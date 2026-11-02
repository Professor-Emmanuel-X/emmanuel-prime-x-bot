const fs = require('fs');
const path = require('path');

const byName = new Map(); // nom ou alias -> commande
const all = []; // liste unique

function loadCommands() {
  byName.clear();
  all.length = 0;
  const dir = path.join(__dirname, '..', 'commands');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    let mod;
    try {
      mod = require(path.join(dir, file));
    } catch (e) {
      console.error(`[loader] ${file} ignoré:`, e.message);
      continue;
    }
    const list = Array.isArray(mod) ? mod : [mod];
    for (const cmd of list) {
      if (!cmd || !cmd.name || typeof cmd.run !== 'function') continue;
      cmd.category = cmd.category || file.replace('.js', '');
      all.push(cmd);
      byName.set(cmd.name, cmd);
      for (const a of cmd.aliases || []) byName.set(a, cmd);
    }
  }
  console.log(`[loader] ${all.length} commandes chargées`);
  return all;
}

module.exports = { loadCommands, byName, all };
