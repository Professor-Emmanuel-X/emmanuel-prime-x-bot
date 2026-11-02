const axios = require('axios');
const pino = require('pino');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const logger = pino({ level: 'silent' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const digits = (jid = '') => String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const isUrl = (s = '') => /https?:\/\/[^\s]+/i.test(s);

const extractUrl = (s = '') => (s.match(/https?:\/\/[^\s]+/i) || [])[0];

function runtime(seconds) {
  seconds = Math.floor(seconds);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [d && `${d}j`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${u[i]}`;
}

// En-tête d'identification standard d'un navigateur : certains services refusent les clients sans identité reconnaissable
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const transient = (e) => {
  const status = e.response?.status;
  return !status || status === 429 || status >= 500;
};

async function getBuffer(url, opts = {}) {
  const { retries = 1, ...rest } = opts;
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'User-Agent': UA, Accept: '*/*' },
        ...rest
      });
      return Buffer.from(res.data);
    } catch (e) {
      lastError = e;
      if (!transient(e) || i === retries) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastError;
}

// Réponses JSON gardées en mémoire quelques instants : évite de dépasser les limites (erreur 429) des services gratuits
const jsonCache = new Map();

/**
 * GET JSON avec nouvelles tentatives (coupure, délai dépassé, 429, 5xx).
 * Options : retries (2 par défaut), cache (durée en ms, 0 = aucun), timeout, headers…
 */
async function fetchJson(url, opts = {}) {
  const { retries = 2, cache = 0, ...rest } = opts;
  if (cache) {
    const hit = jsonCache.get(url);
    if (hit && hit.exp > Date.now()) return hit.data;
  }
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: 30000,
        ...rest,
        headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', ...(rest.headers || {}) }
      });
      if (cache) {
        jsonCache.set(url, { data: res.data, exp: Date.now() + cache });
        if (jsonCache.size > 300) jsonCache.delete(jsonCache.keys().next().value);
      }
      return res.data;
    } catch (e) {
      lastError = e;
      if (!transient(e) || i === retries) break;
      // 429 : on respecte le délai demandé par le service s'il est court
      const wait = Number(e.response?.headers?.['retry-after']);
      await sleep(wait > 0 && wait <= 10 ? wait * 1000 : 1500 * (i + 1));
    }
  }
  // Dernier recours : une réponse un peu ancienne vaut mieux qu'une erreur
  const stale = cache ? jsonCache.get(url) : null;
  if (stale) return stale.data;
  throw lastError;
}

/**
 * Télécharge le média d'un message (le message cité en priorité).
 * wanted: tableau de types acceptés ex ['imageMessage','videoMessage']
 */
async function downloadMedia(sock, ctx, wanted) {
  const candidates = [ctx.quoted, ctx.msg].filter(Boolean);
  for (const c of candidates) {
    const content = c.message;
    if (!content) continue;
    const type = Object.keys(content).find((k) => /Message$/.test(k) && content[k] && (content[k].mimetype || k === 'stickerMessage'));
    if (!type) continue;
    if (wanted && !wanted.includes(type)) continue;
    const buffer = await downloadMediaMessage(
      { key: c.key, message: content },
      'buffer',
      {},
      { logger, reuploadRequest: sock.updateMediaMessage }
    );
    return { buffer, type, mimetype: content[type].mimetype, node: content[type] };
  }
  return null;
}

/**
 * Traduit un texte. Essaie Google, puis MyMemory, puis l'IA (OpenRouter) : si un service tombe, le suivant prend le relais.
 * Renvoie { text, from }.
 */
async function translateFull(text, to = 'fr', from = 'auto') {
  const errors = [];
  try {
    const d = await fetchJson(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`,
      { retries: 1 }
    );
    const out = (d[0] || []).map((x) => x[0]).join('');
    if (out) return { text: out, from: d[2] || from };
  } catch (e) {
    errors.push(`google:${e.response?.status || e.code || e.message}`);
  }
  try {
    const d = await fetchJson(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=${from === 'auto' ? 'autodetect' : from}|${to}`,
      { retries: 1 }
    );
    const out = d?.responseData?.translatedText;
    if (out && d.responseStatus == 200) return { text: out, from: from === 'auto' ? '?' : from };
  } catch (e) {
    errors.push(`mymemory:${e.response?.status || e.code || e.message}`);
  }
  try {
    const out = await require('./ai').ask(`Traduis ce texte en "${to}" (code de langue). Réponds uniquement avec la traduction :\n\n${text}`);
    if (out) return { text: out, from: '?' };
  } catch (e) {
    errors.push(`ia:${e.message}`);
  }
  throw new Error(`Traduction impossible pour le moment (${errors.join(' | ')})`);
}

async function translate(text, to = 'fr', from = 'auto') {
  return (await translateFull(text, to, from)).text;
}

const truncate = (s = '', n = 600) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// [majuscules, minuscules, chiffres] : points de code de départ (null = inchangé)
const fancyMaps = {
  bold: [0x1d400, 0x1d41a, 0x1d7ce],
  italic: [0x1d608, 0x1d622, null],
  mono: [0x1d670, 0x1d68a, 0x1d7f6],
  script: [0x1d4d0, 0x1d4ea, null],
  gothic: [0x1d56c, 0x1d586, null],
  bubble: [0x24b6, 0x24d0, null]
};

function fancy(text, style) {
  const map = fancyMaps[style];
  if (!map) return text;
  return [...text]
    .map((ch) => {
      const c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(map[0] + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(map[1] + c - 97);
      if (c >= 48 && c <= 57 && map[2]) return String.fromCodePoint(map[2] + c - 48);
      return ch;
    })
    .join('');
}

module.exports = {
  logger,
  sleep,
  digits,
  pickRandom,
  isUrl,
  extractUrl,
  runtime,
  formatSize,
  getBuffer,
  fetchJson,
  downloadMedia,
  translate,
  translateFull,
  UA,
  truncate,
  fancy,
  fancyStyles: Object.keys(fancyMaps)
};
