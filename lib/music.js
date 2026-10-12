const yts = require('yt-search');
const { fetchJson, getBuffer, extractUrl } = require('./utils');
const { download, sniff } = require('./dl');

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
  return r.videos?.[0];
}

async function ytdlBuffer(kind, video) {
  const { ytdl, agent: ag } = getYtdl();
  const opts =
    kind === 'audio'
      ? { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }
      : { filter: (f) => f.hasVideo && f.hasAudio && f.container === 'mp4', quality: 'highest', highWaterMark: 1 << 25 };
  if (ag) opts.agent = ag;
  return streamToBuffer(ytdl(video.url, opts));
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
  const video = await findVideo(query).catch(() => null);
  const name = video?.title || query;
  if (video && video.seconds <= MAX_SECONDS) {
    try {
      const buffer = await ytdlBuffer('audio', video);
      return { buffer, title: video.title, artist: video.author?.name, full: true, thumb: video.thumbnail, url: video.url, duration: video.timestamp };
    } catch (e) {
      console.error('[music] YouTube direct refusé :', e.message);
    }
    const got = await download('ytmp3', video.url, { max: 1 });
    if (got?.[0] && got[0].type !== 'image') {
      return { buffer: got[0].buffer, title: video.title, artist: video.author?.name, full: true, thumb: video.thumbnail, url: video.url, duration: video.timestamp };
    }
  }
  const alt = (await audius(name).catch((e) => (console.error('[music] Audius :', e.message), null))) || (await preview(name));
  if (alt) return { ...alt, url: video?.url, duration: video?.timestamp };
  throw new Error('Impossible de récupérer cette musique pour le moment. Essaie un autre titre.');
}

module.exports = { findVideo, getSong, ytdlBuffer, MAX_SECONDS };
