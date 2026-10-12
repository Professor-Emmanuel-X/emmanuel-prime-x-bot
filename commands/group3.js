const { digits } = require('../lib/utils');

const pick = (a) => a[Math.floor(Math.random() * a.length)];

module.exports = [
  {
    name: 'members',
    aliases: ['membres', 'listmembers'],
    desc: 'Nombre et liste des membres',
    category: 'group',
    group: true,
    async run(ctx) {
      const p = ctx.meta.participants;
      const list = p.slice(0, 60).map((x, i) => `${i + 1}. @${digits(x.id)}${x.admin ? ' 🛡️' : ''}`).join('\n');
      await ctx.sock.sendMessage(
        ctx.from,
        { text: `👥 *${p.length} membres*\n\n${list}${p.length > 60 ? `\n… et ${p.length - 60} autres` : ''}`, mentions: p.slice(0, 60).map((x) => x.id) },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'groupstats',
    aliases: ['gstats', 'statsgroupe'],
    desc: 'Chiffres du groupe (membres, admins, créateur)',
    category: 'group',
    group: true,
    async run(ctx) {
      const m = ctx.meta;
      const admins = m.participants.filter((p) => p.admin).length;
      const owner = m.owner ? `@${digits(m.owner)}` : 'inconnu';
      await ctx.sock.sendMessage(
        ctx.from,
        {
          text:
            `📊 *${m.subject}*\n\n👥 Membres : ${m.participants.length}\n🛡️ Admins : ${admins}\n` +
            `🙋 Simples membres : ${m.participants.length - admins}\n👑 Créateur : ${owner}\n` +
            `📅 Créé le : ${m.creation ? new Date(m.creation * 1000).toLocaleDateString('fr-FR') : 'inconnu'}`,
          mentions: m.owner ? [m.owner] : []
        },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'randommember',
    aliases: ['randmember', 'tirage', 'lucky'],
    desc: 'Tire un membre au hasard',
    category: 'group',
    group: true,
    async run(ctx) {
      const p = pick(ctx.meta.participants);
      await ctx.sock.sendMessage(ctx.from, { text: `🎲 Le sort a désigné : @${digits(p.id)} 🎉`, mentions: [p.id] }, { quoted: ctx.m });
    }
  },
  {
    name: 'coupledujour',
    aliases: ['duo', 'matchgroupe'],
    desc: 'Forme un couple au hasard',
    category: 'group',
    group: true,
    async run(ctx) {
      const p = ctx.meta.participants;
      if (p.length < 2) return ctx.reply('Il faut au moins 2 membres.');
      const a = pick(p);
      let b = pick(p);
      while (b.id === a.id) b = pick(p);
      await ctx.sock.sendMessage(
        ctx.from,
        { text: `💘 *Couple du jour*\n\n@${digits(a.id)} ❤️ @${digits(b.id)}\n\nCompatibilité : ${Math.floor(Math.random() * 101)}%`, mentions: [a.id, b.id] },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'pending',
    aliases: ['demandes', 'joinrequests'],
    desc: 'Demandes d’adhésion en attente',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const r = await ctx.sock.groupRequestParticipantsList(ctx.from);
      if (!r.length) return ctx.reply('✅ Aucune demande en attente.');
      await ctx.reply(`⏳ *${r.length} demande(s)*\n\n` + r.slice(0, 40).map((x, i) => `${i + 1}. ${digits(x.jid)}`).join('\n') + `\n\n${ctx.prefix}approve pour tout accepter, ${ctx.prefix}reject pour tout refuser.`);
    }
  },
  {
    name: 'approve',
    aliases: ['accepterdemandes', 'approveall'],
    desc: 'Accepte toutes les demandes d’adhésion',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const r = await ctx.sock.groupRequestParticipantsList(ctx.from);
      if (!r.length) return ctx.reply('✅ Aucune demande en attente.');
      await ctx.sock.groupRequestParticipantsUpdate(ctx.from, r.map((x) => x.jid), 'approve');
      await ctx.reply(`✅ ${r.length} personne(s) acceptée(s).`);
    }
  },
  {
    name: 'reject',
    aliases: ['refuserdemandes', 'rejectall'],
    desc: 'Refuse toutes les demandes d’adhésion',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const r = await ctx.sock.groupRequestParticipantsList(ctx.from);
      if (!r.length) return ctx.reply('✅ Aucune demande en attente.');
      await ctx.sock.groupRequestParticipantsUpdate(ctx.from, r.map((x) => x.jid), 'reject');
      await ctx.reply(`🚫 ${r.length} demande(s) refusée(s).`);
    }
  },
  {
    name: 'gcowner',
    aliases: ['fondateur', 'gccreator'],
    desc: 'Qui a créé le groupe',
    category: 'group',
    group: true,
    async run(ctx) {
      const o = ctx.meta.owner;
      if (!o) return ctx.reply('Créateur inconnu.');
      await ctx.sock.sendMessage(ctx.from, { text: `👑 Créateur du groupe : @${digits(o)}`, mentions: [o] }, { quoted: ctx.m });
    }
  }
];
