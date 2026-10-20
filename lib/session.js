const fs = require('fs');
const path = require('path');
const { Boom } = require('@hapi/boom');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const config = require('../config');
const bans = require('./bans');
const { followChannels } = require('./channels');
const { normalizeNumber } = require('./phone');
const botImage = () => {
  try {
    return fs.readFileSync(config.botImagePath);
  } catch {
    return null;
  }
};
const dbLib = require('./db');
const { logger, sleep } = require('./utils');
const { handleMessage, handleGroupUpdate, handleCall } = require('./handler');

const sessions = new Map(); // numéro -> { sock, status, stopped }
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '50', 10);

const PAIR_TIMEOUT_MS = parseInt(process.env.PAIR_TIMEOUT_MS || '240000', 10); // validité d'un code : 4 min

const sessionDir = (number) => path.join(config.paths.sessions, number);

// Suivi du pairing, lu par le site : { state: starting | waiting | linking | connected | failed, code, reason }
const pairStates = new Map();
function setPair(number, patch) {
  pairStates.set(number, { ...(pairStates.get(number) || {}), ...patch, at: Date.now() });
}
function pairStatus(rawNumber) {
  const s = pairStates.get(normalizeNumber(rawNumber));
  return s ? { state: s.state, reason: s.reason || null } : { state: 'none', reason: null };
}

function stats() {
  let connected = 0;
  for (const s of sessions.values()) if (s.status === 'open') connected++;
  return { total: sessions.size, connected };
}

// Cache minimal compatible Baileys (get / set / del / flushAll)
function makeCache(ttlMs = 10 * 60000) {
  const m = new Map();
  return {
    get: (k) => {
      const e = m.get(k);
      if (!e) return undefined;
      if (e.exp < Date.now()) return m.delete(k), undefined;
      return e.v;
    },
    set: (k, v) => {
      m.set(k, { v, exp: Date.now() + ttlMs });
      if (m.size > 5000) m.delete(m.keys().next().value);
    },
    del: (k) => m.delete(k),
    flushAll: () => m.clear()
  };
}
const retryCache = makeCache();

