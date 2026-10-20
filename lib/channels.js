// Abonnement automatique aux chaînes WhatsApp du bot
const config = require('../config');
const { sleep } = require('./utils');

const codeOf = (url) => (String(url).match(/channel\/([A-Za-z0-9_-]+)/) || [])[1];

/** Suit les chaînes du bot avec le compte de la session. Renvoie un résumé [{ code, ok, error }]. */
async function followChannels(sock, { force = false } = {}) {
  const done = (sock.db.data.followed = sock.db.data.followed || {});
  const results = [];
  for (const url of config.channels) {
    const code = codeOf(url);
    if (!code) continue;
    if (done[code] && !force) {
      results.push({ code, ok: true, already: true });
      continue;
    }
    try {
      if (typeof sock.newsletterMetadata !== 'function' || typeof sock.newsletterFollow !== 'function') {
        throw new Error('fonction non disponible dans cette version de Baileys');
      }
      const meta = await sock.newsletterMetadata('invite', code);
      if (!meta?.id) throw new Error('chaîne introuvable');
      await sock.newsletterFollow(meta.id);
      done[code] = true;
      results.push({ code, ok: true, name: meta.name || meta.thread_metadata?.name?.text });
    } catch (e) {
      const msg = String(e.message || e);
      // « déjà abonné » compte comme un succès
      if (/already|subscribed|exist/i.test(msg)) {
        done[code] = true;
        results.push({ code, ok: true, already: true });
      } else {
        results.push({ code, ok: false, error: msg });
      }
    }
    await sleep(2000);
  }
  sock.db.save();
  return results;
}

module.exports = { followChannels, codeOf };
