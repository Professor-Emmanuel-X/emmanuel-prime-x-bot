const config = require('../config');

/**
 * Met un numéro au format international (chiffres seulement).
 * Un numéro local qui commence par 0 (ex : 06 915 8808) reçoit l'indicatif par défaut (Congo : 242).
 */
function normalizeNumber(raw) {
  let n = String(raw || '').replace(/\D/g, '').replace(/^00/, '');
  const cc = String(config.defaultCountryCode || '').replace(/\D/g, '');
  if (cc && n.startsWith('0') && n.length <= 9) n = cc + n;
  return n;
}

module.exports = { normalizeNumber };
