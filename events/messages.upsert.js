const { extractText, extractJid, isGroup, cleanJid, isOwner } = require('../lib/utils');
const { checkSpam } = require('../plugins/antispam');
const { checkCooldown } = require('../plugins/cooldown');
const { containsLink, containsBlockedDomain } = require('../plugins/antilink');
const db = require('../database/index');
const config = require('../config.json');
const { handleSelection: handleTikTokSel, hasPending: hasTikTokPending } = require('../commands/tiktok');
const { handleSelection: handleRobloxSel, hasPending: hasRobloxPending } = require('../commands/roblox');

let handler = null;

function setHandler(h) { handler = h; }

const _antilinkCache = new Map();
global._antilinkCacheCleanup = () => {
  const now = Date.now();
  for (const [k, v] of _antilinkCache) {
    if (now - v.time > 60000) _antilinkCache.delete(k);
  }
};

async function processAntilink(sock, jid, sender, text) {
  const cached = _antilinkCache.get(jid);
  if (cached && Date.now() - cached.time < 30000) return cached.isAdmin;
  try {
    const meta = await sock.groupMetadata(jid);
    const participants = meta.participants;
    const senderClean = cleanJid(sender);
    const botClean = cleanJid(sock.user?.id);
    let isAdmin = false, isBotAdmin = false;
    for (const p of participants) {
      const pid = cleanJid(p.id);
      if (pid === senderClean && (p.admin === 'admin' || p.admin === 'superadmin')) isAdmin = true;
      if (pid === botClean && (p.admin === 'admin' || p.admin === 'superadmin')) isBotAdmin = true;
      if (isAdmin && isBotAdmin) break;
    }
    _antilinkCache.set(jid, { isAdmin, time: Date.now() });
    if (!isAdmin && isBotAdmin) {
      await sock.sendMessage(jid, { text: '❌ Links não são permitidos neste grupo!' });
      await sock.groupParticipantsUpdate(jid, [sender], 'remove');
    }
    return isAdmin;
  } catch { return true; }
}

async function handleMessages(sock, messages) {
  for (const msg of messages) {
    try {
      if (!msg.message || msg.key?.fromMe) continue;
      if (msg.key?.remoteJid === 'status@broadcast') continue;

      const jid = extractJid(msg, 'key');
      const sender = extractJid(msg, 'sender') || jid;
      const text = extractText(msg).trim();
      if (!text) continue;

      const chat = isGroup(jid) ? 'group' : 'private';
      const prefix = config.prefix || '!';
      const isCommand = text.startsWith(prefix);

      if (!isCommand) {
        const hasTikTok = hasTikTokPending(sender);
        if (hasTikTok && await handleTikTokSel(sock, msg, text, jid, sender)) continue;
        const hasRoblox = hasRobloxPending(sender);
        if (hasRoblox && await handleRobloxSel(sock, msg, text, jid, sender)) continue;
        if (chat === 'group') {
          const group = db.getGroup(jid);
          if (group.antilink && containsLink(text) && containsBlockedDomain(text)) {
            await processAntilink(sock, jid, sender, text);
          }
        }
        continue;
      }

      const args = text.slice(prefix.length).split(' ');
      const commandName = args.shift()?.toLowerCase();
      if (!commandName) continue;

      const user = db.getUser(sender);

      if (user.banned) {
        await sock.sendMessage(jid, { text: '❌ Você está banido do bot!' });
        continue;
      }

      user.lastSeen = Date.now();
      user.messages = (user.messages || 0) + 1;
      if (!user.name && msg.pushName) user.name = msg.pushName;
      db.addXp(sender, Math.floor(Math.random() * 16) + 5, user);

      if (chat === 'group') {
        const group = db.getGroup(jid);
        if (group.antilink && containsLink(text) && containsBlockedDomain(text)) {
          const isAdmin = await processAntilink(sock, jid, sender, text);
          if (!isAdmin) continue;
        }
      }

      console.log(`[COMANDO] ${sender.split('@')[0]} usou: ${prefix}${commandName} ${args.join(' ')}`);

      const spam = checkSpam(sender, config.maxCommandsPerMinute || 20);
      if (spam.blocked) {
        await sock.sendMessage(jid, { text: '❌ Muitos comandos! Aguarde um momento.' });
        continue;
      }

      const cooldown = checkCooldown(sender, commandName, config.cooldown || 3000);
      if (cooldown.onCooldown) continue;

      db.addCommand(user);

      if (db.data.config?.maintenance && !await isOwner(sender, sock)) {
        await sock.sendMessage(jid, { text: '🛠️ O bot está em manutenção. Tente mais tarde.' });
        continue;
      }

      if (handler) await handler(sock, { msg, jid, sender, text, args, commandName, chat, prefix, user });

    } catch (err) {
      console.error(`[ERRO] ${err.message}`);
    }
  }
}

module.exports = { handleMessages, setHandler };
