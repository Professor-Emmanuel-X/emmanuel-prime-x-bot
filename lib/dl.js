const { fetchJson, getBuffer } = require('./utils');

const enc = encodeURIComponent;

// Services publics testés tour à tour. Aucun n'est garanti : s'ils tombent, on passe au suivant.
const HOSTS = {
  siputzx: 'https://api.siputzx.my.id',
  ryzen: 'https://api.ryzendesu.vip',
  agatz: 'https://api.agatz.xyz',
  vreden: 'https://api.vreden.my.id',
  nexoracle: 'https://api.nexoracle.com'
};

const PROVIDERS = {
  ytmp3: [
    (u) => `${HOSTS.siputzx}/api/d/ytmp3?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/ytmp3?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/ytmp3?url=${enc(u)}`,
    (u) => `${HOSTS.vreden}/api/ytmp3?url=${enc(u)}`
  ],
  ytmp4: [
    (u) => `${HOSTS.siputzx}/api/d/ytmp4?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/ytmp4?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/ytmp4?url=${enc(u)}`,
    (u) => `${HOSTS.vreden}/api/ytmp4?url=${enc(u)}`
  ],
  facebook: [
    (u) => `${HOSTS.siputzx}/api/d/facebook?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/fbdl?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/facebook?url=${enc(u)}`,
    (u) => `${HOSTS.vreden}/api/fbdl?url=${enc(u)}`
  ],
  instagram: [
    (u) => `${HOSTS.siputzx}/api/d/igdl?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/igdl?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/instagram?url=${enc(u)}`,
    (u) => `${HOSTS.vreden}/api/igdownload?url=${enc(u)}`
  ],
  twitter: [
    (u) => `${HOSTS.siputzx}/api/d/twitter?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/twitter?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/twitter?url=${enc(u)}`,
    (u) => `${HOSTS.vreden}/api/twitter?url=${enc(u)}`
  ],
  pinterest: [
    (u) => `${HOSTS.siputzx}/api/d/pinterest?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/pinterest?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/pinterest?url=${enc(u)}`
  ],
  mediafire: [
    (u) => `${HOSTS.siputzx}/api/d/mediafire?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/mediafire?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/mediafire?url=${enc(u)}`
  ],
  spotify: [
    (u) => `${HOSTS.siputzx}/api/d/spotify?url=${enc(u)}`,
    (u) => `${HOSTS.ryzen}/api/downloader/spotify?url=${enc(u)}`,
    (u) => `${HOSTS.agatz}/api/spotify?url=${enc(u)}`
  ]
};

// Instance Cobalt personnelle (facultatif) : variables COBALT_API et COBALT_KEY
async function viaCobalt(url, audio) {
  const base = process.env.COBALT_API;
  if (!base) return null;
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (process.env.COBALT_KEY) headers.Authorization = `Api-Key ${process.env.COBALT_KEY}`;
  const axios = require('axios');
  const r = await axios.post(base, { url, downloadMode: audio ? 'audio' : 'auto' }, { headers, timeout: 30000 });
  return r.data?.url || r.data?.picker?.[0]?.url || null;
}

const MEDIA_KEY = /(mp4|mp3|m4a|jpe?g|png|webp|gif|video|audio|download|dl|hd|sd|url|link|media|image|thumb)/i;

/** Parcourt n'importe quelle réponse JSON et renvoie tous les liens trouvés (vidéos en premier). */
function findLinks(obj, out = [], key = '', depth = 0) {
  if (obj == null || depth > 6) return out;
  if (typeof obj === 'string') {
    if (/^https?:\/\//i.test(obj) && MEDIA_KEY.test(key + obj)) out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v) => findLinks(v, out, key, depth + 1));
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) findLinks(v, out, k, depth + 1);
  }
  const rank = (l) => (/\.(mp4|mp3|m4a)(\?|$)/i.test(l) ? 0 : /thumb|cover|preview|avatar/i.test(l) ? 3 : /\.(jpe?g|png|webp)(\?|$)/i.test(l) ? 2 : 1);
  return depth === 0 ? [...new Set(out)].sort((a, b) => rank(a) - rank(b)) : out;
}

/** Type réel d'un fichier d'après ses premiers octets. */
function sniff(buf) {
  if (!buf || buf.length < 12) return 'bad';
  if (buf.slice(4, 8).toString() === 'ftyp') {
    const brand = buf.slice(8, 12).toString();
    if (/^(avif|avis|heic|heix|mif1)/i.test(brand)) return 'avif'; // image que WhatsApp ne sait pas afficher
    return brand.startsWith('M4A') ? 'audio' : 'video';
  }
  if (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return 'audio';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image';
  if (buf.slice(1, 4).toString() === 'PNG') return 'image';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image';
  if (buf.slice(0, 4).toString('hex') === '1a45dfa3') return 'video'; // webm
  if (buf.slice(0, 4).toString() === 'OggS') return 'audio';
  if (/^\s*</.test(buf.slice(0, 20).toString())) return 'bad'; // page HTML : pas un média
  return 'file';
}

/**
 * Essaie les services pour une plateforme et renvoie [{ buffer, type }] (1 à max médias).
 * Renvoie null si aucun service ne répond.
 */
async function download(kind, url, { max = 1, maxBytes = 60 * 1024 * 1024 } = {}) {
  const tried = [];
  const cobalt = await viaCobalt(url, kind === 'ytmp3').catch((e) => (tried.push(`cobalt:${e.message}`), null));
  const sources = [];
  if (cobalt) sources.push({ name: 'cobalt', links: [cobalt] });
  for (const make of PROVIDERS[kind] || []) {
    const api = make(url);
    try {
      const d = await fetchJson(api, { timeout: 25000 });
      const links = findLinks(d);
      if (links.length) sources.push({ name: new URL(api).host, links });
      else tried.push(`${new URL(api).host}:sans lien ${JSON.stringify(d).slice(0, 140)}`);
    } catch (e) {
      tried.push(`${new URL(api).host}:${e.code || e.message}`);
    }
    if (sources.length) {
      const got = await fetchLinks(sources[sources.length - 1], max, maxBytes, tried);
      if (got.length) return got;
    }
  }
  if (cobalt && !sources.some((s) => s.name !== 'cobalt')) {
    const got = await fetchLinks(sources[0], max, maxBytes, tried);
    if (got.length) return got;
  }
  console.error(`[dl:${kind}] aucun service n'a répondu →`, tried.join(' | '));
  return null;
}

async function fetchLinks(src, max, maxBytes, tried) {
  const out = [];
  for (const link of src.links.slice(0, 8)) {
    try {
      const buffer = await getBuffer(link, { timeout: 120000, maxContentLength: maxBytes, maxBodyLength: maxBytes });
      const type = sniff(buffer);
      if (type === 'bad') continue;
      out.push({ buffer, type, link });
      if (out.length >= max) break;
    } catch (e) {
      tried.push(`${src.name}:fichier ${e.code || e.message}`);
    }
  }
  return out;
}

module.exports = { download, findLinks, sniff, PROVIDERS, HOSTS };
