const { animeGif } = require('../lib/anime');
const { getBuffer } = require('../lib/utils');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function ffmpegPath() {
  try {
    return process.env.FFMPEG_PATH || require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
}

// GIF → MP4 (WhatsApp ne lit les animations qu'en vidéo)
function gifToMp4(buffer) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    const inp = path.join(os.tmpdir(), `${id}.gif`);
    const out = path.join(os.tmpdir(), `${id}.mp4`);
    fs.writeFileSync(inp, buffer);
    const p = spawn(ffmpegPath(), ['-y', '-i', inp, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', out]);
    const done = (err, res) => {
      fs.rmSync(inp, { force: true });
      fs.rmSync(out, { force: true });
      err ? reject(err) : resolve(res);
    };
    p.on('error', done);
    p.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(out)) return done(new Error('conversion impossible'));
      done(null, fs.readFileSync(out));
    });
  });
}

// Commandes de réaction animée : [nom, alias, texte avec cible, texte seul]
const REACTS = [
  ['hug', ['calin'], '🤗 @A fait un câlin à @B', '🤗 @A se fait un câlin'],
  ['pat', ['caresse'], '🥰 @A caresse la tête de @B', '🥰 @A se caresse la tête'],
  ['slap', ['gifle'], '👋 @A gifle @B', '👋 @A se gifle'],
  ['kiss', ['bisou'], '😘 @A embrasse @B', '😘 @A envoie un bisou'],
  ['cuddle', ['blottir'], '🫂 @A se blottit contre @B', '🫂 @A se blottit'],
  ['nudge', ['titiller'], '👉 @A titille @B', '👉 @A titille quelqu’un'],
  ['bite', ['mordre'], '😬 @A mord @B', '😬 @A mord dans le vide'],
  ['wave', ['coucou'], '👋 @A fait coucou à @B', '👋 @A dit coucou'],
  ['dance', ['danser'], '💃 @A danse avec @B', '💃 @A danse'],
  ['cry', ['pleurer'], '😭 @A pleure à cause de @B', '😭 @A pleure'],
  ['laugh', ['rire'], '😂 @A rit de @B', '😂 @A rit aux éclats'],
  ['blush', ['rougir'], '😳 @A rougit devant @B', '😳 @A rougit'],
  ['punch', ['frapper'], '👊 @A donne un coup de poing à @B', '👊 @A frappe dans le vide'],
  ['kickass', ['coupdepied'], '🦵 @A donne un coup de pied à @B', '🦵 @A donne un coup de pied dans le vide', 'kick'],
  ['highfive', ['tapemoilacinq'], '🙌 @A tape dans la main de @B', '🙌 @A lève la main pour un high five'],
  ['handhold', ['maindanslamain'], '🤝 @A prend la main de @B', '🤝 @A tend la main'],
  ['feed', ['nourrir'], '🍙 @A donne à manger à @B', '🍙 @A mange un bon repas'],
  ['wink', ['clin'], '😉 @A fait un clin d’œil à @B', '😉 @A fait un clin d’œil'],
  ['smug', ['fier'], '😏 @A regarde @B d’un air fier', '😏 @A a l’air très fier'],
  ['shoot', ['pistolet'], '🔫 @A vise @B (pour rire)', '🔫 @A fait le pistolet avec les doigts'],
  ['facepalm', ['fp'], '🤦 @A est consterné par @B', '🤦 @A se prend la tête dans la main'],
  ['stare', ['fixer'], '👀 @A fixe @B', '👀 @A fixe le vide'],
  ['pout', ['bouder'], '😤 @A boude @B', '😤 @A boude'],
  ['think', ['reflechir'], '🤔 @A réfléchit à propos de @B', '🤔 @A réfléchit'],
  ['sleep', ['dormir'], '😴 @A s’endort près de @B', '😴 @A s’endort'],
  ['bored', ['ennui'], '🥱 @A s’ennuie avec @B', '🥱 @A s’ennuie'],
  ['happy', ['content'], '😄 @A est content avec @B', '😄 @A est très content'],
  ['smile', ['sourire'], '😊 @A sourit à @B', '😊 @A sourit'],
  ['thumbsup', ['pouce'], '👍 @A félicite @B', '👍 @A lève le pouce'],
  ['tickle', ['chatouiller'], '🤭 @A chatouille @B', '🤭 @A chatouille quelqu’un'],
  ['baka', ['idiot'], '💢 @A traite @B de baka', '💢 Baka !'],
  ['shrug', ['bof'], '🤷 @A hausse les épaules devant @B', '🤷 @A hausse les épaules'],
  ['yeet', ['lancer'], '🚀 @A lance @B très loin', '🚀 @A lance tout très loin'],
  ['peck', ['smack'], '😚 @A fait un petit bisou à @B', '😚 @A envoie un petit bisou'],
  ['nom', ['miam'], '😋 @A mange avec @B', '😋 @A fait miam'],
  ['nope', ['non'], '🙅 @A dit non à @B', '🙅 @A dit non']
];

