const yts = require('yt-search');
const { fetchJson, getBuffer, extractUrl } = require('./utils');
const { download, sniff } = require('./dl');
const { proxyBuffer } = require('./ytproxy');
const ytdlp = require('./ytdlp');

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

const fmtDur = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

/**
 * Fiche officielle du morceau (titre exact, artiste, durée, pochette) via Deezer, puis iTunes.
 * Sert à choisir la vraie chanson et pas une reprise / un remix / une autre version.
 */
async function identify(query) {
  const q = ytdlp.words(query);
  const overlap = (t) => {
    const hay = ytdlp.norm(`${t.artist} ${t.title}`);
    return q.filter((w) => hay.includes(w)).length;
  };
  const pickBest = (list) => {
    const ranked = list.map((t) => ({ t, sc: overlap(t) * 10 - (ytdlp.BAD_WORDS.test(t.title) && !ytdlp.BAD_WORDS.test(query) ? 20 : 0) })).sort((a, b) => b.sc - a.sc);
    return ranked[0] && ranked[0].sc >= Math.min(20, q.length * 10 * 0.6) ? ranked[0].t : null;
  };
  try {
    const d = await fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=8`, { retries: 1, timeout: 8000 });
    const t = pickBest((d?.data || []).map((x) => ({ title: x.title_short || x.title, artist: x.artist?.name, seconds: x.duration, thumb: x.album?.cover_big, preview: x.preview })));
    if (t) return t;
  } catch (e) {
    console.error('[music] Deezer (fiche) :', e.code || e.message);
  }
  try {
    const d = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=8`, { retries: 1, timeout: 8000 });
    const t = pickBest((d?.results || []).map((x) => ({ title: x.trackName, artist: x.artistName, seconds: Math.round((x.trackTimeMillis || 0) / 1000), thumb: x.artworkUrl100?.replace('100x100', '600x600'), preview: x.previewUrl })));
    if (t) return t;
  } catch (e) {
    console.error('[music] iTunes (fiche) :', e.code || e.message);
  }
  return null;
}

/** Note une vidéo YouTube : la version officielle de l'artiste passe devant les reprises, paroles, remix… */
function scoreVideo(v, query, canon) {
  const chan = ytdlp.norm(v.author?.name);
  const title = ytdlp.norm(v.title);
  let sc = ytdlp.words(query).filter((w) => `${title} ${chan}`.includes(w)).length * 10;
  if (canon) {
    const a = ytdlp.words(canon.artist);
    const t = ytdlp.words(canon.title);
    sc += t.filter((w) => title.includes(w)).length * 8;
    sc += a.filter((w) => chan.includes(w)).length * 25; // chaîne de l'artiste
    sc += a.filter((w) => title.includes(w)).length * 6;
    if (canon.seconds && v.seconds) sc -= Math.min(40, Math.abs(v.seconds - canon.seconds)) * 1.5; // même durée que la version officielle
  }
  if (/\btopic\b/.test(chan)) sc += 30; // « Artiste - Topic » = audio officiel
  if (/vevo|official/.test(chan)) sc += 15;
  if (/official (audio|video|music)|audio officiel|clip officiel/.test(title)) sc += 10;
  if (ytdlp.BAD_WORDS.test(v.title) && !ytdlp.BAD_WORDS.test(query)) sc -= 45;
  return sc;
}

/** Cherche la vidéo YouTube (texte ou lien). */
async function findVideo(query, canon) {
  const url = extractUrl(query);
  if (url && /(youtube\.com|youtu\.be)/i.test(url)) {
    const id = (url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1];
    if (id) return yts({ videoId: id });
  }
  const r = await yts(canon ? `${canon.artist} ${canon.title}` : query);
  const list = (r.videos || []).filter((v) => v.seconds > 60 && v.seconds <= MAX_SECONDS).slice(0, 10);
  if (!list.length) return r.videos?.[0];
  return list.map((v, i) => ({ v, sc: scoreVideo(v, query, canon) - i * 0.5 })).sort((a, b) => b.sc - a.sc)[0].v;
}

