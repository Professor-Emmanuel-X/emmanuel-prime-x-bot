const fs = require('fs');
const path = require('path');
const config = require('../config');

const defaults = () => ({
  settings: {
    mode: 'public', // public | self
    prefix: config.prefix,
    autoread: false,
    autotyping: false,
    autorecord: false,
    alwaysonline: false,
    anticall: false,
    antidelete: false,
    autoviewstatus: false,
    autoreactstatus: false,
    chatbot: false
  },
  sudo: [],
  banned: [],
  afk: {}, // numéro -> { reason, since }
  groups: {} // jid -> réglages du groupe
});

const cache = new Map();

/**
 * Une base JSON par session (par numéro WhatsApp connecté),
 * pour que chaque personne qui lie son numéro garde ses propres réglages.
 */
function open(number) {
  if (cache.has(number)) return cache.get(number);

  const file = path.join(config.paths.data, `db-${number}.json`);
  let data = defaults();
  try {
    fs.mkdirSync(config.paths.data, { recursive: true });
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const d = defaults();
      data = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
    }
  } catch (e) {
    console.error(`[db:${number}] lecture impossible, valeurs par défaut:`, e.message);
  }

  let timer = null;
  const db = {
    number,
    data,
    get settings() {
      return data.settings;
    },
    group(jid) {
      const g = data.groups[jid] || (data.groups[jid] = {});
      if (g.antilink === undefined) g.antilink = false;
      if (g.antilinkAction === undefined) g.antilinkAction = 'delete';
      if (g.welcome === undefined) g.welcome = false;
      if (!g.warns) g.warns = {};
      if (!g.stats) g.stats = {};
      if (!g.badwords) g.badwords = [];
      if (g.antibadword === undefined) g.antibadword = false;
      if (g.rules === undefined) g.rules = '';
      return g;
    },
    save() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          fs.mkdirSync(config.paths.data, { recursive: true });
          fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (e) {
          console.error(`[db:${number}] écriture impossible:`, e.message);
        }
      }, 500);
    }
  };
  cache.set(number, db);
  return db;
}

module.exports = { open };
