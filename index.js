const express = require('express');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const { loadCommands, all } = require('./lib/loader');
const session = require('./lib/session');
const auth = require('./lib/auth');
const { findMusic } = require('./lib/site-music');

// La bibliothèque de chiffrement écrit des centaines de lignes « Closing session » dans la console : on les masque
const _info = console.info.bind(console);
console.info = (...a) => {
  if (typeof a[0] === 'string' && /^(Closing session|Opening session|Removing old closed session|Migrating session|Session already)/.test(a[0])) return;
  _info(...a);
};

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.message || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e?.message || e));

loadCommands();

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});
// Fichiers publics : page de connexion + images (le site lui-même est dans /views, protégé)
app.use(express.static(path.join(__dirname, 'public'), { index: false, extensions: ['html'] }));

// Limite simple : 5 demandes de code par IP toutes les 10 minutes
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 5;
}

const loginHits = new Map();
function loginBlocked(ip) {
  const now = Date.now();
  return (loginHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000).length >= 5;
}
function loginFailed(ip) {
  const now = Date.now();
  const list = (loginHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  loginHits.set(ip, list);
}

// Musique du site : cherche un fichier audio n'importe où dans public/ (music, Musique, audio…)
app.get('/api/music', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ src: findMusic(path.join(__dirname, 'public')) });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ----- Authentification -----
app.get('/login', (req, res) => {
  if (auth.isAuthed(req)) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (loginBlocked(ip)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 10 minutes.' });
  }
  const { login, password } = req.body || {};
  if (!auth.checkCredentials(login, password)) {
    loginFailed(ip);
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  auth.setCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  auth.clearCookie(res);
  res.json({ ok: true });
});

// ----- Site protégé -----
app.get('/', auth.requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ----- Administration : voir et supprimer les appareils connectés -----
app.get('/admin', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/admin/login', (req, res) => {
  if (!auth.adminEnabled()) {
    return res.status(503).json({ error: "L'espace admin est désactivé : définis la variable ADMIN_PASSWORD sur le serveur." });
  }
  const ip = req.ip;
  if (loginBlocked(ip)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessaie dans 10 minutes.' });
  }
  const { login, password } = req.body || {};
  if (!auth.checkCredentials(login, password, 'admin')) {
    loginFailed(ip);
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
  }
  auth.setCookie(req, res, 'admin');
  res.json({ ok: true });
});

app.post('/api/admin/logout', (_req, res) => {
  auth.clearCookie(res, 'admin');
  res.json({ ok: true });
});

app.get('/api/admin/devices', auth.requireAdmin, (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ devices: session.list(), ...session.stats() });
});

app.post('/api/admin/devices/delete', auth.requireAdmin, async (req, res) => {
  try {
    const number = await session.adminRemove(req.body?.number);
    res.json({ ok: true, number });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Suppression impossible.' });
  }
});

app.get('/api/status', auth.requireAuth, (_req, res) => {
  res.json({
    bot: config.botName,
    owner: config.ownerName,
    telegram: config.telegram,
    commands: all.length,
    uptime: Math.floor(process.uptime()),
    ...session.stats()
  });
});

app.get('/api/pair/status', auth.requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(session.pairStatus(req.query.number));
});

app.post('/api/pair', auth.requireAuth, async (req, res) => {
  const ip = req.ip;
  if (limited(ip)) {
    return res.status(429).json({ error: 'Trop de demandes. Réessaie dans quelques minutes.' });
  }
  try {
    const code = await session.requestPairing(req.body?.number);
    res.json({ code });
  } catch (e) {
    console.error('[pair]', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Erreur lors de la génération du code.' });
  }
});

app.listen(config.port, () => {
  console.log(`[web] site de pairing sur le port ${config.port}`);
});

session.restoreAll().then(() => {
  if (session.stats().total === 0) {
    console.log('[bot] Aucune session. Ouvre le site et entre ton numéro pour obtenir le code de pairing.');
  }
});

// Évite la mise en veille de Render (plan gratuit) : le serveur s'appelle lui-même toutes les 10 minutes
// par son adresse publique, ce que Render compte comme une vraie visite.
const PING_EVERY_MS = 10 * 60 * 1000;
const selfUrl = (process.env.PING_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
if (selfUrl) {
  let pings = 0;
  let fails = 0;
  const ping = async () => {
    try {
      await axios.get(`${selfUrl}/health`, { timeout: 20000 });
      pings++;
      fails = 0;
      if (pings === 1 || pings % 6 === 0) console.log(`[keepalive] ping n°${pings} OK (${selfUrl})`);
    } catch (e) {
      fails++;
      console.error(`[keepalive] ping échoué (${fails}) :`, e.code || e.message);
    }
  };
  setTimeout(ping, 60 * 1000); // premier ping 1 minute après le démarrage
  setInterval(ping, PING_EVERY_MS);
  console.log(`[keepalive] auto-ping toutes les 10 minutes sur ${selfUrl}/health`);
} else {
  console.log('[keepalive] désactivé (RENDER_EXTERNAL_URL absent). Ajoute la variable PING_URL avec l’adresse de ton site.');
}
