const os = require('os');
const fs = require('fs');
const config = require('../config');
const { all } = require('../lib/loader');
const { runtime, formatSize, getBuffer } = require('../lib/utils');

const CATS = {
  main: '🏠 𝐏𝐑𝐈𝐍𝐂𝐈𝐏𝐀𝐋',
  ai: '🤖 𝐈𝐀',
  group: '👥 𝐆𝐑𝐎𝐔𝐏𝐄',
  tools: '🛠️ 𝐎𝐔𝐓𝐈𝐋𝐒',
  download: '📥 𝐓𝐄́𝐋𝐄́𝐂𝐇𝐀𝐑𝐆𝐄𝐌𝐄𝐍𝐓',
  media: '🎞️ 𝐌𝐄́𝐃𝐈𝐀',
  search: '🔎 𝐑𝐄𝐂𝐇𝐄𝐑𝐂𝐇𝐄',
  anime: '🎌 𝐀𝐍𝐈𝐌𝐄',
  fun: '🎮 𝐅𝐔𝐍',
  owner: '👑 𝐎𝐖𝐍𝐄𝐑'
};

function greeting() {
  const h = Number(new Date().toLocaleString('fr-FR', { hour: 'numeric', hour12: false, timeZone: config.timezone }));
  if (h < 12) return 'Bonjour 🌅';
  if (h < 18) return 'Bon après-midi ☀️';
  return 'Bonsoir 🌙';
}

function header(ctx) {
  const { prefix, sock, db } = ctx;
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR', { timeZone: config.timezone });
  const time = now.toLocaleTimeString('fr-FR', { timeZone: config.timezone });
  return (
    `╭━━━━〔 ${config.botName} 〕━━━━╮\n` +
    `┃ ${greeting()} @${ctx.senderNum}\n` +
    `┃ 👑 Owner : ${config.ownerName}\n` +
    `┃ ⚙️ Préfixe : ${prefix}\n` +
    `┃ 🌐 Mode : ${db.settings.mode}\n` +
    `┃ ⏱️ Uptime : ${runtime((Date.now() - sock.startedAt) / 1000)}\n` +
    `┃ 📅 ${date} • ${time}\n` +
    `┃ 📦 Commandes : ${all.length}\n` +
    `┃ ✈️ ${config.telegram}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯`
  );
}

/** Les listes de commandes, découpées en messages de moins de 3000 caractères. */
function menuChunks(prefix) {
  const blocks = [];
  for (const [key, title] of Object.entries(CATS)) {
    const cmds = all.filter((c) => c.category === key && !c.hidden);
    if (!cmds.length) continue;
    blocks.push(`╭──〔 ${title} 〕\n${cmds.map((c) => `│ ➜ ${prefix}${c.name}`).join('\n')}\n╰──────────────`);
  }
  const chunks = [];
  let cur = '';
  for (const b of blocks) {
    if (cur && cur.length + b.length > 2500) {
      chunks.push(cur);
      cur = '';
    }
    cur += `${cur ? '\n\n' : ''}${b}`;
  }
  if (cur) chunks.push(cur);
  chunks[chunks.length - 1] += `\n\n_${config.botName} • by ${config.ownerName}_`;
  return chunks;
}

