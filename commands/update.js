const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const updater = require('../lib/updater');
const { safeRestart } = require('../lib/restart');
const fs = require('fs');
const path = require('path');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies.txt');
const updateCommands = ['update', 'versão', 'versao', 'rollback', 'meunúmero', 'addcookie', 'delcookie', 'cookieb64', 'cookieinfo'];

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

    case 'cookieinfo': {
      const p = path.resolve(__dirname, '..');
      const cookieExists = fs.existsSync(COOKIE_PATH);
      const cookieSize = cookieExists ? fs.statSync(COOKIE_PATH).size : 0;
      const cfgPath = path.join(__dirname, '..', 'config.json');
      let cfgObj = {};
      try { cfgObj = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch {}
      const hasB64 = !!cfgObj.cookieBase64;
      const envSet = !!process.env.YOUTUBE_COOKIES_B64;
      const loginfo = cookieExists ? fs.readFileSync(COOKIE_PATH, 'utf-8').includes('LOGIN_INFO') : false;
      await sock.sendMessage(jid, {
        text: `📋 *Diagnostico de Cookies*\n\n` +
              `📁 *cookies.txt:* ${cookieExists ? 'EXISTE' : 'NAO EXISTE'} (${cookieSize} bytes)\n` +
              `🔑 *LOGIN_INFO:* ${loginfo ? 'PRESENTE' : 'AUSENTE'}\n` +
              `⚙️ *cookiesPath config:* ${cfgObj.cookiesPath || '(vazio)'}\n` +
              `💾 *cookieBase64 config:* ${hasB64 ? 'PRESENTE' : 'AUSENTE'}\n` +
              `🌍 *YOUTUBE_COOKIES_B64 env:* ${envSet ? 'SETADA' : 'NAO SETADA'}\n` +
              `📂 *ROOT:* ${p}`
      });
      break;
    }

    case 'addcookie': {
      if (!args.length) {
        return await sock.sendMessage(jid, {
          text: `📋 *Configurar cookies do YouTube*\n\n1. Instale "Get cookies.txt LOCALLY" no Chrome\n2. Acesse youtube.com, faca login\n3. Clique na extensao > Exportar\n4. Copie TODO o conteudo\n5. Envie: *addcookie* + o conteudo dos cookies`
        });
      }
      const input = args.join(' ');
      if (input.length < 50) {
        return await sock.sendMessage(jid, { text: '❌ Conteudo muito curto. Copie todo o conteudo do cookies.txt' });
      }
      try {
        const b64 = Buffer.from(input, 'utf-8').toString('base64');
        fs.writeFileSync(COOKIE_PATH, input, 'utf-8');
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.cookiesPath = 'cookies.txt';
          cfg.cookieBase64 = b64;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, {
          text: `✅ Cookies salvos! Reinicie com *!reiniciar*\n\n` +
                `💡 *Para o cookie sobreviver a qualquer restart:* use *!cookieb64* + o conteudo, e cole o base64 gerado no painel PhanomCloud como *YOUTUBE_COOKIES_B64*`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro ao salvar: ${e.message}` });
      }
      break;
    }

    case 'delcookie': {
      try {
        if (fs.existsSync(COOKIE_PATH)) fs.unlinkSync(COOKIE_PATH);
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          delete cfg.cookieBase64;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, { text: '✅ Cookies removidos' });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }

    case 'cookieb64': {
      if (!args.length) {
        return await sock.sendMessage(jid, {
          text: `📋 *Gerar base64 dos cookies*\n\nEnvie: *cookieb64* + o conteudo do cookies.txt\n\nO base64 gerado voce cola no painel PhanomCloud como a variavel *YOUTUBE_COOKIES_B64*`
        });
      }
      const input = args.join(' ');
      if (input.length < 50) {
        return await sock.sendMessage(jid, { text: '❌ Conteudo muito curto. Cole todo o conteudo do cookies.txt' });
      }
      const b64 = Buffer.from(input, 'utf-8').toString('base64');
      await sock.sendMessage(jid, {
        text: `✅ *Base64 gerado!*\n\n` +
              `Copie o valor abaixo e cole no painel PhanomCloud:\n` +
              `*Variavel:* YOUTUBE_COOKIES_B64\n\n` +
              `\`\`\`${b64}\`\`\``
      });
      break;
    }
  }
}

module.exports = { handleUpdate, updateCommands };
