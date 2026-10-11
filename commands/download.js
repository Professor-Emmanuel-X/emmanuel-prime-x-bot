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

function getYtdl() {
  return require('@distube/ytdl-core');
}

async function sendAudio(ctx, video) {
  const ytdl = getYtdl();
  const buf = await streamToBuffer(ytdl(video.url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }));
  await ctx.sock.sendMessage(
    ctx.from,
    { audio: buf, mimetype: 'audio/mp4', fileName: `${video.title}.mp3` },
    { quoted: ctx.m }
  );
}

async function sendVideo(ctx, video) {
  const ytdl = getYtdl();
  const buf = await streamToBuffer(
    ytdl(video.url, { filter: (f) => f.hasVideo && f.hasAudio && f.container === 'mp4', quality: 'highest', highWaterMark: 1 << 25 })
  );
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
