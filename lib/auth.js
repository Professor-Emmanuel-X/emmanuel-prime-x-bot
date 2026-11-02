const crypto = require('crypto');
const config = require('../config');

const TTL_MS = 12 * 60 * 60 * 1000; // session de 12 h
const COOKIES = { user: 'epx_auth', admin: 'epx_admin' };

const sha = (s) => crypto.createHash('sha256').update(s).digest();

// Chaque espace (site / admin) a sa propre clé de signature, dérivée de ses identifiants :
// un cookie « site » ne peut jamais ouvrir l'admin, et changer un mot de passe invalide les anciennes sessions.
const secrets = {
  user: process.env.SESSION_SECRET || sha(`${config.siteLogin}:${config.sitePassword}:epx-secret`).toString('hex'),
  admin: sha(`${process.env.SESSION_SECRET || ''}:${config.adminLogin}:${config.adminPassword}:epx-admin-secret`).toString('hex')
};

function safeEqual(a, b) {
  // comparaison à temps constant (les hash ont toujours la même longueur)
  return crypto.timingSafeEqual(sha(String(a)), sha(String(b)));
}

function sign(scope, payload) {
  return crypto.createHmac('sha256', secrets[scope]).update(`${scope}.${payload}`).digest('base64url');
}

function makeToken(scope) {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(scope, exp)}`;
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* cookie illisible : ignoré */
      }
    }
  }
  return out;
}

function isAuthed(req, scope = 'user') {
  if (scope === 'admin' && !adminEnabled()) return false;
  const token = parseCookies(req.headers.cookie)[COOKIES[scope]];
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(scope, exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

const adminEnabled = () => Boolean(config.adminPassword);

function checkCredentials(login, password, scope = 'user') {
  const [l, p] = scope === 'admin' ? [config.adminLogin, config.adminPassword] : [config.siteLogin, config.sitePassword];
  if (scope === 'admin' && !adminEnabled()) return false;
  // on évalue les deux pour ne pas révéler lequel est faux
  const a = safeEqual(login || '', l);
  const b = safeEqual(password || '', p);
  return a && b;
}

function setCookie(req, res, scope = 'user') {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${COOKIES[scope]}=${encodeURIComponent(makeToken(scope))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`
  );
}

function clearCookie(res, scope = 'user') {
  res.setHeader('Set-Cookie', `${COOKIES[scope]}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

/** Protège une route du site : API → 401 JSON, pages → redirection vers /login */
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autorisé. Connecte-toi.' });
  return res.redirect('/login');
}

/** Protège les routes d'administration (API uniquement). */
function requireAdmin(req, res, next) {
  if (isAuthed(req, 'admin')) return next();
  return res.status(401).json({ error: 'Accès administrateur requis.' });
}

module.exports = { isAuthed, checkCredentials, setCookie, clearCookie, requireAuth, requireAdmin, adminEnabled };
