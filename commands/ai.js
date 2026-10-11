const config = require('../config');
const ai = require('../lib/ai');
const { getBuffer, downloadMedia } = require('../lib/utils');

function modelCommand(name, aliases, modelKey, label) {
  return {
    name,
    aliases,
    desc: `Pose une question à ${label}`,
    category: 'ai',
    async run(ctx) {
      const q = ctx.text || ctx.quoted?.text;
      if (!q) return ctx.reply(`💡 Exemple : ${ctx.prefix}${name} Explique-moi la blockchain`);
      await ctx.sock.sendPresenceUpdate('composing', ctx.from).catch(() => {});
      const out = await ai.ask(q, config.aiModels[modelKey]);
      await ctx.reply(`🤖 *${label}*\n\n${out}`);
    }
  };
}

module.exports = [
  modelCommand('ai', ['ask', 'ia', 'chat'], 'default', 'IA'),
  modelCommand('gpt', ['chatgpt', 'gpt4o'], 'gpt', 'ChatGPT'),
  modelCommand('gpt4', ['gpt-4'], 'gpt4', 'GPT-4o'),
  modelCommand('gemini', ['bard'], 'gemini', 'Gemini'),
  modelCommand('claude', ['anthropic'], 'claude', 'Claude'),
  modelCommand('deepseek', ['ds'], 'deepseek', 'DeepSeek'),
  modelCommand('llama', ['meta'], 'llama', 'Llama'),
  modelCommand('mistral', [], 'mistral', 'Mistral'),
  {
    name: 'imagine',
    aliases: ['img', 'image', 'flux', 'dalle', 'draw'],
    desc: "Génère une image à partir d'un texte",
    category: 'ai',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`🎨 Exemple : ${ctx.prefix}imagine un lion en armure dorée, style cinématique`);
      await ctx.reply('🎨 Génération en cours...');
      const seed = Math.floor(Math.random() * 1e6);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(ctx.text)}?width=1024&height=1024&nologo=true&seed=${seed}`;
      const buffer = await getBuffer(url, { timeout: 120000 });
      await ctx.sock.sendMessage(
        ctx.from,
        { image: buffer, caption: `🎨 *${ctx.text}*\n\n_${config.botName}_` },
        { quoted: ctx.m }
      );
    }
  },
  {
    name: 'vision',
    aliases: ['analyse', 'analyze', 'describe', 'ocr'],
    desc: "Analyse une image (réponds à une image)",
    category: 'ai',
    async run(ctx) {
      const media = await downloadMedia(ctx.sock, ctx, ['imageMessage']);
      if (!media) return ctx.reply(`🖼️ Réponds à une image avec ${ctx.prefix}vision [question]`);
      const prompt = ctx.text || "Décris cette image en détail et transcris le texte s'il y en a.";
      const out = await ai.vision(prompt, media.buffer, media.mimetype || 'image/jpeg');
      await ctx.reply(`👁️ *Analyse*\n\n${out}`);
    }
  },
  {
    name: 'code',
    aliases: ['coder', 'dev-ai'],
    desc: 'Génère du code avec l\'IA',
    category: 'ai',
    async run(ctx) {
      if (!ctx.text) return ctx.reply(`💻 Exemple : ${ctx.prefix}code fonction JavaScript qui inverse une chaîne`);
      const out = await ai.ask(
        ctx.text,
        config.aiModels.gpt,
        'Tu es un expert en programmation. Réponds avec du code propre et commenté dans un bloc markdown, puis une courte explication en français.'
      );
      await ctx.reply(out);
    }
  },
  {
    name: 'summarize',
    aliases: ['resume', 'résumé', 'tldr'],
    desc: 'Résume un texte',
    category: 'ai',
    async run(ctx) {
      const t = ctx.text || ctx.quoted?.text;
      if (!t) return ctx.reply(`📝 Donne un texte ou réponds à un message : ${ctx.prefix}resume`);
      const out = await ai.ask(`Résume ce texte en quelques points clairs :\n\n${t}`);
      await ctx.reply(`📝 *Résumé*\n\n${out}`);
    }
  },
  {
    name: 'correct',
    aliases: ['corriger', 'grammar'],
    desc: "Corrige l'orthographe et la grammaire",
    category: 'ai',
    async run(ctx) {
      const t = ctx.text || ctx.quoted?.text;
      if (!t) return ctx.reply(`✍️ Donne un texte ou réponds à un message : ${ctx.prefix}corriger`);
      const out = await ai.ask(
        `Corrige l'orthographe et la grammaire sans changer le sens. Réponds uniquement avec le texte corrigé :\n\n${t}`
      );
      await ctx.reply(out);
    }
  },
  {
    name: 'rewrite',
    aliases: ['reformuler', 'paraphrase'],
    desc: 'Reformule un texte',
    category: 'ai',
    async run(ctx) {
      const t = ctx.text || ctx.quoted?.text;
      if (!t) return ctx.reply(`✍️ Donne un texte ou réponds à un message : ${ctx.prefix}reformuler`);
      const out = await ai.ask(`Reformule ce texte de façon claire et professionnelle, dans la même langue :\n\n${t}`);
      await ctx.reply(out);
    }
  },
  {
    name: 'chatbot',
    aliases: ['autoreply'],
    desc: 'Active/désactive le chatbot IA en privé',
    category: 'ai',
    owner: true,
    async run(ctx) {
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return ctx.reply(`Utilisation : ${ctx.prefix}chatbot on/off\nÉtat actuel : ${ctx.db.settings.chatbot ? 'ON' : 'OFF'}`);
      ctx.db.settings.chatbot = v === 'on';
      ctx.db.save();
      await ctx.reply(`🤖 Chatbot IA : *${v.toUpperCase()}*`);
    }
  }
];