module.exports = [
  {
    name: 'menu',
    aliases: ['help', 'aide', 'allmenu', 'commands', 'start'],
    desc: 'Affiche le menu des commandes',
    category: 'main',
    async run(ctx) {
      const mentions = [ctx.sender];
      const q = { quoted: ctx.m };
      // Une légende d'image trop longue n'est pas affichée par WhatsApp : on envoie l'image avec l'en-tête seulement,
      // puis les listes de commandes en messages texte.
      let sentHeader = false;
      try {
        const img = config.menuImage ? await getBuffer(config.menuImage) : fs.readFileSync(config.botImagePath);
        await ctx.sock.sendMessage(ctx.from, { image: img, caption: header(ctx), mentions }, q);
        sentHeader = true;
      } catch {
        /* on retombe sur le texte */
      }
      const chunks = menuChunks(ctx.prefix);
      if (!sentHeader) chunks[0] = `${header(ctx)}\n\n${chunks[0]}`;
      for (const text of chunks) {
        await ctx.sock.sendMessage(ctx.from, { text, mentions }, q);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  },
  {
    name: 'ping',
    aliases: ['speed', 'latence'],
    desc: 'Teste la vitesse du bot',
    category: 'main',
    async run(ctx) {
      const t = Date.now();
      const sent = await ctx.reply('🏓 Ping...');
      const ms = Date.now() - t;
      await ctx.sock.sendMessage(ctx.from, { text: `🏓 *Pong !* ${ms} ms`, edit: sent.key });
    }
  },
  {
    name: 'alive',
    aliases: ['bot', 'online'],
    desc: 'Vérifie que le bot est en ligne',
    category: 'main',
    async run(ctx) {
      const caption = `✅ *${config.botName}* est en ligne !\n\n⏱️ Uptime : ${runtime((Date.now() - ctx.sock.startedAt) / 1000)}\n👑 Owner : ${config.ownerName}\n📜 Tape ${ctx.prefix}menu`;
      try {
        return await ctx.sock.sendMessage(ctx.from, { image: fs.readFileSync(config.botImagePath), caption }, { quoted: ctx.m });
      } catch {
        return ctx.reply(caption);
      }
    }
  },
  {
    name: 'uptime',
    aliases: ['runtime'],
    desc: "Temps de fonctionnement",
    category: 'main',
    async run(ctx) {
      await ctx.reply(`⏱️ *Uptime :* ${runtime((Date.now() - ctx.sock.startedAt) / 1000)}`);
    }
  },
  {
    name: 'owner',
    aliases: ['creator', 'dev', 'createur'],
    desc: 'Contact du propriétaire',
    category: 'main',
    async run(ctx) {
      const vcard =
        'BEGIN:VCARD\nVERSION:3.0\n' +
        `FN:${config.ownerName}\n` +
        `ORG:${config.botName};\n` +
        `TEL;type=CELL;type=VOICE;waid=${config.ownerNumber}:+${config.ownerNumber}\n` +
        `URL:${config.telegram}\nEND:VCARD`;
      await ctx.sock.sendMessage(
        ctx.from,
        { contacts: { displayName: config.ownerName, contacts: [{ vcard }] } },
        { quoted: ctx.m }
      );
      await ctx.reply(`👑 *Owner :* ${config.ownerName}\n📞 wa.me/${config.ownerNumber}\n✈️ Telegram : ${config.telegram}`);
    }
  },
  {
    name: 'telegram',
    aliases: ['tg', 'support'],
    desc: 'Telegram du owner',
    category: 'main',
    async run(ctx) {
      await ctx.reply(`✈️ *Telegram du owner :*\n${config.telegram}`);
    }
  },
  {
    name: 'script',
    aliases: ['repo', 'sc'],
    desc: 'Lien du code source',
    category: 'main',
    hidden: false,
    async run(ctx) {
      await ctx.reply(`📦 *${config.botName}*\n\n🔗 Repo : ${config.repo}\n👑 ${config.ownerName}\n✈️ ${config.telegram}`);
    }
  },
  {
    name: 'botinfo',
    aliases: ['info', 'infobot', 'stats'],
    desc: 'Informations du bot',
    category: 'main',
    async run(ctx) {
      const mem = process.memoryUsage();
      await ctx.reply(
        `🤖 *${config.botName}*\n\n` +
          `👑 Owner : ${config.ownerName}\n` +
          `📞 Numéro : ${config.botNumber}\n` +
          `⚙️ Préfixe : ${ctx.prefix}\n` +
          `🌐 Mode : ${ctx.db.settings.mode}\n` +
          `📦 Commandes : ${all.length}\n` +
          `⏱️ Uptime : ${runtime((Date.now() - ctx.sock.startedAt) / 1000)}\n` +
          `🧠 RAM : ${formatSize(mem.rss)} / ${formatSize(os.totalmem())}\n` +
          `🖥️ Node : ${process.version}\n` +
          `💻 Plateforme : ${os.platform()}`
      );
    }
  },
  {
    name: 'pairsite',
    aliases: ['pair', 'getcode'],
    desc: 'Lien du site pour obtenir un code de pairing',
    category: 'main',
    async run(ctx) {
      const url = process.env.RENDER_EXTERNAL_URL || 'le site du bot';
      await ctx.reply(`🔗 *Obtiens ton code de pairing ici :*\n${url}\n\nEntre ton numéro (format international) puis lie-le dans WhatsApp > Appareils connectés.`);
    }
  }
];
