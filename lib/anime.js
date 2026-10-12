const { fetchJson } = require('./utils');

// Plusieurs sources, essayées dans l'ordre : si l'une est hors service, la suivante prend le relais.
const PIC_SOURCES = {
  waifu: [
    async () => (await fetchJson('https://nekos.best/api/v2/waifu'))?.results?.[0]?.url,
    async () => (await fetchJson('https://nekos.life/api/v2/img/waifu'))?.url,
    async () => (await fetchJson('https://api.waifu.im/search?included_tags=waifu'))?.images?.[0]?.url,
    async () => (await fetchJson('https://api.waifu.pics/sfw/waifu'))?.url,
    async () => `https://image.pollinations.ai/prompt/${encodeURIComponent('anime waifu illustration, beautiful, detailed')}?width=768&height=1024&nologo=true&seed=${Date.now()}`
  ],
  neko: [
    async () => (await fetchJson('https://nekos.best/api/v2/neko'))?.results?.[0]?.url,
    async () => (await fetchJson('https://nekos.life/api/v2/img/neko'))?.url,
    async () => (await fetchJson('https://api.waifu.pics/sfw/neko'))?.url,
    async () => `https://image.pollinations.ai/prompt/${encodeURIComponent('anime neko catgirl illustration, cute, detailed')}?width=768&height=1024&nologo=true&seed=${Date.now()}`
  ],
  husbando: [
    async () => (await fetchJson('https://nekos.best/api/v2/husbando'))?.results?.[0]?.url,
    async () => `https://image.pollinations.ai/prompt/${encodeURIComponent('anime husbando handsome boy illustration')}?width=768&height=1024&nologo=true&seed=${Date.now()}`
  ],
  kitsune: [
    async () => (await fetchJson('https://nekos.best/api/v2/kitsune'))?.results?.[0]?.url,
    async () => `https://image.pollinations.ai/prompt/${encodeURIComponent('anime kitsune fox girl illustration')}?width=768&height=1024&nologo=true&seed=${Date.now()}`
  ]
};

/** Image d'anime au hasard. */
async function animePic(category) {
  const list = PIC_SOURCES[category] || PIC_SOURCES.waifu;
  const errors = [];
  for (const src of list) {
    try {
      const url = await src();
      if (url) return url;
    } catch (e) {
      errors.push(e.code || e.message);
    }
  }
  console.error(`[anime:${category}] toutes les sources ont échoué :`, errors.join(' | '));
  throw new Error("Impossible de récupérer une image pour le moment. Réessaie dans un instant.");
}

/** Réaction animée (hug, pat, slap…) : renvoie { url, anime }. Plusieurs services en secours. */
async function animeGif(name) {
  const sources = [
    async () => {
      const r = (await fetchJson(`https://nekos.best/api/v2/${name}`))?.results?.[0];
      return r?.url ? { url: r.url, anime: r.anime_name || '' } : null;
    },
    async () => {
      const d = await fetchJson(`https://api.purrbot.site/v2/img/sfw/${name}/gif`);
      return d?.link ? { url: d.link, anime: '' } : null;
    },
    async () => {
      const d = await fetchJson(`https://api.otakugifs.xyz/gif?reaction=${name}`);
      return d?.url ? { url: d.url, anime: '' } : null;
    },
    async () => {
      const d = await fetchJson(`https://api.waifu.pics/sfw/${name}`);
      return d?.url ? { url: d.url, anime: '' } : null;
    }
  ];
  const errors = [];
  for (const src of sources) {
    try {
      const r = await src();
      if (r) return r;
    } catch (e) {
      errors.push(`${e.response?.status || e.code || e.message}`);
    }
  }
  console.error(`[anime:${name}] toutes les sources ont échoué :`, errors.join(' | '));
  throw new Error("Impossible de récupérer l'animation pour le moment. Réessaie dans un instant.");
}

module.exports = { animePic, animeGif };