const reactCommands = REACTS.map(([name, aliases, withT, alone, api]) => ({
  name,
  aliases,
  desc: `Animation « ${name} » (mentionne quelqu’un)`,
  category: 'fun',
  async run(ctx) {
    const target = ctx.getTarget ? ctx.getTarget() : null;
    const a = `@${ctx.senderNum}`;
    const t = target ? withT.replace('@A', a).replace('@B', `@${String(target).split('@')[0]}`) : alone.replace('@A', a);
    const mentions = [ctx.sender, ...(target ? [target] : [])];
    const g = await animeGif(api || (name === 'nudge' ? 'poke' : name));
    const caption = `${t}${g.anime ? `\n🎞️ ${g.anime}` : ''}`;
    try {
      const mp4 = await gifToMp4(await getBuffer(g.url));
      await ctx.sock.sendMessage(ctx.from, { video: mp4, gifPlayback: true, caption, mentions }, { quoted: ctx.m });
    } catch {
      await ctx.sock.sendMessage(ctx.from, { image: { url: g.url }, caption, mentions }, { quoted: ctx.m });
    }
  }
}));

const ROASTS = [
  'Tu es la preuve que même le Wi-Fi peut avoir une mauvaise connexion avec la réalité.',
  'Ton humour, c’est comme ton réseau : on attend, et ça ne vient jamais.',
  'Tu as la vitesse d’un escargot… avec un sac à dos.',
  'Si la paresse était un sport olympique, tu enverrais quelqu’un à ta place.',
  'Tes blagues sont tellement vieilles qu’elles ont une retraite.'
];
const PICKUPS = [
  'Tu as un plan de secours ? Parce que je viens de tomber pour toi.',
  'Est-ce que tu es un Wi-Fi ? Parce que je ressens une vraie connexion.',
  'Si tu étais une commande, tu serais .menu : toujours la première que je veux voir.',
  'Tu dois être fatigué(e)… tu cours dans ma tête depuis ce matin.',
  'Je ne suis pas un bot, pourtant mon cœur vient de planter à ta vue.'
];
const WYR = [
  'Plutôt voyager dans le passé 🕰️ ou dans le futur 🚀 ?',
  'Plutôt ne plus jamais utiliser ton téléphone 📵 ou ne plus jamais dormir 😴 ?',
  'Plutôt être invisible 👻 ou pouvoir voler 🦅 ?',
  'Plutôt tout savoir 🧠 ou tout pouvoir 💪 ?',
  'Plutôt vivre sans musique 🎵 ou sans films 🎬 ?',
  'Plutôt un million tout de suite 💰 ou 10 000 par mois à vie 📆 ?'
];

module.exports = [
  ...reactCommands,
  {
    name: 'roast',
    aliases: ['clash', 'vanne'],
    desc: 'Une petite vanne (mentionne quelqu’un)',
    category: 'fun',
    async run(ctx) {
      const t = ctx.getTarget ? ctx.getTarget() : null;
      const who = t ? `@${String(t).split('@')[0]}` : `@${ctx.senderNum}`;
      await ctx.sock.sendMessage(ctx.from, { text: `🔥 ${who}, ${pick(ROASTS)}`, mentions: [t || ctx.sender] }, { quoted: ctx.m });
    }
  },
  {
    name: 'pickup',
    aliases: ['drague', 'flirt'],
    desc: 'Phrase de drague',
    category: 'fun',
    async run(ctx) {
      await ctx.reply(`💘 ${pick(PICKUPS)}`);
    }
  },
  {
    name: 'wyr',
    aliases: ['plutot', 'wouldyourather'],
    desc: 'Tu préfères… ?',
    category: 'fun',
    async run(ctx) {
      await ctx.reply(`🤔 *Tu préfères…*\n\n${pick(WYR)}`);
    }
  },
  {
    name: 'iq',
    aliases: ['qi'],
    desc: 'Mesure ton QI (pour rire)',
    category: 'fun',
    async run(ctx) {
      const t = ctx.getTarget ? ctx.getTarget() : null;
      const who = t ? `@${String(t).split('@')[0]}` : `@${ctx.senderNum}`;
      await ctx.sock.sendMessage(ctx.from, { text: `🧠 QI de ${who} : *${60 + Math.floor(Math.random() * 100)}* (résultat 100 % scientifique 😄)`, mentions: [t || ctx.sender] }, { quoted: ctx.m });
    }
  },
  {
    name: 'reverse',
    aliases: ['inverser', 'retourner'],
    desc: 'Écrit ton texte à l’envers',
    category: 'fun',
    async run(ctx) {
      const t = ctx.text || ctx.quoted?.text;
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}reverse bonjour`);
      await ctx.reply([...t].reverse().join(''));
    }
  }
];
