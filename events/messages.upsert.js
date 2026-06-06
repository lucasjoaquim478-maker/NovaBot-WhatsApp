const { extractText, extractJid, isGroup, cleanJid } = require('../lib/utils');
const { checkSpam } = require('../plugins/antispam');
const { checkCooldown } = require('../plugins/cooldown');
const { containsLink, containsBlockedDomain } = require('../plugins/antilink');
const db = require('../database/index');
const config = require('../config.json');
const { handleSelection: handleTikTokSel } = require('../commands/tiktok');
const { handleSelection: handleRobloxSel } = require('../commands/roblox');

let handler = null;

function setHandler(h) { handler = h; }

async function handleMessages(sock, messages) {
  for (const msg of messages) {
    try {
      if (!msg.message || msg.key?.fromMe) continue;

      const jid = extractJid(msg, 'key');
      const sender = extractJid(msg, 'sender') || jid;
      const text = extractText(msg).trim();
      const chat = isGroup(jid) ? 'group' : 'private';
      const prefix = config.prefix || '!';

      if (!text) continue;

      if (chat === 'group') {
        const group = db.getGroup(jid);
        if (group.antilink && containsLink(text) && containsBlockedDomain(text)) {
          try {
            const groupMetadata = await sock.groupMetadata(jid);
            const isAdmin = groupMetadata.participants.some(p => cleanJid(p.id) === cleanJid(sender) && (p.admin === 'admin' || p.admin === 'superadmin'));
            const isBotAdmin = groupMetadata.participants.some(p => cleanJid(p.id) === cleanJid(sock.user?.id) && (p.admin === 'admin' || p.admin === 'superadmin'));
            if (!isAdmin && isBotAdmin) {
              await sock.sendMessage(jid, { text: '❌ Links nao sao permitidos neste grupo!' });
              await sock.groupParticipantsUpdate(jid, [sender], 'remove');
              continue;
            }
          } catch {}
        }
      }

      const user = db.getUser(sender);
      user.lastSeen = Date.now();
      user.messages = (user.messages || 0) + 1;
      if (!user.name && msg.pushName) user.name = msg.pushName;

      db.addXp(sender, Math.floor(Math.random() * 16) + 5, user);

      if (await handleTikTokSel(sock, msg, text, jid, sender) || await handleRobloxSel(sock, msg, text, jid, sender)) continue;

      if (!text.startsWith(prefix)) continue;

      const args = text.slice(prefix.length).split(/ +/);
      const commandName = args.shift()?.toLowerCase();
      if (!commandName) continue;

      if (user.banned) {
        await sock.sendMessage(jid, { text: '❌ Voce esta banido do bot!' });
        continue;
      }

      console.log(`[COMANDO] ${sender.split('@')[0]} usou: ${prefix}${commandName} ${args.join(' ')}`);

      const spam = checkSpam(sender, config.maxCommandsPerMinute || 20);
      if (spam.blocked) {
        await sock.sendMessage(jid, { text: '❌ Muitos comandos! Aguarde um momento.' });
        continue;
      }

      const cooldown = checkCooldown(sender, commandName, config.cooldown || 3000);
      if (cooldown.onCooldown) continue;

      user.commands = (user.commands || 0) + 1;
      db.save('users');

      if (handler) await handler(sock, { msg, jid, sender, text, args, commandName, chat, prefix, user });

    } catch (err) {
      console.error(`[ERRO] ${err.message}`);
    }
  }
}

module.exports = { handleMessages, setHandler };
