const config = require('../config.json');
const { isOwner, cleanJid } = require('../lib/utils');
const {
  checkForUpdates,
  performUpdate,
  rollback,
  getChangelog,
  getCurrentVersion,
  getLatestVersion,
} = require('../lib/updater');

const updateCommands = ['update', 'versao', 'rollback', 'meunumero'];

async function handleUpdate(sock, { jid, sender, args, commandName }) {
  const owner = await isOwner(sender, sock);
  if (!owner) {
    await sock.sendMessage(jid, { text: '❌ Apenas o dono do bot pode usar este comando.' });
    return;
  }

  if (!config.githubRepo) {
    await sock.sendMessage(jid, { text: '❌ Repositorio GitHub nao configurado (githubRepo no config.json).' });
    return;
  }

  switch (commandName) {
    case 'meunumero': {
      await sock.sendMessage(jid, {
        text: `📱 *Seu JID:* ${sender}\n👤 *Nome:* ${msg.pushName || 'N/A'}\n🔍 *No config:* ${config.ownerNumbers.some(n => sender.startsWith(n.split('@')[0])) ? 'SIM' : 'NAO'}\n👑 *isOwner:* ${await isOwner(sender, sock) ? 'SIM' : 'NAO'}`
      });
      return;
    }

    case 'versao': {
      const local = getCurrentVersion();
      const latest = getLatestVersion();
      let msg = `📦 *Versao atual:* v${local}\n`;
      if (latest !== local) msg += `🎯 *Ultima disponivel:* v${latest}\n`;
      else msg += `✅ *Ultima versao disponivel:* v${latest}\n`;
      const changelog = await getChangelog();
      if (changelog) msg += `\n📋 *Changelog:*\n${changelog.slice(0, 1500)}`;
      await sock.sendMessage(jid, { text: msg });
      break;
    }

    case 'update': {
      const force = args[0]?.toLowerCase() === 'force';

      if (force) {
        await sock.sendMessage(jid, { text: '⚡ Forcando atualizacao...' });
        await performUpdate(sock, jid);
        return;
      }

      const result = await checkForUpdates();
      if (!result) {
        await sock.sendMessage(jid, { text: '❌ Nao foi possivel verificar atualizacoes. Verifique sua configuracao (githubRepo).' });
        return;
      }

      if (result.current) {
        await sock.sendMessage(jid, { text: `✅ Voce ja esta na versao mais recente: v${getCurrentVersion()}` });
        return;
      }

      if (result.hasUpdate) {
        await sock.sendMessage(jid, {
          text: `🔄 *Nova versao disponivel!*\n\n` +
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
