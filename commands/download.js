const yts = require('yt-search');
const axios = require('axios');
const config = require('../config');
const { fetchJson, getBuffer, extractUrl } = require('../lib/utils');
const { download, sniff, HOSTS } = require('../lib/dl');
const { findVideo, getSong, ytdlBuffer } = require('../lib/music');

const kb = (n) => `${(n / 1048576).toFixed(1)} Mo`;

/** Envoie un média selon son vrai type. */
async function sendMedia(ctx, item, caption = '') {
  const cap = `${caption}${caption ? '\n\n' : ''}_${config.botName}_`;
  const q = { quoted: ctx.m };
  if (item.type === 'video') return ctx.sock.sendMessage(ctx.from, { video: item.buffer, caption: cap, mimetype: 'video/mp4' }, q);
  if (item.type === 'image') return ctx.sock.sendMessage(ctx.from, { image: item.buffer, caption: cap }, q);
  if (item.type === 'audio') return ctx.sock.sendMessage(ctx.from, { audio: item.buffer, mimetype: 'audio/mp4' }, q);
  return ctx.sock.sendMessage(ctx.from, { document: item.buffer, mimetype: 'application/octet-stream', fileName: caption || 'fichier', caption: cap }, q);
}

async function sendSong(ctx, query, asDocument) {
  const song = await getSong(query);
  const isMp4 = song.buffer.slice(4, 8).toString() === 'ftyp';
  const mimetype = isMp4 ? 'audio/mp4' : 'audio/mpeg';
  const info =
    `🎵 *${song.title}*\n👤 ${song.artist || 'Inconnu'}` +
    (song.duration ? `\n⏱️ ${song.duration}` : '') +
    (song.url ? `\n🔗 ${song.url}` : '') +
    (song.full ? '' : '\n\n⚠️ Extrait de 30 secondes (le morceau complet est indisponible pour le moment).');
  if (song.thumb) {
    await ctx.sock.sendMessage(ctx.from, { image: { url: song.thumb }, caption: info }, { quoted: ctx.m }).catch(() => ctx.reply(info));
  } else {
    await ctx.reply(info);
  }
  if (asDocument) {
    await ctx.sock.sendMessage(ctx.from, { document: song.buffer, mimetype, fileName: `${song.title}.mp3` }, { quoted: ctx.m });
  } else {
    await ctx.sock.sendMessage(ctx.from, { audio: song.buffer, mimetype, fileName: `${song.title}.mp3` }, { quoted: ctx.m });
  }
}

function socialCommand({ name, aliases, desc, kind, host, label }) {
  return {
    name,
    aliases,
    desc,
    category: 'download',
    async run(ctx) {
      const u = extractUrl(ctx.text || ctx.quoted?.text || '');
      if (!u || !host.test(u)) return ctx.reply(`📥 Utilisation : ${ctx.prefix}${name} ${label}`);
      await ctx.reply('⏳ Téléchargement en cours…');
      const got = await download(kind, u, { max: 5 });
      if (!got?.length) {
        return ctx.reply(`❌ Impossible de télécharger ce lien pour le moment (publication privée, lien invalide ou service indisponible).`);
      }
      const media = got.filter((g) => g.type !== 'bad');
      for (const item of media.slice(0, 5)) await sendMedia(ctx, item, '');
    }
  };
}

