const { backup } = require('../database/backup');
const db = require('../database/index');
const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const fs = require('fs');
const path = require('path');
const OWNERS_FILE = path.join(__dirname, '..', 'database', 'owners.json');

function loadPersistedOwners() {
  try {
    if (fs.existsSync(OWNERS_FILE)) return JSON.parse(fs.readFileSync(OWNERS_FILE, 'utf-8'));
  } catch {}
  return [];
}

function savePersistedOwner(jid) {
  const owners = loadPersistedOwners();
  if (!owners.includes(jid)) {
    owners.push(jid);
    fs.writeFileSync(OWNERS_FILE, JSON.stringify(owners, null, 2));
  }
}

async function handleOwner(sock, { msg, jid, sender, args, commandName }) {
  if (!await isOwner(sender, sock)) {
    await sock.sendMessage(jid, { text: '❌ Apenas o dono do bot pode usar este comando.' });
    return;
  }

  switch (commandName) {
    case 'reiniciar': {
      await sock.sendMessage(jid, { text: '🔄 Reiniciando bot...' });
      process.exit(0);
      break;
    }
    case 'shutdown': {
      await sock.sendMessage(jid, { text: '🛑 Desligando bot...' });
      process.exit(1);
      break;
    }
    case 'backup': {
      try {
        const file = backup();
        await sock.sendMessage(jid, { text: `✅ Backup concluído: ${file}` });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro no backup: ${e.message}` });
      }
      break;
    }
    case 'broadcast': {
      if (!args.length) return await sock.sendMessage(jid, { text: '❌ Informe a mensagem.' });
      const text = args.join(' ');
      const users = Object.keys(db.data.users);
      let sent = 0;
      for (const u of users) {
        try {
          await sock.sendMessage(u, { text: `📢 *BROADCAST*\n\n${text}` });
          sent++;
        } catch {}
      }
      await sock.sendMessage(jid, { text: `✅ Mensagem enviada para ${sent} usuários.` });
      break;
    }
    case 'blacklist': {
      const target = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque ou responda ao usuário.' });
      const user = db.getUser(target);
      user.banned = true;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Usuário @${target.split('@')[0]} banido.`, mentions: [target] });
      break;
    }
    case 'unblacklist': {
      const target = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque ou responda ao usuário.' });
      const user = db.getUser(target);
      user.banned = false;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Usuário @${target.split('@')[0]} desbanido.`, mentions: [target] });
      break;
    }
    case 'eval': {
      try {
        const code = args.join(' ');
        let result = eval(code);
        if (typeof result !== 'string') result = JSON.stringify(result, null, 2);
        await sock.sendMessage(jid, { text: `📝 *Resultado:*\n\`\`\`\n${result.slice(0, 3000)}\n\`\`\`` });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro:*\n\`\`\`\n${e.message.slice(0, 3000)}\n\`\`\`` });
      }
      break;
    }
  }
}

async function handleAddDono(sock, { jid, sender, args, chat }) {
  if (chat === 'group') {
    await sock.sendMessage(jid, { text: '❌ Envie este comando no privado do bot.' });
    return;
  }

  const number = args[0]?.replace(/[^0-9]/g, '');
  if (!number) {
    await sock.sendMessage(jid, { text: `❌ Use: !adddono SEUNUMERO\n\nSeu JID: ${sender}\nEnvie !adddono seguido do seu número (so números, com código do país).` });
    return;
  }

  const ownerPhones = config.ownerNumbers.map(n => n.split('@')[0].replace(/[^0-9]/g, ''));
  const match = ownerPhones.some(p => number.endsWith(p.slice(-10)) || p.endsWith(number.slice(-10)));
  if (!match) {
    await sock.sendMessage(jid, { text: `❌ Número ${number} não autorizado como dono.` });
    return;
  }

  if (!global.resolvedOwnerJids) global.resolvedOwnerJids = new Set();
  global.resolvedOwnerJids.add(sender);
  global.resolvedOwnerJids.add(sender.split('@')[0]);
  savePersistedOwner(sender);
  savePersistedOwner(sender.split('@')[0]);
  await sock.sendMessage(jid, { text: `✅ Dono salvo permanentemente! Agora você pode usar comandos restritos.` });
}

async function handleSetPP(sock, { jid, sender }) {
  if (!await isOwner(sender, sock)) {
    await sock.sendMessage(jid, { text: '❌ Apenas o dono do bot pode usar este comando.' });
    return;
  }
  try {
    const imgPath = path.join(__dirname, '..', 'bot-avatar.png');
    if (!fs.existsSync(imgPath)) {
      await sock.sendMessage(jid, { text: '❌ Arquivo bot-avatar.png nao encontrado.' });
      return;
    }
    const img = fs.readFileSync(imgPath);
    const jidBot = sock.user?.id;
    if (!jidBot) {
      await sock.sendMessage(jid, { text: '❌ Nao foi possivel obter o ID do bot.' });
      return;
    }
    await sock.updateProfilePicture(jidBot, img);
    await sock.sendMessage(jid, { text: '✅ Foto de perfil atualizada!' });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
  }
}

const ownerCommands = ['reiniciar', 'shutdown', 'backup', 'broadcast', 'blacklist', 'unblacklist', 'eval', 'adddono'];

module.exports = { handleOwner, handleAddDono, handleSetPP, ownerCommands };