async function ytdlBuffer(kind, video) {
  const id = video.videoId || (String(video.url).match(/([\w-]{11})(?:[&?]|$)/) || [])[1];
  // YouTube vient de refuser ce serveur (anti-robot) : inutile de réessayer, on répond tout de suite
  if (ytdlp.youtubeBlocked()) throw new Error(ytdlp.BLOCK_MESSAGE);
  const errors = [];
  // 1. yt-dlp (mis à jour automatiquement ; accepte des cookies YT_COOKIES_TXT)
  try {
    return await (kind === 'audio' ? ytdlp.audioFromUrl(video.url) : ytdlp.videoFromUrl(video.url));
  } catch (e) {
    errors.push(`yt-dlp: ${e.message}`);
    if (ytdlp.youtubeBlocked()) throw e; // anti-robot : les autres méthodes passent par la même adresse, elles échoueront aussi
  }
  // 2. ytdl-core
  try {
    const { ytdl, agent: ag } = getYtdl();
    const opts =
      kind === 'audio'
        ? { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }
        : { filter: (f) => f.hasVideo && f.hasAudio && f.container === 'mp4', quality: 'highest', highWaterMark: 1 << 25 };
    if (ag) opts.agent = ag;
    return await streamToBuffer(ytdl(video.url, opts));
  } catch (e) {
    errors.push(`ytdl-core: ${e.message}`);
  }
  // 3. instances Piped / Invidious
  console.error('[music] YouTube refusé :', errors.join(' || '), '→ essai via Piped/Invidious');
  return proxyBuffer(kind, id);
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

// Audius : catalogue libre (morceaux entiers) ; on n'accepte que si le titre ET l'artiste correspondent
async function audius(query, canon) {
  const d = await fetchJson(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(canon ? `${canon.artist} ${canon.title}` : query)}&app_name=${APP}&limit=8`);
  const list = (d?.data || []).filter((x) => x.duration > 75);
  const ranked = list.map((x) => ({ x, sc: ytdlp.scoreTrack({ title: x.title, uploader: x.user?.name, duration: x.duration }, query, canon) })).sort((a, b) => b.sc - a.sc);
  const t = ranked[0] && ranked[0].sc >= 40 ? ranked[0].x : null;
  if (!t) return null;
  const buffer = await getBuffer(`https://api.audius.co/v1/tracks/${t.id}/stream?app_name=${APP}`, { timeout: 120000, maxRedirects: 5 });
  if (sniff(buffer) === 'bad') return null;
  return { buffer, title: canon?.title || t.title, artist: canon?.artist || t.user?.name, full: true, source: 'Audius', thumb: canon?.thumb || t.artwork?.['480x480'], duration: fmtDur(t.duration) };
}

// Extrait officiel de 30 secondes (dernier recours) : on réutilise le lien de la fiche trouvée
async function preview(query, canon) {
  if (canon?.preview) {
    try {
      return { buffer: await getBuffer(canon.preview), title: canon.title, artist: canon.artist, full: false, source: 'extrait officiel', thumb: canon.thumb, duration: canon.seconds ? fmtDur(canon.seconds) : undefined };
    } catch (e) {
      console.error('[music] extrait :', e.code || e.message);
    }
  }
  try {
    const d = await fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`);
    const t = d?.results?.[0];
    if (t?.previewUrl) return { buffer: await getBuffer(t.previewUrl), title: t.trackName, artist: t.artistName, full: false, source: 'extrait officiel', thumb: t.artworkUrl100?.replace('100x100', '400x400') };
  } catch (e) {
    console.error('[music] iTunes :', e.message);
  }
  return null;
}

/**
 * Trouve une musique : fiche officielle → YouTube → SoundCloud → Audius → extrait de 30 s.
 * onInfo(info) est appelé dès que le morceau est identifié (avant le téléchargement) pour répondre plus vite.
 * Renvoie { buffer, title, artist, full, thumb, url, duration, source } ou lance une erreur lisible.
 */
async function getSong(query, onInfo) {
  const isLink = /(youtube\.com|youtu\.be)/i.test(query);
  const log = (what) => (e) => (console.error(`[music] ${what} :`, e.code || e.message), null);

  // 1. Fiche officielle (titre exact + artiste + durée) et vidéo YouTube en parallèle
  const canon = isLink ? null : await identify(query).catch(() => null);
  const video = await findVideo(query, canon).catch(() => null);
  const baseInfo = canon
    ? { title: canon.title, artist: canon.artist, thumb: canon.thumb, duration: canon.seconds ? fmtDur(canon.seconds) : video?.timestamp }
    : video
      ? { title: video.title, artist: video.author?.name, thumb: video.thumbnail, duration: video.timestamp }
      : null;
  if (baseInfo && onInfo) Promise.resolve(onInfo(baseInfo)).catch(() => {});

  // 2. YouTube (si le serveur n'est pas bloqué)
  if (video && video.seconds <= MAX_SECONDS && !ytdlp.youtubeBlocked()) {
    try {
      const buffer = await ytdlBuffer('audio', video);
      return { ...baseInfo, title: baseInfo?.title || video.title, url: video.url, full: true, source: 'YouTube', buffer };
    } catch (e) {
      console.error('[music] YouTube refusé :', e.message);
    }
  }

  // 3. Autres catalogues (choix précis grâce à la fiche), puis extrait officiel de 30 s en dernier recours
  const name = isLink ? video?.title || query : query;
  const alt =
    (await ytdlp.soundcloud(name, canon).catch(log('SoundCloud'))) ||
    (await audius(name, canon).catch(log('Audius'))) ||
    (await preview(name, canon));
  if (alt) return alt;
  throw new Error('Impossible de récupérer cette musique pour le moment. Essaie un autre titre.');
}

module.exports = { findVideo, getSong, identify, ytdlBuffer, MAX_SECONDS };
