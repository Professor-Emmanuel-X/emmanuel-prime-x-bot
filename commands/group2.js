const { digits, downloadMedia, runtime } = require('../lib/utils');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const commands = [
  {
    name: 'setppgc',
    aliases: ['setgrouppp', 'gcpp'],
    desc: 'Change la photo du groupe (réponds à une image)',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['imageMessage']);
      if (!media) return ctx.reply(`Réponds à une image avec ${ctx.prefix}setppgc`);
      await ctx.sock.updateProfilePicture(ctx.from, media.buffer);
      await ctx.reply('✅ Photo du groupe mise à jour.');
    }
  },
  {
    name: 'setrules',
    aliases: ['setreglement', 'definirregles'],
    desc: 'Définit le règlement du groupe',
    group: true,
    admin: true,
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}setrules 1. Respect\n2. Pas de spam`);
      ctx.db.group(ctx.from).rules = ctx.text.slice(0, 1500);
      ctx.db.save();
      await ctx.reply(`✅ Règlement enregistré. Tape ${ctx.prefix}rules pour l'afficher.`);
    }
  },
  {
    name: 'rules',
    aliases: ['regles', 'règles', 'reglement'],
    desc: 'Affiche le règlement du groupe',
    group: true,
    async run(ctx) {
      const r = ctx.db.group(ctx.from).rules;
      await ctx.reply(r ? `📜 *Règlement de ${ctx.meta?.subject || 'ce groupe'}*\n\n${r}` : `📜 Aucun règlement défini. Un admin peut utiliser ${ctx.prefix}setrules.`);
    }
  },
  {
    name: 'top',
    aliases: ['actifs', 'classement', 'leaderboard'],
    desc: 'Les membres les plus actifs du groupe',
    group: true,
    async run(ctx) {
      const list = Object.entries(ctx.db.group(ctx.from).stats || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (!list.length) return ctx.reply("📊 Pas encore de statistiques : elles se remplissent avec les messages du groupe.");
      const medals = ['🥇', '🥈', '🥉'];
      await ctx.sock.sendMessage(
        ctx.from,
        {
          text: '🏆 *Membres les plus actifs*\n\n' + list.map(([n, c], i) => `${medals[i] || `${i + 1}.`} @${n} — ${c} messages`).join('\n'),
          mentions: list.map(([n]) => `${n}@s.whatsapp.net`)
        },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'resetstats',
    aliases: ['resettop'],
    desc: 'Remet à zéro le classement des messages',
    group: true,
    admin: true,
    async run(ctx) {
      ctx.db.group(ctx.from).stats = {};
      ctx.db.save();
      await ctx.reply('✅ Classement réinitialisé.');
    }
  },
  {
    name: 'antibadword',
    aliases: ['antimot', 'antiinsulte'],
    desc: 'Anti-mots interdits : on / off / list',
    group: true,
    admin: true,
    async run(ctx) {
      const g = ctx.db.group(ctx.from);
      const v = (ctx.args[0] || '').toLowerCase();
      if (v === 'list') return ctx.reply(g.badwords.length ? `🚫 *Mots interdits (${g.badwords.length})*\n\n${g.badwords.join(', ')}` : 'Aucun mot interdit défini.');
      if (!['on', 'off'].includes(v)) return ctx.reply(`Utilisation : ${ctx.prefix}antibadword on/off/list\nÉtat : ${g.antibadword ? 'ON' : 'OFF'}\nAjoute des mots avec ${ctx.prefix}addbadword mot`);
      g.antibadword = v === 'on';
      ctx.db.save();
      await ctx.reply(`🚫 Anti-mots interdits : *${v.toUpperCase()}*${v === 'on' && !g.badwords.length ? `\n⚠️ Aucun mot défini : utilise ${ctx.prefix}addbadword mot` : ''}${v === 'on' && !ctx.isBotAdmin ? '\n⚠️ Je dois être admin pour supprimer les messages.' : ''}`);
    }
  },
  {
    name: 'addbadword',
    aliases: ['addmot'],
    desc: 'Ajoute un mot interdit',
    group: true,
    admin: true,
    async run(ctx) {
      const w = norm(ctx.text);
      if (!w || w.length > 30) return ctx.reply(`Utilisation : ${ctx.prefix}addbadword mot (30 caractères max)`);
      const g = ctx.db.group(ctx.from);
      if (g.badwords.length >= 50) return ctx.reply('❌ Limite de 50 mots atteinte.');
      if (!g.badwords.includes(w)) g.badwords.push(w);
      ctx.db.save();
      await ctx.reply(`✅ « ${w} » ajouté (${g.badwords.length} mot(s)).`);
    }
  },
  {
    name: 'delbadword',
    aliases: ['delmot'],
    desc: 'Retire un mot interdit',
    group: true,
    admin: true,
    async run(ctx) {
      const w = norm(ctx.text);
      const g = ctx.db.group(ctx.from);
      if (!w || !g.badwords.includes(w)) return ctx.reply(`❌ Mot introuvable. Vois la liste avec ${ctx.prefix}antibadword list`);
      g.badwords = g.badwords.filter((x) => x !== w);
      ctx.db.save();
      await ctx.reply(`✅ « ${w} » retiré.`);
    }
  },
  {
    name: 'afk',
    aliases: ['absent'],
    desc: 'Passe en mode absent (AFK)',
    async run(ctx) {
      const afk = ctx.db.data.afk || (ctx.db.data.afk = {});
      afk[ctx.senderNum] = { reason: ctx.text.slice(0, 120), since: Date.now() };
      ctx.db.save();
      await ctx.sock.sendMessage(
        ctx.from,
        { text: `😴 @${ctx.senderNum} est maintenant AFK${ctx.text ? ` : ${ctx.text.slice(0, 120)}` : ''}\nJe préviendrai ceux qui te mentionnent.`, mentions: [ctx.sender] },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'disappear',
    aliases: ['ephemeral', 'messagestemporaires'],
    desc: 'Messages éphémères : 24h / 7d / 90d / off',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const map = { off: 0, '24h': 86400, '7d': 604800, '90d': 7776000 };
      const v = (ctx.args[0] || '').toLowerCase();
      if (!(v in map)) return ctx.reply(`Utilisation : ${ctx.prefix}disappear 24h / 7d / 90d / off`);
      await ctx.sock.groupToggleEphemeral(ctx.from, map[v]);
      await ctx.reply(v === 'off' ? '✅ Messages éphémères désactivés.' : `✅ Messages éphémères activés : ${v}`);
    }
  }
];

module.exports = commands.map((c) => ({ category: 'group', ...c }));
