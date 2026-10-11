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

const sessionDir = (number) => path.join(config.paths.sessions, number);

function stats() {
  let connected = 0;
  for (const s of sessions.values()) if (s.status === 'open') connected++;
  return { total: sessions.size, connected };
}

async function connect(number) {
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
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
    getMessage: async () => undefined
  });

  // Données attachées au socket (utilisées par le handler et les commandes)
  sock.sessionNumber = number;
  sock.db = dbLib.open(number);
  sock.startedAt = Date.now();
  sock.groupCache = new Map();
  sock.msgCache = new Map();
  sock.sentIds = new Set();

  // On mémorise les ids des messages envoyés pour ne pas les retraiter
  const rawSend = sock.sendMessage.bind(sock);
  sock.sendMessage = async (...a) => {
    const r = await rawSend(...a);
    const id = r?.key?.id;
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
  sessions.set(number, entry);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    const { connection, lastDisconnect } = u;

    if (connection === 'open') {
      entry.status = 'open';
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
          `╰━━━━━━━━━━━━━━━━━━━━╯`;
        const img = botImage();
        await sock.sendMessage(me, img ? { image: img, caption } : { text: caption }).catch(() => {});

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
        // Déconnecté depuis le téléphone : on supprime la session
        removeSession(number);
        return;
      }
      if (code === DisconnectReason.connectionReplaced) {
        console.log(`[session ${number}] remplacée par une autre connexion, arrêt.`);
        sessions.delete(number);
        return;
      }
      // Jamais associée (code de pairing non saisi à temps) : on nettoie
      if (!sock.authState.creds.me && code !== DisconnectReason.restartRequired) {
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

/** Génère un code de pairing pour un numéro (format international sans +). */
async function requestPairing(rawNumber) {
  const number = String(rawNumber || '').replace(/\D/g, '');
  if (number.length < 8 || number.length > 15) {
    const e = new Error('Numéro invalide. Utilise le format international sans + (ex : 242056749511).');
    e.status = 400;
    throw e;
  }

  const existing = sessions.get(number);
  if (existing && existing.sock?.authState?.creds?.me && existing.status === 'open') {
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

  const entry = await connect(number);
  const sock = entry.sock;
  await sleep(3000);
  const code = await sock.requestPairingCode(number);
  return code.match(/.{1,4}/g).join('-');
}

/** Relance toutes les sessions déjà enregistrées au démarrage. */
async function restoreAll() {
  fs.mkdirSync(config.paths.sessions, { recursive: true });
  const dirs = fs
    .readdirSync(config.paths.sessions, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(config.paths.sessions, d.name, 'creds.json')))
    .map((d) => d.name);

  console.log(`[session] ${dirs.length} session(s) à restaurer`);
  for (const number of dirs) {
    try {
      await connect(number);
    } catch (e) {
      console.error(`[session ${number}] restauration échouée:`, e.message);
    }
    await sleep(2000);
  }
}

module.exports = { sessions, stats, connect, requestPairing, removeSession, restoreAll };
