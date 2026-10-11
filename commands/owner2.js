const config = require('../config');
const { digits, runtime } = require('../lib/utils');
const session = require('../lib/session');

const commands = [
  {
    name: 'setbotname',
    aliases: ['setnamebot', 'setpushname'],
    desc: 'Change le nom du profil WhatsApp du bot',
    async run(ctx) {
      if (!ctx.text || ctx.text.length > 25) return ctx.reply(`Utilisation : ${ctx.prefix}setbotname Nouveau nom (25 caractères max)`);
      await ctx.sock.updateProfileName(ctx.text);
      await ctx.reply('✅ Nom du profil mis à jour.');
    }
  },
  {
    name: 'delpp',
    aliases: ['removepp', 'deletepp'],
    desc: 'Supprime la photo de profil du bot',
    async run(ctx) {
      await ctx.sock.removeProfilePicture(ctx.sock.user.id);
      await ctx.reply('✅ Photo de profil supprimée.');
    }
  },
  {
    name: 'blocklist',
    aliases: ['listblock', 'bloques'],
    desc: 'Liste des contacts bloqués',
    async run(ctx) {
      const list = await ctx.sock.fetchBlocklist();
      if (!list?.length) return ctx.reply('✅ Aucun contact bloqué.');
      await ctx.reply(`🚫 *Contacts bloqués (${list.length})*\n\n` + list.slice(0, 50).map((j) => `➜ ${digits(j)}`).join('\n'));
    }
  },
  {
    name: 'sudolist',
    aliases: ['listsudo', 'owners'],
    desc: 'Liste des co-owners',
    async run(ctx) {
      const s = ctx.db.data.sudo;
      await ctx.reply(s.length ? `👑 *Co-owners (${s.length})*\n\n` + s.map((n) => `➜ ${n}`).join('\n') : 'Aucun co-owner défini.');
    }
  },
  {
    name: 'sessions',
    aliases: ['bots', 'connectes', 'appareils'],
    desc: 'Appareils connectés : sessions / sessions delete 242...',
    async run(ctx) {
      if (ctx.sock.sessionNumber !== config.botNumber) return ctx.reply("🚫 Réservé à l'owner principal du bot.");
      const sub = (ctx.args[0] || '').toLowerCase();

      if (['delete', 'del', 'remove', 'supprimer'].includes(sub)) {
        const n = (ctx.args[1] || '').replace(/\D/g, '');
        if (!n) return ctx.reply(`Utilisation : ${ctx.prefix}sessions delete 242XXXXXXXXX`);
        if (n === config.botNumber) return ctx.reply('🚫 Impossible de supprimer la session principale ici (utilise .logout si tu veux la déconnecter).');
        await session.adminRemove(n);
        return ctx.reply(`✅ Appareil ${n} déconnecté et supprimé.`);
      }

      const list = session.list();
      const s = session.stats();
      const icon = { open: '🟢', connecting: '🟡', closed: '🔴' };
      const since = (t) => (t ? runtime((Date.now() - t) / 1000) : '—');
      await ctx.reply(
        `🤖 *Appareils connectés*\n✅ ${s.connected} en ligne • 📦 ${s.total} au total\n\n` +
          (list.map((d, i) => `${i + 1}. ${icon[d.status] || '⚪'} ${d.number}${d.main ? ' 👑' : ''}${d.name ? ` (${d.name})` : ''}\n   ⏱️ ${since(d.since)}`).join('\n') || 'Aucun appareil.') +
          `\n\nPour en supprimer un : ${ctx.prefix}sessions delete NUMERO`
      );
    }
  }
];

module.exports = commands.map((c) => ({ category: 'owner', owner: true, ...c }));
