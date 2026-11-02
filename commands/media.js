const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config');
const { downloadMedia } = require('../lib/utils');

try {
  process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || require('ffmpeg-static');
} catch {
  /* ffmpeg système */
}

const tmp = (ext) => path.join(os.tmpdir(), `epx-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);

// ---------- Images (sharp) ----------

function imageCommand({ name, aliases = [], desc, usage, build }) {
  return {
    name,
    aliases,
    desc,
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['imageMessage', 'stickerMessage']);
      if (!media) return ctx.reply(`🖼️ Réponds à une image ou un sticker avec ${ctx.prefix}${usage || name}`);
      const sharp = require('sharp');
      const out = await build(sharp(media.buffer), ctx).jpeg({ quality: 90 }).toBuffer();
      await ctx.sock.sendMessage(ctx.from, { image: out, caption: `✅ ${config.botName}` }, { quoted: ctx.m });
    }
  };
}

// ---------- Audio (ffmpeg) ----------

function audioFx(buffer, filter) {
  const ffmpeg = require('fluent-ffmpeg');
  if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
  return new Promise((resolve, reject) => {
    const input = tmp('bin');
    const output = tmp('mp3');
    fs.writeFileSync(input, buffer);
    const cleanup = () => {
      fs.rmSync(input, { force: true });
      fs.rmSync(output, { force: true });
    };
    ffmpeg(input)
      .noVideo()
      .audioFilters(filter)
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .format('mp3')
      .on('error', (e) => {
        cleanup();
        reject(e);
      })
      .on('end', () => {
        const out = fs.readFileSync(output);
        cleanup();
        resolve(out);
      })
      .save(output);
  });
}

function audioCommand({ name, aliases = [], desc, filter }) {
  return {
    name,
    aliases,
    desc,
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['audioMessage', 'videoMessage']);
      if (!media) return ctx.reply(`🎧 Réponds à un audio ou une vidéo avec ${ctx.prefix}${name}`);
      const out = await audioFx(media.buffer, filter);
      await ctx.sock.sendMessage(ctx.from, { audio: out, mimetype: 'audio/mpeg' }, { quoted: ctx.m });
    }
  };
}

const commands = [
  imageCommand({
    name: 'blur',
    aliases: ['flou'],
    desc: 'Floute une image : blur 10',
    usage: 'blur 10',
    build: (img, ctx) => img.blur(Math.min(Math.max(parseFloat(ctx.args[0]) || 8, 1), 50))
  }),
  imageCommand({ name: 'grey', aliases: ['gris', 'noiretblanc', 'bw'], desc: 'Image en noir et blanc', build: (img) => img.grayscale() }),
  imageCommand({ name: 'mirror', aliases: ['miroir', 'flip-image'], desc: 'Effet miroir', build: (img) => img.flop() }),
  imageCommand({
    name: 'rotate',
    aliases: ['pivoter', 'tourner'],
    desc: 'Fait pivoter une image : rotate 90',
    usage: 'rotate 90',
    build: (img, ctx) => img.rotate(((parseInt(ctx.args[0]) || 90) % 360 + 360) % 360)
  }),
  imageCommand({ name: 'invert', aliases: ['negatif', 'inverser-couleurs'], desc: 'Inverse les couleurs', build: (img) => img.negate({ alpha: false }) }),
  imageCommand({
    name: 'sepia',
    aliases: ['vintage'],
    desc: 'Effet sépia',
    build: (img) => img.recomb([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]])
  }),
  audioCommand({ name: 'bass', aliases: ['basse', 'bassboost'], desc: 'Renforce les basses', filter: 'bass=g=14,volume=0.85' }),
  audioCommand({ name: 'nightcore', aliases: ['rapide', 'speedup'], desc: 'Version nightcore (plus rapide et aiguë)', filter: 'aresample=44100,asetrate=44100*1.25,aresample=44100' })
];

module.exports = commands.map((c) => ({ category: 'media', ...c }));
