const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const axios = require('axios');
const config = require('../config');
const { fetchJson, extractUrl } = require('../lib/utils');

// ---------- Aides ----------

function parseDate(s = '') {
  s = s.trim();
  let d, m, y;
  let r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (r) [, d, m, y] = r;
  else if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, m, d] = r;
  else return null;
  d = +d;
  m = +m;
  y = +y;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const l = ip.toLowerCase();
  return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:');
}

const MORSE = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--',
  n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '!': '-.-.--', '/': '-..-.'
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

const UNITS = {
  longueur: { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  masse: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237 },
  volume: { ml: 0.001, l: 1, gal: 3.785411784, cup: 0.2365882365 },
  vitesse: { ms: 1, kmh: 1 / 3.6, mph: 0.44704, kn: 0.514444 }
};
const TEMP_TO_C = { c: (v) => v, f: (v) => ((v - 32) * 5) / 9, k: (v) => v - 273.15 };
const TEMP_FROM_C = { c: (v) => v, f: (v) => (v * 9) / 5 + 32, k: (v) => v + 273.15 };

const ZODIAC = [
  [120, 'Verseau', '♒'], [219, 'Poissons', '♓'], [321, 'Bélier', '♈'], [420, 'Taureau', '♉'], [521, 'Gémeaux', '♊'], [621, 'Cancer', '♋'],
  [723, 'Lion', '♌'], [823, 'Vierge', '♍'], [923, 'Balance', '♎'], [1023, 'Scorpion', '♏'], [1122, 'Sagittaire', '♐'], [1222, 'Capricorne', '♑']
];

const hsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)}°, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%`;
};

// ---------- Commandes ----------

const commands = [
  {
    name: 'hash',
    aliases: ['sha256', 'md5'],
    desc: 'Calcule un hash : hash sha256 texte',
    async run(ctx) {
      const algos = ['md5', 'sha1', 'sha256', 'sha512'];
      let algo = 'sha256';
      let text = ctx.text;
      if (algos.includes((ctx.args[0] || '').toLowerCase())) {
        algo = ctx.args[0].toLowerCase();
        text = ctx.args.slice(1).join(' ');
      } else if (algos.includes(ctx.command)) algo = ctx.command;
      if (!text) return ctx.reply(`Utilisation : ${ctx.prefix}hash [${algos.join('/')}] texte`);
      await ctx.reply(`🔑 *${algo.toUpperCase()}*\n\`${crypto.createHash(algo).update(text).digest('hex')}\``);
    }
  },
  {
    name: 'binary',
    aliases: ['binaire', 'bin'],
    desc: 'Texte ↔ binaire : binary encode Salut',
    async run(ctx) {
      const mode = (ctx.args[0] || '').toLowerCase();
      const text = ctx.args.slice(1).join(' ');
      if (!['encode', 'decode'].includes(mode) || !text) return ctx.reply(`Utilisation : ${ctx.prefix}binary encode Salut\n${ctx.prefix}binary decode 01010011 01100001`);
      if (mode === 'encode') return ctx.reply([...Buffer.from(text)].map((b) => b.toString(2).padStart(8, '0')).join(' '));
      if (!/^[01\s]+$/.test(text)) return ctx.reply('❌ Binaire invalide (uniquement des 0 et des 1).');
      await ctx.reply(Buffer.from(text.trim().split(/\s+/).map((b) => parseInt(b, 2))).toString('utf8'));
    }
  },
  {
    name: 'morse',
    aliases: ['codemorse'],
    desc: 'Texte ↔ morse (détection automatique)',
    async run(ctx) {
      const text = ctx.text || ctx.quoted?.text;
      if (!text) return ctx.reply(`Utilisation : ${ctx.prefix}morse SOS\n${ctx.prefix}morse ... --- ...`);
      if (/^[.\-/\s]+$/.test(text)) {
        const out = text.trim().split(/\s*\/\s*|\s{3,}/).map((w) => w.split(/\s+/).map((c) => MORSE_REV[c] || '?').join('')).join(' ');
        return ctx.reply(`📡 ${out.toUpperCase()}`);
      }
      const clean = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const out = clean.split(/\s+/).map((w) => [...w].map((c) => MORSE[c] || '').filter(Boolean).join(' ')).join(' / ');
      await ctx.reply(`📡 ${out}`);
    }
  },
  {
    name: 'count',
    aliases: ['compter', 'wordcount'],
    desc: 'Compte mots, caractères et lignes',
    async run(ctx) {
      const t = ctx.text || ctx.quoted?.text;
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}count ton texte (ou réponds à un message)`);
      const words = t.trim().split(/\s+/).filter(Boolean).length;
      const sentences = (t.match(/[.!?]+(\s|$)/g) || []).length || 1;
      await ctx.reply(`🔢 *Statistiques du texte*\n\n📝 Mots : ${words}\n🔤 Caractères : ${t.length}\n🔡 Sans espaces : ${t.replace(/\s/g, '').length}\n📄 Lignes : ${t.split('\n').length}\n💬 Phrases : ${sentences}`);
    }
  },
  {
    name: 'random',
    aliases: ['aleatoire', 'nombre'],
    desc: 'Nombre aléatoire : random 1 100',
    async run(ctx) {
      let min = parseInt(ctx.args[0]);
      let max = parseInt(ctx.args[1]);
      if (Number.isNaN(min)) { min = 1; max = 100; }
      else if (Number.isNaN(max)) { max = min; min = 1; }
      if (min > max) [min, max] = [max, min];
      if (max - min > 2 ** 40) return ctx.reply('❌ Intervalle trop grand.');
      await ctx.reply(`🎯 Entre ${min} et ${max} : *${crypto.randomInt(min, max + 1)}*`);
    }
  },
  {
    name: 'bmi',
    aliases: ['imc'],
    desc: 'Calcule ton IMC : bmi 70 175',
    async run(ctx) {
      const kg = parseFloat((ctx.args[0] || '').replace(',', '.'));
      let cm = parseFloat((ctx.args[1] || '').replace(',', '.'));
      if (!kg || !cm || kg < 10 || kg > 400) return ctx.reply(`Utilisation : ${ctx.prefix}imc poids(kg) taille(cm)\nExemple : ${ctx.prefix}imc 70 175`);
      if (cm < 3) cm *= 100; // taille donnée en mètres
      const v = kg / (cm / 100) ** 2;
      const cat = v < 18.5 ? 'Insuffisance pondérale' : v < 25 ? 'Corpulence normale' : v < 30 ? 'Surpoids' : 'Obésité';
      await ctx.reply(`⚖️ *IMC : ${v.toFixed(1)}*\n📊 ${cat}\n\n_Indication générale (OMS), elle ne remplace pas un avis médical._`);
    }
  },
  {
    name: 'age',
    aliases: ['anniversaire'],
    desc: 'Calcule un âge : age 21/05/1998',
    async run(ctx) {
      const b = parseDate(ctx.args[0]);
      if (!b) return ctx.reply(`Utilisation : ${ctx.prefix}age JJ/MM/AAAA\nExemple : ${ctx.prefix}age 21/05/1998`);
      const now = new Date();
      const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      if (b.getTime() > today) return ctx.reply('❌ Cette date est dans le futur.');
      let years = now.getUTCFullYear() - b.getUTCFullYear();
      let months = now.getUTCMonth() - b.getUTCMonth();
      let days = now.getUTCDate() - b.getUTCDate();
      if (days < 0) { months--; days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate(); }
      if (months < 0) { years--; months += 12; }
      let next = Date.UTC(now.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
      if (next < today) next = Date.UTC(now.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate());
      const left = Math.round((next - today) / 864e5);
      await ctx.reply(`🎂 *${years} ans, ${months} mois et ${days} jours*\n📅 Jours vécus : ${Math.round((today - b.getTime()) / 864e5).toLocaleString('fr-FR')}\n🎉 Prochain anniversaire : ${left === 0 ? "c'est aujourd'hui !" : `dans ${left} jour(s)`}`);
    }
  },
  {
    name: 'countdown',
    aliases: ['compteabours', 'joursrestants'],
    desc: 'Temps restant avant une date',
    async run(ctx) {
      const dt = parseDate(ctx.args[0]);
      if (!dt) return ctx.reply(`Utilisation : ${ctx.prefix}countdown JJ/MM/AAAA\nExemple : ${ctx.prefix}countdown 25/12/2026`);
      const diff = dt.getTime() - Date.now();
      const abs = Math.abs(diff);
      const d = Math.floor(abs / 864e5);
      const h = Math.floor((abs % 864e5) / 36e5);
      const m = Math.floor((abs % 36e5) / 6e4);
      await ctx.reply(`⏳ ${ctx.args[0]} : ${diff >= 0 ? 'dans' : 'il y a'} *${d} j ${h} h ${m} min*`);
    }
  },
  {
    name: 'color',
    aliases: ['couleur', 'hex'],
    desc: 'Infos sur une couleur : color #ff8800',
    async run(ctx) {
      let h = (ctx.args[0] || '').replace('#', '').toLowerCase();
      if (/^[0-9a-f]{3}$/.test(h)) h = [...h].map((c) => c + c).join('');
      if (!/^[0-9a-f]{6}$/.test(h)) return ctx.reply(`Utilisation : ${ctx.prefix}color #ff8800`);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      const caption = `🎨 *#${h.toUpperCase()}*\nRGB : ${r}, ${g}, ${b}\nHSL : ${hsl(r, g, b)}`;
      try {
        const sharp = require('sharp');
        const img = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r, g, b } } }).png().toBuffer();
        await ctx.sock.sendMessage(ctx.from, { image: img, caption }, { quoted: ctx.m });
      } catch {
        await ctx.reply(caption);
      }
    }
  },
  {
    name: 'ipinfo',
    aliases: ['ip', 'iplookup'],
    desc: 'Infos sur une adresse IP',
    async run(ctx) {
      const q = ctx.args[0];
      if (!q || !/^[A-Za-z0-9.:-]{3,100}$/.test(q)) return ctx.reply(`Utilisation : ${ctx.prefix}ipinfo 8.8.8.8`);
      const d = await fetchJson(`https://ipwho.is/${encodeURIComponent(q)}`);
      if (!d.success) return ctx.reply('❌ Adresse introuvable.');
      await ctx.reply(
        `🌐 *${d.ip}*\n\n🏳️ Pays : ${d.country} ${d.flag?.emoji || ''}\n📍 Région : ${d.region || '—'}\n🏙️ Ville : ${d.city || '—'}\n🏢 Opérateur : ${d.connection?.isp || '—'}\n🕒 Fuseau : ${d.timezone?.id || '—'}`
      );
    }
  },
  {
    name: 'dns',
    aliases: ['nslookup', 'dnslookup'],
    desc: "Enregistrements DNS d'un domaine",
    async run(ctx) {
      const d = (ctx.args[0] || '').toLowerCase();
      if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(d)) return ctx.reply(`Utilisation : ${ctx.prefix}dns exemple.com`);
      const [a, aaaa, mx, ns] = await Promise.allSettled([dns.resolve4(d), dns.resolve6(d), dns.resolveMx(d), dns.resolveNs(d)]);
      const v = (r, f = (x) => x) => (r.status === 'fulfilled' && r.value.length ? r.value.slice(0, 6).map(f).join('\n') : '—');
      await ctx.reply(`🔎 *${d}*\n\n*A*\n${v(a)}\n\n*AAAA*\n${v(aaaa)}\n\n*MX*\n${v(mx, (x) => `${x.priority} ${x.exchange}`)}\n\n*NS*\n${v(ns)}`);
    }
  },
  {
    name: 'checkurl',
    aliases: ['isup', 'statussite'],
    desc: 'Vérifie si un site répond',
    async run(ctx) {
      const raw = extractUrl(ctx.text) || (/^[\w.-]+\.[a-z]{2,}/i.test(ctx.text) ? `https://${ctx.text.split(/\s/)[0]}` : '');
      let u;
      try {
        u = new URL(raw);
      } catch {
        return ctx.reply(`Utilisation : ${ctx.prefix}checkurl https://exemple.com`);
      }
      if (!/^https?:$/.test(u.protocol)) return ctx.reply('❌ Seuls les liens http(s) sont acceptés.');
      let addrs;
      try {
        addrs = await dns.lookup(u.hostname, { all: true });
      } catch {
        return ctx.reply(`🔴 *${u.hostname}* est introuvable (DNS).`);
      }
      if (addrs.some((a) => isPrivateIp(a.address))) return ctx.reply('🚫 Adresse non autorisée.');
      const t = Date.now();
      try {
        const r = await axios.get(u.href, { timeout: 15000, maxRedirects: 0, validateStatus: () => true, responseType: 'stream' });
        r.data.destroy();
        const ok = r.status < 400;
        await ctx.reply(`${ok ? '🟢' : '🟠'} *${u.hostname}*\n\n📶 Statut : ${r.status}\n⚡ Temps : ${Date.now() - t} ms\n🖥️ Serveur : ${r.headers.server || '—'}${r.headers.location ? `\n↪️ Redirige vers : ${r.headers.location}` : ''}`);
      } catch (e) {
        await ctx.reply(`🔴 *${u.hostname}* ne répond pas (${e.code || e.message}).`);
      }
    }
  },
  {
    name: 'json',
    aliases: ['jsonformat', 'beautify'],
    desc: 'Met en forme un JSON',
    async run(ctx) {
      const t = ctx.text || ctx.quoted?.text;
      if (!t) return ctx.reply(`Utilisation : ${ctx.prefix}json {"a":1,"b":[2,3]}`);
      try {
        const out = JSON.stringify(JSON.parse(t), null, 2);
        await ctx.reply('```' + out.slice(0, 3500) + '```');
      } catch (e) {
        await ctx.reply(`❌ JSON invalide : ${e.message}`);
      }
    }
  },
  {
    name: 'unit',
    aliases: ['unite', 'convertunit'],
    desc: 'Convertit des unités : unit 10 km mi',
    async run(ctx) {
      const norm = (s = '') => s.toLowerCase().replace(/[°/]/g, '').replace('celsius', 'c').replace('fahrenheit', 'f').replace('kelvin', 'k');
      const v = parseFloat((ctx.args[0] || '').replace(',', '.'));
      const from = norm(ctx.args[1]);
      const to = norm(ctx.args[2]);
      const help = `Utilisation : ${ctx.prefix}unit 10 km mi\n\n📏 ${Object.keys(UNITS.longueur).join(', ')}\n⚖️ ${Object.keys(UNITS.masse).join(', ')}\n🧪 ${Object.keys(UNITS.volume).join(', ')}\n🚗 ${Object.keys(UNITS.vitesse).join(', ')} (km/h, m/s)\n🌡️ c, f, k`;
      if (Number.isNaN(v) || !from || !to) return ctx.reply(help);
      let res;
      if (TEMP_TO_C[from] && TEMP_TO_C[to]) res = TEMP_FROM_C[to](TEMP_TO_C[from](v));
      else {
        const cat = Object.values(UNITS).find((c) => c[from] && c[to]);
        if (!cat) return ctx.reply(`❌ Conversion impossible.\n\n${help}`);
        res = (v * cat[from]) / cat[to];
      }
      await ctx.reply(`🔄 ${v} ${from} = *${+res.toPrecision(8)} ${to}*`);
    }
  },
  {
    name: 'zodiac',
    aliases: ['signeastro', 'zodiaque'],
    desc: 'Signe astrologique : zodiac 21/05',
    async run(ctx) {
      let d, m;
      const full = parseDate(ctx.args[0]);
      if (full) { d = full.getUTCDate(); m = full.getUTCMonth() + 1; }
      else {
        const r = (ctx.args[0] || '').match(/^(\d{1,2})[/.-](\d{1,2})$/);
        if (r) { d = +r[1]; m = +r[2]; }
      }
      if (!d || !m || m > 12 || d > 31) return ctx.reply(`Utilisation : ${ctx.prefix}zodiac JJ/MM\nExemple : ${ctx.prefix}zodiac 21/05`);
      const key = m * 100 + d;
      const sign = [...ZODIAC].reverse().find((z) => key >= z[0]) || ZODIAC[11];
      await ctx.reply(`${sign[2]} Ton signe : *${sign[1]}*`);
    }
  }
];

module.exports = commands.map((c) => ({ category: 'tools', ...c }));
