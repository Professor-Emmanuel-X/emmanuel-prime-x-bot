// yt-dlp : téléchargement YouTube / SoundCloud complet (pas seulement 30 s).
// Le binaire officiel est téléchargé au démarrage (le disque de Render est effacé à chaque déploiement)
// et essaie plusieurs « clients » YouTube : si l'un est bloqué, on passe au suivant.
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const config = require('../config');

const DIR = path.join(fs.existsSync(config.paths.root) ? config.paths.root : os.tmpdir(), 'bin');
const FILE = path.join(DIR, 'yt-dlp');
const ASSET = process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
const URL_BIN = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ASSET}`;

// « default » = choix automatique de yt-dlp, puis un client précis (mweb / ios / web_safari ne marchent plus sans « PO token »)
const CLIENTS = ['default', 'tv,android_vr'];
// Avec des cookies, android_vr les ignore : on garde « tv » qui les accepte
// « ! » devant un client = essai SANS cookies (des cookies refusés par YouTube peuvent gâcher même les clients qui marcheraient sans)
// web_safari / tv_simply / web_embedded / mweb : clients qui marchent parfois quand « default » et « tv » sont refusés avec des cookies
const clientsFor = () => (hasCookies() ? ['default', 'web_safari', 'tv', 'tv_simply', 'web_embedded', 'mweb', '!tv,android_vr'] : CLIENTS);

// YouTube répond « Sign in to confirm you're not a bot » aux serveurs : tous les clients sont alors bloqués
// de la même façon. On le retient quelques minutes pour ne plus perdre de temps (réponse immédiate).
const BOT_CHECK = /confirm you.?re not a bot|sign in to confirm/i;
let blockedUntil = 0;
const hasCookies = () => Boolean(process.env.YT_COOKIES_TXT || process.env.YT_COOKIES);
const youtubeBlocked = () => Date.now() < blockedUntil;
const resetBlock = () => (blockedUntil = 0);
const BLOCK_NO_COOKIES = 'YouTube bloque ce serveur (vérification anti-robot). Il faut ajouter des cookies YouTube : variable YT_COOKIES_TXT.';
const BLOCK_BAD_COOKIES = 'YouTube bloque ce serveur malgré les cookies : ils sont expirés ou invalidés. Réexporte-les depuis une fenêtre de navigation privée (connecté à YouTube, exporte puis ferme la fenêtre sans te déconnecter) et remplace YT_COOKIES_TXT.';
const blockMessage = () => (hasCookies() ? BLOCK_BAD_COOKIES : BLOCK_NO_COOKIES);
const TMP = path.join(os.tmpdir(), 'ytdlp-work');

function ffmpegPath() {
  try {
    return process.env.FFMPEG_PATH || require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
}

let readyPromise = null;
let version = null;

// Au plus 2 yt-dlp / ffmpeg en même temps : sur le plan gratuit de Render (512 Mo), davantage fait swapper
// le serveur et toutes les commandes deviennent lentes.
const MAX_JOBS = parseInt(process.env.YTDLP_MAX_JOBS || '2', 10);
let running = 0;
const waiting = [];
async function slot() {
  if (running >= MAX_JOBS) await new Promise((r) => waiting.push(r));
  else running++;
}
function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

function exec(bin, args, { timeoutMs = 120000, capture = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('délai dépassé'));
    }, timeoutMs);
    p.stdout?.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err = (err + d).slice(-3000)));
    p.on('error', (e) => (clearTimeout(timer), reject(e)));
    p.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(lastLine(err) || `code ${code}`));
    });
  });
}

function lastLine(s) {
  const lines = String(s).split('\n').map((l) => l.trim()).filter(Boolean);
  const err = lines.reverse().find((l) => /ERROR/i.test(l)) || lines[0] || '';
  return err.replace(/^ERROR:\s*/i, '').replace(/\[[a-z:]+\]\s*/gi, '').slice(0, 220);
}

/** Télécharge (une fois) le binaire yt-dlp. */
function ensure() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    fs.mkdirSync(DIR, { recursive: true });
    if (!fs.existsSync(FILE)) {
      const res = await axios.get(URL_BIN, { responseType: 'arraybuffer', timeout: 180000, maxRedirects: 5, maxContentLength: 200 * 1024 * 1024 });
      fs.writeFileSync(FILE, Buffer.from(res.data), { mode: 0o755 });
      fs.chmodSync(FILE, 0o755);
    }
    version = (await exec(FILE, ['--version'], { timeoutMs: 60000 })).trim();
    console.log(`[yt-dlp] prêt (version ${version})`);
    return FILE;
  })().catch((e) => {
    readyPromise = null; // on réessaiera à la prochaine demande
    console.error('[yt-dlp] indisponible :', e.message);
    throw e;
  });
  return readyPromise;
}

// Cookies YouTube optionnels : YT_COOKIES_TXT (format Netscape) ou YT_COOKIES (JSON exporté par Cookie-Editor & co).
// Render abîme souvent le texte collé : tabulations remplacées par des espaces, retours à la ligne écrits « \n »,
// guillemets autour de la valeur. On répare tout ça, et on n'écrit le fichier qu'une fois par contenu
// (plusieurs yt-dlp en parallèle ne doivent pas se marcher dessus).
let cookieCache = { raw: null, file: null, info: null };

function netscapeFromJson(raw) {
  let list = JSON.parse(raw);
  if (!Array.isArray(list)) list = list.cookies || [];
  return list
    .filter((c) => c && c.name && c.domain)
    .map((c) => {
      const dom = String(c.domain);
      const exp = c.session ? 0 : Math.floor(c.expirationDate || c.expires || 0);
      return [dom, dom.startsWith('.') ? 'TRUE' : 'FALSE', c.path || '/', c.secure ? 'TRUE' : 'FALSE', exp, c.name, c.value].join('\t');
    })
    .join('\n');
}

function normalizeNetscape(raw) {
  const lines = [];
  for (let line of raw.split('\n')) {
    line = line.replace(/\r/g, '').trim();
    if (!line) continue;
    if (line.startsWith('#') && !line.startsWith('#HttpOnly_')) continue;
    let parts = line.split('\t');
    if (parts.length < 7) parts = line.split(/\s+/); // tabulations perdues → on découpe sur les espaces
    if (parts.length < 7) continue;
    const value = parts.slice(6).join(' ');
    lines.push([...parts.slice(0, 6), value].join('\t'));
  }
  return lines.join('\n');
}

function loadCookies() {
  let raw = (process.env.YT_COOKIES_TXT || process.env.YT_COOKIES || '').trim();
  if (!raw) return null;
  if (cookieCache.raw === raw) return cookieCache;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
  if (!raw.includes('\n') && raw.includes('\\n')) raw = raw.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  let body = '';
  try {
    body = raw.startsWith('[') || raw.startsWith('{') ? netscapeFromJson(raw) : normalizeNetscape(raw);
  } catch (e) {
    cookieCache = { raw: (process.env.YT_COOKIES_TXT || process.env.YT_COOKIES || '').trim(), file: null, info: { count: 0, error: `format illisible (${e.message})` } };
    return cookieCache;
  }
  const names = new Set(body.split('\n').map((l) => l.split('\t')[5]).filter(Boolean));
  const count = body ? body.split('\n').length : 0;
  const info = {
    count,
    // cookies de session Google : sans eux, YouTube ne voit pas un compte connecté
    loggedIn: ['__Secure-3PSID', 'SID', '__Secure-1PSID', 'LOGIN_INFO'].some((n) => names.has(n)),
    expired: 0
  };
  const now = Date.now() / 1000;
  for (const l of body.split('\n')) {
    const exp = Number(l.split('\t')[4]);
    if (exp > 0 && exp < now) info.expired++;
  }
  let file = null;
  if (count) {
    file = path.join(TMP, 'cookies.txt');
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(file, '# Netscape HTTP Cookie File\n' + body + '\n', { mode: 0o600 });
  } else {
    info.error = 'aucun cookie reconnu dans la variable';
  }
  cookieCache = { raw: (process.env.YT_COOKIES_TXT || process.env.YT_COOKIES || '').trim(), file, info };
  return cookieCache;
}

function cookieFile() {
  const c = loadCookies();
  if (!c?.file) return null;
  // yt-dlp réécrit le fichier de cookies : on lui en donne une copie par appel pour éviter toute corruption
  const copy = path.join(TMP, `ck-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.txt`);
  fs.copyFileSync(c.file, copy);
  setTimeout(() => fs.rmSync(copy, { force: true }), 5 * 60000).unref();
  return copy;
}

function baseArgs(client) {
  const noCookies = String(client || '').startsWith('!');
  if (noCookies) client = client.slice(1);
  const a = ['--no-playlist', '--no-warnings', '--no-progress', '--ignore-config', '--socket-timeout', '30', '--retries', '2', '--max-filesize', '60M', '--ffmpeg-location', ffmpegPath(), '--js-runtimes', 'node', '--remote-components', 'ejs:github'];
  if (process.env.YT_PROXY) a.push('--proxy', process.env.YT_PROXY); // proxy résidentiel facultatif : les adresses de datacenter (Render) sont souvent refusées par YouTube
  if (client && client !== 'default') a.push('--extractor-args', `youtube:player_client=${client}`);
  const ck = noCookies ? null : cookieFile();
  if (ck) a.push('--cookies', ck);
  return a;
}

async function run(args, opts) {
  const bin = await ensure();
  await slot();
  try {
    return await runInner(bin, args, opts);
  } finally {
    release();
  }
}

async function runInner(bin, args, opts) {
  try {
    return await exec(bin, args, opts);
  } catch (e) {
    // anciennes versions : l'option --js-runtimes n'existe pas
    if (/no such option|unrecognized/i.test(e.message) && (args.includes('--js-runtimes') || args.includes('--remote-components'))) {
      const drop = new Set();
      for (const opt of ['--js-runtimes', '--remote-components']) {
        const i = args.indexOf(opt);
        if (i >= 0) drop.add(i).add(i + 1);
      }
      return exec(bin, args.filter((_, k) => !drop.has(k)), opts);
    }
    throw e;
  }
}

function cleanup(id) {
  try {
    for (const f of fs.readdirSync(TMP)) if (f.startsWith(id)) fs.rmSync(path.join(TMP, f), { force: true });
  } catch {
    /* rien à nettoyer */
  }
}

function toMp3(file) {
  const out = file.replace(/\.[^.]+$/, '') + '-c.mp3';
  return exec(ffmpegPath(), ['-y', '-i', file, '-vn', '-codec:a', 'libmp3lame', '-q:a', '4', out], { timeoutMs: 180000, capture: false }).then(() => out);
}

/** Télécharge dans un fichier temporaire et renvoie le Buffer. */
async function fetchFile(url, { kind, clients, extra = [], youtube = false }) {
  fs.mkdirSync(TMP, { recursive: true });
  if (youtube && youtubeBlocked()) throw new Error(blockMessage());
  const errors = [];
  for (const client of clients) {
    const id = `y${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    // vidéo : mp4 « tout-en-un » si possible, sinon image + son fusionnés par ffmpeg ; audio : m4a lu directement par WhatsApp
    const fmt = kind === 'video' ? 'b[ext=mp4][height<=480]/bv*[height<=480][ext=mp4]+ba[ext=m4a]/bv*[height<=480]+ba/b[height<=480]/b' : 'bestaudio[ext=m4a]/bestaudio/best';
    try {
      await run([...baseArgs(client), '-f', fmt, ...(kind === 'video' ? ['--merge-output-format', 'mp4'] : []), ...extra, '-o', path.join(TMP, `${id}.%(ext)s`), url], { timeoutMs: 150000, capture: false });
      const f = fs.readdirSync(TMP).find((n) => n.startsWith(id) && !n.endsWith('.part'));
      if (!f) throw new Error('aucun fichier produit');
      let file = path.join(TMP, f);
      if (kind === 'audio' && !/\.(m4a|mp3|mp4|aac)$/i.test(file)) file = await toMp3(file); // webm/opus/ogg → mp3
      const buf = fs.readFileSync(file);
      cleanup(id);
      if (buf.length < 20000) throw new Error('fichier trop petit');
      console.log(`[yt-dlp] ${kind} OK via client « ${client} » (${(buf.length / 1048576).toFixed(1)} Mo)`);
      return buf;
    } catch (e) {
      cleanup(id);
      errors.push(`${client}: ${e.message}`);
      console.error(`[yt-dlp] ${kind} client « ${client} » : ${e.message}`);
      if (youtube && BOT_CHECK.test(e.message)) {
        // inutile d'essayer les autres clients : même blocage. On mémorise (3 min avec cookies, 10 min sans).
        blockedUntil = Date.now() + (hasCookies() ? 3 : 10) * 60000;
        throw new Error(blockMessage());
      }
    }
  }
  throw new Error(errors.join(' | ').slice(0, 400));
}

