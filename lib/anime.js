const { fetchJson } = require('./utils');

/** Image d'anime au hasard : nekos.best en premier, waifu.pics en secours. */
async function animePic(category) {
  try {
    const d = await fetchJson(`https://nekos.best/api/v2/${category}`);
    const url = d?.results?.[0]?.url;
    if (url) return url;
  } catch {
    /* on essaie le secours */
  }
  const d = await fetchJson(`https://api.waifu.pics/sfw/${category}`);
  if (!d?.url) throw new Error('Aucune image reçue');
  return d.url;
}

/** Réaction animée (hug, pat, slap…) : renvoie { url, anime } depuis nekos.best. */
async function animeGif(name) {
  const d = await fetchJson(`https://nekos.best/api/v2/${name}`);
  const r = d?.results?.[0];
  if (!r?.url) throw new Error('Aucune animation reçue');
  return { url: r.url, anime: r.anime_name || '' };
}

module.exports = { animePic, animeGif };
