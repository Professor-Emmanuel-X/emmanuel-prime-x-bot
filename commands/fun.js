const crypto = require('crypto');
const config = require('../config');
const { fetchJson, getBuffer, pickRandom, digits } = require('../lib/utils');
const ai = require('../lib/ai');

const rnd = (n) => crypto.randomInt(n);

const TRUTHS = [
  "Quelle est la chose la plus embarrassante qui te soit arrivée ?",
  "Quel est ton plus grand secret que personne ne connaît ?",
  "Quelle est la dernière chose que tu as cherchée sur Google ?",
  "As-tu déjà menti pour éviter une sortie ? Raconte.",
  "Quelle est ta plus grande peur ?",
  "Quel est le pire cadeau que tu aies reçu ?",
  "Quelle habitude étrange as-tu ?",
  "Qui dans ce groupe t'a le plus fait rire ?"
];
const DARES = [
  "Envoie un vocal où tu chantes ton refrain préféré.",
  "Change ta photo de profil pour une photo de légume pendant 1 heure.",
  "Écris un compliment à la 5e personne de ta liste de contacts.",
  "Envoie un message avec uniquement des emojis pour décrire ta journée.",
  "Parle avec un accent différent pendant 3 messages.",
  "Fais 10 pompes et envoie la preuve 💪",
  "Raconte une blague nulle dans le groupe.",
  "Écris ton prénom avec le coude et envoie une photo."
];
const BALL = [
  'Oui, absolument ✅', 'Sans aucun doute 💯', 'Tout porte à le croire 👍', 'Probablement 🙂',
  'Demande plus tard ⏳', 'Je ne peux pas prédire maintenant 🔮', 'Peu probable 🤔', 'Non ❌', 'Mes sources disent non 🚫', 'Très douteux 😬'
];
const COMPLIMENTS = [
  "Tu illumines la pièce simplement en y entrant ✨",
  "Ton énergie est contagieuse, continue comme ça 🔥",
  "Tu es plus fort(e) que tu ne le crois 💪",
  "Ton sourire rend la journée des autres meilleure 😊",
  "Tu as un talent unique, ne le sous-estime jamais 🌟"
];