/** Vidéo d'un autre site (Facebook, Instagram, TikTok, X, Pinterest…) via yt-dlp, quand les services en ligne sont en panne. */
const videoFromAnySite = (url) => fetchFile(url, { kind: 'video', clients: ['!default'] });

const audioFromUrl = (url) => fetchFile(url, { kind: 'audio', clients: clientsFor(), youtube: true });
const videoFromUrl = (url) => fetchFile(url, { kind: 'video', clients: clientsFor(), youtube: true });

const BAD_WORDS = /\b(remix|cover|slowed|sped ?up|speed ?up|nightcore|reverb|lyrics?|paroles|instrumental|karaoke|mashup|bootleg|edit|type beat|8d|bass boosted|loop|extended|tutorial|reaction|live|acoustic)\b/i;
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ');
const words = (t) => norm(t).split(/\s+/).filter((w) => w.length > 1);

/** Note un résultat : plus c'est haut, plus c'est la vraie chanson de l'artiste. */
function scoreTrack(c, query, canon) {
  const hay = norm(`${c.title} ${c.uploader}`);
  const q = words(query);
  let sc = q.filter((w) => hay.includes(w)).length * 10;
  if (canon) {
    const a = words(canon.artist);
    const t = words(canon.title);
    sc += t.filter((w) => hay.includes(w)).length * 8;
    sc += a.filter((w) => norm(c.uploader).includes(w)).length * 25; // chaîne de l'artiste
    sc += a.filter((w) => norm(c.title).includes(w)).length * 6;
    if (canon.seconds && c.duration) sc -= Math.min(40, Math.abs(c.duration - canon.seconds)) * 1.2; // même durée que la version officielle
  }
  if (BAD_WORDS.test(c.title) && !BAD_WORDS.test(query)) sc -= 40;
  if (c.duration && (c.duration < 90 || c.duration > 600)) sc -= 30;
  return sc;
}

