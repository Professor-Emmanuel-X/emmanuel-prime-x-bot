const { normalizeMessageContent, getContentType } = require('@whiskeysockets/baileys');
const config = require('../config');
const { digits, sleep, runtime } = require('./utils');
const { byName } = require('./loader');
const ai = require('./ai');

const LINK_REGEX = /(https?:\/\/)?(chat\.whatsapp\.com\/[A-Za-z0-9]{10,}|wa\.me\/|whatsapp\.com\/channel\/)/i;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Aides ----------

function getBody(content, type) {
  const c = content?.[type];
  if (!c) return '';
  if (typeof c === 'string') return c;
  return (
    c.text ||
    c.caption ||
    c.selectedButtonId ||
    c.selectedId ||
    c.singleSelectReply?.selectedRowId ||
    c.name ||
    ''
  );
}

function matches(p, ids) {
  const cand = [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean).map(digits);
  return ids.some((i) => cand.includes(i));
}

async function getGroupMeta(sock, jid) {
  const hit = sock.groupCache.get(jid);
  if (hit && Date.now() - hit.t < 60000) return hit.meta;
  const meta = await Promise.race([
    sock.groupMetadata(jid),
    sleep(8000).then(() => {
      throw new Error('groupMetadata: délai dépassé');
    })
  ]);
  sock.groupCache.set(jid, { meta, t: Date.now() });
  return meta;
}

function botIds(sock) {
  return [digits(sock.user?.id), digits(sock.user?.lid)].filter(Boolean);
}

// ---------- Traitement d'un message ----------

