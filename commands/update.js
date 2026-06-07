const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const {
  checkForUpdates,
  performUpdate,
  rollback,
  getChangelog,
  getCurrentVersion,
  getLatestVersion,
} = require('../lib/updater');

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
      const local = getCurrentVersion();
      const latest = getLatestVersion();
      let txt = `📦 *Versão atual:* v${local}\n`;
      if (latest !== local) txt += `🎯 *Última disponível:* v${latest}\n`;
      else txt += `✅ *Última versão disponível:* v${latest}\n`;
      const changelog = await getChangelog();
      if (changelog) txt += `\n📋 *Changelog:*\n${changelog.slice(0, 1500)}`;
      await sock.sendMessage(jid, { text: txt });
      break;
    }

    case 'update': {
      const force = args[0]?.toLowerCase() === 'force';
      if (force) {
        await sock.sendMessage(jid, { text: '⚡ Forçando atualização...' });
        await performUpdate(sock, jid);
        return;
      }
      const result = await checkForUpdates();
      if (!result) {
        await sock.sendMessage(jid, { text: '❌ Nao foi possivel verificar atualizações. Verifique sua configuração (githubRepo).' });
        return;
      }
      if (result.current) {
        await sock.sendMessage(jid, { text: `✅ Você já está na versão mais recente: v${getCurrentVersion()}` });
        return;
      }
      if (result.hasUpdate) {
        await sock.sendMessage(jid, {
          text: `🔄 *Nova versão disponível!*\n\n` +
                `📦 Atual: v${getCurrentVersion()}\n` +
                `🎯 Nova: v${result.version}\n` +
                `📝 Changelog: ${result.release?.html_url || 'N/A'}\n\n` +
                `Deseja atualizar? Use \`!update force\` para confirmar.`
        });
      }
      break;
    }

    case 'rollback': {
      await rollback(sock, jid);
      break;
    }
  }
}

module.exports = { handleUpdate, updateCommands };
