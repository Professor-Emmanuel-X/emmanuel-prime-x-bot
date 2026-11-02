// Numéros bannis : ils ne peuvent plus lier le bot (pairing refusé) ni être restaurés au démarrage.
// Stockage : data/banned.json (modifiable depuis l'espace admin) + variable BANNED_NUMBERS (permanente,
// utile sur Render gratuit où le disque est effacé à chaque déploiement).
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { normalizeNumber } = require('./phone');

const FILE = path.join(config.paths.data, 'banned.json');

function readFile() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  } catch {
    return {};
  }
}

function writeFile(d) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(d, null, 2));
}

function envList() {
  return String(process.env.BANNED_NUMBERS || '')
    .split(/[,;\s]+/)
    .map(normalizeNumber)
    .filter((n) => n.length >= 8);
}

const isProtected = (n) => [config.botNumber, config.ownerNumber].filter(Boolean).map(normalizeNumber).includes(n);

function isBanned(raw) {
  const n = normalizeNumber(raw);
  if (!n || isProtected(n)) return false;
  return envList().includes(n) || Boolean(readFile()[n]);
}

function ban(raw, note = '') {
  const n = normalizeNumber(raw);
  if (n.length < 8 || n.length > 15) throw Object.assign(new Error('Numéro invalide (format international, ex : 242056749511).'), { status: 400 });
  if (isProtected(n)) throw Object.assign(new Error('Impossible de bannir le numéro du propriétaire.'), { status: 400 });
  const d = readFile();
  d[n] = { at: Date.now(), note: String(note || '').slice(0, 120) };
  writeFile(d);
  return n;
}

function unban(raw) {
  const n = normalizeNumber(raw);
  if (envList().includes(n) && !readFile()[n]) {
    throw Object.assign(new Error('Ce numéro est banni par la variable BANNED_NUMBERS de Render : retire-le de cette variable pour le débannir.'), { status: 409 });
  }
  const d = readFile();
  if (!d[n]) throw Object.assign(new Error('Ce numéro n’est pas dans la liste des bannis.'), { status: 404 });
  delete d[n];
  writeFile(d);
  if (envList().includes(n)) throw Object.assign(new Error('Retiré de la liste, mais il reste banni par la variable BANNED_NUMBERS de Render.'), { status: 409 });
  return n;
}

function list() {
  const f = readFile();
  const out = Object.entries(f).map(([number, v]) => ({ number, at: v.at || null, note: v.note || '', source: 'admin' }));
  for (const number of envList()) if (!f[number]) out.push({ number, at: null, note: '', source: 'env' });
  return out.sort((a, b) => (b.at || 0) - (a.at || 0));
}

module.exports = { isBanned, ban, unban, list };