async function handleMessage(sock, m) {
  if (!m.message) return;
  const db = sock.db;
  const settings = db.settings;
  const from = m.key.remoteJid;
  if (!from) return;

  // Statuts
  if (from === 'status@broadcast') {
    if (settings.autoviewstatus) {
      await sock.readMessages([m.key]).catch(() => {});
      if (settings.autoreactstatus && m.key.participant) {
        await sock
          .sendMessage(from, { react: { key: m.key, text: '💚' } }, { statusJidList: [m.key.participant, sock.user.id] })
          .catch(() => {});
      }
    }
    return;
  }

  const content = normalizeMessageContent(m.message);
  if (!content) return;
  const type = getContentType(content);

  // Un même message peut être livré deux fois par WhatsApp (renvoi, reconnexion) : on ne le traite qu'une fois
  const handled = sock.handledIds || (sock.handledIds = new Set());
  const uid = `${from}|${m.key.id}`;
  if (m.key.id && handled.has(uid)) return;
  handled.add(uid);
  if (handled.size > 3000) handled.delete(handled.values().next().value);

  // Cache pour l'anti-suppression
  sock.msgCache.set(m.key.id, m);
  if (sock.msgCache.size > 1500) sock.msgCache.delete(sock.msgCache.keys().next().value);

  // Anti-delete : un message supprimé arrive comme protocolMessage REVOKE
  if (type === 'protocolMessage') {
    const pm = content.protocolMessage;
    if (settings.antidelete && (pm.type === 0 || pm.type === 'REVOKE') && pm.key?.id) {
      const old = sock.msgCache.get(pm.key.id);
      if (old && !old.key.fromMe) {
        const me = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        const who = old.key.participant || old.key.remoteJid;
        await sock.sendMessage(me, { text: `🗑️ *Message supprimé*\n👤 De : @${digits(who)}\n💬 Chat : ${old.key.remoteJid}`, mentions: [who] }).catch(() => {});
        await sock.sendMessage(me, { forward: old }).catch(() => {});
      }
    }
    return;
  }

  if (sock.sentIds.has(m.key.id)) return; // messages envoyés par le bot lui-même

  const isGroup = from.endsWith('@g.us');
  const fromMe = !!m.key.fromMe;
  const body = getBody(content, type);

  // Identité de l'expéditeur
  const selfNum = digits(sock.user?.id);
  const senderIds = (
    fromMe
      ? [selfNum]
      : isGroup
        ? [m.key.participant, m.key.participantAlt, m.key.participantPn]
        : [from, m.key.remoteJidAlt]
  )
    .filter(Boolean)
    .map(digits);
  const sender = fromMe ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : isGroup ? m.key.participant : from;
  const senderNum = senderIds[0] || digits(sender);

  // Propriétaires de cette session
  const owners = new Set([sock.sessionNumber, selfNum, ...db.data.sudo]);
  if (sock.sessionNumber === config.botNumber) owners.add(config.ownerNumber);
  const isOwner = fromMe || senderIds.some((n) => owners.has(n));

  if (!isOwner && senderIds.some((n) => db.data.banned.includes(n))) return;
  if (settings.mode === 'self' && !isOwner) return;

  // Réaction automatique (.autoreact) : un emoji au hasard sur chaque message reçu
  if (settings.autoreact && !fromMe && m.key.id) {
    const { randomEmoji } = require('./reactions');
    sock.sendMessage(from, { react: { text: randomEmoji(settings), key: m.key } }).catch(() => {});
  }

  // Message cité
  const ci = content[type]?.contextInfo;
  let quoted = null;
  if (ci?.quotedMessage) {
    const qm = normalizeMessageContent(ci.quotedMessage);
    quoted = {
      key: { remoteJid: from, id: ci.stanzaId, participant: ci.participant, fromMe: ci.participant ? digits(ci.participant) === selfNum : false },
      message: qm,
      sender: ci.participant,
      type: getContentType(qm),
      text: getBody(qm, getContentType(qm))
    };
  }

  // Infos groupe
  let meta = null;
  let isAdmin = false;
  let isBotAdmin = false;
  if (isGroup) {
    try {
      meta = await getGroupMeta(sock, from);
      const admins = meta.participants.filter((p) => p.admin);
      isAdmin = admins.some((p) => matches(p, senderIds));
      isBotAdmin = admins.some((p) => matches(p, botIds(sock)));
    } catch {
      /* groupe inaccessible */
    }
  }

  const prefix = settings.prefix || config.prefix;
  const reply = (text, extra = {}) => sock.sendMessage(from, { text, ...extra }, { quoted: m });

  // ----- Statistiques de groupe (classement .top) -----
  if (isGroup && !fromMe) {
    const g = db.group(from);
    g.stats[senderNum] = (g.stats[senderNum] || 0) + 1;
    if (g.stats[senderNum] % 10 === 0) db.save();
  }

  // ----- AFK : retour de la personne + prévenir ceux qui la mentionnent -----
  const afkMap = db.data.afk || (db.data.afk = {});
  if (afkMap[senderNum] && !body.startsWith(prefix + 'afk')) {
    const since = afkMap[senderNum].since;
    delete afkMap[senderNum];
    db.save();
    if (isGroup) {
      await sock
        .sendMessage(from, { text: `👋 Bon retour @${senderNum} ! Tu étais AFK depuis ${runtime((Date.now() - since) / 1000)}.`, mentions: [sender] })
        .catch(() => {});
    }
  }
  if (isGroup) {
    const targets = new Set([...(ci?.mentionedJid || []), quoted?.sender].filter(Boolean).map(digits));
    for (const n of targets) {
      const a = afkMap[n];
      if (!a || n === senderNum) continue;
      await sock
        .sendMessage(
          from,
          { text: `😴 @${n} est AFK${a.reason ? ` : ${a.reason}` : ''} (depuis ${runtime((Date.now() - a.since) / 1000)})`, mentions: [n + '@s.whatsapp.net'] },
          { quoted: m }
        )
        .catch(() => {});
    }
  }

  // ----- Anti-lien -----
  if (isGroup && !fromMe && body && LINK_REGEX.test(body)) {
    const g = db.group(from);
    if (g.antilink && !isAdmin && !isOwner && isBotAdmin) {
      await sock.sendMessage(from, { delete: m.key }).catch(() => {});
      if (g.antilinkAction === 'kick') {
        await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {});
        await sock.sendMessage(from, { text: `🚫 @${senderNum} a été retiré du groupe (lien interdit).`, mentions: [sender] });
      } else {
        await sock.sendMessage(from, { text: `⚠️ @${senderNum}, les liens ne sont pas autorisés ici.`, mentions: [sender] });
      }
      return;
    }
  }

  // ----- Anti-mots interdits -----
  if (isGroup && !fromMe && body) {
    const g = db.group(from);
    if (g.antibadword && g.badwords.length && !isAdmin && !isOwner && isBotAdmin) {
      const text = body.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const hit = g.badwords.find((w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w)}([^a-z0-9]|$)`).test(text));
      if (hit) {
        await sock.sendMessage(from, { delete: m.key }).catch(() => {});
        await sock.sendMessage(from, { text: `🚫 @${senderNum}, ce langage n'est pas toléré ici.`, mentions: [sender] }).catch(() => {});
        return;
      }
    }
  }

  // ----- Chatbot IA (messages privés) -----
  if (settings.chatbot && !isGroup && !fromMe && body && !body.startsWith(prefix)) {
    try {
      await sock.sendPresenceUpdate('composing', from);
      const out = await ai.chatWithMemory(from, body);
      await reply(out);
    } catch (e) {
      console.error('[chatbot]', e.message);
    }
    return;
  }

  // ----- Commandes -----
  if (!body || !body.startsWith(prefix)) return;
  const [rawCmd, ...args] = body.slice(prefix.length).trim().split(/\s+/);
  const command = (rawCmd || '').toLowerCase();
  if (!command) return;
  const cmd = byName.get(command);
  if (!cmd) return;

  if (cmd.owner && !isOwner) return reply('🚫 Cette commande est réservée au propriétaire du bot.');
  if (cmd.group && !isGroup) return reply('👥 Cette commande fonctionne uniquement dans un groupe.');
  if (cmd.private && isGroup) return reply('💬 Cette commande fonctionne uniquement en privé.');
  if (cmd.admin && !isAdmin && !isOwner) return reply("🛡️ Réservé aux admins du groupe.");
  if (cmd.botAdmin && !isBotAdmin) return reply("🤖 Je dois être admin du groupe pour faire ça.");

  const text = args.join(' ');
  const mentioned = ci?.mentionedJid || [];

  // Cible : mention > message cité > numéro tapé
  const getTarget = () => {
    let jid = mentioned[0] || quoted?.sender;
    if (!jid && args[0]) {
      const n = args[0].replace(/\D/g, '');
      if (n.length >= 7) jid = n + '@s.whatsapp.net';
    }
    if (jid && meta) {
      const p = meta.participants.find((x) => matches(x, [digits(jid)]));
      if (p) jid = p.id;
    }
    return jid;
  };

  const ctx = {
    sock,
    m,
    msg: { key: m.key, message: content },
    db,
    config,
    from,
    sender,
    senderNum,
    isGroup,
    isOwner,
    isAdmin,
    isBotAdmin,
    meta,
    body,
    args,
    text,
    prefix,
    command,
    quoted,
    mentioned,
    getTarget,
    reply
  };

  try {
    if (settings.autoread) await sock.readMessages([m.key]).catch(() => {});
    if (settings.autotyping) await sock.sendPresenceUpdate('composing', from).catch(() => {});
    else if (settings.autorecord) await sock.sendPresenceUpdate('recording', from).catch(() => {});
    await cmd.run(ctx);
  } catch (e) {
    console.error(`[cmd:${command}]`, e);
    await reply(`❌ Erreur : ${e.message || e}`).catch(() => {});
  }
}

