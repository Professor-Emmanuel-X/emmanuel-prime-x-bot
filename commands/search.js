const { fetchJson, translate, truncate, getBuffer } = require('../lib/utils');

const COINS = { btc: 'bitcoin', eth: 'ethereum', bnb: 'binancecoin', sol: 'solana', xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', usdt: 'tether', ltc: 'litecoin', trx: 'tron', ton: 'the-open-network' };

const clean = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\r/g, '').trim();

module.exports = [
  {
    name: 'ddg',
    aliases: ['search', 'duck', 'recherche', 'google'],
    desc: 'Recherche rapide (DuckDuckGo)',
    category: 'search',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}ddg Tour Eiffel`);
      const q = encodeURIComponent(ctx.text);
      const d = await fetchJson(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`);
      const related = (d.RelatedTopics || []).filter((t) => t.Text).slice(0, 3);
      if (!d.AbstractText && !related.length) {
        return ctx.reply(`🔎 Pas de résumé direct pour « ${ctx.text} ».\n\n🔗 https://duckduckgo.com/?q=${q}\n💡 Essaie aussi ${ctx.prefix}wiki ou ${ctx.prefix}ai.`);
      }
      let out = `🔎 *${d.Heading || ctx.text}*\n\n`;
      if (d.AbstractText) out += `${truncate(d.AbstractText, 700)}\n${d.AbstractURL ? `\n🔗 ${d.AbstractURL}` : ''}\n`;
      if (related.length) out += `\n*Voir aussi :*\n` + related.map((r) => `• ${truncate(r.Text, 140)}`).join('\n');
      await ctx.reply(out.trim());
    }
  },
  {
    name: 'crypto',
    aliases: ['coin', 'btc', 'cours'],
    desc: 'Cours d’une cryptomonnaie : crypto btc',
    category: 'search',
    async run(ctx) {
      const raw = (ctx.args[0] || (ctx.command === 'btc' ? 'btc' : 'bitcoin')).toLowerCase();
      const id = COINS[raw] || raw;
      const d = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd,eur&include_24hr_change=true`);
      const c = d[id];
      if (!c) return ctx.reply(`❌ Crypto introuvable. Essaie : ${Object.keys(COINS).join(', ')} ou le nom complet (ex : bitcoin).`);
      const ch = c.usd_24h_change;
      await ctx.reply(
        `🪙 *${id.toUpperCase()}*\n\n💵 ${c.usd.toLocaleString('fr-FR')} USD\n💶 ${c.eur.toLocaleString('fr-FR')} EUR\n${ch >= 0 ? '📈' : '📉'} 24 h : ${ch?.toFixed(2)} %\n\n_Information indicative, pas un conseil financier._`
      );
    }
  },
  {
    name: 'country',
    aliases: ['pays', 'nation'],
    desc: "Informations sur un pays",
    category: 'search',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}pays Congo`);
      let d;
      try {
        d = await fetchJson(`https://restcountries.com/v3.1/translation/${encodeURIComponent(ctx.text)}`);
      } catch {
        d = await fetchJson(`https://restcountries.com/v3.1/name/${encodeURIComponent(ctx.text)}`);
      }
      const c = d[0];
      const langs = Object.values(c.languages || {}).join(', ');
      const curr = Object.values(c.currencies || {}).map((x) => `${x.name} (${x.symbol || ''})`).join(', ');
      const caption =
        `${c.flag || '🏳️'} *${c.translations?.fra?.common || c.name.common}*\n\n` +
        `🏛️ Capitale : ${(c.capital || ['—']).join(', ')}\n🌍 Région : ${c.region} • ${c.subregion || ''}\n` +
        `👥 Population : ${c.population.toLocaleString('fr-FR')}\n📐 Superficie : ${c.area?.toLocaleString('fr-FR')} km²\n` +
        `🗣️ Langues : ${langs}\n💰 Monnaie : ${curr}\n📞 Indicatif : ${c.idd?.root || ''}${(c.idd?.suffixes || [''])[0]}\n🕒 Fuseaux : ${(c.timezones || []).slice(0, 3).join(', ')}`;
      try {
        const img = await getBuffer(c.flags.png);
        await ctx.sock.sendMessage(ctx.from, { image: img, caption }, { quoted: ctx.m });
      } catch {
        await ctx.reply(caption);
      }
    }
  },
  {
    name: 'urban',
    aliases: ['ud', 'slang', 'urbandictionary'],
    desc: 'Définition d’argot (Urban Dictionary)',
    category: 'search',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}urban rizz`);
      const d = await fetchJson(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(ctx.text)}`);
      const e = d.list?.[0];
      if (!e) return ctx.reply('❌ Aucune définition trouvée.');
      await ctx.reply(`📖 *${e.word}*\n\n${truncate(clean(e.definition).replace(/[\[\]]/g, ''), 700)}\n\n💬 _${truncate(clean(e.example).replace(/[\[\]]/g, ''), 250)}_\n\n👍 ${e.thumbs_up}  👎 ${e.thumbs_down}`);
    }
  },
  {
    name: 'npm',
    aliases: ['npmjs', 'package'],
    desc: 'Infos sur un paquet npm',
    category: 'search',
    async run(ctx) {
      if (!ctx.args[0]) return ctx.reply(`Utilisation : ${ctx.prefix}npm express`);
      try {
        const p = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(ctx.args[0]).replace('%40', '@')}/latest`);
        await ctx.reply(
          `📦 *${p.name}* v${p.version}\n\n📝 ${p.description || '—'}\n⚖️ Licence : ${p.license || '—'}\n🔗 https://www.npmjs.com/package/${p.name}${p.homepage ? `\n🏠 ${p.homepage}` : ''}\n\n⬇️ npm install ${p.name}`
        );
      } catch {
        await ctx.reply('❌ Paquet introuvable.');
      }
    }
  },
  {
    name: 'bible',
    aliases: ['verset', 'verse'],
    desc: 'Verset biblique : bible john 3:16',
    category: 'search',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}bible john 3:16`);
      try {
        const d = await fetchJson(`https://bible-api.com/${encodeURIComponent(ctx.text)}?translation=web`);
        const fr = await translate(d.text.trim(), 'fr');
        await ctx.reply(`📖 *${d.reference}*\n\n${truncate(fr, 1200)}\n\n_(traduction automatique de la World English Bible)_`);
      } catch {
        await ctx.reply('❌ Verset introuvable. Exemple : john 3:16 ou psalms 23:1-3');
      }
    }
  },
  {
    name: 'quran',
    aliases: ['coran', 'ayah'],
    desc: 'Verset du Coran : quran 2:255',
    category: 'search',
    async run(ctx) {
      const ref = (ctx.args[0] || '').trim();
      if (!/^\d{1,3}:\d{1,3}$/.test(ref)) return ctx.reply(`Utilisation : ${ctx.prefix}coran 2:255  (sourate:verset)`);
      try {
        const [fr, ar] = await Promise.all([
          fetchJson(`https://api.alquran.cloud/v1/ayah/${ref}/fr.hamidullah`),
          fetchJson(`https://api.alquran.cloud/v1/ayah/${ref}/quran-uthmani`)
        ]);
        await ctx.reply(`🕌 *Sourate ${fr.data.surah.englishName} (${ref})*\n\n${ar.data.text}\n\n${fr.data.text}`);
      } catch {
        await ctx.reply('❌ Verset introuvable.');
      }
    }
  },
  {
    name: 'holidays',
    aliases: ['feries', 'jourferies'],
    desc: 'Jours fériés : holidays FR 2026',
    category: 'search',
    async run(ctx) {
      const cc = (ctx.args[0] || 'FR').toUpperCase();
      const year = parseInt(ctx.args[1]) || new Date().getFullYear();
      try {
        const d = await fetchJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`);
        await ctx.reply(`📅 *Jours fériés ${cc} ${year}*\n\n` + d.map((h) => `• ${h.date} — ${h.localName}`).join('\n'));
      } catch {
        await ctx.reply('❌ Pays non supporté ou code invalide (utilise un code ISO à 2 lettres : FR, BE, CA, CM…).');
      }
    }
  },
  {
    name: 'book',
    aliases: ['livre', 'bouquin'],
    desc: 'Recherche de livres',
    category: 'search',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}livre Le Petit Prince`);
      const d = await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(ctx.text)}&limit=4`);
      if (!d.docs?.length) return ctx.reply('❌ Aucun livre trouvé.');
      await ctx.reply(
        `📚 *Résultats : ${ctx.text}*\n\n` +
          d.docs.map((b) => `• *${b.title}*\n  ✍️ ${(b.author_name || ['?']).slice(0, 2).join(', ')}\n  📅 ${b.first_publish_year || '?'}\n  🔗 https://openlibrary.org${b.key}`).join('\n\n')
      );
    }
  },
  {
    name: 'meal',
    aliases: ['recettemonde', 'mealdb', 'plat'],
    desc: 'Recette du monde (en anglais) : meal chicken',
    category: 'search',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}meal pasta  (nom en anglais)`);
      const d = await fetchJson(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(ctx.text)}`);
      const m = d.meals?.[0];
      if (!m) return ctx.reply('❌ Aucune recette trouvée. Essaie un nom en anglais (chicken, beef, pasta…).');
      const ing = [];
      for (let i = 1; i <= 20; i++) if (m[`strIngredient${i}`]?.trim()) ing.push(`• ${m[`strIngredient${i}`]} — ${m[`strMeasure${i}`] || ''}`.trim());
      const steps = await translate(truncate(m.strInstructions, 900), 'fr').catch(() => m.strInstructions);
      const caption = `🍽️ *${m.strMeal}*\n🌍 ${m.strArea} • ${m.strCategory}\n\n*Ingrédients*\n${ing.join('\n')}\n\n*Préparation*\n${steps}`;
      try {
        const img = await getBuffer(m.strMealThumb);
        await ctx.sock.sendMessage(ctx.from, { image: img, caption }, { quoted: ctx.m });
      } catch {
        await ctx.reply(caption);
      }
    }
  },
  {
    name: 'cocktail',
    aliases: ['drink', 'boisson'],
    desc: 'Recette de cocktail : cocktail mojito',
    category: 'search',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}cocktail mojito`);
      const d = await fetchJson(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${encodeURIComponent(ctx.text)}`);
      const c = d.drinks?.[0];
      if (!c) return ctx.reply('❌ Cocktail introuvable.');
      const ing = [];
      for (let i = 1; i <= 15; i++) if (c[`strIngredient${i}`]) ing.push(`• ${c[`strIngredient${i}`]} — ${c[`strMeasure${i}`] || ''}`.trim());
      const steps = await translate(c.strInstructions, 'fr').catch(() => c.strInstructions);
      const caption = `🍹 *${c.strDrink}*\n🥂 ${c.strGlass} • ${c.strAlcoholic}\n\n*Ingrédients*\n${ing.join('\n')}\n\n*Préparation*\n${steps}\n\n_À consommer avec modération._`;
      try {
        const img = await getBuffer(c.strDrinkThumb);
        await ctx.sock.sendMessage(ctx.from, { image: img, caption }, { quoted: ctx.m });
      } catch {
        await ctx.reply(caption);
      }
    }
  },
  {
    name: 'nasa',
    aliases: ['apod', 'espace', 'space'],
    desc: 'Image astronomique du jour (NASA)',
    category: 'search',
    async run(ctx) {
      const d = await fetchJson('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
      const title = await translate(d.title, 'fr').catch(() => d.title);
      const expl = await translate(truncate(d.explanation, 700), 'fr').catch(() => d.explanation);
      const caption = `🚀 *${title}*\n📅 ${d.date}\n\n${expl}\n\n© NASA APOD`;
      if (d.media_type === 'image') {
        try {
          const img = await getBuffer(d.url);
          return ctx.sock.sendMessage(ctx.from, { image: img, caption }, { quoted: ctx.m });
        } catch {
          /* texte seul */
        }
      }
      await ctx.reply(`${caption}\n\n🔗 ${d.url}`);
    }
  }
];
