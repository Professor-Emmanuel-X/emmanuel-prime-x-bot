// Abonnement automatique aux chaînes WhatsApp du bot
const config = require('../config');
const { sleep } = require('./utils');

const codeOf = (url) => (String(url).match(/channel\/([A-Za-z0-9_-]+)/) || [])[1];

/** Vrai si le compte est bien abonné à la chaîne (lecture de son rôle dans les métadonnées). */
async function isFollowing(sock, jid) {
  try {
    await sleep(1500);
    const m = await sock.newsletterMetadata('jid', jid);
    const role = String(m?.viewer_metadata?.role || m?.viewer?.role || '').toUpperCase();
    return ['SUBSCRIBER', 'ADMIN', 'OWNER'].includes(role);
  } catch {
    return false;
  }
}

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
      const name = meta.name || meta.thread_metadata?.name?.text;
      try {
        await sock.newsletterFollow(meta.id);
      } catch (e) {
        // Baileys 6.7.x : WhatsApp a changé le format de sa réponse, l'erreur « unexpected response structure » est levée
        // alors que l'abonnement a parfois réussi. On vérifie l'état réel avant de conclure.
        if (!(await isFollowing(sock, meta.id))) throw e;
      }
      done[code] = true;
      results.push({ code, ok: true, name });
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
