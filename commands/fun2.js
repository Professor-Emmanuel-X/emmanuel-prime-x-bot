const crypto = require('crypto');
const { fetchJson, getBuffer, digits, pickRandom } = require('../lib/utils');

const games = new Map(); // `${session}:${chat}` -> question en cours

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function social(name, emoji, lines, usage) {
  return {
    name,
    aliases: [],
    desc: usage,
    async run(ctx) {
      const t = ctx.mentioned[0] || ctx.quoted?.sender;
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}${name} @personne (ou réponds à son message)`);
      const text = `${emoji} @${digits(ctx.sender)} ${pickRandom(lines)} @${digits(t)}`;
      await ctx.sock.sendMessage(ctx.from, { text, mentions: [ctx.sender, t] }, { quoted: ctx.m });
    }
  };
}

const commands = [
  social('hug', '🤗', ['fait un gros câlin à', 'serre très fort dans ses bras', 'offre un câlin plein de tendresse à'], 'Fait un câlin'),
  social('slap', '👋', ['donne une gifle (pour rire) à', 'envoie une claque amicale à', 'met un petit vent à'], 'Donne une claque (pour rire)'),
  {
    name: 'cat',
    aliases: ['chat-photo', 'randomcat'],
    desc: 'Photo de chat aléatoire',
    async run(ctx) {
      const { fetchImage } = require('../lib/media');
      const img = await fetchImage([
        async () => (await fetchJson('https://api.thecatapi.com/v1/images/search'))?.[0]?.url,
        `https://cataas.com/cat?type=small&t=${Date.now()}`
      ]);
      await ctx.sock.sendMessage(ctx.from, { image: img, caption: '🐱 Miaou !' }, { quoted: ctx.m });
    }
  },
  {
    name: 'dog',
    aliases: ['chien', 'randomdog'],
    desc: 'Photo de chien aléatoire',
    async run(ctx) {
      const d = await fetchJson('https://dog.ceo/api/breeds/image/random');
      await ctx.sock.sendMessage(ctx.from, { image: { url: d.message }, caption: '🐶 Ouaf !' }, { quoted: ctx.m });
    }
  },
  {
    name: 'mock',
    aliases: ['moquer', 'spongebob'],
    desc: 'tExTe eN mAjUsCuLeS aLtErNéEs',
    async run(ctx) {
      const t = ctx.text || ctx.quoted?.text;
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}mock je suis sérieux`);
      let i = 0;
      await ctx.reply([...t].map((c) => (/\p{L}/u.test(c) ? (i++ % 2 ? c.toUpperCase() : c.toLowerCase()) : c)).join(''));
    }
  },
  {
    name: 'trivia',
    aliases: ['culture', 'quizrapide'],
    desc: 'Question de culture générale (réponds avec answer A)',
    async run(ctx) {
      const d = await fetchJson('https://opentdb.com/api.php?amount=1&type=multiple&encode=url3986');
      const q = d.results?.[0];
      if (!q) throw new Error('Question indisponible, réessaie.');
      const dec = decodeURIComponent;
      const correct = dec(q.correct_answer);
      const options = shuffle([q.correct_answer, ...q.incorrect_answers].map(dec));
      const letters = ['A', 'B', 'C', 'D'];
      games.set(`${ctx.sock.sessionNumber}:${ctx.from}`, { letter: letters[options.indexOf(correct)], answer: correct, exp: Date.now() + 120000 });
      await ctx.reply(
        `🎯 *TRIVIA* (en anglais)\n📚 ${dec(q.category)} • ${dec(q.difficulty)}\n\n${dec(q.question)}\n\n` +
          options.map((o, i) => `${letters[i]}) ${o}`).join('\n') +
          `\n\n✍️ Réponds avec *${ctx.prefix}answer A* (2 minutes)`
      );
    }
  },
  {
    name: 'answer',
    aliases: ['reponse', 'rep'],
    desc: 'Répond à la question trivia en cours',
    async run(ctx) {
      const key = `${ctx.sock.sessionNumber}:${ctx.from}`;
      const g = games.get(key);
      if (!g) return ctx.reply(`Aucune question en cours. Lance-en une avec ${ctx.prefix}trivia`);
      if (Date.now() > g.exp) {
        games.delete(key);
        return ctx.reply(`⏰ Temps écoulé ! La réponse était *${g.letter}) ${g.answer}*`);
      }
      const a = (ctx.args[0] || '').toUpperCase();
      if (!['A', 'B', 'C', 'D'].includes(a)) return ctx.reply(`Utilisation : ${ctx.prefix}answer A`);
      if (a === g.letter) {
        games.delete(key);
        return ctx.sock.sendMessage(ctx.from, { text: `✅ Bravo @${digits(ctx.sender)} ! C'était *${g.letter}) ${g.answer}* 🎉`, mentions: [ctx.sender] }, { quoted: ctx.m });
      }
      await ctx.reply('❌ Mauvaise réponse, retente ta chance !');
    }
  }
];

module.exports = commands.map((c) => ({ category: 'fun', ...c }));
