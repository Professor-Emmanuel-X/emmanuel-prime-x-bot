const yts = require('yt-search');
const config = require('../config');
const { fetchJson, getBuffer, extractUrl } = require('../lib/utils');

const MAX_SECONDS = 20 * 60;

async function findVideo(query) {
  const url = extractUrl(query);
  if (url && /(youtube\.com|youtu\.be)/i.test(url)) {
    const id = (url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1];
    if (id) return yts({ videoId: id });
  }
  const r = await yts(query);
  return r.videos?.[0];
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}

let agent;
function getYtdl() {
  const ytdl = require('@distube/ytdl-core');
  // Facultatif : cookies YouTube (variable YT_COOKIES, au format JSON) pour passer le contrôle « pas un robot »
  if (!agent && process.env.YT_COOKIES) {
    try {
      agent = ytdl.createAgent(JSON.parse(process.env.YT_COOKIES));
    } catch (e) {
      console.error('[play] YT_COOKIES invalide :', e.message);
    }
  }
  return { ytdl, agent };
}

// Services de secours quand YouTube bloque le serveur (les IP d'hébergeurs sont souvent refusées)
const PROVIDERS = {
  audio: [
    (u) => `https://api.vreden.my.id/api/ytmp3?url=${encodeURIComponent(u)}`,
    (u) => `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(u)}`,
    (u) => `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(u)}`,
    (u) => `https://api.agatz.xyz/api/ytmp3?url=${encodeURIComponent(u)}`
  ],
  video: [
    (u) => `https://api.vreden.my.id/api/ytmp4?url=${encodeURIComponent(u)}`,
    (u) => `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(u)}`,
    (u) => `https://api.ryzendesu.vip/api/downloader/ytmp4?url=${encodeURIComponent(u)}`,
    (u) => `https://api.agatz.xyz/api/ytmp4?url=${encodeURIComponent(u)}`
  ]
};

