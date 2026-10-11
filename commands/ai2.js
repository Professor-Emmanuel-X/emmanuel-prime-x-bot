const config = require('../config');
const ai = require('../lib/ai');

function make({ name, aliases = [], desc, example, title, prompt, model }) {
  return {
    name,
    aliases,
    desc,
    category: 'ai',
    async run(ctx) {
      const input = ctx.text || ctx.quoted?.text;
      if (!input) return ctx.reply(`💡 Exemple : ${ctx.prefix}${name} ${example}`);
      await ctx.sock.sendPresenceUpdate('composing', ctx.from).catch(() => {});
      const out = await ai.ask(prompt(input), model || config.aiModels.default);
      await ctx.reply(`${title}\n\n${out}`);
    }
  };
}

module.exports = [
  make({
    name: 'story',
    aliases: ['histoire', 'conte'],
    desc: 'Écrit une courte histoire',
    example: 'un dragon qui apprend à coder',
    title: '📖 *Histoire*',
    prompt: (i) => `Écris une histoire courte (environ 250 mots) en français sur ce thème : ${i}`
  }),
  make({
    name: 'poem',
    aliases: ['poeme', 'poème'],
    desc: 'Écrit un poème original',
    example: "l'amour de la patrie",
    title: '🪶 *Poème*',
    prompt: (i) => `Écris un poème original en français sur : ${i}. Rimes soignées, 3 à 4 strophes.`
  }),
  make({
    name: 'recipe',
    aliases: ['recette'],
    desc: 'Donne une recette détaillée',
    example: 'poulet moambe',
    title: '🍳 *Recette*',
    prompt: (i) => `Donne une recette détaillée (ingrédients avec quantités, étapes numérotées, temps de préparation) pour : ${i}`
  }),
  make({
    name: 'explain',
    aliases: ['explique', 'eli5'],
    desc: 'Explique un sujet simplement',
    example: "comment fonctionne l'internet",
    title: '🧠 *Explication*',
    prompt: (i) => `Explique simplement, comme à un débutant, avec un exemple concret : ${i}`
  }),
  make({
    name: 'email',
    aliases: ['mail', 'redigermail'],
    desc: 'Rédige un email professionnel',
    example: 'demander un rendez-vous à mon banquier',
    title: '📧 *Email*',
    prompt: (i) => `Rédige un email professionnel en français (objet + corps du message) pour : ${i}`
  }),
  make({
    name: 'idea',
    aliases: ['idee', 'idée', 'brainstorm'],
    desc: "Donne 10 idées sur un sujet",
    example: 'un business à lancer avec 50 000 FCFA',
    title: '💡 *Idées*',
    prompt: (i) => `Donne 10 idées originales et concrètes pour : ${i}`
  }),
  make({
    name: 'caption',
    aliases: ['legende'],
    desc: 'Légendes pour réseaux sociaux',
    example: 'photo de coucher de soleil à la plage',
    title: '📸 *Légendes*',
    prompt: (i) => `Propose 5 légendes courtes et percutantes (avec emojis) pour un post de réseaux sociaux sur : ${i}`
  }),
  make({
    name: 'horoscope',
    aliases: ['horoscop', 'astro'],
    desc: "Horoscope du jour (divertissement)",
    example: 'Lion',
    title: '🔮 *Horoscope du jour*',
    prompt: (i) =>
      `Écris l'horoscope du jour (amour, travail, santé, chance) pour le signe : ${i}. C'est uniquement pour le divertissement, avec un ton positif.`
  }),
  make({
    name: 'motivate',
    aliases: ['motivation', 'boost'],
    desc: 'Message de motivation',
    example: "j'ai raté mon examen",
    title: '🔥 *Motivation*',
    prompt: (i) => `Écris un message de motivation court et puissant pour quelqu'un qui vit ceci : ${i}`
  }),
  make({
    name: 'math',
    aliases: ['maths', 'solve', 'resoudre'],
    desc: 'Résout un problème de maths',
    example: 'résoudre 2x² - 5x + 2 = 0',
    title: '📐 *Mathématiques*',
    model: config.aiModels.gpt4,
    prompt: (i) => `Résous ce problème de mathématiques étape par étape, puis donne la réponse finale clairement : ${i}`
  }),
  make({
    name: 'debug',
    aliases: ['fixcode', 'corrigercode'],
    desc: 'Corrige un code avec des erreurs',
    example: 'console.log("a" + )',
    title: '🐞 *Correction de code*',
    model: config.aiModels.gpt4,
    prompt: (i) => `Trouve et corrige les erreurs dans ce code, explique brièvement chaque correction et donne le code corrigé :\n\n${i}`
  })
];
