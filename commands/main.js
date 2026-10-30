const os = require('os');
const fs = require('fs');
const config = require('../config');
const { all } = require('../lib/loader');
const { runtime, formatSize, getBuffer } = require('../lib/utils');
const { sendWithChannelButton } = require('../lib/channelbtn');

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

function buildMenu(ctx) {
  const { prefix, sock, db } = ctx;
  const now = new Date();
  const date = now.toLocaleDateString('fr-FR', { timeZone: config.timezone });
  const time = now.toLocaleTimeString('fr-FR', { timeZone: config.timezone });

  let out =
    `╭━━━━〔 ${config.botName} 〕━━━━╮\n` +
    `┃ ${greeting()} @${ctx.senderNum}\n` +
    `┃ 👑 Owner : ${config.ownerName}\n` +
    `┃ ⚙️ Préfixe : ${prefix}\n` +
    `┃ 🌐 Mode : ${db.settings.mode}\n` +
    `┃ ⏱️ Uptime : ${runtime((Date.now() - sock.startedAt) / 1000)}\n` +
    `┃ 📅 ${date} • ${time}\n` +
    `┃ 📦 Commandes : ${all.length}\n` +
    `┃ ✈️ ${config.telegram}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━╯\n`;

  for (const [key, title] of Object.entries(CATS)) {
    const cmds = all.filter((c) => c.category === key && !c.hidden);
    if (!cmds.length) continue;
    out += `\n╭──〔 ${title} 〕\n`;
    for (const c of cmds) out += `│ ➜ ${prefix}${c.name}\n`;
    out += '╰──────────────\n';
  }
  out += `\n_${config.botName} • by ${config.ownerName}_`;
  return out;
}

module.exports = [
  {
    name: 'menu',
    aliases: ['help', 'aide', 'allmenu', 'commands', 'start'],
    desc: 'Affiche le menu des commandes',
    category: 'main',
    async run(ctx) {
      const caption = buildMenu(ctx);
      const mentions = [ctx.sender];
      let image;
      try {
        image = config.menuImage ? await getBuffer(config.menuImage) : fs.readFileSync(config.botImagePath);
      } catch {
        /* menu sans image */
      }
      return sendWithChannelButton(ctx.sock, ctx.from, { image, text: caption, mentions, quoted: ctx.m });
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
      await sendWithChannelButton(ctx.sock, ctx.from, { text: `👑 *Owner :* ${config.ownerName}\n📞 wa.me/${config.ownerNumber}\n✈️ Telegram : ${config.telegram}`, quoted: ctx.m });
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
    name: 'channel',
    aliases: ['chaine', 'canal', 'wachannel'],
    desc: 'Chaîne WhatsApp officielle du bot',
    category: 'main',
    async run(ctx) {
      await sendWithChannelButton(ctx.sock, ctx.from, { text: `📢 *Chaîne WhatsApp de ${config.botName}*\n\nRejoins la chaîne pour les nouveautés, les mises à jour et les annonces.\n\n👑 ${config.ownerName}`, quoted: ctx.m });
    }
  },
  {
    name: 'followchannels',
    aliases: ['suivrechaines', 'abonnerchaines'],
    desc: 'Abonne ce compte aux chaînes du bot (owner)',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const { followChannels } = require('../lib/channels');
      await ctx.reply('⏳ Abonnement aux chaînes en cours…');
      const r = await followChannels(ctx.sock, { force: true });
      await ctx.reply(
        `📢 *Chaînes*\n\n` +
          r.map((x, i) => `${x.ok ? '✅' : '❌'} Chaîne ${i + 1}${x.ok ? (x.already ? ' (déjà abonné)' : ' : abonné') : ` : ${x.error}`}`).join('\n')
      );
    }
  },
  {
    name: 'script',
    aliases: ['repo', 'sc'],
    desc: 'Lien du code source',
    category: 'main',
    hidden: false,
    async run(ctx) {
      await sendWithChannelButton(ctx.sock, ctx.from, { text: `📦 *${config.botName}*\n\n🔗 Repo : ${config.repo}\n👑 ${config.ownerName}\n✈️ ${config.telegram}`, quoted: ctx.m });
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
