const { fetchJson, translate, truncate } = require('../lib/utils');
const { animePic } = require('../lib/anime');

async function fr(text, n = 500) {
  if (!text) return '—';
  const t = truncate(text.replace(/\[Written by.*?\]/gi, '').trim(), n);
  return translate(t, 'fr').catch(() => t);
}

module.exports = [
  {
    name: 'anime',
    aliases: ['ani', 'animeinfo'],
    desc: 'Fiche d’un anime : anime Blue Box',
    category: 'anime',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}anime Blue Box`);
      const d = await fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(ctx.text)}&limit=1&sfw=true`);
      const a = d.data?.[0];
      if (!a) return ctx.reply('❌ Anime introuvable.');
      await ctx.reply(
        `🎌 *${a.title}*${a.title_japanese ? ` (${a.title_japanese})` : ''}\n\n` +
          `📺 Type : ${a.type || '?'} • ${a.episodes || '?'} épisodes\n📡 Statut : ${a.status}\n⭐ Note : ${a.score || '—'}\n📅 Diffusion : ${a.aired?.string || '?'}\n🎭 Genres : ${(a.genres || []).map((g) => g.name).join(', ') || '—'}\n\n` +
          `📝 ${await fr(a.synopsis)}\n\n🔗 ${a.url}`
      );
    }
  },
  {
    name: 'manga',
    aliases: ['mangainfo', 'scan'],
    desc: 'Fiche d’un manga',
    category: 'anime',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}manga One Piece`);
      const d = await fetchJson(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(ctx.text)}&limit=1&sfw=true`);
      const m = d.data?.[0];
      if (!m) return ctx.reply('❌ Manga introuvable.');
      await ctx.reply(
        `📚 *${m.title}*${m.title_japanese ? ` (${m.title_japanese})` : ''}\n\n` +
          `📖 Chapitres : ${m.chapters || '?'} • Volumes : ${m.volumes || '?'}\n📡 Statut : ${m.status}\n⭐ Note : ${m.score || '—'}\n✍️ Auteur(s) : ${(m.authors || []).map((x) => x.name).join(', ') || '—'}\n🎭 Genres : ${(m.genres || []).map((g) => g.name).join(', ') || '—'}\n\n` +
          `📝 ${await fr(m.synopsis)}\n\n🔗 ${m.url}`
      );
    }
  },
  {
    name: 'animechar',
    aliases: ['character', 'perso', 'personnage'],
    desc: 'Fiche d’un personnage d’anime / manga',
    category: 'anime',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}perso Mikoto`);
      const d = await fetchJson(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(ctx.text)}&limit=1`);
      const c = d.data?.[0];
      if (!c) return ctx.reply('❌ Personnage introuvable.');
      await ctx.reply(
        `👤 *${c.name}*${c.name_kanji ? ` (${c.name_kanji})` : ''}\n❤️ Favoris : ${c.favorites?.toLocaleString('fr-FR') || 0}\n\n📝 ${await fr(c.about, 450)}\n\n🔗 ${c.url}`
      );
    }
  },
  {
    name: 'waifu',
    aliases: ['animepic', 'wife'],
    desc: 'Illustration d’anime au hasard',
    category: 'anime',
    async run(ctx) {
      const url = await animePic('waifu');
      await ctx.sock.sendMessage(ctx.from, { image: { url }, caption: '🌸 Illustration aléatoire' }, { quoted: ctx.m });
    }
  },
  {
    name: 'neko',
    aliases: ['catgirl', 'nekopic'],
    desc: 'Illustration « neko » au hasard',
    category: 'anime',
    async run(ctx) {
      const url = await animePic('neko');
      await ctx.sock.sendMessage(ctx.from, { image: { url }, caption: '🐱 Illustration aléatoire' }, { quoted: ctx.m });
    }
  },
  {
    name: 'pokemon',
    aliases: ['poke', 'pokedex'],
    desc: 'Fiche Pokédex : pokemon pikachu',
    category: 'anime',
    async run(ctx) {
      const n = (ctx.args[0] || '').toLowerCase();
      if (!n) return ctx.reply(`Utilisation : ${ctx.prefix}pokemon pikachu`);
      try {
        const p = await fetchJson(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(n)}`);
        const stats = p.stats.map((s) => `• ${s.stat.name} : ${s.base_stat}`).join('\n');
        await ctx.reply(
          `🔴 *${p.name.toUpperCase()}* (#${p.id})\n\n🧬 Types : ${p.types.map((t) => t.type.name).join(', ')}\n📏 Taille : ${p.height / 10} m\n⚖️ Poids : ${p.weight / 10} kg\n✨ Talents : ${p.abilities.map((a) => a.ability.name).join(', ')}\n\n📊 *Statistiques*\n${stats}`
        );
      } catch {
        await ctx.reply('❌ Pokémon introuvable (utilise le nom anglais ou le numéro).');
      }
    }
  }
];