module.exports = [
  {
    name: 'joke',
    aliases: ['blague'],
    desc: 'Une blague au hasard',
    category: 'fun',
    async run(ctx) {
      try {
        const d = await fetchJson('https://v2.jokeapi.dev/joke/Any?lang=fr&safe-mode');
        if (d.error) throw new Error('none');
        return ctx.reply(`😂 *Blague*\n\n${d.type === 'single' ? d.joke : `${d.setup}\n\n👉 ${d.delivery}`}`);
      } catch {
        const out = await ai.ask("Raconte une courte blague drôle et familiale en français.");
        return ctx.reply(`😂 *Blague*\n\n${out}`);
      }
    }
  },
  {
    name: 'fact',
    aliases: ['faitrandom', 'insolite'],
    desc: 'Un fait insolite',
    category: 'fun',
    async run(ctx) {
      try {
        const d = await fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
        const tr = await fetchJson(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=${encodeURIComponent(d.text)}`
        );
        return ctx.reply(`🧠 *Le saviez-vous ?*\n\n${tr[0].map((x) => x[0]).join('')}`);
      } catch {
        const out = await ai.ask('Donne un fait insolite et vrai en une ou deux phrases, en français.');
        return ctx.reply(`🧠 *Le saviez-vous ?*\n\n${out}`);
      }
    }
  },
  {
    name: 'quote',
    aliases: ['citation'],
    desc: 'Une citation inspirante',
    category: 'fun',
    async run(ctx) {
      const out = await ai.ask('Donne une citation inspirante réelle, avec son auteur, en français. Format : « citation » — Auteur');
      await ctx.reply(`💬 *Citation*\n\n${out}`);
    }
  },
  {
    name: 'meme',
    aliases: ['memes'],
    desc: 'Un meme au hasard',
    category: 'fun',
    async run(ctx) {
      const d = await fetchJson('https://meme-api.com/gimme');
      const img = await getBuffer(d.url);
      await ctx.sock.sendMessage(ctx.from, { image: img, caption: `😂 ${d.title}` }, { quoted: ctx.m });
    }
  },
  {
    name: '8ball',
    aliases: ['boule', 'magic8'],
    desc: 'Pose une question à la boule magique',
    category: 'fun',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`🎱 Exemple : ${ctx.prefix}8ball Vais-je réussir ?`);
      await ctx.reply(`🎱 *${ctx.text}*\n\n${pickRandom(BALL)}`);
    }
  },
  {
    name: 'dice',
    aliases: ['de', 'roll'],
    desc: 'Lance un dé',
    category: 'fun',
    async run(ctx) {
      const faces = Math.min(Math.max(parseInt(ctx.args[0]) || 6, 2), 1000);
      await ctx.reply(`🎲 Dé à ${faces} faces : *${rnd(faces) + 1}*`);
    }
  },
  {
    name: 'flip',
    aliases: ['pileouface'],
    desc: 'Pile ou face',
    category: 'fun',
    async run(ctx) {
      await ctx.reply(`🪙 *${rnd(2) ? 'PILE' : 'FACE'}*`);
    }
  },
  {
    name: 'rps',
    aliases: ['chifoumi', 'pfc'],
    desc: 'Pierre, feuille, ciseaux',
    category: 'fun',
    async run(ctx) {
      const opts = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };
      const me = (ctx.args[0] || '').toLowerCase();
      if (!opts[me]) return ctx.reply(`Utilisation : ${ctx.prefix}rps pierre/feuille/ciseaux`);
      const bot = pickRandom(Object.keys(opts));
      const wins = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };
      const res = me === bot ? 'Égalité 🤝' : wins[me] === bot ? 'Tu gagnes 🎉' : 'Je gagne 😎';
      await ctx.reply(`Toi : ${opts[me]} ${me}\nMoi : ${opts[bot]} ${bot}\n\n*${res}*`);
    }
  },
  {
    name: 'slot',
    aliases: ['casino', 'machine'],
    desc: 'Machine à sous',
    category: 'fun',
    async run(ctx) {
      const s = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'];
      const r = [pickRandom(s), pickRandom(s), pickRandom(s)];
      const win = r[0] === r[1] && r[1] === r[2];
      const two = !win && (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]);
      await ctx.reply(`🎰 | ${r.join(' | ')} |\n\n${win ? '🎉 *JACKPOT !*' : two ? '😮 Presque !' : '😢 Perdu, retente ta chance'}`);
    }
  },
  {
    name: 'ship',
    aliases: ['love', 'couple'],
    desc: 'Compatibilité entre deux personnes',
    category: 'fun',
    async run(ctx) {
      const a = ctx.mentioned[0];
      const b = ctx.mentioned[1] || ctx.sender;
      if (!a) return ctx.reply(`Utilisation : ${ctx.prefix}ship @personne1 @personne2`);
      const pct = rnd(101);
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      await ctx.sock.sendMessage(
        ctx.from,
        { text: `💘 *Compatibilité*\n\n@${digits(a)} ❤️ @${digits(b)}\n\n[${bar}] *${pct}%*`, mentions: [a, b] },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'rate',
    aliases: ['note'],
    desc: 'Note n’importe quoi sur 100',
    category: 'fun',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`Utilisation : ${ctx.prefix}rate mon style`);
      await ctx.reply(`⭐ *${ctx.text}* : ${rnd(101)}/100`);
    }
  },
  {
    name: 'truth',
    aliases: ['verite', 'vérité'],
    desc: 'Une question vérité',
    category: 'fun',
    async run(ctx) {
      await ctx.reply(`🧩 *VÉRITÉ*\n\n${pickRandom(TRUTHS)}`);
    }
  },
  {
    name: 'dare',
    aliases: ['action', 'defi'],
    desc: 'Un défi action',
    category: 'fun',
    async run(ctx) {
      await ctx.reply(`🔥 *ACTION*\n\n${pickRandom(DARES)}`);
    }
  },
  {
    name: 'compliment',
    aliases: ['flatter'],
    desc: 'Envoie un compliment',
    category: 'fun',
    async run(ctx) {
      const t = ctx.mentioned[0] || ctx.quoted?.sender || ctx.sender;
      await ctx.sock.sendMessage(ctx.from, { text: `💖 @${digits(t)}, ${pickRandom(COMPLIMENTS)}`, mentions: [t] }, { quoted: ctx.m });
    }
  },
  {
    name: 'choose',
    aliases: ['choisir', 'pick'],
    desc: 'Choisit parmi des options : a | b | c',
    category: 'fun',
    async run(ctx) {
      const opts = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return ctx.reply(`Utilisation : ${ctx.prefix}choose pizza | burger | tacos`);
      await ctx.reply(`🤔 Je choisis : *${pickRandom(opts)}*`);
    }
  },
  {
    name: 'riddle',
    aliases: ['devinette'],
    desc: 'Une devinette',
    category: 'fun',
    async run(ctx) {
      const out = await ai.ask("Donne une devinette originale en français, suivie de la réponse sur une nouvelle ligne commençant par « Réponse : ».");
      await ctx.reply(`🧠 *Devinette*\n\n${out}`);
    }
  }
];
