const { backup } = require('../database/backup');
const db = require('../database/index');
const { isOwner } = require('../lib/utils');

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
        await sock.sendMessage(jid, { text: `✅ Backup concluido: ${file}` });
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
      await sock.sendMessage(jid, { text: `✅ Mensagem enviada para ${sent} usuarios.` });
      break;
    }
    case 'blacklist': {
      const target = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque ou responda ao usuario.' });
      const user = db.getUser(target);
      user.banned = true;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Usuario @${target.split('@')[0]} banido.`, mentions: [target] });
      break;
    }
    case 'unblacklist': {
      const target = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque ou responda ao usuario.' });
      const user = db.getUser(target);
      user.banned = false;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Usuario @${target.split('@')[0]} desbanido.`, mentions: [target] });
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

const ownerCommands = ['reiniciar', 'shutdown', 'backup', 'broadcast', 'blacklist', 'unblacklist', 'eval'];

module.exports = { handleOwner, ownerCommands };
