const axios = require('axios');
const { fetchJson } = require('./utils');

const strip = (s) => (s ? String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : '');
const fuzzy = (d) => (d?.month && d?.year ? `${d.day || '?'}/${d.month}/${d.year}` : d?.year ? String(d.year) : '?');

async function anilist(query, variables) {
  const r = await axios.post(
    'https://graphql.anilist.co',
    { query, variables },
    { timeout: 15000, headers: { 'Content-Type': 'application/json', Accept: 'application/json' } }
  );
  return r.data?.data;
}

const MEDIA = `query($q:String,$t:MediaType){Media(search:$q,type:$t,isAdult:false,sort:SEARCH_MATCH){
  siteUrl title{romaji english native} format status episodes chapters volumes averageScore genres description(asHtml:false)
  startDate{year month day} endDate{year month day} staff(perPage:3){edges{role node{name{full}}}}}}`;

function fromMedia(m, kind) {
  return {
    title: m.title.english || m.title.romaji,
    title_japanese: m.title.native,
    type: m.format,
    episodes: m.episodes,
    chapters: m.chapters,
    volumes: m.volumes,
    status: m.status,
    score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
    aired: { string: `${fuzzy(m.startDate)} → ${m.endDate?.year ? fuzzy(m.endDate) : '?'}` },
    genres: (m.genres || []).map((name) => ({ name })),
    authors: (m.staff?.edges || []).filter((e) => /story|art/i.test(e.role)).map((e) => ({ name: e.node.name.full })),
    synopsis: strip(m.description),
    url: m.siteUrl,
    kind
  };
}

/** Jikan d'abord (rapide à échouer), AniList en secours. Même format de sortie que Jikan. */
async function searchMedia(kind, q) {
  try {
    const d = await fetchJson(`https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(q)}&limit=1&sfw=true`, { retries: 0, timeout: 8000 });
    if (d?.data?.[0]) return d.data[0];
  } catch {}
  const data = await anilist(MEDIA, { q, t: kind.toUpperCase() });
  return data?.Media ? fromMedia(data.Media, kind) : null;
}

async function searchCharacter(q) {
  try {
    const d = await fetchJson(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(q)}&limit=1`, { retries: 0, timeout: 8000 });
    if (d?.data?.[0]) return d.data[0];
  } catch {}
  const data = await anilist(
    `query($q:String){Character(search:$q,sort:SEARCH_MATCH){siteUrl favourites description(asHtml:false) name{full native}}}`,
    { q }
  );
  const c = data?.Character;
  return c ? { name: c.name.full, name_kanji: c.name.native, favorites: c.favourites, about: strip(c.description).replace(/~!|!~/g, ''), url: c.siteUrl } : null;
}

module.exports = { searchMedia, searchCharacter };