// Cherche un lien de téléchargement dans n'importe quelle réponse JSON
function findLink(obj, depth = 0) {
  if (!obj || depth > 5) return null;
  if (typeof obj === 'string') return /^https?:\/\//i.test(obj) && !/\.(jpe?g|png|webp)(\?|$)/i.test(obj) ? obj : null;
  const keys = ['download_url', 'downloadUrl', 'download', 'dl', 'link', 'url', 'result', 'data', 'media'];
  if (typeof obj === 'object') {
    for (const k of keys) {
      if (k in obj) {
        const f = findLink(obj[k], depth + 1);
        if (f) return f;
      }
    }
    for (const v of Object.values(obj)) {
      const f = findLink(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

async function viaProviders(kind, videoUrl) {
  for (const make of PROVIDERS[kind]) {
    try {
      const d = await fetchJson(make(videoUrl), { timeout: 25000 });
      const link = findLink(d);
      if (!link) continue;
      const buf = await getBuffer(link, { timeout: 120000, maxContentLength: 60 * 1024 * 1024 });
      if (buf.length > 5000) return buf;
    } catch (e) {
      console.error(`[play] service de secours refusé (${make('x').split('/')[2]}) :`, e.message);
    }
  }
  return null;
}

async function getMedia(kind, video) {
  try {
    const { ytdl, agent: ag } = getYtdl();
    const opts =
      kind === 'audio'
        ? { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }
        : { filter: (f) => f.hasVideo && f.hasAudio && f.container === 'mp4', quality: 'highest', highWaterMark: 1 << 25 };
    if (ag) opts.agent = ag;
    return await streamToBuffer(ytdl(video.url, opts));
  } catch (e) {
    console.error('[play] YouTube direct refusé :', e.message);
  }
  const buf = await viaProviders(kind, video.url);
  if (!buf) {
    throw new Error("YouTube bloque le serveur et les services de secours sont indisponibles. Réessaie plus tard, ou essaie une autre musique.");
  }
  return buf;
}

async function sendAudio(ctx, video) {
  const buf = await getMedia('audio', video);
  await ctx.sock.sendMessage(
    ctx.from,
    { audio: buf, mimetype: 'audio/mpeg', fileName: `${video.title}.mp3` },
    { quoted: ctx.m }
  );
}

async function sendVideo(ctx, video) {
  const buf = await getMedia('video', video);
  await ctx.sock.sendMessage(
    ctx.from,
    { video: buf, caption: `🎬 ${video.title}\n\n_${config.botName}_`, mimetype: 'video/mp4' },
    { quoted: ctx.m }
  );
}

module.exports = [
  {
    name: 'play',
    aliases: ['song', 'musique', 'music'],
    desc: 'Télécharge une musique YouTube',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`🎵 Exemple : ${ctx.prefix}play Burna Boy Last Last`);
      const v = await findVideo(ctx.text);
      if (!v) return ctx.reply('❌ Aucun résultat.');
      if (v.seconds > MAX_SECONDS) return ctx.reply('⏱️ Vidéo trop longue (20 min maximum).');
      await ctx.sock.sendMessage(
        ctx.from,
        {
          image: { url: v.thumbnail },
          caption: `🎵 *${v.title}*\n👤 ${v.author?.name}\n⏱️ ${v.timestamp}\n👁️ ${v.views?.toLocaleString('fr-FR')} vues\n🔗 ${v.url}\n\n⏳ Téléchargement de l'audio...`
        },
        { quoted: ctx.m }
      );
      await sendAudio(ctx, v);
    }
  },
  {
    name: 'ytmp3',
    aliases: ['yta', 'audio'],
    desc: 'Lien YouTube → audio',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}ytmp3 https://youtu.be/...`);
      const v = await findVideo(ctx.text);
      if (!v) return ctx.reply('❌ Vidéo introuvable.');
      if (v.seconds > MAX_SECONDS) return ctx.reply('⏱️ Vidéo trop longue (20 min maximum).');
      await ctx.reply(`⏳ Téléchargement : *${v.title}*`);
      await sendAudio(ctx, v);
    }
  },
  {
    name: 'ytmp4',
    aliases: ['ytv', 'video'],
    desc: 'Lien YouTube → vidéo',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}ytmp4 https://youtu.be/...`);
      const v = await findVideo(ctx.text);
      if (!v) return ctx.reply('❌ Vidéo introuvable.');
      if (v.seconds > 10 * 60) return ctx.reply('⏱️ Vidéo trop longue (10 min maximum).');
      await ctx.reply(`⏳ Téléchargement : *${v.title}*`);
      await sendVideo(ctx, v);
    }
  },
  {
    name: 'ytsearch',
    aliases: ['yts', 'youtube'],
    desc: 'Recherche sur YouTube',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}yts afrobeat 2026`);
      const r = await yts(ctx.text);
      const list = r.videos.slice(0, 8);
      if (!list.length) return ctx.reply('❌ Aucun résultat.');
      await ctx.reply(
        `🔎 *YouTube : ${ctx.text}*\n\n` +
          list.map((v, i) => `${i + 1}. *${v.title}*\n   ⏱️ ${v.timestamp} • 👁️ ${v.views?.toLocaleString('fr-FR')}\n   🔗 ${v.url}`).join('\n\n')
      );
    }
  },
  {
    name: 'tiktok',
    aliases: ['tt', 'ttdl'],
    desc: 'Télécharge une vidéo TikTok (sans filigrane)',
    category: 'download',
    async run(ctx) {
      const u = extractUrl(ctx.text || ctx.quoted?.text || '');
      if (!u || !/tiktok\.com/i.test(u)) return ctx.reply(`Utilisation : ${ctx.prefix}tiktok https://vm.tiktok.com/...`);
      const d = await fetchJson(`https://www.tikwm.com/api/?url=${encodeURIComponent(u)}&hd=1`);
      const v = d?.data;
      if (!v?.play) return ctx.reply('❌ Impossible de récupérer cette vidéo.');
      const buf = await getBuffer(v.hdplay || v.play);
      await ctx.sock.sendMessage(
        ctx.from,
        { video: buf, caption: `🎬 *${v.title || 'TikTok'}*\n👤 @${v.author?.unique_id || ''}\n\n_${config.botName}_` },
        { quoted: ctx.m }
      );
    }
  }
];
