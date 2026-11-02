// Envoi d'un message (image + texte) avec un bouton « Voir la chaîne » à la place du lien en clair.
// Utilise un message interactif « cta_url ». Si WhatsApp ou Baileys refuse, on envoie le même message sans bouton
// (et surtout sans le lien de la chaîne).
const { proto, generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');
const config = require('../config');

const BUTTON_TEXT = 'Voir la chaîne';

/**
 * @param sock     socket Baileys
 * @param jid      destinataire
 * @param opts     { image?: Buffer, text: string (corps du message), footer?: string, mentions?: string[], quoted?: message }
 */
async function sendWithChannelButton(sock, jid, { image, text, footer, mentions = [], quoted } = {}) {
  try {
    let header = { title: '', subtitle: '', hasMediaAttachment: false };
    if (image) {
      const media = await prepareWAMessageMedia({ image }, { upload: sock.waUploadToServer });
      header = { title: '', subtitle: '', hasMediaAttachment: true, imageMessage: media.imageMessage };
    }

    const interactive = proto.Message.InteractiveMessage.create({
      body: proto.Message.InteractiveMessage.Body.create({ text }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || config.botName }),
      header: proto.Message.InteractiveMessage.Header.create(header),
      contextInfo: { mentionedJid: mentions },
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
        buttons: [
          {
            name: 'cta_url',
            buttonParamsJson: JSON.stringify({ display_text: BUTTON_TEXT, url: config.channel, merchant_url: config.channel })
          }
        ]
      })
    });

    const msg = generateWAMessageFromContent(
      jid,
      {
        viewOnceMessage: {
          message: {
            messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
            interactiveMessage: interactive
          }
        }
      },
      { userJid: sock.user?.id, quoted }
    );

    const isGroup = jid.endsWith('@g.us');
    await sock.relayMessage(jid, msg.message, {
      messageId: msg.key.id,
      additionalNodes: [
        {
          tag: 'biz',
          attrs: {},
          content: [
            {
              tag: 'interactive',
              attrs: { type: 'native_flow', v: '1' },
              content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
            }
          ]
        },
        ...(isGroup ? [] : [{ tag: 'bot', attrs: { biz_bot: '1' } }])
      ]
    });

    // Le bot ne doit pas retraiter son propre message
    if (msg.key.id) {
      sock.sentIds?.add(msg.key.id);
      sock.sentCache?.set(msg.key.id, msg.message);
    }
    return msg;
  } catch (e) {
    console.error('[channelbtn] bouton impossible, envoi sans bouton :', e.message);
    const content = image ? { image, caption: text, mentions } : { text, mentions };
    return sock.sendMessage(jid, content, quoted ? { quoted } : undefined);
  }
}

module.exports = { sendWithChannelButton, BUTTON_TEXT };
