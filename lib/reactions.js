// Réactions automatiques (.autoreact)
const DEFAULT_EMOJIS = ['🌺', '🍭', '😋', '🌈', '🍪', '🍩', '🍫', '🍬', '🌝', '🌠', '✨', '🍡', '🍥', '🍧', '🍿', '🍨', '🍦', '🍓', '🍒', '🍑', '🍉', '🌸', '🌼', '🌷', '💖', '🦋', '🍀', '🧁', '🍰', '🥰'];

const seg = new Intl.Segmenter('fr', { granularity: 'grapheme' });

/** Extrait les emojis d'un texte (avec ou sans espaces entre eux). */
function parseEmojis(text) {
  const out = [];
  for (const { segment } of seg.segment(String(text || ''))) {
    if (/\p{Extended_Pictographic}/u.test(segment) && !out.includes(segment)) out.push(segment);
  }
  return out;
}

const emojisOf = (settings) => (settings.reactEmojis && settings.reactEmojis.length ? settings.reactEmojis : DEFAULT_EMOJIS);
const randomEmoji = (settings) => {
  const l = emojisOf(settings);
  return l[Math.floor(Math.random() * l.length)];
};

module.exports = { DEFAULT_EMOJIS, parseEmojis, emojisOf, randomEmoji };