module.exports = [
  {
    name: 'play',
    aliases: ['musique', 'music', 'jouer'],
    desc: 'Télécharge une musique (nom ou lien YouTube)',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`🎵 Exemple : ${ctx.prefix}play Burna Boy Last Last`);
      await ctx.reply('🔎 Recherche en cours…');
      await sendSong(ctx, ctx.text, false);
    }
  },
  {
    name: 'song',
    aliases: ['chanson', 'songdoc'],
    desc: 'Télécharge une chanson en fichier MP3',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`🎶 Exemple : ${ctx.prefix}song Asake Lonely at the top`);
      await ctx.reply('🔎 Recherche en cours…');
      await sendSong(ctx, ctx.text, true);
    }
  },
  {
    name: 'ytmp3',
    aliases: ['yta', 'audio'],
    desc: 'Lien YouTube → audio',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}ytmp3 https://youtu.be/...`);
      await ctx.reply('⏳ Téléchargement en cours…');
      await sendSong(ctx, ctx.text, false);
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
      if (v.seconds > 10 * 60) return ctx.reply('⏱️ Vidéo trop longue (10 minutes maximum).');
      await ctx.reply(`⏳ Téléchargement : *${v.title}*`);
      let buf;
      try {
        buf = await ytdlBuffer('video', v);
      } catch (e) {
        console.error('[ytmp4] YouTube direct refusé :', e.message);
        const got = await download('ytmp4', v.url, { max: 1 });
        buf = got?.find((g) => g.type === 'video')?.buffer;
      }
      if (!buf) return ctx.reply("❌ YouTube bloque le serveur pour les vidéos et aucun service de secours n'a répondu. Essaie plus tard.");
      await sendMedia(ctx, { type: 'video', buffer: buf }, `🎬 ${v.title}`);
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
  socialCommand({ name: 'facebook', aliases: ['fb', 'fbdl'], desc: 'Télécharge une vidéo Facebook', kind: 'facebook', host: /(facebook\.com|fb\.watch|fb\.com)/i, label: 'https://www.facebook.com/...' }),
  socialCommand({ name: 'instagram', aliases: ['ig', 'igdl', 'insta'], desc: 'Télécharge un post / reel Instagram', kind: 'instagram', host: /instagram\.com/i, label: 'https://www.instagram.com/reel/...' }),
  socialCommand({ name: 'twitter', aliases: ['x', 'twdl', 'xdl'], desc: 'Télécharge une vidéo Twitter / X', kind: 'twitter', host: /(twitter\.com|x\.com)/i, label: 'https://x.com/...' }),
  socialCommand({ name: 'pinterest', aliases: ['pin', 'pindl'], desc: 'Télécharge une image / vidéo Pinterest', kind: 'pinterest', host: /(pinterest\.|pin\.it)/i, label: 'https://pin.it/...' }),
  socialCommand({ name: 'mediafire', aliases: ['mf', 'mfdl'], desc: 'Télécharge un fichier MediaFire', kind: 'mediafire', host: /mediafire\.com/i, label: 'https://www.mediafire.com/file/...' }),
  socialCommand({ name: 'spotify', aliases: ['spotifydl', 'spdl'], desc: 'Télécharge un titre Spotify (lien)', kind: 'spotify', host: /spotify\.com/i, label: 'https://open.spotify.com/track/...' }),
  {
    name: 'lyrics',
    aliases: ['paroles', 'lyric'],
    desc: 'Paroles d’une chanson',
    category: 'download',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}lyrics Burna Boy Last Last`);
      const r = await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(ctx.text)}`);
      const t = Array.isArray(r) && r.find((x) => x.plainLyrics);
      if (!t) return ctx.reply('❌ Paroles introuvables.');
      const text = t.plainLyrics.length > 3500 ? `${t.plainLyrics.slice(0, 3500)}…` : t.plainLyrics;
      await ctx.reply(`🎤 *${t.trackName}* — ${t.artistName}\n\n${text}`);
    }
  },
  {
    name: 'apitest',
    aliases: ['testapi', 'diagnostic'],
    desc: 'Teste les services utilisés par les commandes (owner)',
    category: 'download',
    owner: true,
    async run(ctx) {
      const targets = [
        ['nekos.best (waifu, neko, câlins)', 'https://nekos.best/api/v2/waifu'],
        ['Audius (musique)', 'https://api.audius.co/v1/tracks/search?query=a&app_name=EMMANUELPRIMEX&limit=1'],
        ['iTunes (extraits)', 'https://itunes.apple.com/search?term=a&limit=1'],
        ['Deezer (extraits)', 'https://api.deezer.com/search?q=a&limit=1'],
        ['TikWM (TikTok)', 'https://www.tikwm.com/api/'],
        ['LRCLib (paroles)', 'https://lrclib.net/api/search?q=a'],
        ['OpenRouter (IA)', 'https://openrouter.ai/api/v1/models'],
        ['YouTube', 'https://www.youtube.com/'],
        ['thecatapi (.cat)', 'https://api.thecatapi.com/v1/images/search'],
        ['dog.ceo (.dog)', 'https://dog.ceo/api/breeds/image/random'],
        ['purrbot (animations)', 'https://api.purrbot.site/v2/img/sfw/bite/gif'],
        ['otakugifs (animations)', 'https://api.otakugifs.xyz/gif?reaction=bite'],
        ['pollinations (.imagine)', 'https://image.pollinations.ai/prompt/a?width=64&height=64'],
        ['Jikan (anime)', 'https://api.jikan.moe/v4/anime?q=naruto&limit=1'],
        ['PokeAPI', 'https://pokeapi.co/api/v2/pokemon/pikachu'],
        ['wttr.in (météo)', 'https://wttr.in/Brazzaville?format=3'],
        ['Wikipedia', 'https://fr.wikipedia.org/api/rest_v1/page/summary/Congo'],
        ['JokeAPI', 'https://v2.jokeapi.dev/joke/Any?safe-mode'],
        ['meme-api', 'https://meme-api.com/gimme'],
        ['Google Traduction', 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=hello'],
        ['Coingecko (.crypto)', 'https://api.coingecko.com/api/v3/ping'],
        ['restcountries', 'https://restcountries.com/v3.1/name/congo'],
        ['open.er-api (devises)', 'https://open.er-api.com/v6/latest/USD'],
        ['dictionaryapi', 'https://api.dictionaryapi.dev/api/v2/entries/en/hello'],
        ['thum.io (.ssweb)', 'https://image.thum.io/get/https://example.com'],
        ...Object.entries(HOSTS).map(([k, v]) => [`${k} (secours Facebook/Insta/YT)`, v])
      ];
      await ctx.reply('🧪 Test en cours (≈ 15 s)…');
      const res = await Promise.all(
        targets.map(async ([label, url]) => {
          const t0 = Date.now();
          try {
            const r = await axios.get(url, { timeout: 12000, validateStatus: () => true, responseType: 'arraybuffer', maxContentLength: 2 * 1024 * 1024, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EmmanuelPrimeXBot/1.0)' } });
            return `${r.status < 500 ? '✅' : '⚠️'} ${label} — HTTP ${r.status} (${Date.now() - t0} ms)`;
          } catch (e) {
            return `❌ ${label} — ${e.code || e.message}`;
          }
        })
      );
      await ctx.reply(`🧪 *Services*\n\n${res.join('\n')}\n\n✅ répond • ❌ injoignable depuis Render\nOpenRouter : clé ${process.env.OPENROUTER_API_KEY ? 'présente' : 'ABSENTE'}`);
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
