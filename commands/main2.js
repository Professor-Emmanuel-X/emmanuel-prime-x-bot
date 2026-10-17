const config = require('../config');
const { digits } = require('../lib/utils');
const { byName, all } = require('../lib/loader');

module.exports = [
  {
    name: 'report',
    aliases: ['bug', 'suggest', 'signaler'],
    desc: 'Signale un bug ou envoie une suggestion au owner',
    category: 'main',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}report Décris le problème ou ton idée`);
      const to = config.ownerNumber + '@s.whatsapp.net';
      await ctx.sock.sendMessage(to, {
        text: `📨 *Nouveau message (${ctx.command})*\n\n👤 De : @${ctx.senderNum}\n💬 ${ctx.text}`,
        mentions: [ctx.sender]
      });
      await ctx.reply(`✅ Message transmis à ${config.ownerName}. Ton numéro lui est visible pour pouvoir te répondre. Merci !`);
    }
  },
  {
    name: 'profile',
    aliases: ['me', 'moi', 'whoami'],
    desc: 'Ton profil',
    category: 'main',
    async run(ctx) {
      const role = ctx.isOwner ? '👑 Owner' : ctx.isAdmin ? '🛡️ Admin du groupe' : '👤 Membre';
      const text =
        `🪪 *Ton profil*\n\n` +
        `📞 Numéro : ${ctx.senderNum}\n` +
        `🎖️ Rôle : ${role}\n` +
        `🚫 Banni du bot : ${ctx.db.data.banned.includes(ctx.senderNum) ? 'oui' : 'non'}\n` +
        `💬 Chat : ${ctx.isGroup ? 'groupe' : 'privé'}`;
      try {
        const url = await ctx.sock.profilePictureUrl(ctx.sender, 'image');
        await ctx.sock.sendMessage(ctx.from, { image: { url }, caption: text }, { quoted: ctx.m });
      } catch {
        await ctx.reply(text);
      }
    }
  },
  {
    name: 'about',
    aliases: ['apropos', 'àpropos'],
    desc: 'À propos du bot',
    category: 'main',
    async run(ctx) {
      await ctx.reply(
        `🤖 *${config.botName}*\n\n` +
          `Bot WhatsApp multi-appareils créé par ${config.ownerName}.\n\n` +
          `• ${all.length} commandes (IA, groupe, outils, téléchargement, fun…)\n` +
          `• Site de pairing code intégré\n` +
          `• Technologie : Node.js + Baileys\n\n` +
          `✈️ ${config.telegram}\n📢 ${config.channel}\n📦 ${config.repo}`
      );
    }
  },
  {
    name: 'credits',
    aliases: ['merci', 'remerciements'],
    desc: 'Crédits et remerciements',
    category: 'main',
    async run(ctx) {
      await ctx.reply(
        `🙏 *Crédits*\n\n` +
          `👑 Création : ${config.ownerName}\n` +
          `📚 Baileys (WhiskeySockets)\n` +
          `🧠 IA : OpenRouter\n` +
          `🌐 APIs publiques : Wikipédia, Jikan, PokéAPI, CoinGecko, TheMealDB, TheCocktailDB, REST Countries…\n\n` +
          `_${config.botName}_`
      );
    }
  },
  {
    name: 'jid',
    aliases: ['id', 'chatid'],
    desc: "Affiche l'identifiant du chat et le tien",
    category: 'main',
    async run(ctx) {
      await ctx.reply(`🆔 *Chat :* ${ctx.from}\n👤 *Toi :* ${ctx.sender}${ctx.quoted?.sender ? `\n↩️ *Message cité :* ${ctx.quoted.sender}` : ''}`);
    }
  },
  {
    name: 'cmdinfo',
    aliases: ['cmd', 'helpcmd', 'aidecmd'],
    desc: "Détails d'une commande",
    category: 'main',
    async run(ctx) {
      const n = (ctx.args[0] || '').toLowerCase().replace(ctx.prefix, '');
      if (!n) return ctx.reply(`Utilisation : ${ctx.prefix}cmdinfo ping`);
      const c = byName.get(n);
      if (!c) return ctx.reply('❌ Commande introuvable.');
      const flags = [c.owner && 'owner', c.group && 'groupe', c.admin && 'admin', c.botAdmin && 'bot admin', c.private && 'privé'].filter(Boolean);
      await ctx.reply(
        `📖 *${ctx.prefix}${c.name}*\n\n` +
          `📝 ${c.desc || 'Pas de description'}\n` +
          `📂 Catégorie : ${c.category}\n` +
          `🔁 Alias : ${(c.aliases || []).map((a) => ctx.prefix + a).join(', ') || '—'}\n` +
          `🔐 Restrictions : ${flags.join(', ') || 'aucune'}`
      );
    }
  }
];
