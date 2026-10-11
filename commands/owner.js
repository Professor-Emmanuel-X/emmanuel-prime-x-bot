const config = require('../config');
const { digits, sleep, downloadMedia } = require('../lib/utils');
const session = require('../lib/session');

function onOff(key, label, extra = {}) {
  return {
    name: key,
    aliases: extra.aliases || [],
    desc: `${label} : on / off`,
    category: 'owner',
    owner: true,
    async run(ctx) {
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) {
        return ctx.reply(`Utilisation : ${ctx.prefix}${key} on/off\nÉtat : ${ctx.db.settings[key] ? 'ON' : 'OFF'}`);
      }
      ctx.db.settings[key] = v === 'on';
      ctx.db.save();
      await ctx.reply(`⚙️ ${label} : *${v.toUpperCase()}*`);
    }
  };
}

module.exports = [
  {
    name: 'mode',
    aliases: ['setmode'],
    desc: 'public ou self',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['public', 'self'].includes(v)) return ctx.reply(`Utilisation : ${ctx.prefix}mode public/self\nMode actuel : ${ctx.db.settings.mode}`);
      ctx.db.settings.mode = v;
      ctx.db.save();
      await ctx.reply(`🌐 Mode : *${v}*${v === 'self' ? '\n(seul le owner peut utiliser le bot)' : ''}`);
    }
  },
  {
    name: 'setprefix',
    aliases: ['prefix'],
    desc: 'Change le préfixe',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const p = ctx.args[0];
      if (!p || p.length > 3) return ctx.reply(`Utilisation : ${ctx.prefix}setprefix !\n(1 à 3 caractères)`);
      ctx.db.settings.prefix = p;
      ctx.db.save();
      await ctx.reply(`✅ Nouveau préfixe : *${p}*`);
    }
  },
  onOff('autoread', 'Lecture automatique', { aliases: ['readmessage'] }),
  onOff('autotyping', 'Écriture automatique', { aliases: ['typing'] }),
  onOff('autorecord', 'Enregistrement audio automatique', { aliases: ['recording'] }),
  onOff('alwaysonline', 'Toujours en ligne', { aliases: ['online24'] }),
  onOff('anticall', 'Anti-appel', { aliases: ['rejectcall'] }),
  onOff('antidelete', 'Anti-suppression (reçus en privé)', { aliases: ['antidel'] }),
  onOff('autoviewstatus', 'Vue automatique des statuts', { aliases: ['autostatus', 'viewstatus'] }),
  onOff('autoreactstatus', 'Réaction automatique aux statuts', { aliases: ['reactstatus'] }),
  {
    name: 'settings',
    aliases: ['config', 'parametres'],
    desc: 'Affiche les réglages',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const s = ctx.db.settings;
      const f = (b) => (b ? '✅' : '❌');
      await ctx.reply(
        `⚙️ *Réglages — ${config.botName}*\n\n` +
          `Préfixe : ${s.prefix}\nMode : ${s.mode}\n\n` +
          `${f(s.autoread)} autoread\n${f(s.autotyping)} autotyping\n${f(s.autorecord)} autorecord\n` +
          `${f(s.alwaysonline)} alwaysonline\n${f(s.anticall)} anticall\n${f(s.antidelete)} antidelete\n` +
          `${f(s.autoviewstatus)} autoviewstatus\n${f(s.autoreactstatus)} autoreactstatus\n${f(s.chatbot)} chatbot`
      );
    }
  },
  {
    name: 'ban',
    aliases: ['banuser'],
    desc: "Bannit un utilisateur du bot",
    category: 'owner',
    owner: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}ban @user`);
      const n = digits(t);
      if (!ctx.db.data.banned.includes(n)) ctx.db.data.banned.push(n);
      ctx.db.save();
      await ctx.reply(`🚫 ${n} est banni du bot.`);
    }
  },
  {
    name: 'unban',
    aliases: ['unbanuser'],
    desc: 'Débannit un utilisateur',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}unban @user`);
      const n = digits(t);
      ctx.db.data.banned = ctx.db.data.banned.filter((x) => x !== n);
      ctx.db.save();
      await ctx.reply(`✅ ${n} est débanni.`);
    }
  },
  {
    name: 'banlist',
    aliases: ['listban'],
    desc: 'Liste des bannis',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const b = ctx.db.data.banned;
      await ctx.reply(b.length ? `🚫 *Bannis (${b.length})*\n\n` + b.map((n) => `➜ ${n}`).join('\n') : '✅ Aucun utilisateur banni.');
    }
  },
  {
    name: 'addsudo',
    aliases: ['addowner'],
    desc: 'Ajoute un co-owner',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}addsudo @user`);
      const n = digits(t);
      if (!ctx.db.data.sudo.includes(n)) ctx.db.data.sudo.push(n);
      ctx.db.save();
      await ctx.reply(`👑 ${n} ajouté comme co-owner.`);
    }
  },
  {
    name: 'delsudo',
    aliases: ['delowner'],
    desc: 'Retire un co-owner',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const t = ctx.getTarget();
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}delsudo @user`);
      const n = digits(t);
      ctx.db.data.sudo = ctx.db.data.sudo.filter((x) => x !== n);
      ctx.db.save();
      await ctx.reply(`✅ ${n} retiré des co-owners.`);
    }
  },
  {
    name: 'broadcast',
    aliases: ['bc', 'diffuser'],
    desc: 'Envoie un message à tous les groupes',
    category: 'owner',
    owner: true,
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}bc Ton message`);
      const groups = Object.keys(await ctx.sock.groupFetchAllParticipating());
      await ctx.reply(`📢 Diffusion vers ${groups.length} groupe(s)...`);
      let ok = 0;
      for (const g of groups) {
        try {
          await ctx.sock.sendMessage(g, { text: `📢 *Annonce — ${config.botName}*\n\n${ctx.text}` });
          ok++;
        } catch {
          /* on continue */
        }
        await sleep(1500);
      }
      await ctx.reply(`✅ Envoyé à ${ok}/${groups.length} groupes.`);
    }
  },
  {
    name: 'join',
    aliases: ['joingroup'],
    desc: 'Rejoint un groupe via un lien',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const code = (ctx.text.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/) || [])[1];
      if (!code) return ctx.reply(`Utilisation : ${ctx.prefix}join https://chat.whatsapp.com/XXXX`);
      await ctx.sock.groupAcceptInvite(code);
      await ctx.reply('✅ Groupe rejoint.');
    }
  },
  {
    name: 'block',
    aliases: ['blockuser'],
    desc: 'Bloque un contact',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const t = ctx.isGroup ? ctx.getTarget() : ctx.from;
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}block @user`);
      await ctx.sock.updateBlockStatus(t, 'block');
      await ctx.reply('🚫 Contact bloqué.');
    }
  },
  {
    name: 'unblock',
    aliases: ['unblockuser'],
    desc: 'Débloque un contact',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const t = ctx.isGroup ? ctx.getTarget() : ctx.from;
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}unblock @user`);
      await ctx.sock.updateBlockStatus(t, 'unblock');
      await ctx.reply('✅ Contact débloqué.');
    }
  },
  {
    name: 'setbio',
    aliases: ['setstatus', 'bio'],
    desc: 'Change la bio du bot',
    category: 'owner',
    owner: true,
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}setbio Ma nouvelle bio`);
      await ctx.sock.updateProfileStatus(ctx.text);
      await ctx.reply('✅ Bio mise à jour.');
    }
  },
  {
    name: 'setpp',
    aliases: ['setppbot', 'setprofilepic'],
    desc: 'Change la photo de profil (réponds à une image)',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['imageMessage']);
      if (!media) return ctx.reply(`Réponds à une image avec ${ctx.prefix}setpp`);
      await ctx.sock.updateProfilePicture(ctx.sock.user.id, media.buffer);
      await ctx.reply('✅ Photo de profil mise à jour.');
    }
  },
  {
    name: 'groups',
    aliases: ['listgroups', 'gclist'],
    desc: 'Liste des groupes du bot',
    category: 'owner',
    owner: true,
    async run(ctx) {
      const gs = Object.values(await ctx.sock.groupFetchAllParticipating());
      if (!gs.length) return ctx.reply('Aucun groupe.');
      await ctx.reply(`👥 *Groupes (${gs.length})*\n\n` + gs.map((g, i) => `${i + 1}. ${g.subject} (${g.participants.length})`).join('\n'));
    }
  },
  {
    name: 'restart',
    aliases: ['reboot', 'redemarrer'],
    desc: 'Redémarre le bot',
    category: 'owner',
    owner: true,
    async run(ctx) {
      if (ctx.sock.sessionNumber !== config.botNumber) return ctx.reply("🚫 Le redémarrage est réservé à l'owner principal (le serveur est partagé).");
      await ctx.reply('🔄 Redémarrage...');
      setTimeout(() => process.exit(0), 1500);
    }
  },
  {
    name: 'logout',
    aliases: ['deconnecter', 'unlink'],
    desc: 'Déconnecte ce bot de ton WhatsApp',
    category: 'owner',
    owner: true,
    async run(ctx) {
      await ctx.reply('👋 Déconnexion du bot... Tu pourras relier ton numéro via le site quand tu veux.');
      const num = ctx.sock.sessionNumber;
      await ctx.sock.logout().catch(() => {});
      session.removeSession(num);
    }
  }
];
