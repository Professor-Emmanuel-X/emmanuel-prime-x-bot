const axios = require('axios');
const config = require('../config');

const SYSTEM_PROMPT =
  `Tu es ${config.botName}, un assistant WhatsApp créé par ${config.ownerName}. ` +
  `Réponds dans la langue de l'utilisateur (français par défaut), de façon claire, utile et concise.`;

async function chat(messages, model = config.aiModels.default) {
  if (!config.openrouterKey) {
    throw new Error("Clé OpenRouter manquante. Ajoute la variable d'environnement OPENROUTER_API_KEY.");
  }
  try {
    const { data } = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { model, messages },
      {
        timeout: 90000,
        headers: {
          Authorization: `Bearer ${config.openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': config.telegram,
          'X-Title': 'Emmanuel Prime X Bot'
        }
      }
    );
    const out = data?.choices?.[0]?.message?.content;
    if (!out) throw new Error('Réponse vide du modèle IA.');
    return out.trim();
  } catch (e) {
    const apiMsg = e.response?.data?.error?.message;
    throw new Error(apiMsg || e.message);
  }
}

async function ask(prompt, model, system = SYSTEM_PROMPT) {
  return chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ],
    model
  );
}

async function vision(prompt, imageBuffer, mime = 'image/jpeg', model = config.aiModels.vision) {
  const url = `data:${mime};base64,${imageBuffer.toString('base64')}`;
  return chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url } }
        ]
      }
    ],
    model
  );
}

// Mémoire courte pour le chatbot (par conversation)
const memory = new Map();
async function chatWithMemory(jid, text, model) {
  const hist = memory.get(jid) || [];
  hist.push({ role: 'user', content: text });
  while (hist.length > 12) hist.shift();
  const out = await chat([{ role: 'system', content: SYSTEM_PROMPT }, ...hist], model);
  hist.push({ role: 'assistant', content: out });
  memory.set(jid, hist);
  return out;
}

module.exports = { chat, ask, vision, chatWithMemory };