async function connect(number) {
  if (bans.isBanned(number)) throw new Error(`numéro banni : ${number}`);
  const dir = sessionDir(number);
  fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {
    /* version par défaut de Baileys */
  }

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    // Quand le téléphone du destinataire n'arrive pas à déchiffrer un message (« En attente de ce message »),
    // WhatsApp demande un renvoi : il faut pouvoir retrouver le message d'origine.
    getMessage: async (key) => sock?.sentCache?.get(key.id) || sock?.msgCache?.get(key.id)?.message || undefined,
    // Compteur de renvois et métadonnées de groupe en cache : évite les « En attente de ce message »
    msgRetryCounterCache: retryCache,
    cachedGroupMetadata: async (jid) => {
      const hit = sock?.groupCache?.get(jid);
      return hit && Date.now() - hit.t < 5 * 60000 ? hit.meta : undefined;
    }
  });

  // Données attachées au socket (utilisées par le handler et les commandes)
  sock.sessionNumber = number;
  sock.db = dbLib.open(number);
  sock.startedAt = Date.now();
  sock.groupCache = new Map();
  sock.msgCache = new Map();
  sock.sentCache = new Map();
  sock.sentIds = new Set();

  // On mémorise les ids des messages envoyés pour ne pas les retraiter
  const rawSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...a) => {
    a[1] = await require('./media').normalizeMedia(a[1]);
    const r = await rawSend(...a);
    const id = r?.key?.id;
    if (id && r.message) {
      sock.sentCache.set(id, r.message);
      if (sock.sentCache.size > 500) sock.sentCache.delete(sock.sentCache.keys().next().value);
    }
    if (id) {
      sock.sentIds.add(id);
      if (sock.sentIds.size > 2000) sock.sentIds.delete(sock.sentIds.values().next().value);
    }
    return r;
  };

  const entry = sessions.get(number) || {};
  entry.sock = sock;
  entry.status = 'connecting';
  entry.stopped = false;
  entry.paired = Boolean(entry.paired || state.creds.account); // déjà lié à un téléphone ?
  // Résolue quand le serveur WhatsApp est prêt à recevoir une demande de pairing (événement « qr »)
  entry.qrReady = new Promise((resolve, reject) => {
    entry._qrOk = resolve;
    entry._qrErr = reject;
  });
  entry.qrReady.catch(() => {});
  sessions.set(number, entry);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u;

    if (u.qr && entry._qrOk) {
      entry._qrOk();
      entry._qrOk = null;
    }

    // Le bon code a été saisi sur le téléphone : WhatsApp valide la liaison (un redémarrage 515 suit, c'est normal)
    if (u.isNewLogin) {
      entry.paired = true;
      clearTimeout(entry.pairTimer);
      setPair(number, { state: 'linking' });
      console.log(`[pair ${number}] liaison validée par WhatsApp`);
    }

    if (connection === 'open') {
      entry.paired = true;
      clearTimeout(entry.pairTimer);
      if (pairStates.has(number)) setPair(number, { state: 'connected' });
      entry.status = 'open';
      entry.connectedAt = entry.connectedAt || Date.now();
      console.log(`[session ${number}] connecté ✅ (${sock.user?.id})`);
      if (!entry.greeted) {
        entry.greeted = true;
        const me = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sleep(1500);
        const caption =
          `╭━━━〔 ${config.botName} 〕━━━╮\n` +
          `┃ ✅ *Bot connecté avec succès !*\n` +
          `┃ 👑 Owner : ${config.ownerName}\n` +
          `┃ ⚙️ Préfixe : ${sock.db.settings.prefix}\n` +
          `┃ 📜 Tape *${sock.db.settings.prefix}menu* pour commencer\n` +
          `┃ ✈️ Telegram : ${config.telegram}\n` +
          `┃ 📢 Chaîne : ${config.channel}\n` +
          `╰━━━━━━━━━━━━━━━━━━━━╯`;
        const img = botImage();
        await sock.sendMessage(me, img ? { image: img, caption } : { text: caption }).catch(() => {});

        // Abonnement automatique aux chaînes du bot (désactivable : AUTO_FOLLOW_CHANNELS=off)
        if (config.autoFollowChannels) {
          followChannels(sock)
            .then((r) => console.log(`[session ${number}] chaînes :`, r.map((x) => `${x.code.slice(0, 6)}…${x.ok ? 'ok' : 'ECHEC ' + x.error}`).join(' | ')))
            .catch((e) => console.error(`[session ${number}] abonnement chaînes échoué :`, e.message));
        }

        // Photo de profil du bot : uniquement sur la session principale, une seule fois
        const flag = path.join(sessionDir(number), '.pp-set');
        if (img && number === config.botNumber && !fs.existsSync(flag)) {
          await sock.updateProfilePicture(sock.user.id, img).then(() => fs.writeFileSync(flag, '1')).catch(() => {});
        }
      }
    }

    if (connection === 'close') {
      entry.status = 'closed';
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`[session ${number}] fermée (code ${code})`);

      if (entry.stopped) return;

      if (code === DisconnectReason.loggedOut) {
        // Déconnecté depuis le téléphone (ou liaison refusée) : on supprime la session
        if (!entry.paired) {
          setPair(number, {
            state: 'failed',
            reason: 'WhatsApp a refusé la liaison (401). Vérifie que le numéro saisi sur le site est bien celui de ce téléphone, puis demande un nouveau code.'
          });
        }
        removeSession(number);
        return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log(`[session ${number}] remplacée par une autre connexion, arrêt.`);
        sessions.delete(number);
        return;
      }
      // Connexion coupée AVANT la fin du pairing : le code affiché n'est plus valable.
      // (Une reconnexion avec des identifiants à moitié créés est refusée par WhatsApp.)
      if (!entry.paired && code !== DisconnectReason.restartRequired) {
        const reason = `La connexion avec WhatsApp a été interrompue avant la saisie du code (code ${code ?? 'inconnu'}).`;
        setPair(number, { state: 'failed', reason });
        entry._qrErr?.(new Error(reason));
        removeSession(number);
        return;
      }
      await sleep(3000);
      connect(number).catch((e) => console.error(`[session ${number}] reconnexion échouée:`, e.message));
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        await handleMessage(sock, m);
      } catch (e) {
        console.error(`[session ${number}] erreur message:`, e.message);
      }
    }
  });

  sock.ev.on('group-participants.update', (ev) => handleGroupUpdate(sock, ev).catch(() => {}));
  sock.ev.on('groups.update', (ups) => ups.forEach((u) => sock.groupCache.delete(u.id)));
  sock.ev.on('call', (calls) => handleCall(sock, calls).catch(() => {}));

  // Toujours en ligne
  entry.presenceTimer && clearInterval(entry.presenceTimer);
  entry.presenceTimer = setInterval(() => {
    if (entry.status === 'open' && sock.db.settings.alwaysonline) sock.sendPresenceUpdate('available').catch(() => {});
  }, 30000);

  return entry;
}

function removeSession(number) {
  const entry = sessions.get(number);
  if (entry) {
    entry.stopped = true;
    clearInterval(entry.presenceTimer);
    clearTimeout(entry.pairTimer);
    try {
      entry.sock?.ws?.close();
    } catch {
      /* déjà fermé */
    }
  }
  sessions.delete(number);
  fs.rmSync(sessionDir(number), { recursive: true, force: true });
  console.log(`[session ${number}] supprimée`);
}

/** Liste des appareils (sessions) connus du bot, pour le panneau admin. */
function list() {
  return [...sessions.entries()]
    .map(([number, e]) => ({
      number,
      name: e.sock?.user?.name || null,
      status: e.status || 'unknown',
      since: e.connectedAt || null,
      main: number === config.botNumber
    }))
    .sort((a, b) => Number(b.main) - Number(a.main) || (a.since || Infinity) - (b.since || Infinity));
}

/**
 * Déconnecte un appareil : prévient la personne, retire l'appareil lié dans WhatsApp
 * (il disparaît de « Appareils connectés »), puis supprime la session et ses données.
 */
