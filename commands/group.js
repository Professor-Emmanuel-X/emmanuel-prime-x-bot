const { digits } = require('../lib/utils');

const toggle = (v) => ['on', 'off'].includes((v || '').toLowerCase());

module.exports = [
  {
    name: 'tagall',
    aliases: ['everyone', 'tousmentionner'],
    desc: 'Mentionne tous les membres',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const members = ctx.meta.participants.map((p) => p.id);
      let t = `📢 *TAG ALL*\n💬 ${ctx.text || 'Attention tout le monde !'}\n\n`;
      t += members.map((j) => `➜ @${digits(j)}`).join('\n');
      await ctx.sock.sendMessage(ctx.from, { text: t, mentions: members }, { quoted: ctx.m });
    }
  },
  {
    name: 'hidetag',
    aliases: ['tag', 'notify', 'ht'],
    desc: 'Mentionne tout le monde discrètement',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const members = ctx.meta.participants.map((p) => p.id);
      await ctx.sock.sendMessage(ctx.from, { text: ctx.text || ctx.quoted?.text || '📢', mentions: members });
    }
  },
  {
    name: 'tagadmins',
    aliases: ['admins', 'listadmin'],
    desc: 'Mentionne les admins',
    category: 'group',
    group: true,
    async run(ctx) {
      const admins = ctx.meta.participants.filter((p) => p.admin).map((p) => p.id);
      const t = `🛡️ *Admins du groupe (${admins.length})*\n\n` + admins.map((j) => `➜ @${digits(j)}`).join('\n');
      await ctx.sock.sendMessage(ctx.from, { text: t, mentions: admins }, { quoted: ctx.m });
    }
  },
  {
    name: 'kick',
    aliases: ['remove', 'ban-member', 'expulser'],
    desc: 'Expulse un membre',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}kick @membre (ou réponds à son message)`);
      if (digits(t) === digits(ctx.sock.user.id)) return ctx.reply('😅 Je ne peux pas me retirer moi-même.');
      await ctx.sock.groupParticipantsUpdate(ctx.from, [t], 'remove');
      await ctx.sock.sendMessage(ctx.from, { text: `👢 @${digits(t)} a été expulsé.`, mentions: [t] });
    }
  },
  {
    name: 'add',
    aliases: ['invite-member', 'ajouter'],
    desc: 'Ajoute un membre par son numéro',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const n = (ctx.args[0] || '').replace(/\D/g, '');
      if (n.length < 7) return ctx.reply(`Utilisation : ${ctx.prefix}add 242XXXXXXXXX`);
      const res = await ctx.sock.groupParticipantsUpdate(ctx.from, [n + '@s.whatsapp.net'], 'add');
      const st = res?.[0]?.status;
      if (st === '200') return ctx.reply(`✅ ${n} a été ajouté.`);
      if (st === '403') return ctx.reply("⚠️ Ce contact n'autorise pas les ajouts directs.");
      if (st === '409') return ctx.reply('ℹ️ Ce contact est déjà dans le groupe.');
      return ctx.reply(`⚠️ Impossible d'ajouter ce numéro (code ${st || 'inconnu'}).`);
    }
  },
  {
    name: 'promote',
    aliases: ['admin', 'makeadmin'],
    desc: 'Nomme un membre admin',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}promote @membre`);
      await ctx.sock.groupParticipantsUpdate(ctx.from, [t], 'promote');
      await ctx.sock.sendMessage(ctx.from, { text: `⬆️ @${digits(t)} est maintenant admin.`, mentions: [t] });
    }
  },
  {
    name: 'demote',
    aliases: ['unadmin', 'removeadmin'],
    desc: 'Retire le rôle admin',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}demote @admin`);
      await ctx.sock.groupParticipantsUpdate(ctx.from, [t], 'demote');
      await ctx.sock.sendMessage(ctx.from, { text: `⬇️ @${digits(t)} n'est plus admin.`, mentions: [t] });
    }
  },
  {
    name: 'link',
    aliases: ['gclink', 'grouplink', 'lien'],
    desc: "Lien d'invitation du groupe",
    category: 'group',
    group: true,
    botAdmin: true,
    async run(ctx) {
      const code = await ctx.sock.groupInviteCode(ctx.from);
      await ctx.reply(`🔗 *${ctx.meta.subject}*\nhttps://chat.whatsapp.com/${code}`);
    }
  },
  {
    name: 'revoke',
    aliases: ['resetlink', 'newlink'],
    desc: "Réinitialise le lien d'invitation",
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      await ctx.sock.groupRevokeInvite(ctx.from);
      await ctx.reply("♻️ Le lien d'invitation a été réinitialisé.");
    }
  },
  {
    name: 'setname',
    aliases: ['gname', 'setsubject'],
    desc: 'Change le nom du groupe',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}setname Nouveau nom`);
      await ctx.sock.groupUpdateSubject(ctx.from, ctx.text);
      await ctx.reply('✅ Nom du groupe modifié.');
    }
  },
  {
    name: 'setdesc',
    aliases: ['gdesc', 'setdescription'],
    desc: 'Change la description du groupe',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}setdesc Nouvelle description`);
      await ctx.sock.groupUpdateDescription(ctx.from, ctx.text);
      await ctx.reply('✅ Description modifiée.');
    }
  },
  {
    name: 'close',
    aliases: ['mute', 'lock', 'fermer'],
    desc: 'Seuls les admins peuvent écrire',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.from, 'announcement');
      await ctx.reply('🔒 Groupe fermé : seuls les admins peuvent écrire.');
    }
  },
  {
    name: 'open',
    aliases: ['unmute', 'unlock', 'ouvrir'],
    desc: 'Tout le monde peut écrire',
    category: 'group',
    group: true,
    admin: true,
    botAdmin: true,
    async run(ctx) {
      await ctx.sock.groupSettingUpdate(ctx.from, 'not_announcement');
      await ctx.reply('🔓 Groupe ouvert : tout le monde peut écrire.');
    }
  },
  {
    name: 'groupinfo',
    aliases: ['ginfo', 'infogroupe'],
    desc: 'Informations du groupe',
    category: 'group',
    group: true,
    async run(ctx) {
      const m = ctx.meta;
      const admins = m.participants.filter((p) => p.admin).length;
      await ctx.reply(
        `👥 *${m.subject}*\n\n` +
          `🆔 ${m.id}\n` +
          `👤 Membres : ${m.participants.length}\n` +
          `🛡️ Admins : ${admins}\n` +
          `📅 Créé le : ${new Date(m.creation * 1000).toLocaleDateString('fr-FR')}\n` +
          `🔒 Écriture : ${m.announce ? 'admins seulement' : 'tout le monde'}\n\n` +
          `📝 *Description*\n${m.desc || 'Aucune'}`
      );
    }
  },
  {
    name: 'antilink',
    aliases: ['antilien'],
    desc: 'Anti-lien : on / off / kick / delete',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const g = ctx.db.group(ctx.from);
      const v = (ctx.args[0] || '').toLowerCase();
      if (toggle(v)) g.antilink = v === 'on';
      else if (['kick', 'delete'].includes(v)) {
        g.antilink = true;
        g.antilinkAction = v;
      } else {
        return ctx.reply(
          `Utilisation : ${ctx.prefix}antilink on/off\n${ctx.prefix}antilink delete (supprime le lien)\n${ctx.prefix}antilink kick (supprime + expulse)\n\nÉtat : ${g.antilink ? 'ON' : 'OFF'} (${g.antilinkAction})`
        );
      }
      ctx.db.save();
      await ctx.reply(`🔗 Anti-lien : *${g.antilink ? 'ON' : 'OFF'}* (action : ${g.antilinkAction})`);
    }
  },
  {
    name: 'welcome',
    aliases: ['goodbye', 'bienvenue'],
    desc: 'Messages de bienvenue / au revoir',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const g = ctx.db.group(ctx.from);
      const v = (ctx.args[0] || '').toLowerCase();
      if (!toggle(v)) return ctx.reply(`Utilisation : ${ctx.prefix}welcome on/off\nÉtat : ${g.welcome ? 'ON' : 'OFF'}`);
      g.welcome = v === 'on';
      ctx.db.save();
      await ctx.reply(`👋 Bienvenue/Au revoir : *${v.toUpperCase()}*`);
    }
  },
  {
    name: 'warn',
    aliases: ['avertir'],
    desc: 'Avertit un membre (3 = expulsion)',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}warn @membre`);
      const g = ctx.db.group(ctx.from);
      const k = digits(t);
      g.warns[k] = (g.warns[k] || 0) + 1;
      ctx.db.save();
      const n = g.warns[k];
      if (n >= 3 && ctx.isBotAdmin) {
        g.warns[k] = 0;
        ctx.db.save();
        await ctx.sock.groupParticipantsUpdate(ctx.from, [t], 'remove').catch(() => {});
        return ctx.sock.sendMessage(ctx.from, { text: `🚫 @${k} a atteint 3 avertissements et a été expulsé.`, mentions: [t] });
      }
      await ctx.sock.sendMessage(ctx.from, { text: `⚠️ @${k} : avertissement ${n}/3`, mentions: [t] });
    }
  },
  {
    name: 'resetwarn',
    aliases: ['unwarn'],
    desc: "Réinitialise les avertissements d'un membre",
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}resetwarn @membre`);
      ctx.db.group(ctx.from).warns[digits(t)] = 0;
      ctx.db.save();
      await ctx.reply('✅ Avertissements réinitialisés.');
    }
  },
  {
    name: 'warns',
    aliases: ['listwarn'],
    desc: 'Liste des avertissements',
    category: 'group',
    group: true,
    async run(ctx) {
      const w = Object.entries(ctx.db.group(ctx.from).warns).filter(([, n]) => n > 0);
      if (!w.length) return ctx.reply('✅ Aucun avertissement dans ce groupe.');
      const jids = w.map(([k]) => k + '@s.whatsapp.net');
      await ctx.sock.sendMessage(
        ctx.from,
        { text: '⚠️ *Avertissements*\n\n' + w.map(([k, n]) => `➜ @${k} : ${n}/3`).join('\n'), mentions: jids },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'del',
    aliases: ['delete', 'supprimer'],
    desc: 'Supprime le message cité',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      if (!ctx.quoted) return ctx.reply('Réponds au message à supprimer.');
      await ctx.sock.sendMessage(ctx.from, {
        delete: { remoteJid: ctx.from, fromMe: ctx.quoted.key.fromMe, id: ctx.quoted.key.id, participant: ctx.quoted.sender }
      });
    }
  },
  {
    name: 'poll',
    aliases: ['sondage'],
    desc: 'Crée un sondage : question | option1 | option2',
    category: 'group',
    async run(ctx) {
      const parts = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) return ctx.reply(`Utilisation : ${ctx.prefix}poll Question | Option 1 | Option 2 | ...`);
      await ctx.sock.sendMessage(ctx.from, { poll: { name: parts[0], values: parts.slice(1, 13), selectableCount: 1 } });
    }
  },
  {
    name: 'leave',
    aliases: ['quitter'],
    desc: 'Le bot quitte le groupe',
    category: 'group',
    group: true,
    owner: true,
    async run(ctx) {
      await ctx.reply('👋 Au revoir !');
      await ctx.sock.groupLeave(ctx.from);
    }
  }
];
