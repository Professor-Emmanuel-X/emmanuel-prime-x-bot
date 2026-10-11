const crypto = require('crypto');
const config = require('../config');

const COOKIE = 'epx_auth';
const TTL_MS = 12 * 60 * 60 * 1000; // session de 12 h

const sha = (s) => crypto.createHash('sha256').update(s).digest();

// La clé de signature dépend des identifiants : changer le mot de passe invalide les anciennes sessions.
const secret = process.env.SESSION_SECRET || sha(`${config.siteLogin}:${config.sitePassword}:epx-secret`).toString('hex');

function safeEqual(a, b) {
  // comparaison à temps constant (les hash ont toujours la même longueur)
  return crypto.timingSafeEqual(sha(String(a)), sha(String(b)));
}

function sign(payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function makeToken() {
  const exp = String(Date.now() + TTL_MS);
  return `${exp}.${sign(exp)}`;
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

function checkCredentials(login, password) {
  // on évalue les deux pour ne pas révéler lequel est faux
  const a = safeEqual(login || '', config.siteLogin);
  const b = safeEqual(password || '', config.sitePassword);
  return a && b;
}

function setCookie(req, res) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}`
  );
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Protège une route : API → 401 JSON, pages → redirection vers /login */
function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autorisé. Connecte-toi.' });
  return res.redirect('/login');
}

module.exports = { isAuthed, checkCredentials, setCookie, clearCookie, requireAuth };
