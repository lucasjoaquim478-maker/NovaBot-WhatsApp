const db = require('../database/index');

async function handleNiveis(sock, { msg, jid, sender, args, commandName }) {
  const user = db.getUser(sender);
  const needed = Math.floor(100 * Math.pow(1.5, user.level - 1));
  const progress = Math.min(100, Math.floor((user.xp || 0) / needed * 100));
  const bar = '█'.repeat(Math.floor(progress / 10)) + '░'.repeat(10 - Math.floor(progress / 10));

  if (commandName === 'nivel') {
    await sock.sendMessage(jid, {
      text: `⭐ *NIVEL*\n\n👤 Nivel: ${user.level || 1}\n📊 XP: ${user.xp || 0}/${needed}\n📈 Progresso: ${bar} ${progress}%`
    });
  }
}

const niveisCommands = ['nivel'];

module.exports = { handleNiveis, niveisCommands };
