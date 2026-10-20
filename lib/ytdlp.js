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

// « default » = choix automatique de yt-dlp, puis des clients précis
const CLIENTS = ['default', 'tv,android_vr', 'mweb', 'ios', 'web_safari'];
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

// Cookies YouTube optionnels : YT_COOKIES (JSON exporté) ou YT_COOKIES_TXT (format Netscape)
function cookieFile() {
  const raw = (process.env.YT_COOKIES_TXT || process.env.YT_COOKIES || '').trim();
  if (!raw) return null;
  const f = path.join(TMP, 'cookies.txt');
  fs.mkdirSync(TMP, { recursive: true });
  let txt = raw;
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      let list = JSON.parse(raw);
      if (!Array.isArray(list)) list = list.cookies || [];
      txt =
        '# Netscape HTTP Cookie File\n' +
        list
          .map((c) => [c.domain, String(c.domain || '').startsWith('.') ? 'TRUE' : 'FALSE', c.path || '/', c.secure ? 'TRUE' : 'FALSE', Math.floor(c.expirationDate || c.expires || 0), c.name, c.value].join('\t'))
          .join('\n');
    } catch {
      return null;
    }
  }
  fs.writeFileSync(f, txt);
  return f;
}

function baseArgs(client) {
  const a = ['--no-playlist', '--no-warnings', '--no-progress', '--ignore-config', '--socket-timeout', '30', '--retries', '2', '--max-filesize', '60M', '--ffmpeg-location', ffmpegPath(), '--js-runtimes', 'node'];
  if (client && client !== 'default') a.push('--extractor-args', `youtube:player_client=${client}`);
  const ck = cookieFile();
  if (ck) a.push('--cookies', ck);
  return a;
}

async function run(args, opts) {
  const bin = await ensure();
  try {
    return await exec(bin, args, opts);
  } catch (e) {
    // anciennes versions : l'option --js-runtimes n'existe pas
    if (/no such option|unrecognized/i.test(e.message) && args.includes('--js-runtimes')) {
      const i = args.indexOf('--js-runtimes');
      return exec(bin, args.filter((_, k) => k !== i && k !== i + 1), opts);
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
async function fetchFile(url, { kind, clients, extra = [] }) {
  fs.mkdirSync(TMP, { recursive: true });
  const errors = [];
  for (const client of clients) {
    const id = `y${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const fmt = kind === 'video' ? 'best[ext=mp4][height<=480]/best[ext=mp4]/best[height<=480]/best' : 'bestaudio[ext=m4a]/bestaudio';
    try {
      await run([...baseArgs(client), '-f', fmt, ...extra, '-o', path.join(TMP, `${id}.%(ext)s`), url], { timeoutMs: 240000, capture: false });
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
    }
  }
  throw new Error(errors.join(' | ').slice(0, 400));
}

const audioFromUrl = (url) => fetchFile(url, { kind: 'audio', clients: CLIENTS });
const videoFromUrl = (url) => fetchFile(url, { kind: 'video', clients: CLIENTS });

/** SoundCloud : morceau entier (on ignore les extraits de moins de 75 s). */
async function soundcloud(query) {
  const info = await run([...baseArgs('default'), '--match-filter', 'duration>75', '--playlist-items', '1', '--print', '%(title)s\t%(uploader)s\t%(duration)s\t%(thumbnail)s', '--skip-download', '--no-playlist', `scsearch5:${query}`], { timeoutMs: 60000 }).catch(() => '');
  const [title, artist, seconds, thumb] = String(info).trim().split('\n')[0].split('\t');
  if (!title) return null;
  // On retélécharge le premier résultat valide
  const buffer = await fetchFile(`scsearch5:${query}`, { kind: 'audio', clients: ['default'], extra: ['--match-filter', 'duration>75', '--playlist-items', '1', '--yes-playlist'] });
  const s = parseInt(seconds, 10) || 0;
  return { buffer, title, artist, full: true, thumb: /^https?:/.test(thumb || '') ? thumb : undefined, duration: s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : undefined };
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
  lines.push(process.env.YT_COOKIES || process.env.YT_COOKIES_TXT ? '🍪 cookies YouTube : présents' : '🍪 cookies YouTube : aucun');
  for (const client of CLIENTS) {
    try {
      const t = await run([...baseArgs(client), '--skip-download', '--print', 'title', videoUrl], { timeoutMs: 60000 });
      lines.push(`✅ YouTube « ${client} » : ${String(t).trim().slice(0, 40)}`);
    } catch (e) {
      lines.push(`❌ YouTube « ${client} » : ${e.message}`);
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

module.exports = { ensure, audioFromUrl, videoFromUrl, soundcloud, check };