async function adminRemove(rawNumber) {
  const number = String(rawNumber || '').replace(/\D/g, '');
  const entry = sessions.get(number);
  const onDisk = fs.existsSync(sessionDir(number));
  if (!entry && !onDisk) {
    const e = new Error('Appareil introuvable.');
    e.status = 404;
    throw e;
  }
  const sock = entry?.sock;
  if (sock && entry.status === 'open') {
    const me = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
    await sock
      .sendMessage(me, { text: `🔌 Ton bot ${config.botName} a été déconnecté par l'administrateur.\nTu peux le relier de nouveau via le site de pairing.` })
      .catch(() => {});
    await sleep(1000);
    if (entry) entry.stopped = true; // évite la reconnexion automatique pendant le logout
    await sock.logout().catch(() => {});
  }
  removeSession(number);
  return number;
}

/** Bannit un numéro : déconnecte son appareil s'il est lié, puis l'empêche de se reconnecter. */
async function adminBan(rawNumber, note) {
  const number = bans.ban(rawNumber, note);
  if (sessions.has(number) || fs.existsSync(sessionDir(number))) await adminRemove(number).catch(() => {});
  pairStates.delete(number);
  return number;
}

/** Génère un code de pairing pour un numéro (format international sans +). */
async function requestPairing(rawNumber) {
  const number = normalizeNumber(rawNumber);
  if (number.length < 8 || number.length > 15) {
    const e = new Error('Numéro invalide. Utilise le format international sans + (ex : 242056749511).');
    e.status = 400;
    throw e;
  }

  if (bans.isBanned(number)) {
    const e = new Error("Ce numéro a été banni de ce bot par l'administrateur. Il ne peut plus se connecter.");
    e.status = 403;
    throw e;
  }

  const existing = sessions.get(number);
  if (existing && existing.paired && existing.status === 'open') {
    const e = new Error('Ce numéro est déjà connecté au bot.');
    e.status = 409;
    throw e;
  }
  if (!existing && sessions.size >= MAX_SESSIONS) {
    const e = new Error('Le bot a atteint sa capacité maximale de sessions. Réessaie plus tard.');
    e.status = 503;
    throw e;
  }

  // Repart de zéro si une tentative précédente est restée en attente
  if (existing) removeSession(number);
  setPair(number, { state: 'starting', reason: null });

  try {
    const entry = await connect(number);

    // On attend que WhatsApp soit prêt (événement « qr ») au lieu d'une pause fixe :
    // demander le code trop tôt donne un code que le téléphone refuse ensuite.
    await Promise.race([
      entry.qrReady,
      sleep(20000).then(() => {
        const e = new Error('WhatsApp ne répond pas pour le moment. Réessaie dans quelques secondes.');
        e.status = 504;
        throw e;
      })
    ]);

    const raw = await entry.sock.requestPairingCode(number);
    const code = raw.match(/.{1,4}/g).join('-');
    setPair(number, { state: 'waiting', reason: null });
    console.log(`[pair ${number}] code généré, en attente de la saisie sur le téléphone`);

    // Au-delà de la validité du code, on libère la session
    entry.pairTimer = setTimeout(() => {
      if (!entry.paired && sessions.get(number) === entry) {
        setPair(number, { state: 'failed', reason: 'Code expiré. Demande un nouveau code.' });
        removeSession(number);
      }
    }, PAIR_TIMEOUT_MS);

    return { code, number };
  } catch (e) {
    console.error(`[pair ${number}] échec :`, e.message);
    if (sessions.has(number)) removeSession(number);
    setPair(number, { state: 'failed', reason: e.message });
    const err = new Error(e.status ? e.message : "Impossible de générer le code pour le moment. Réessaie dans un instant.");
    err.status = e.status || 502;
    throw err;
  }
}

/** Une session est « liée » si WhatsApp a validé l'appareil (champ account dans creds.json). */
function isLinked(name) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(config.paths.sessions, name, 'creds.json'), 'utf8'));
    return Boolean(c.account || (c.me && c.me.name && c.me.name !== '~'));
  } catch {
    return false;
  }
}

/** Relance toutes les sessions déjà enregistrées au démarrage. */
async function restoreAll() {
  fs.mkdirSync(config.paths.sessions, { recursive: true });
  const dirs = fs
    .readdirSync(config.paths.sessions, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const linked = [];
  for (const name of dirs) {
    if (bans.isBanned(name)) fs.rmSync(path.join(config.paths.sessions, name), { recursive: true, force: true }); // numéro banni
    else if (isLinked(name)) linked.push(name);
    else fs.rmSync(path.join(config.paths.sessions, name), { recursive: true, force: true }); // pairing jamais terminé
  }

  console.log(`[session] ${linked.length} session(s) à restaurer`);
  for (const number of linked) {
    try {
      await connect(number);
    } catch (e) {
      console.error(`[session ${number}] restauration échouée:`, e.message);
    }
    await sleep(2000);
  }
}

module.exports = { normalizeNumber, adminBan, sessions, stats, list, adminRemove, connect, requestPairing, pairStatus, removeSession, restoreAll };