/** SoundCloud : morceau entier (on ignore les extraits), choisi avec la fiche officielle (canon) si on l'a. */
async function soundcloud(query, canon) {
  const out = await run([...baseArgs('default'), '--flat-playlist', '--skip-download', '-j', `scsearch10:${canon ? `${canon.artist} ${canon.title}` : query}`], { timeoutMs: 60000 }).catch(() => '');
  const cands = String(out)
    .split('\n')
    .map((l) => {
      try {
        const j = JSON.parse(l);
        return { url: j.webpage_url || j.url, title: j.title || '', uploader: j.uploader || j.channel || '', duration: Number(j.duration) || 0, thumb: j.thumbnails?.[j.thumbnails.length - 1]?.url || j.thumbnail };
      } catch {
        return null;
      }
    })
    .filter((c) => c && c.url && c.duration > 75);
  if (!cands.length) return null;
  const best = cands.map((c) => ({ c, sc: scoreTrack(c, query, canon) })).sort((a, b) => b.sc - a.sc)[0];
  if (best.sc < 15) return null; // rien qui ressemble : mieux vaut un extrait officiel que la mauvaise chanson
  const c = best.c;
  const buffer = await fetchFile(c.url, { kind: 'audio', clients: ['default'] });
  const s = Math.round(c.duration);
  return {
    buffer,
    title: canon?.title || c.title,
    artist: canon?.artist || c.uploader,
    full: true,
    source: 'SoundCloud',
    thumb: canon?.thumb || (/^https?:/.test(c.thumb || '') ? c.thumb : undefined),
    duration: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  };
}

