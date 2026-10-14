require('dotenv').config();
const path = require('path');

const root = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;

module.exports = {
  botName: '\ud835\udc04\ud835\udc0c\ud835\udc0c\ud835\udc00\ud835\udc0d\ud835\udc14\ud835\udc04\ud835\udc0b \ud835\udc0f\ud835\udc11\ud835\udc08\ud835\udc0c\ud835\udc04 \ud835\udc17 \ud835\udc01\ud835\udc0e\ud835\udc13',
  ownerName: '\ud835\udc0f\ud835\udc11\ud835\udc0e\ud835\udc05\ud835\udc04\ud835\udc12\ud835\udc12\ud835\udc0e\ud835\udc11 \ud835\udc04\ud835\udc0c\ud835\udc0c\ud835\udc00\ud835\udc0d\ud835\udc14\ud835\udc04\ud835\udc0b \ud835\udc17',
  ownerNumber: '242056749511',
  botNumber: '242056749511',
  defaultCountryCode: process.env.DEFAULT_COUNTRY_CODE || '242', // ajoute aux numeros saisis au format local (ex : 069158808)
  telegram: 'https://t.me/emmanuelprimex',
  repo: process.env.REPO_URL || 'https://github.com/VOTRE-PSEUDO/emmanuel-prime-x-bot',
  prefix: process.env.PREFIX || '.',
  port: process.env.PORT || 3000,
  // Acces au site de pairing (a definir dans les variables d'environnement Render)
  siteLogin: process.env.SITE_LOGIN || 'Emmanuelprime',
  sitePassword: process.env.SITE_PASSWORD || 'Emmanuel@2026',
  // Panneau admin (/admin) : desactive tant que ADMIN_PASSWORD n'est pas defini
  adminLogin: process.env.ADMIN_LOGIN || 'Emmanuelprime',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  menuImage: process.env.MENU_IMAGE || '',
  botImagePath: path.join(__dirname, 'public', 'bot.jpg'),
  stickerPack: '\ud835\udc04\ud835\udc0c\ud835\udc0c\ud835\udc00\ud835\udc0d\ud835\udc14\ud835\udc04\ud835\udc0b \ud835\udc0f\ud835\udc11\ud835\udc08\ud835\udc0c\ud835\udc04 \ud835\udc17',
  stickerAuthor: '\ud835\udc0f\ud835\udc11\ud835\udc0e\ud835\udc05\ud835\udc04\ud835\udc12\ud835\udc12\ud835\udc04\ud835\udc14\ud835\udc11 \ud835\udc04\ud835\udc0c\ud835\udc0c\ud835\udc00\ud835\udc0d\ud835\udc14\ud835\udc04\ud835\udc0b \ud835\udc17',
  timezone: process.env.TZ || 'Africa/Brazzaville',

  // IA (OpenRouter) : la cle se met dans la variable d'environnement OPENROUTER_API_KEY
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
