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

async function getBuffer(url, opts = {}) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmmanuelPrimeXBot/1.0)' },
    ...opts
  });
  return Buffer.from(res.data);
}

async function fetchJson(url, opts = {}) {
  const res = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmmanuelPrimeXBot/1.0)' },
    ...opts
  });
  return res.data;
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

async function translate(text, to = 'fr') {
  const d = await fetchJson(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
  );
  return (d[0] || []).map((x) => x[0]).join('');
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
  truncate,
  fancy,
  fancyStyles: Object.keys(fancyMaps)
};