// ---------- Événements de groupe ----------

const DEFAULT_WELCOME = '👋 Bienvenue @user dans *@group* !\n\n📌 Lis la description et respecte les règles.\n🤖 Tape @prefixmenu pour voir mes commandes.';
const DEFAULT_GOODBYE = '👋 @user a quitté *@group*. À bientôt !';

function fillTemplate(tpl, vars) {
  return String(tpl)
    .replace(/@user/gi, `@${vars.num}`)
    .replace(/@group/gi, vars.group)
    .replace(/@count/gi, String(vars.count))
    .replace(/@desc/gi, vars.desc || '')
    .replace(/@prefix/gi, vars.prefix);
}

async function handleGroupUpdate(sock, ev) {
  const g = sock.db.group(ev.id);
  const goodbyeOn = g.goodbye === undefined ? g.welcome : g.goodbye;
  if (ev.action !== 'add' && ev.action !== 'remove') return;
  if (ev.action === 'add' ? !g.welcome : !goodbyeOn) return;
  let meta;
  try {
    meta = await getGroupMeta(sock, ev.id);
  } catch {
    return;
  }
  sock.groupCache.delete(ev.id);
  for (const p of ev.participants) {
    const jid = typeof p === 'string' ? p : p.id;
    const tpl = ev.action === 'add' ? g.welcomeText || DEFAULT_WELCOME : g.goodbyeText || DEFAULT_GOODBYE;
    const text = fillTemplate(tpl, {
      num: digits(jid),
      group: meta.subject,
      count: meta.participants.length,
      desc: meta.desc,
      prefix: sock.db.settings.prefix
    });
    await sock.sendMessage(ev.id, { text, mentions: [jid] }).catch(() => {});
    await sleep(500);
  }
}

// ---------- Appels ----------

async function handleCall(sock, calls) {
  if (!sock.db.settings.anticall) return;
  for (const c of calls) {
    if (c.status !== 'offer') continue;
    await sock.rejectCall(c.id, c.from).catch(() => {});
    await sock
      .sendMessage(c.from, { text: `📵 Les appels ne sont pas acceptés. Écris-moi un message à la place.\n— ${config.botName}` })
      .catch(() => {});
  }
}

module.exports = { fillTemplate, DEFAULT_WELCOME, DEFAULT_GOODBYE, handleMessage, handleGroupUpdate, handleCall, getGroupMeta, matches };
