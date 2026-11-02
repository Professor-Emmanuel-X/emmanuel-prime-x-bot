const { getBuffer } = require('./utils');
const { sniff } = require('./dl');

const isJpeg = (b) => b && b.length > 3 && b[0] === 0xff && b[1] === 0xd8;

/** Rend une image affichable : tout ce qui n'est pas du JPEG (GIF, PNG, WebP, AVIF…) est converti. */
async function ensureJpeg(buf, type) {
  if (isJpeg(buf)) return buf;
  try {
    return await toJpeg(buf);
  } catch (e) {
    if (type === 'image') return buf; // PNG/WebP/GIF : on tente tel quel si la conversion est impossible
    throw new Error("Format d'image non pris en charge.");
  }
}

async function toJpeg(buf) {
  const sharp = require('sharp');
  return sharp(buf).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Filet de sécurité appliqué à TOUT envoi : télécharge les médias donnés par lien,
 * vérifie que c'est bien une image/vidéo (pas une page d'erreur) et convertit
 * les formats que WhatsApp n'affiche pas (AVIF, HEIC…) en JPEG.
 */
async function normalizeMedia(content) {
  if (!content || typeof content !== 'object') return content;
  for (const kind of ['image', 'video']) {
    let m = content[kind];
    if (!m) continue;
    let buf = Buffer.isBuffer(m) ? m : null;
    if (!buf && m.url && /^https?:\/\//i.test(m.url)) {
      try {
        buf = await getBuffer(m.url, { timeout: 40000, maxContentLength: 80 * 1024 * 1024 });
      } catch (e) {
        throw new Error(`Impossible de télécharger le média (${e.code || e.message})`);
      }
    }
    if (!buf) continue;
    const type = sniff(buf);
    if (type === 'bad') throw new Error("Le lien n'a pas renvoyé un média valide.");
    if (kind === 'image') buf = await ensureJpeg(buf, type);
    content = { ...content, [kind]: buf };
  }
  return content;
}

/** Télécharge la première image valable parmi plusieurs liens. */
async function fetchImage(urls) {
  const errors = [];
  for (const u of urls) {
    try {
      let buf = await getBuffer(typeof u === 'function' ? await u() : u, { timeout: 30000 });
      const t = sniff(buf);
      if (t === 'bad') continue;
      buf = await ensureJpeg(buf, t);
      return buf;
    } catch (e) {
      errors.push(e.code || e.message);
    }
  }
  throw new Error(`Aucune image disponible (${errors.join(', ') || 'réponse invalide'})`);
}

module.exports = { normalizeMedia, fetchImage };
