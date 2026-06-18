const config = require('../config.json');
const db = require('../database/index');
const { formatUptime } = require('../lib/utils');
const os = require('os');

let startTime = Date.now();

function setStartTime(time) { startTime = time; }

async function handleInformacao(sock, { msg, jid, sender, args, commandName }) {
  switch (commandName) {
    case 'ping': {
      const start = Date.now();
      await sock.sendPresenceUpdate('composing', jid);
      const latency = Date.now() - start;
      await sock.sendMessage(jid, { text: `🏓 *Pong!*\n\n📡 Latência: ${latency}ms\n💚 Conexão: ${latency < 200 ? 'Excelente' : latency < 500 ? 'Boa' : 'Ruim'}` });
      break;
    }
    case 'uptime': {
      const uptime = formatUptime(Date.now() - startTime);
      await sock.sendMessage(jid, { text: `⏱ *Uptime:* ${uptime}` });
      break;
    }
    case 'status': {
      const uptime = formatUptime(Date.now() - startTime);
      const used = process.memoryUsage();
      const totalCommands = db.getCommandCount();
      const totalUsers = db.getUserCount();
      const totalGroups = db.getGroupCount();

      let info = `╔══════════════════════════╗\n`;
      info += `║     ${config.botName || 'NovaBot'} - STATUS     ║\n`;
      info += `╚══════════════════════════╝\n\n`;
      info += `🤖 *Nome:* ${config.botName || 'NovaBot'}\n`;
      info += `📟 *Prefixo:* ${config.prefix}\n`;
      if (sock.user) info += `📱 *Número:* ${sock.user.id?.split(':')[0] || 'N/A'}\n`;
      info += `⏱ *Uptime:* ${uptime}\n`;
      info += `💾 *RAM:* ${(used.heapUsed / 1024 / 1024).toFixed(1)}MB / ${(used.heapTotal / 1024 / 1024).toFixed(1)}MB\n`;
      info += `⚡ *Comandos:* ${totalCommands}\n`;
      info += `👥 *Usuários:* ${totalUsers}\n`;
      info += `👪 *Grupos:* ${totalGroups}\n`;
      info += `🖥 *OS:* ${os.platform()} ${os.release()}\n`;
      info += `⏰ *Ativo desde:* ${new Date(startTime).toLocaleString('pt-BR')}\n`;

      await sock.sendMessage(jid, { text: info });
      break;
    }
    case 'grupoinfo': {
      if (jid.endsWith('@g.us')) {
        try {
          const metadata = await sock.groupMetadata(jid);
          let text = `👥 *Informações do Grupo*\n\n`;
          text += `📌 *Nome:* ${metadata.subject}\n`;
          text += `🆔 *ID:* ${jid}\n`;
          text += `👤 *Membros:* ${metadata.participants?.length || 0}\n`;
          text += `👑 *Criador:* ${metadata.owner?.split('@')[0] || 'N/A'}\n`;
          text += `📅 *Criado:* ${metadata.creation || 'N/A'}\n`;
          text += `🔒 *Config:* ${metadata.announce ? 'Fechado' : 'Aberto'}\n`;
          text += `📝 *Descrição:* ${metadata.desc || 'Sem descrição'}`;
          await sock.sendMessage(jid, { text });
        } catch (e) {
          await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
        }
      } else {
        await sock.sendMessage(jid, { text: '❌ Este comando só funciona em grupos.' });
      }
      break;
    }
  }
}

const informacaoCommands = ['ping', 'uptime', 'status', 'grupoinfo'];

module.exports = { handleInformacao, informacaoCommands, setStartTime };
