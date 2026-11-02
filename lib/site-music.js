const fs = require('fs');
const path = require('path');

const AUDIO = /\.(mp3|m4a|ogg|wav|aac)$/i;

/**
 * Cherche un fichier audio dans public/ (n'importe quel sous-dossier : music, Musique, audio…),
 * en préférant celui qui s'appelle « la-vida-carousel ». Renvoie l'adresse web ou null.
 */
function findMusic(publicDir, maxDepth = 3) {
  const found = [];
  (function walk(dir, rel, depth) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && depth < maxDepth) walk(path.join(dir, e.name), `${rel}/${e.name}`, depth + 1);
      else if (e.isFile() && AUDIO.test(e.name)) found.push(`${rel}/${e.name}`);
    }
  })(publicDir, '', 0);
  if (!found.length) return null;
  const score = (f) => (/la-?vida/i.test(f) ? 0 : /carou/i.test(f) ? 1 : 2);
  found.sort((a, b) => score(a) - score(b) || a.localeCompare(b));
  return found[0].split('/').map((s) => (s ? encodeURIComponent(s) : s)).join('/');
}

module.exports = { findMusic };