/** Test rapide de chaque client (commande .ytcheck). */
async function check(videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ') {
  const lines = [];
  try {
    await ensure();
    lines.push(`✅ yt-dlp ${version}`);
  } catch (e) {
    return [`❌ yt-dlp introuvable : ${e.message}`];
  }
  resetBlock();
  if (!hasCookies()) {
    lines.push('🍪 cookies YouTube : aucun (variable YT_COOKIES_TXT vide)');
  } else {
    const ck = loadCookies()?.info || {};
    if (ck.error) lines.push(`🍪 cookies YouTube : ❌ ${ck.error}`);
    else {
      lines.push(`🍪 cookies YouTube : ${ck.count} cookies lus${ck.expired ? `, dont ${ck.expired} expirés` : ''}`);
      lines.push(ck.loggedIn ? '✅ session Google présente dans les cookies' : '❌ aucun cookie de connexion Google (SID / __Secure-3PSID) : exporte les cookies une fois connecté à YouTube');
    }
  }
  for (const client of clientsFor()) {
    try {
      // vrai test : demander le lien du flux audio (c'est là que YouTube bloque, pas pour le simple titre)
      const t = await run([...baseArgs(client), '-f', 'bestaudio[ext=m4a]/bestaudio', '-g', videoUrl], { timeoutMs: 60000 });
      const label = client.startsWith('!') ? `${client.slice(1)} sans cookies` : client;
      lines.push(String(t).trim().startsWith('http') ? `✅ YouTube « ${label} » : audio accessible` : `❌ YouTube « ${label} » : réponse vide`);
    } catch (e) {
      lines.push(`❌ YouTube « ${client.replace(/^!(.*)$/, '$1 sans cookies')} » : ${e.message.slice(0, 90)}`);
    }
  }
  try {
    const t = await run([...baseArgs('default'), '--skip-download', '--print', 'title', '--playlist-items', '1', 'scsearch1:daft punk']);
    lines.push(`✅ SoundCloud : ${String(t).trim().slice(0, 40)}`);
  } catch (e) {
    lines.push(`❌ SoundCloud : ${e.message}`);
  }
  return lines;
}

module.exports = { videoFromAnySite, ensure, audioFromUrl, videoFromUrl, soundcloud, check, youtubeBlocked, blockMessage, get BLOCK_MESSAGE() { return blockMessage(); }, scoreTrack, norm, words, BAD_WORDS };
