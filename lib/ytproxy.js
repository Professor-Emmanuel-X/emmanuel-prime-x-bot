// Secours YouTube : instances publiques Piped / Invidious (elles font le travail à la place du serveur,
// dont l'adresse est bloquée par YouTube). Plusieurs instances sont essayées en parallèle.
const axios = require('axios');
const { sniff } = require('./dl');

const split = (s, d) => (s ? s.split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean) : d);
const PIPED = split(process.env.PIPED_API, [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.garudalinux.org'
]);
const INVIDIOUS = split(process.env.INVIDIOUS_API, [
  'https://inv.nadeko.net',
  'https://yewtu.be',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacyredirect.com'
]);

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; EmmanuelPrimeXBot/1.0)' };
const MAX_BYTES = 60 * 1024 * 1024;

async function getJson(url) {
  return (await axios.get(url, { timeout: 12000, headers: UA })).data;
}

async function fromPiped(base, id, kind) {
  const d = await getJson(`${base}/streams/${id}`);
  if (kind === 'audio') {
    const a = (d.audioStreams || []).filter((s) => /mp4|m4a/i.test(s.mimeType || s.format || '')).sort((x, y) => y.bitrate - x.bitrate)[0];
    return a?.url;
  }
  const v = (d.videoStreams || []).filter((s) => !s.videoOnly && /mp4/i.test(s.mimeType || s.format || '')).sort((x, y) => (y.height || 0) - (x.height || 0))[0];
  return v?.url;
}

async function fromInvidious(base, id, kind) {
  const d = await getJson(`${base}/api/v1/videos/${id}?local=true`);
  const abs = (u) => (u && u.startsWith('/') ? base + u : u);
  if (kind === 'audio') {
    const a = (d.adaptiveFormats || []).filter((s) => /audio\/mp4/i.test(s.type || '')).sort((x, y) => parseInt(y.bitrate) - parseInt(x.bitrate))[0];
    return abs(a?.url);
  }
  const v = (d.formatStreams || []).filter((s) => /video\/mp4/i.test(s.type || '')).pop();
  return abs(v?.url);
}

async function fetchMedia(url, kind) {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: MAX_BYTES, headers: UA, maxRedirects: 5 });
  const buf = Buffer.from(res.data);
  const t = sniff(buf);
  if (t === 'bad' || t === 'image') throw new Error('réponse invalide');
  return buf;
}

/** Renvoie un Buffer (audio m4a ou vidéo mp4) ou lance une erreur. */
async function proxyBuffer(kind, videoId) {
  if (!videoId) throw new Error('identifiant YouTube manquant');
  const jobs = [
    ...PIPED.map((b) => async () => fetchMedia(await fromPiped(b, videoId, kind), kind)),
    ...INVIDIOUS.map((b) => async () => fetchMedia(await fromInvidious(b, videoId, kind), kind))
  ];
  const errors = [];
  try {
    return await Promise.any(jobs.map((j) => j().catch((e) => (errors.push(e.code || e.message), Promise.reject(e)))));
  } catch {
    throw new Error(`aucune instance Piped/Invidious n'a répondu (${errors.slice(0, 4).join(', ')})`);
  }
}

module.exports = { proxyBuffer };
