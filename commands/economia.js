const db = require('../database/index');
const config = require('../config.json');

async function handleEconomia(sock, { msg, jid, sender, args, commandName }) {
  switch (commandName) {
    case 'saldo': {
      const user = db.getUser(sender);
      await sock.sendMessage(jid, {
        text: `💰 *SALDO*\n\nCarteira: ${user.coins || 0} coins\nBanco: ${user.bank || 0} coins\nTotal: ${(user.coins || 0) + (user.bank || 0)} coins`
      });
      break;
    }
    case 'daily': {
      const user = db.getUser(sender);
      const now = Date.now();
      const cooldown = 86400000;
      if (user.daily && now - user.daily < cooldown) {
        const remaining = cooldown - (now - user.daily);
        const hours = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        return await sock.sendMessage(jid, { text: `⏳ Aguarde ${hours}h ${mins}min para o proximo daily.` });
      }
      const amount = config.dailyCoins || 500;
      user.daily = now;
      user.coins = (user.coins || 0) + amount;
      db.save('users');
      await sock.sendMessage(jid, { text: `🎉 *Daily recebido!*\n\n+${amount} coins!\n💳 Saldo: ${user.coins} coins` });
      break;
    }
    case 'trabalhar': {
      const user = db.getUser(sender);
      const now = Date.now();
      const cooldown = 1800000;
      if (user.workCooldown && now - user.workCooldown < cooldown) {
        const remaining = cooldown - (now - user.workCooldown);
        const mins = Math.floor(remaining / 60000);
        return await sock.sendMessage(jid, { text: `⏳ Descanse! Volte em ${mins} minutos.` });
      }
      const min = config.workCoins?.[0] || 50;
      const max = config.workCoins?.[1] || 200;
      const amount = Math.floor(Math.random() * (max - min + 1)) + min;
      user.workCooldown = now;
      user.coins = (user.coins || 0) + amount;
      db.save('users');
      const trabalhos = ['programou', 'limpou a casa', 'fez entregas', 'deu aulas', 'consertou carros', 'vendeu doces'];
      const job = trabalhos[Math.floor(Math.random() * trabalhos.length)];
      await sock.sendMessage(jid, { text: `💼 *Trabalho concluído!*\n\nVocê ${job} e ganhou +${amount} coins!\n💳 Saldo: ${user.coins} coins` });
      break;
    }
    case 'depositar': {
      const user = db.getUser(sender);
      const amount = parseInt(args[0]);
      if (!amount || amount <= 0) return await sock.sendMessage(jid, { text: '❌ Digite um valor válido.' });
      if (amount > (user.coins || 0)) return await sock.sendMessage(jid, { text: '❌ Saldo insuficiente na carteira.' });
      user.coins = (user.coins || 0) - amount;
      user.bank = (user.bank || 0) + amount;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Depositado ${amount} coins no banco!\n💰 Carteira: ${user.coins}\n🏦 Banco: ${user.bank}` });
      break;
    }
    case 'sacar': {
      const user = db.getUser(sender);
      const amount = parseInt(args[0]);
      if (!amount || amount <= 0) return await sock.sendMessage(jid, { text: '❌ Digite um valor válido.' });
      if (amount > (user.bank || 0)) return await sock.sendMessage(jid, { text: '❌ Saldo insuficiente no banco.' });
      user.bank = (user.bank || 0) - amount;
      user.coins = (user.coins || 0) + amount;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Sacado ${amount} coins do banco!\n💰 Carteira: ${user.coins}\n🏦 Banco: ${user.bank}` });
      break;
    }
    case 'ranking': {
      const users = db.getTopUsers('coins', 10);
      let text = '🏆 *Ranking Global* 🏆\n\n';
      users.forEach((u, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        text += `${medal} ${u.name || u.jid.split('@')[0]} - ${u.coins || 0} coins\n`;
      });
      await sock.sendMessage(jid, { text });
      break;
    }
  }
}

const economiaCommands = ['saldo', 'daily', 'trabalhar', 'depositar', 'sacar', 'ranking'];

module.exports = { handleEconomia, economiaCommands };
