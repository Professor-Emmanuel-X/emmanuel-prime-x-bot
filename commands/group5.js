const { randomBytes } = require('crypto');
const { proto, generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
const config = require('../config');
const { digits, sleep, downloadMedia } = require('../lib/utils');

// Mémoire des demandes de confirmation de .kickall : groupe -> { by, at }
const pendingKick = new Map();
const CONFIRM_MS = 60 * 1000;

module.exports = [
  {
    name: 'kickall',
    aliases: ['removeall', 'expulsertous', 'purge'],
    desc: 'Expulse tous les membres non-admins du groupe (owner du bot ou créateur du groupe)',
    category: 'group',
    group: true,
    botAdmin: true,
    async run(ctx) {
      const { sock, meta, from, sender } = ctx;
      const creator = meta.owner && digits(meta.owner) === digits(sender);
      if (!ctx.isOwner && !creator) {
        return ctx.reply("🚫 Seul le propriétaire du bot ou le créateur du groupe peut utiliser *kickall*.");
      }

      const botNum = digits(sock.user.id);
      const botLid = digits(sock.user.lid);
      const targets = meta.participants.filter((p) => {
        if (p.admin) return false; // les admins ne sont jamais touchés
        const ids = [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(digits);
        return !ids.includes(botNum) && !(botLid && ids.includes(botLid)) && !ids.includes(digits(sender));
      });
      if (!targets.length) return ctx.reply('✅ Il n’y a aucun membre simple à expulser (il ne reste que des admins).');

      // Confirmation obligatoire : l'action est irréversible
      const ask = pendingKick.get(from);
      const confirmed = /^(oui|yes|confirm|confirmer)$/i.test(ctx.args[0] || '') && ask && ask.by === digits(sender) && Date.now() - ask.at < CONFIRM_MS;
      if (!confirmed) {
        pendingKick.set(from, { by: digits(sender), at: Date.now() });
        return ctx.reply(
          `⚠️ *Attention !* ${targets.length} membre(s) vont être expulsés de *${meta.subject}* (les admins et moi sont épargnés).\n\n` +
            `Pour confirmer dans les 60 secondes, tape :\n*${ctx.prefix}kickall oui*`
        );
      }
      pendingKick.delete(from);

      await ctx.reply(`🧹 Expulsion de ${targets.length} membre(s) en cours… (par petits groupes pour éviter la limite de WhatsApp)`);
      let done = 0;
      let failed = 0;
      for (let i = 0; i < targets.length; i += 5) {
        const batch = targets.slice(i, i + 5).map((p) => p.id);
        try {
          const res = await sock.groupParticipantsUpdate(from, batch, 'remove');
          for (const r of res || []) (String(r.status) === '200' ? done++ : failed++);
          if (!res?.length) done += batch.length;
        } catch (e) {
          failed += batch.length;
          console.error('[kickall]', e.message);
        }
        sock.groupCache.delete(from);
        await sleep(2000);
      }
      await ctx.reply(`✅ Terminé : *${done}* expulsé(s)${failed ? `, ${failed} échec(s)` : ''}.`);
    }
  },

  {
    name: 'groupstatus',
    aliases: ['gstatus', 'statusgc', 'swgc', 'statutgroupe'],
    desc: 'Publie un statut pour les membres du groupe (texte, image, vidéo ou audio)',
    category: 'group',
    group: true,
    admin: true,
    async run(ctx) {
      const { sock, from, meta } = ctx;

      // 1. Contenu : média cité / joint, sinon texte tapé
      let content = null;
      const media = await downloadMedia(sock, ctx, ['imageMessage', 'videoMessage', 'audioMessage']).catch(() => null);
      const caption = ctx.text || '';
      if (media) {
        if (media.type === 'imageMessage') content = { image: media.buffer, caption };
        else if (media.type === 'videoMessage') content = { video: media.buffer, caption };
        else content = { audio: media.buffer, mimetype: media.mimetype || 'audio/mp4', ptt: true };
      } else if (caption) {
        content = { text: caption };
      }
      if (!content) {
        return ctx.reply(
          `📣 *Statut de groupe*\n\nUtilisation :\n• ${ctx.prefix}groupstatus Mon texte\n• Réponds à une image / vidéo / audio avec ${ctx.prefix}groupstatus (légende facultative)`
        );
      }

      // 2. Méthode native « statut de groupe » si cette version de Baileys la connaît
      const nativeOk = 'groupStatusMessageV2' in proto.Message.prototype;
      if (nativeOk) {
        try {
          const inner = await generateWAMessageContent(content, { upload: sock.waUploadToServer });
          const msg = generateWAMessageFromContent(
            from,
            { messageContextInfo: { messageSecret: randomBytes(32) }, groupStatusMessageV2: { message: inner } },
            { userJid: sock.user.id }
          );
          await sock.relayMessage(from, msg.message, { messageId: msg.key.id });
          sock.sentIds?.add(msg.key.id);
          return ctx.reply('✅ Statut publié dans le groupe.');
        } catch (e) {
          console.error('[groupstatus] méthode native échouée, essai du statut classique :', e.message);
        }
      }

      // 3. Secours : statut WhatsApp classique, visible seulement par les membres de ce groupe
      const jids = meta.participants
        .map((p) => [p.phoneNumber, p.jid, p.id].filter(Boolean).find((j) => String(j).endsWith('@s.whatsapp.net')) || p.id)
        .filter(Boolean);
      const me = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const opts = { statusJidList: [...new Set([...jids, me])] };
      if (content.text) Object.assign(opts, { backgroundColor: '#0b6b3a', font: 2 });
      await sock.sendMessage('status@broadcast', content, opts);
      await ctx.reply(
        `✅ Statut publié pour les ${jids.length} membres de *${meta.subject}*.\n` +
          `ℹ️ Il apparaît dans l'onglet Statuts de ${config.botName}, uniquement pour les membres du groupe qui ont ce numéro dans leurs contacts.`
      );
    }
  }
];
