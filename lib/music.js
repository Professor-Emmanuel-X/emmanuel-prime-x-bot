const yts = require('yt-search');
const { fetchJson, getBuffer, extractUrl } = require('./utils');
const { download, sniff } = require('./dl');
const { proxyBuffer } = require('./ytproxy');

const MAX_SECONDS = 20 * 60;
const APP = 'EMMANUELPRIMEX';

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

let agent;
function getYtdl() {
  const ytdl = require('@distube/ytdl-core');
  if (!agent && process.env.YT_COOKIES) {
    try {
      agent = ytdl.createAgent(JSON.parse(process.env.YT_COOKIES));
    } catch (e) {
      console.error('[music] YT_COOKIES invalide :', e.message);
    }
  }
  return { ytdl, agent };
}

/** Cherche la vidéo YouTube (texte ou lien). */
async function findVideo(query) {
  const url = extractUrl(query);
  if (url && /(youtube\.com|youtu\.be)/i.test(url)) {
    const id = (url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1];
    if (id) return yts({ videoId: id });
  }
  const r = await yts(query);
  const list = (r.videos || []).filter((v) => v.seconds > 60 && v.seconds <= MAX_SECONDS).slice(0, 8);
  if (!list.length) return r.videos?.[0];
  // On préfère la vidéo dont le titre contient le plus de mots de la recherche
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const score = (v) => words.filter((w) => `${v.title} ${v.author?.name || ''}`.toLowerCase().includes(w)).length;
  return list.map((v, i) => ({ v, sc: score(v) * 10 - i })).sort((a, b) => b.sc - a.sc)[0].v;
}

async function ytdlBuffer(kind, video) {
  const { ytdl, agent: ag } = getYtdl();
  const opts =
    kind === 'audio'
      ? { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }
      : { filter: (f) => f.hasVideo && f.hasAudio && f.container === 'mp4', quality: 'highest', highWaterMark: 1 << 25 };
  if (ag) opts.agent = ag;
  try {
    return await streamToBuffer(ytdl(video.url, opts));
  } catch (e) {
    console.error('[music] YouTube direct refusé :', e.message, '→ essai via Piped/Invidious');
    return proxyBuffer(kind, video.videoId || (String(video.url).match(/([\w-]{11})(?:[&?]|$)/) || [])[1]);
  }
}

// JioSaavn (via saavn.dev) : morceaux entiers, très bon catalogue
async function saavn(query) {
  const d = await fetchJson(`https://saavn.dev/api/search/songs?query=${encodeURIComponent(query)}&limit=3`, { timeout: 15000 });
  const t = d?.data?.results?.[0];
  const dl = t?.downloadUrl?.slice().sort((a, b) => parseInt(b.quality) - parseInt(a.quality)).find((x) => x.url);
  if (!dl) return null;
  const buffer = await getBuffer(dl.url, { timeout: 120000 });
  if (sniff(buffer) === 'bad') return null;
  const decode = (x) => String(x || '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return {
    buffer,
    title: decode(t.name),
    artist: decode(t.artists?.primary?.map((a) => a.name).join(', ')),
    full: true,
    thumb: t.image?.[t.image.length - 1]?.url,
    duration: t.duration ? `${Math.floor(t.duration / 60)}:${String(t.duration % 60).padStart(2, '0')}` : undefined
  };
}

// Audius : catalogue libre avec API officielle (morceaux entiers, mais pas toutes les stars)
async function audius(query) {
  const d = await fetchJson(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP}&limit=3`);
  const t = d?.data?.find((x) => x.duration > 45) || d?.data?.[0];
  if (!t) return null;
  const buffer = await getBuffer(`https://api.audius.co/v1/tracks/${t.id}/stream?app_name=${APP}`, { timeout: 120000, maxRedirects: 5 });
  if (sniff(buffer) === 'bad') return null;
  return { buffer, title: t.title, artist: t.user?.name, full: true, thumb: t.artwork?.['480x480'] };
}

// iTunes puis Deezer : extraits officiels de 30 secondes (dernier recours)
async function preview(query) {
  try {
    const d = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`);
    const t = d?.results?.[0];
    if (t?.previewUrl) {
      return { buffer: await getBuffer(t.previewUrl), title: t.trackName, artist: t.artistName, full: false, thumb: t.artworkUrl100?.replace('100x100', '400x400') };
    }
  } catch (e) {
    console.error('[music] iTunes :', e.message);
  }
  try {
    const d = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`);
    const t = d?.data?.[0];
    if (t?.preview) return { buffer: await getBuffer(t.preview), title: t.title, artist: t.artist?.name, full: false, thumb: t.album?.cover_big };
  } catch (e) {
    console.error('[music] Deezer :', e.message);
  }
  return null;
}

/**
 * Trouve une musique : YouTube → services de secours → Audius → extrait de 30 s.
 * Renvoie { buffer, title, artist, full, thumb, url, duration } ou lance une erreur lisible.
 */
async function getSong(query) {
  const isLink = /(youtube\.com|youtu\.be)/i.test(query);
  const log = (what) => (e) => (console.error(`[music] ${what} :`, e.code || e.message), null);

  // 2. YouTube (accès direct, puis services de secours)
  const video = await findVideo(query).catch(() => null);
  if (video && video.seconds <= MAX_SECONDS) {
    const info = { title: video.title, artist: video.author?.name, thumb: video.thumbnail, url: video.url, duration: video.timestamp, full: true };
    try {
      return { ...info, buffer: await ytdlBuffer('audio', video) };
    } catch (e) {
      console.error('[music] YouTube direct refusé :', e.message);
    }
    const got = await download('ytmp3', video.url, { max: 1 });
    if (got?.[0] && got[0].type !== 'image') return { ...info, buffer: got[0].buffer };
  }

  // 3. Autres catalogues, puis extrait de 30 s en dernier recours
  const name = isLink ? video?.title || query : query;
  const alt =
    (await audius(name).catch(log('Audius'))) ||
    (await preview(name));
  if (alt) return alt; // pas de lien YouTube : l'extrait ne vient pas de cette vidéo
  throw new Error('Impossible de récupérer cette musique pour le moment. Essaie un autre titre.');
}

module.exports = { findVideo, getSong, ytdlBuffer, MAX_SECONDS };
