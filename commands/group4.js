// chargé à l'usage pour éviter une dépendance circulaire avec lib/handler
const H = () => require('../lib/handler');
const { digits } = require('../lib/utils');

const HELP =
  'Variables : @user (le membre), @group (nom du groupe), @count (nombre de membres), @desc (description), @prefix (préfixe du bot).';
const onoff = (v) => ['on', 'off'].includes((v || '').toLowerCase());

function preview(ctx, tpl) {
  return H().fillTemplate(tpl, {
    num: ctx.senderNum,
    group: ctx.meta?.subject || 'Groupe',
    count: ctx.meta?.participants?.length || 0,
    desc: ctx.meta?.desc || '',
    prefix: ctx.prefix
  });
}

module.exports = [
  {
    name: 'goodbye',
    aliases: ['aurevoir', 'bye'],
    desc: 'Active/désactive le message d’au revoir',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const g = ctx.db.group(ctx.from);
      const v = (ctx.args[0] || '').toLowerCase();
      const state = g.goodbye === undefined ? g.welcome : g.goodbye;
      if (!onoff(v)) return ctx.reply(`Utilisation : ${ctx.prefix}goodbye on/off\nÉtat : ${state ? 'ON' : 'OFF'}`);
      g.goodbye = v === 'on';
      ctx.db.save();
      await ctx.reply(`👋 Message d'au revoir : *${v.toUpperCase()}*`);
    }
  },
  {
    name: 'setwelcome',
    aliases: ['welcomemsg', 'setbienvenue'],
    desc: 'Personnalise le message de bienvenue',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      if (!ctx.text) {
        return ctx.reply(`Utilisation : ${ctx.prefix}setwelcome Bienvenue @user dans @group ! Nous sommes @count.\n\n${HELP}`);
      }
      const g = ctx.db.group(ctx.from);
      g.welcomeText = ctx.text.slice(0, 1000);
      g.welcome = true;
      ctx.db.save();
      await ctx.sock.sendMessage(
        ctx.from,
        { text: `✅ Message de bienvenue enregistré (et activé). Aperçu :\n\n${preview(ctx, g.welcomeText)}`, mentions: [ctx.sender] },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'setgoodbye',
    aliases: ['goodbyemsg', 'setaurevoir'],
    desc: 'Personnalise le message d’au revoir',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      if (!ctx.text) {
        return ctx.reply(`Utilisation : ${ctx.prefix}setgoodbye @user nous a quittés. Il reste @count membres.\n\n${HELP}`);
      }
      const g = ctx.db.group(ctx.from);
      g.goodbyeText = ctx.text.slice(0, 1000);
      g.goodbye = true;
      ctx.db.save();
      await ctx.sock.sendMessage(
        ctx.from,
        { text: `✅ Message d'au revoir enregistré (et activé). Aperçu :\n\n${preview(ctx, g.goodbyeText)}`, mentions: [ctx.sender] },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'resetwelcome',
    aliases: ['delwelcome'],
    desc: 'Remet le message de bienvenue par défaut',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      ctx.db.group(ctx.from).welcomeText = '';
      ctx.db.save();
      await ctx.reply('♻️ Message de bienvenue remis par défaut.');
    }
  },
  {
    name: 'resetgoodbye',
    aliases: ['delgoodbye'],
    desc: 'Remet le message d’au revoir par défaut',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      ctx.db.group(ctx.from).goodbyeText = '';
      ctx.db.save();
      await ctx.reply("♻️ Message d'au revoir remis par défaut.");
    }
  },
  {
    name: 'testwelcome',
    aliases: ['previewwelcome', 'testgoodbye'],
    desc: 'Aperçu des messages de bienvenue et d’au revoir',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const g = ctx.db.group(ctx.from);
      const w = preview(ctx, g.welcomeText || H().DEFAULT_WELCOME);
      const b = preview(ctx, g.goodbyeText || H().DEFAULT_GOODBYE);
      await ctx.sock.sendMessage(
        ctx.from,
        { text: `👁️ *Aperçu*\n\n*Bienvenue :*\n${w}\n\n*Au revoir :*\n${b}\n\nÉtat : bienvenue ${g.welcome ? 'ON' : 'OFF'} • au revoir ${(g.goodbye === undefined ? g.welcome : g.goodbye) ? 'ON' : 'OFF'}`, mentions: [ctx.sender] },
        { quoted: ctx.m }
      );
    }
  }
];
