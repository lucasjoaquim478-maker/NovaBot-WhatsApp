const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const updater = require('../lib/updater');
const { safeRestart } = require('../lib/restart');

const updateCommands = ['update', 'versão', 'versao', 'rollback', 'meunúmero'];

async function handleUpdate(sock, { jid, sender, args, commandName, msg }) {
  if (commandName === 'meunúmero') {
    await sock.sendMessage(jid, {
      text: `📱 *Seu JID:* ${sender}\n👤 *Nome:* ${msg.pushName || 'N/A'}\n🔍 *No config:* ${config.ownerNumbers.some(n => sender.startsWith(n.split('@')[0])) ? 'SIM' : 'NAO'}\n👑 *isOwner:* ${await isOwner(sender, sock) ? 'SIM' : 'NAO'}`
    });
    return;
  }

  const owner = await isOwner(sender, sock);
  if (!owner) {
    await sock.sendMessage(jid, { text: '❌ Apenas o dono do bot pode usar este comando.' });
    return;
  }

  if (!config.githubRepo) {
    await sock.sendMessage(jid, { text: '❌ Repositório GitHub não configurado (githubRepo no config.json).' });
    return;
  }

  switch (commandName) {
    case 'versão': {
      const local = updater.getCurrentVersion();
      const latest = updater.getLatestVersion();
      let txt = `📦 *Versão atual:* v${local}\n`;
      if (latest !== local) txt += `🎯 *Última disponível:* v${latest}\n`;
      else txt += `✅ *Última versão disponível:* v${latest}\n`;
      const changelog = await updater.getChangelog();
      if (changelog) txt += `\n📋 *Changelog:*\n${changelog.slice(0, 1500)}`;
      await sock.sendMessage(jid, { text: txt });
      break;
    }

    case 'update': {
      const force = args[0]?.toLowerCase() === 'force';
      if (force) {
        await sock.sendMessage(jid, { text: '⚡ Atualizando... Acompanhe o progresso no painel web.' });
        try {
          const result = await updater.performUpdate();
          await sock.sendMessage(jid, {
            text: `✅ *Atualização concluída!*\n\n📦 v${updater.getCurrentVersion()} → v${result.targetVer}\n📁 ${result.filesSuccess} atualizados\n❌ ${result.filesFailed} falhas\n\n🔄 Reiniciando...`
          });
          setTimeout(() => safeRestart(), 3000);
        } catch (e) {
          await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
        }
        return;
      }
      const result = await updater.checkForUpdates();
      if (!result || result.error) {
        await sock.sendMessage(jid, { text: `❌ ${result?.error || 'Erro ao verificar'}` });
        return;
      }
      if (result.current) {
        await sock.sendMessage(jid, { text: `✅ Você já está na versão mais recente: v${updater.getCurrentVersion()}` });
        return;
      }
      if (result.hasUpdate) {
        await sock.sendMessage(jid, {
          text: `🔄 *Nova versão disponível!*\n\n` +
                `📦 Atual: v${updater.getCurrentVersion()}\n` +
                `🎯 Nova: v${result.version}\n` +
                `📝 Changelog: ${result.html_url || 'N/A'}\n\n` +
                `Deseja atualizar? Use \`!update force\` para confirmar.`
        });
      }
      break;
    }

    case 'rollback': {
      try {
        const result = await updater.rollback();
        await sock.sendMessage(jid, {
          text: `✅ *Rollback concluído!*\n\n💾 Backup: ${result.backup}\n📁 ${result.files} arquivos restaurados\n\n🔄 Reiniciando em 3 segundos...`
        });
        setTimeout(() => safeRestart(), 3000);
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
  }
}

module.exports = { handleUpdate, updateCommands };
