const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const QRCode = require('qrcode');
const config = require('../config');
const { getBuffer, fetchJson, downloadMedia, fancy, fancyStyles, isUrl, extractUrl } = require('../lib/utils');

// ffmpeg embarqué (utilisé par wa-sticker-formatter et fluent-ffmpeg)
try {
  process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || require('ffmpeg-static');
} catch {
  /* ffmpeg système */
}

const tmp = (ext) => path.join(os.tmpdir(), `epx-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

function ffmpegToMp3(buffer) {
  const ffmpeg = require('fluent-ffmpeg');
  if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
  return new Promise((resolve, reject) => {
    const input = tmp('bin');
    const output = tmp('mp3');
    fs.writeFileSync(input, buffer);
    ffmpeg(input)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .format('mp3')
      .on('error', (e) => {
        fs.rmSync(input, { force: true });
        reject(e);
      })
      .on('end', () => {
        const out = fs.readFileSync(output);
        fs.rmSync(input, { force: true });
        fs.rmSync(output, { force: true });
        resolve(out);
      })
      .save(output);
  });
}

async function makeSticker(buffer, pack, author) {
  const { Sticker, StickerTypes } = require('wa-sticker-formatter');
  const s = new Sticker(buffer, { pack, author, type: StickerTypes.FULL, quality: 60 });
  return s.toBuffer();
}

module.exports = [
  {
    name: 'sticker',
    aliases: ['s', 'stiker', 'stick'],
    desc: 'Crée un sticker (image ou courte vidéo)',
    category: 'tools',
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['imageMessage', 'videoMessage']);
      if (!media) return ctx.reply(`🖼️ Réponds à une image ou une vidéo (≤ 10 s) avec ${ctx.prefix}sticker`);
      if (media.type === 'videoMessage' && (media.node.seconds || 0) > 10) return ctx.reply('⏱️ La vidéo doit durer 10 secondes maximum.');
      const [pack, author] = ctx.text.includes('|') ? ctx.text.split('|').map((s) => s.trim()) : [config.stickerPack, config.stickerAuthor];
      const out = await makeSticker(media.buffer, pack, author);
      await ctx.sock.sendMessage(ctx.from, { sticker: out }, { quoted: ctx.m });
    }
  },
  {
    name: 'take',
    aliases: ['wm', 'steal'],
    desc: "Change le pack d'un sticker : take pack|auteur",
    category: 'tools',
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['stickerMessage']);
      if (!media) return ctx.reply(`Réponds à un sticker avec ${ctx.prefix}take pack|auteur`);
      const [pack, author] = ctx.text.includes('|') ? ctx.text.split('|').map((s) => s.trim()) : [ctx.text || config.stickerPack, config.stickerAuthor];
      const out = await makeSticker(media.buffer, pack, author);
      await ctx.sock.sendMessage(ctx.from, { sticker: out }, { quoted: ctx.m });
    }
  },
  {
    name: 'toimg',
    aliases: ['toimage', 'stickertoimg'],
    desc: 'Sticker → image',
    category: 'tools',
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['stickerMessage']);
      if (!media) return ctx.reply(`Réponds à un sticker avec ${ctx.prefix}toimg`);
      const sharp = require('sharp');
      const png = await sharp(media.buffer).png().toBuffer();
      await ctx.sock.sendMessage(ctx.from, { image: png, caption: `✅ ${config.botName}` }, { quoted: ctx.m });
    }
  },
  {
    name: 'tomp3',
    aliases: ['toaudio', 'mp3'],
    desc: 'Vidéo / note vocale → MP3',
    category: 'tools',
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['videoMessage', 'audioMessage']);
      if (!media) return ctx.reply(`Réponds à une vidéo ou un audio avec ${ctx.prefix}tomp3`);
      const out = await ffmpegToMp3(media.buffer);
      await ctx.sock.sendMessage(ctx.from, { audio: out, mimetype: 'audio/mpeg' }, { quoted: ctx.m });
    }
  },
  {
    name: 'tourl',
    aliases: ['upload', 'url'],
    desc: 'Héberge un média et donne le lien',
    category: 'tools',
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx);
      if (!media) return ctx.reply(`Réponds à une image / vidéo / audio / document avec ${ctx.prefix}tourl`);
      const ext = (media.mimetype || 'application/octet-stream').split('/')[1].split(';')[0] || 'bin';
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      form.append('fileToUpload', new Blob([media.buffer], { type: media.mimetype }), `file.${ext}`);
      const { data } = await axios.post('https://catbox.moe/user/api.php', form, { timeout: 120000 });
      if (!/^https?:\/\//.test(String(data))) throw new Error("L'hébergement a échoué, réessaie plus tard.");
      await ctx.reply(`🔗 *Lien :*\n${String(data).trim()}`);
    }
  },
  {
    name: 'tts',
    aliases: ['say-voice', 'voix'],
    desc: 'Texte → voix : tts fr Bonjour',
    category: 'tools',
    async run(ctx) {
      let lang = 'fr';
      let text = ctx.text || ctx.quoted?.text || '';
      if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(ctx.args[0] || '') && ctx.args.length > 1) {
        lang = ctx.args[0];
        text = ctx.args.slice(1).join(' ');
      }
      if (!text) return ctx.reply(`Utilisation : ${ctx.prefix}tts fr Bonjour tout le monde`);
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=${lang}&client=tw-ob`;
      const audio = await getBuffer(url);
      await ctx.sock.sendMessage(ctx.from, { audio, mimetype: 'audio/mpeg', ptt: true }, { quoted: ctx.m });
    }
  },
  {
    name: 'translate',
    aliases: ['tr', 'traduire'],
    desc: 'Traduit un texte : tr en Bonjour',
    category: 'tools',
    async run(ctx) {
      let to = 'fr';
      let text = ctx.text || ctx.quoted?.text || '';
      if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(ctx.args[0] || '') && (ctx.args.length > 1 || ctx.quoted)) {
        to = ctx.args[0];
        text = ctx.args.slice(1).join(' ') || ctx.quoted?.text || '';
      }
      if (!text) return ctx.reply(`Utilisation : ${ctx.prefix}tr en Bonjour\n(ou réponds à un message : ${ctx.prefix}tr es)`);
      const data = await fetchJson(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
      );
      const out = (data[0] || []).map((x) => x[0]).join('');
      await ctx.reply(`🌍 *Traduction (${data[2] || '?'} → ${to})*\n\n${out}`);
    }
  },
  {
    name: 'qr',
    aliases: ['qrcode'],
    desc: 'Crée un QR code',
    category: 'tools',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}qr https://exemple.com`);
      const img = await QRCode.toBuffer(ctx.text, { width: 600, margin: 2 });
      await ctx.sock.sendMessage(ctx.from, { image: img, caption: '✅ QR code généré' }, { quoted: ctx.m });
    }
  },
  {
    name: 'calc',
    aliases: ['calculate', 'calcul'],
    desc: 'Calculatrice',
    category: 'tools',
    async run(ctx) {
      const expr = ctx.text.replace(/,/g, '.').replace(/\^/g, '**').replace(/x/gi, '*');
      if (!expr || !/^[0-9+\-*/().%\s]+$/.test(expr)) return ctx.reply(`Utilisation : ${ctx.prefix}calc 12*(3+4)`);
      let result;
      try {
        result = Function(`"use strict"; return (${expr})`)();
      } catch {
        return ctx.reply('❌ Expression invalide.');
      }
      if (typeof result !== 'number' || !isFinite(result)) return ctx.reply('❌ Résultat invalide.');
      await ctx.reply(`🧮 ${ctx.text} = *${result}*`);
    }
  },
  {
    name: 'weather',
    aliases: ['meteo', 'météo'],
    desc: 'Météo d’une ville',
    category: 'tools',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}meteo Brazzaville`);
      const d = await fetchJson(`https://wttr.in/${encodeURIComponent(ctx.text)}?format=j1&lang=fr`);
      const c = d.current_condition?.[0];
      const a = d.nearest_area?.[0];
      if (!c) return ctx.reply('❌ Ville introuvable.');
      const desc = c.lang_fr?.[0]?.value || c.weatherDesc?.[0]?.value;
      await ctx.reply(
        `🌤️ *Météo — ${a?.areaName?.[0]?.value || ctx.text}, ${a?.country?.[0]?.value || ''}*\n\n` +
          `🌡️ Température : ${c.temp_C}°C (ressenti ${c.FeelsLikeC}°C)\n` +
          `☁️ Ciel : ${desc}\n💧 Humidité : ${c.humidity}%\n💨 Vent : ${c.windspeedKmph} km/h\n👁️ Visibilité : ${c.visibility} km`
      );
    }
  },
  {
    name: 'wiki',
    aliases: ['wikipedia'],
    desc: 'Recherche Wikipédia',
    category: 'tools',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}wiki Napoléon`);
      const s = await fetchJson(
        `https://fr.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(ctx.text)}&format=json&srlimit=1`
      );
      const title = s?.query?.search?.[0]?.title;
      if (!title) return ctx.reply('❌ Aucun résultat.');
      const r = await fetchJson(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      await ctx.reply(`📚 *${r.title}*\n\n${r.extract}\n\n🔗 ${r.content_urls?.desktop?.page || ''}`);
    }
  },
  {
    name: 'define',
    aliases: ['dictionary', 'dico'],
    desc: 'Définition d’un mot (anglais)',
    category: 'tools',
    async run(ctx) {
      if (!ctx.args[0]) return ctx.reply(`Utilisation : ${ctx.prefix}define hello`);
      try {
        const d = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(ctx.args[0])}`);
        const e = d[0];
        const defs = e.meanings
          .slice(0, 3)
          .map((m) => `• _${m.partOfSpeech}_ : ${m.definitions[0].definition}`)
          .join('\n');
        await ctx.reply(`📖 *${e.word}* ${e.phonetic || ''}\n\n${defs}`);
      } catch {
        await ctx.reply('❌ Mot introuvable.');
      }
    }
  },
  {
    name: 'shorturl',
    aliases: ['short', 'tinyurl'],
    desc: 'Raccourcit un lien',
    category: 'tools',
    async run(ctx) {
      const u = extractUrl(ctx.text || ctx.quoted?.text || '');
      if (!u) return ctx.reply(`Utilisation : ${ctx.prefix}shorturl https://exemple.com/long-lien`);
      const { data } = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(u)}`, { timeout: 20000 });
      await ctx.reply(`🔗 ${data}`);
    }
  },
  {
    name: 'ssweb',
    aliases: ['screenshot', 'ss'],
    desc: 'Capture d’écran d’un site',
    category: 'tools',
    async run(ctx) {
      const u = extractUrl(ctx.text || '');
      if (!u) return ctx.reply(`Utilisation : ${ctx.prefix}ssweb https://exemple.com`);
      const img = await getBuffer(`https://image.thum.io/get/width/1280/crop/720/${u}`, { timeout: 90000 });
      await ctx.sock.sendMessage(ctx.from, { image: img, caption: `🖥️ ${u}` }, { quoted: ctx.m });
    }
  },
  {
    name: 'convert',
    aliases: ['currency', 'devise'],
    desc: 'Convertit une devise : convert 100 USD XAF',
    category: 'tools',
    async run(ctx) {
      const [amt, from, to] = ctx.args;
      const n = parseFloat(amt);
      if (!n || !from || !to) return ctx.reply(`Utilisation : ${ctx.prefix}convert 100 USD XAF`);
      const d = await fetchJson(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
      const rate = d?.rates?.[to.toUpperCase()];
      if (!rate) return ctx.reply('❌ Devise inconnue.');
      await ctx.reply(`💱 ${n} ${from.toUpperCase()} = *${(n * rate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${to.toUpperCase()}*`);
    }
  },
  {
    name: 'time',
    aliases: ['heure', 'date'],
    desc: 'Heure dans un fuseau : time Europe/Paris',
    category: 'tools',
    async run(ctx) {
      const tz = ctx.args[0] || config.timezone;
      try {
        const t = new Date().toLocaleString('fr-FR', { timeZone: tz, dateStyle: 'full', timeStyle: 'medium' });
        await ctx.reply(`🕒 *${tz}*\n${t}`);
      } catch {
        await ctx.reply('❌ Fuseau inconnu. Exemple : Africa/Brazzaville, Europe/Paris, America/New_York');
      }
    }
  },
  {
    name: 'fancy',
    aliases: ['font', 'style'],
    desc: 'Change le style du texte',
    category: 'tools',
    async run(ctx) {
      const style = (ctx.args[0] || '').toLowerCase();
      const text = ctx.args.slice(1).join(' ');
      if (!fancyStyles.includes(style) || !text) {
        return ctx.reply(`Utilisation : ${ctx.prefix}fancy <style> <texte>\nStyles : ${fancyStyles.join(', ')}`);
      }
      await ctx.reply(fancy(text, style));
    }
  },
  {
    name: 'github',
    aliases: ['gh', 'ghuser'],
    desc: 'Infos sur un profil GitHub',
    category: 'tools',
    async run(ctx) {
      if (!ctx.args[0]) return ctx.reply(`Utilisation : ${ctx.prefix}github torvalds`);
      try {
        const u = await fetchJson(`https://api.github.com/users/${encodeURIComponent(ctx.args[0])}`);
        await ctx.reply(
          `🐙 *${u.name || u.login}* (@${u.login})\n\n📝 ${u.bio || '—'}\n📦 Repos : ${u.public_repos}\n👥 Followers : ${u.followers}\n🔗 ${u.html_url}`
        );
      } catch {
        await ctx.reply('❌ Utilisateur introuvable.');
      }
    }
  },
  {
    name: 'getpp',
    aliases: ['pp', 'profilepic'],
    desc: 'Photo de profil d’un contact',
    category: 'tools',
    async run(ctx) {
      const t = ctx.getTarget() || (ctx.isGroup ? ctx.sender : ctx.from);
      try {
        const url = await ctx.sock.profilePictureUrl(t, 'image');
        await ctx.sock.sendMessage(ctx.from, { image: { url }, caption: `🖼️ @${t.split('@')[0]}`, mentions: [t] }, { quoted: ctx.m });
      } catch {
        await ctx.reply('❌ Photo de profil indisponible (absente ou privée).');
      }
    }
  },
  {
    name: 'say',
    aliases: ['echo', 'repeat'],
    desc: 'Répète le texte',
    category: 'tools',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}say Bonjour`);
      await ctx.sock.sendMessage(ctx.from, { text: ctx.text });
    }
  },
  {
    name: 'base64',
    aliases: ['b64'],
    desc: 'Encode / décode en base64',
    category: 'tools',
    async run(ctx) {
      const mode = (ctx.args[0] || '').toLowerCase();
      const text = ctx.args.slice(1).join(' ');
      if (!['encode', 'decode'].includes(mode) || !text) return ctx.reply(`Utilisation : ${ctx.prefix}base64 encode Bonjour\n${ctx.prefix}base64 decode Qm9uam91cg==`);
      await ctx.reply(mode === 'encode' ? Buffer.from(text).toString('base64') : Buffer.from(text, 'base64').toString('utf8'));
    }
  },
  {
    name: 'password',
    aliases: ['genpass', 'mdp'],
    desc: 'Génère un mot de passe fort',
    category: 'tools',
    async run(ctx) {
      const len = Math.min(Math.max(parseInt(ctx.args[0]) || 16, 8), 64);
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
      let p = '';
      for (let i = 0; i < len; i++) p += chars[crypto.randomInt(chars.length)];
      await ctx.reply(`🔐 *Mot de passe (${len})*\n\n\`${p}\``);
    }
  },
  {
    name: 'readmore',
    aliases: ['lire-plus'],
    desc: 'Texte avec « Lire la suite » : texte1 | texte2',
    category: 'tools',
    async run(ctx) {
      const [a, b] = ctx.text.split('|');
      if (!a || !b) return ctx.reply(`Utilisation : ${ctx.prefix}readmore Début | Suite cachée`);
      await ctx.sock.sendMessage(ctx.from, { text: `${a.trim()}${'‎'.repeat(4001)}${b.trim()}` });
    }
  },
  {
    name: 'isurl',
    aliases: [],
    desc: 'Vérifie si un texte contient un lien',
    category: 'tools',
    hidden: true,
    async run(ctx) {
      await ctx.reply(isUrl(ctx.text) ? '✅ Lien détecté' : '❌ Aucun lien');
    }
  }
];
