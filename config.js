require('dotenv').config();
const path = require('path');

const root = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;

module.exports = {
  botName: '𝐄𝐌𝐌𝐀𝐍𝐔𝐄𝐋 𝐏𝐑𝐈𝐌𝐄 𝐗 𝐁𝐎𝐓',
  ownerName: '𝐏𝐑𝐎𝐅𝐄𝐒𝐒𝐎𝐑 𝐄𝐌𝐌𝐀𝐍𝐔𝐄𝐋 𝐗',
  ownerNumber: '242056749511',
  botNumber: '242056749511',
  telegram: 'https://t.me/emmanuelprimex',
  repo: process.env.REPO_URL || 'https://github.com/emmanuel_ytb/emmanuel-prime-x-bot',
  prefix: process.env.PREFIX || '.',
  port: process.env.PORT || 3000,
  // Accès au site de pairing (à définir dans les variables d'environnement Render)
  siteLogin: process.env.SITE_LOGIN || 'Emmanuelprime',
  sitePassword: process.env.SITE_PASSWORD || 'Emmanuel@2026',
  menuImage: process.env.MENU_IMAGE || '',
  botImagePath: path.join(__dirname, 'public', 'bot.jpg'),
  stickerPack: '𝐄𝐌𝐌𝐀𝐍𝐔𝐄𝐋 𝐏𝐑𝐈𝐌𝐄 𝐗',
  stickerAuthor: '𝐏𝐑𝐎𝐅𝐄𝐒𝐒𝐄𝐔𝐑 𝐄𝐌𝐌𝐀𝐍𝐔𝐄𝐋 𝐗',
  timezone: process.env.TZ || 'Africa/Brazzaville',

  // IA (OpenRouter) : la clé se met dans la variable d'environnement OPENROUTER_API_KEY
  openrouterKey: process.env.OPENROUTER_API_KEY || '',
  aiModels: {
    default: 'openai/gpt-4o-mini',
    gpt: 'openai/gpt-4o-mini',
    gpt4: 'openai/gpt-4o',
    gemini: 'google/gemini-2.0-flash-001',
    claude: 'anthropic/claude-3.5-haiku',
    deepseek: 'deepseek/deepseek-chat',
    llama: 'meta-llama/llama-3.3-70b-instruct',
    mistral: 'mistralai/mistral-small-3.1-24b-instruct',
    vision: 'openai/gpt-4o-mini'
  },

  paths: {
    root,
    sessions: path.join(root, 'sessions'),
    data: path.join(root, 'data'),
    db: path.join(root, 'data', 'db.json')
  }
};
