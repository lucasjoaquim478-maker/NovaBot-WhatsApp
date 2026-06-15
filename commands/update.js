const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const updater = require('../lib/updater');
const { safeRestart } = require('../lib/restart');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies.txt');
const updateCommands = ['update', 'updateytdlp', 'upgrade', 'versÃ£o', 'versao', 'rollback', 'meunÃºmero', 'addcookie', 'delcookie', 'cookieb64', 'cookieinfo', 'cookie', 'warp', 'setproxy', 'delproxy', 'meuownerb64'];

function progressBar(pct, width = 12) {
  const filled = Math.round((pct / 100) * width);
  return 'â–ˆ'.repeat(filled) + 'â–‘'.repeat(width - filled);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

async function handleUpdate(sock, { jid, sender, text, prefix, args, commandName, msg }) {
  if (commandName === 'meunÃºmero') {
    await sock.sendMessage(jid, {
      text: `â•­â”€â”€â”€ *ã€Œ INFORMACOES DO USUARIO ã€* â”€â”€â”€â•®\n` +
            `â”‚ ðŸ‘¤ *Nome:* ${msg.pushName || 'N/A'}\n` +
            `â”‚ ðŸ“± *JID:* ${sender}\n` +
            `â”‚ ðŸ” *Configurado:* ${config.ownerNumbers.some(n => sender.startsWith(n.split('@')[0])) ? 'âœ… SIM' : 'âŒ NAO'}\n` +
            `â”‚ ðŸ‘‘ *Dono:* ${await isOwner(sender, sock) ? 'âœ… SIM' : 'âŒ NAO'}\n` +
            `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
    });
    return;
  }

  if (commandName === 'meuownerb64') {
    await sock.sendMessage(jid, {
      text: `â•­â”€â”€â”€ *ã€Œ DADOS DO DONO ã€* â”€â”€â”€â•®\n` +
            `â”‚ ðŸ“± *Seu nÃºmero:* ${sender.split('@')[0]}\n` +
            `â”‚\n` +
            `â”‚ Cole no painel como *BOT_OWNERS*:\n` +
            `â”‚ \`${sender.split('@')[0]}\`\n` +
            `â”‚\n` +
            `â”‚ Multiplos: separados por virgula\n` +
            `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
    });
    return;
  }

  const owner = await isOwner(sender, sock);
  if (!owner) {
    await sock.sendMessage(jid, { text: 'âŒ *Acesso negado.* Apenas o dono do bot pode usar este comando.' });
    return;
  }

  if (!config.githubRepo) {
    await sock.sendMessage(jid, { text: 'âŒ *Repositorio nao configurado.* Defina *githubRepo* no config.json' });
    return;
  }

  switch (commandName) {
    case 'versÃ£o': {
      const local = updater.getCurrentVersion();
      const latest = updater.getLatestVersion();
      const state = updater.getState();
      const hasUpdate = state.latestVersion !== local;

      let txt = `â•­â”€â”€â”€ *ã€Œ STATUS DO SISTEMA ã€* â”€â”€â”€â•®\n`;
      txt += `â”‚ ðŸ“¦ *Versao local:* v${local}\n`;
      txt += `â”‚ ðŸŽ¯ *Ultima disponivel:* v${latest}\n`;
      txt += `â”‚ ðŸ”„ *Estado:* ${state.state === 'idle' ? 'âœ… Ocioso' : 'âš¡ ' + state.state}\n`;
      txt += `â”‚ ${hasUpdate ? 'ðŸ“¢ *Nova versao disponivel!*' : 'âœ… *Sistema atualizado*'}\n`;
      txt += `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯\n`;

      if (hasUpdate) {
        const changelog = await updater.getChangelog();
        if (changelog) {
          const lines = changelog.split('\n').slice(0, 8).join('\n');
          txt += `\nðŸ“‹ *Changelog (v${latest}):*\n\`\`\`${lines}\`\`\`\n`;
        }
        txt += `\nðŸ’¡ Use \`!update\` para atualizar`;
      }
      await sock.sendMessage(jid, { text: txt });
      break;
    }

    case 'update': {
      const doForce = args[0]?.toLowerCase() === 'force';

      if (doForce) {
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ ATUALIZACAO INICIADA ã€* â”€â”€â”€â•®\n` +
                `â”‚ ðŸ“¦ v${updater.getCurrentVersion()} â†’ v${updater.getLatestVersion()}\n` +
                `â”‚ â³ Baixando arquivos...\n` +
                `â”‚ ðŸ“Š Acompanhe pelo painel web\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });

        sock.sendPresenceUpdate('recording', jid);

        try {
          const result = await updater.performUpdate();
          const pct = progressBar(100);
          await sock.sendMessage(jid, {
            text: `â•­â”€â”€â”€ *ã€Œ ATUALIZACAO CONCLUIDA ã€* â”€â”€â”€â•®\n` +
                  `â”‚ ${pct} 100%\n` +
                  `â”‚ ðŸ“¦ *v${result.targetVer}*\n` +
                  `â”‚ âœ… *${result.filesSuccess} arquivos* atualizados\n` +
                  `${result.filesFailed > 0 ? `â”‚ âš ï¸ *${result.filesFailed} falhas*\n` : ''}` +
                  `â”‚ ðŸ”„ *Reiniciando em 3 segundos...*\n` +
                  `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
          });
          setTimeout(() => safeRestart(), 3000);
        } catch (e) {
          await sock.sendMessage(jid, {
            text: `â•­â”€â”€â”€ *ã€Œ ERRO NA ATUALIZACAO ã€* â”€â”€â”€â•®\n` +
                  `â”‚ âŒ ${e.message.slice(0, 100)}\n` +
                  `â”‚ ðŸ”„ Backup restaurado automaticamente\n` +
                  `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
          });
        }
        return;
      }

      const result = await updater.checkForUpdates();
      if (!result || result.error) {
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ ERRO NA VERIFICACAO ã€* â”€â”€â”€â•®\n` +
                `â”‚ âŒ ${result?.error || 'Falha ao contactar GitHub'}\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
        return;
      }

      if (result.current) {
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ SISTEMA ATUALIZADO ã€* â”€â”€â”€â•®\n` +
                `â”‚ âœ… v${updater.getCurrentVersion()}\n` +
                `â”‚ ðŸ“Œ Voce ja esta na versao mais recente\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
        return;
      }

      if (result.hasUpdate) {
        const changelog = await updater.getChangelog();
        let txt = `â•­â”€â”€â”€ *ã€Œ NOVA VERSAO DISPONIVEL ã€* â”€â”€â”€â•®\n`;
        txt += `â”‚ ðŸ“¦ *Atual:* v${updater.getCurrentVersion()}\n`;
        txt += `â”‚ ðŸŽ¯ *Nova:* v${result.version}\n`;
        txt += `â”‚ ðŸ“… *Publicada:* ${new Date(result.published_at).toLocaleDateString('pt-BR')}\n`;
        txt += `â”‚\n`;
        if (changelog) {
          const lines = changelog.split('\n').slice(0, 5).join('\nâ”‚ ');
          txt += `â”‚ ðŸ“‹ *Novidades:*\nâ”‚ ${lines}\nâ”‚\n`;
        }
        txt += `â”‚ ðŸ’¡ Confirme com: \`!update force\`\n`;
        txt += `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`;
        await sock.sendMessage(jid, { text: txt });
      }
      break;
    }

    case 'updateytdlp':
    case 'upgrade': {
      await sock.sendMessage(jid, {
        text: `â•­â”€â”€â”€ *ã€Œ ATUALIZANDO YT-DLP ã€* â”€â”€â”€â•®\n` +
              `â”‚ â³ Baixando ultima versao nightly...\n` +
              `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
      });
      try {
        const { execFile } = require('child_process');
        const ytDlpPath = path.join(__dirname, '..', 'bin', 'yt-dlp');
        const result = await new Promise((resolve, reject) => {
          const child = execFile(ytDlpPath, ['--update-to', 'nightly'], { timeout: 120000 }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr || err.message));
            else resolve(stdout);
          });
          child.on('error', reject);
        });
        const clean = result.split('\n').filter(l => l.trim()).slice(0, 3).join('\n');
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ YT-DLP ATUALIZADO ã€* â”€â”€â”€â•®\n` +
                `â”‚ âœ… ${clean || 'Sucesso!'}\n` +
                `â”‚ ðŸ”„ Reiniciando em 3 segundos...\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
        setTimeout(() => safeRestart(), 3000);
      } catch (e) {
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ ERRO NO YT-DLP ã€* â”€â”€â”€â•®\n` +
                `â”‚ âŒ ${e.message.slice(0, 150)}\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      }
      break;
    }

    case 'rollback': {
      await sock.sendMessage(jid, {
        text: `â•­â”€â”€â”€ *ã€Œ RESTAURANDO BACKUP ã€* â”€â”€â”€â•®\n` +
              `â”‚ â³ Restaurando ultimo backup...\n` +
              `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
      });
      try {
        const result = await updater.rollback();
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ BACKUP RESTAURADO ã€* â”€â”€â”€â•®\n` +
                `â”‚ ðŸ’¾ *Backup:* ${result.backup}\n` +
                `â”‚ ðŸ“ *${result.files} arquivos* restaurados\n` +
                `â”‚ ðŸ”„ Reiniciando em 3 segundos...\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
        setTimeout(() => safeRestart(), 3000);
      } catch (e) {
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ ERRO NO ROLLBACK ã€* â”€â”€â”€â•®\n` +
                `â”‚ âŒ ${e.message.slice(0, 150)}\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
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
        text: `â•­â”€â”€â”€ *ã€Œ DIAGNOSTICO DE COOKIES ã€* â”€â”€â”€â•®\n` +
              `â”‚ ðŸ“ *Arquivo:* ${cookieExists ? 'âœ… EXISTE' : 'âŒ AUSENTE'}\n` +
              `â”‚ ðŸ“ *Tamanho:* ${formatBytes(cookieSize)}\n` +
              `â”‚ ðŸ”‘ *LOGIN_INFO:* ${loginfo ? 'âœ… PRESENTE' : 'âŒ AUSENTE'}\n` +
              `â”‚ âš™ï¸ *cookieBase64 cfg:* ${hasB64 ? 'âœ… PRESENTE' : 'âŒ AUSENTE'}\n` +
              `â”‚ ðŸŒ *Env var:* ${envSet ? 'âœ… CONFIGURADA' : 'âŒ AUSENTE'}\n` +
              `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
      });
      break;
    }

    case 'addcookie': {
      if (!args.length) {
        return await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ CONFIGURAR COOKIES ã€* â”€â”€â”€â•®\n` +
                `â”‚ ðŸ“‹ *Como usar:*\n` +
                `â”‚ 1. Instale "Get cookies.txt"\n` +
                `â”‚ 2. Faca login no YouTube\n` +
                `â”‚ 3. Exporte os cookies\n` +
                `â”‚ 4. Envie: *addcookie* + conteudo\n` +
                `â”‚\n` +
                `â”‚ ðŸ“Ž Ou envie o arquivo com *!cookie*\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      }
      const input = text.slice(prefix.length + commandName.length).trim();
      if (input.length < 50) {
        return await sock.sendMessage(jid, { text: 'âŒ *Conteudo muito curto.* Copie todo o cookies.txt' });
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
          text: `â•­â”€â”€â”€ *ã€Œ COOKIES SALVOS ã€* â”€â”€â”€â•®\n` +
                `â”‚ âœ… Cookies exportados\n` +
                `â”‚ ðŸ“ ${formatBytes(Buffer.byteLength(input, 'utf-8'))}\n` +
                `â”‚ ðŸ”„ Reinicie com *!reiniciar*\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `âŒ *Erro:* ${e.message}` });
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
        await sock.sendMessage(jid, { text: 'âœ… *Cookies removidos com sucesso*' });
      } catch (e) {
        await sock.sendMessage(jid, { text: `âŒ *Erro:* ${e.message}` });
      }
      break;
    }

    case 'cookieb64': {
      if (!args.length) {
        return await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ GERAR BASE64 ã€* â”€â”€â”€â•®\n` +
                `â”‚ Envie: *cookieb64* + conteudo\n` +
                `â”‚ do cookies.txt\n` +
                `â”‚\n` +
                `â”‚ Cole o resultado no painel como\n` +
                `â”‚ *YOUTUBE_COOKIES_B64*\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      }
      const input = text.slice(prefix.length + commandName.length).trim();
      if (input.length < 50) {
        return await sock.sendMessage(jid, { text: 'âŒ *Conteudo muito curto*' });
      }
      const b64 = Buffer.from(input, 'utf-8').toString('base64');
      const chunks = [];
      for (let i = 0; i < b64.length; i += 2000) {
        chunks.push(b64.slice(i, i + 2000));
      }
      await sock.sendMessage(jid, {
        text: `â•­â”€â”€â”€ *ã€Œ BASE64 GERADO ã€* â”€â”€â”€â•®\n` +
              `â”‚ ðŸ“ ${formatBytes(Buffer.byteLength(input, 'utf-8'))}\n` +
              `â”‚ Cole no painel como:\n` +
              `â”‚ *YOUTUBE_COOKIES_B64*\n` +
              `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯\n\n` +
              `\`${chunks[0]}\`${chunks.length > 1 ? `\n*(+${chunks.length - 1} partes, veja no console)*` : ''}`
      });
      if (chunks.length > 1) {
        console.log('[COOKIE B64] Conteudo completo:');
        console.log(b64);
      }
      break;
    }

    case 'cookie': {
      const docMsg = msg.message?.documentMessage;
      if (!docMsg) {
        return await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ ENVIAR COOKIES ã€* â”€â”€â”€â•®\n` +
                `â”‚ Envie o arquivo cookies.txt\n` +
                `â”‚ com a legenda *!cookie*\n` +
                `â”‚\n` +
                `â”‚ O bot salva automaticamente\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      }
      try {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(docMsg, 'document');
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(COOKIE_PATH, buffer);
        const b64 = buffer.toString('base64');
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.cookiesPath = 'cookies.txt';
          cfg.cookieBase64 = b64;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        const size = buffer.length;
        const hasLogin = buffer.toString('utf-8').includes('LOGIN_INFO');
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ COOKIES SALVOS ã€* â”€â”€â”€â•®\n` +
                `â”‚ ðŸ“ ${formatBytes(size)}\n` +
                `â”‚ ðŸ”‘ LOGIN_INFO: ${hasLogin ? 'âœ… SIM' : 'âŒ NAO'}\n` +
                `â”‚ ðŸ”„ Reinicie com *!reiniciar*\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `âŒ *Erro:* ${e.message}` });
      }
      break;
    }

    case 'warp': {
      try {
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ CLOUDFLARE WARP ã€* â”€â”€â”€â•®\n` +
                `â”‚ â³ Baixando warp-plus...\n` +
                `â”‚ ðŸ“¡ Porta SOCKS5: 40000\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
        const { execFile, spawn } = require('child_process');
        const https = require('https');
        const warpDir = path.join(__dirname, '..', 'bin');
        if (!fs.existsSync(warpDir)) fs.mkdirSync(warpDir, { recursive: true });
        const warpBin = path.join(warpDir, 'warp-plus');
        if (!fs.existsSync(warpBin)) {
          await sock.sendMessage(jid, { text: 'â¬‡ï¸ *Baixando binario...*' });
          const tmpDir = path.join(warpDir, '.warp-dl');
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const tarball = path.join(tmpDir, 'warp.tar.gz');
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Download timeout (60s)')), 60000);
            https.get('https://api.github.com/repos/bepass-org/warp-plus/releases/latest', { headers: { 'User-Agent': 'NovaBot' } }, (res) => {
              let body = '';
              res.on('data', (c) => body += c);
              res.on('end', () => {
                try {
                  const data = JSON.parse(body);
                  const assets = data.assets || [];
                  let assetUrl = null;
                  for (const a of assets) {
                    if (a.name && a.name.includes('linux-amd64') && a.name.endsWith('.tar.gz')) { assetUrl = a.browser_download_url; break; }
                  }
                  if (!assetUrl) {
                    for (const a of assets) {
                      if (a.name && a.name.includes('linux-amd64') && a.name.endsWith('.zip')) { assetUrl = a.browser_download_url; break; }
                    }
                  }
                  if (!assetUrl && assets.length) assetUrl = assets[0].browser_download_url;
                  if (!assetUrl) { clearTimeout(timeout); reject(new Error('Nenhum asset encontrado')); return; }
                  const isZip = assetUrl.endsWith('.zip');
                  const dl = (u, dest) => {
                    const f = fs.createWriteStream(dest);
                    https.get(u, (r) => {
                      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
                        f.close(); try { fs.unlinkSync(dest); } catch {}
                        return dl(r.headers.location, dest);
                      }
                      r.pipe(f);
                      f.on('finish', () => { clearTimeout(timeout); f.close(resolve); });
                    }).on('error', (e) => { clearTimeout(timeout); try { f.close(); fs.unlinkSync(dest); } catch {} reject(e); });
                  };
                  dl(assetUrl, tarball);
                } catch (e) { clearTimeout(timeout); reject(e); }
              });
            }).on('error', (e) => { clearTimeout(timeout); reject(e); });
          });
          if (!fs.existsSync(tarball)) throw new Error('Download falhou');
          const isZip = (() => { try { const buf = Buffer.alloc(2); const fd = fs.openSync(tarball, 'r'); fs.readSync(fd, buf, 0, 2, 0); fs.closeSync(fd); return buf[0] === 0x50 && buf[1] === 0x4b; } catch { return false; } })();
          const isGz = (() => { try { const buf = Buffer.alloc(2); const fd = fs.openSync(tarball, 'r'); fs.readSync(fd, buf, 0, 2, 0); fs.closeSync(fd); return buf[0] === 0x1f && buf[1] === 0x8b; } catch { return false; } })();
          if (isGz) {
            await new Promise((resolve, reject) => {
              execFile('tar', ['-xzf', tarball, '-C', tmpDir], { timeout: 15000 }, (err) => err ? reject(err) : resolve());
            });
          } else if (isZip) {
            await new Promise((resolve, reject) => {
              execFile('unzip', ['-o', tarball, '-d', tmpDir], { timeout: 15000 }, (err) => err ? reject(err) : resolve());
            });
          } else {
            const destName = path.join(tmpDir, 'warp-plus');
            fs.copyFileSync(tarball, destName);
            fs.chmodSync(destName, 0o755);
          }
          const files = fs.readdirSync(tmpDir).filter(f => f !== 'warp.tar.gz' && !f.startsWith('.'));
          let found = false;
          for (const f of files) {
            const fp = path.join(tmpDir, f);
            if (fs.statSync(fp).isFile() && (fs.statSync(fp).mode & 0o111)) {
              fs.copyFileSync(fp, warpBin);
              fs.chmodSync(warpBin, 0o755);
              found = true;
              break;
            }
          }
          if (!found && files.length) {
            fs.copyFileSync(path.join(tmpDir, files[0]), warpBin);
            fs.chmodSync(warpBin, 0o755);
            found = true;
          }
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
          if (!fs.existsSync(warpBin)) throw new Error('Nao encontrou binario extraido');
          await sock.sendMessage(jid, { text: `âœ… *warp-plus baixado* (${(fs.statSync(warpBin).size / 1024 / 1024).toFixed(1)} MB)` });
        }
        await sock.sendMessage(jid, { text: 'ðŸ”„ *Iniciando WARP SOCKS5* na porta 40000...' });
        let warpOut = '';
        const proc = spawn(warpBin, ['--bind', '127.0.0.1:40000'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
        proc.stdout.on('data', (d) => { warpOut += d.toString(); });
        proc.stderr.on('data', (d) => { warpOut += d.toString(); });
        proc.unref();
        for (let i = 0; i < 12; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const dead = (() => { try { return proc.exitCode !== null; } catch { return true; } })();
          if (dead) break;
        }
        const isRunning = (() => { try { return proc.exitCode === null; } catch { return false; } })();
        if (!isRunning) {
          return await sock.sendMessage(jid, { text: `âŒ *warp-plus parou:*\n\`\`\`${warpOut.slice(0, 400)}\`\`\`` });
        }
        if (warpOut.includes('failed to register')) {
          const wd = path.join(os.homedir(), '.cache', 'warp-plus');
          try { fs.rmSync(wd, { recursive: true, force: true }); } catch {}
        }
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.youtubeProxy = 'socks5://127.0.0.1:40000';
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ WARP ATIVADO ã€* â”€â”€â”€â•®\n` +
                `â”‚ ðŸ”— *SOCKS5:*\n` +
                `â”‚ socks5://127.0.0.1:40000\n` +
                `â”‚ ðŸ“‹ ${(warpOut || '(vazio)').slice(0, 200)}\n` +
                `â”‚\n` +
                `â”‚ âœ… Teste com *!play*\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `âŒ *Erro WARP:* ${e.message}` });
      }
      break;
    }

    case 'setproxy': {
      const proxyUrl = args.join(' ').trim();
      if (!proxyUrl) {
        return await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ CONFIGURAR PROXY ã€* â”€â”€â”€â•®\n` +
                `â”‚ Envie: *setproxy* <url>\n` +
                `â”‚\n` +
                `â”‚ Exemplos:\n` +
                `â”‚ HTTP: http://user:pass@host:port\n` +
                `â”‚ SOCKS5: socks5://host:1080\n` +
                `â”‚\n` +
                `â”‚ Para remover: *delproxy*\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      }
      try {
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.youtubeProxy = proxyUrl;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, {
          text: `â•­â”€â”€â”€ *ã€Œ PROXY CONFIGURADO ã€* â”€â”€â”€â•®\n` +
                `â”‚ ðŸ”— ${proxyUrl}\n` +
                `â”‚ ðŸ”„ Reinicie com *!reiniciar*\n` +
                `â•°â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â•¯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `âŒ *Erro:* ${e.message}` });
      }
      break;
    }

    case 'delproxy': {
      try {
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          delete cfg.youtubeProxy;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, { text: 'âœ… *Proxy removido com sucesso*' });
      } catch (e) {
        await sock.sendMessage(jid, { text: `âŒ *Erro:* ${e.message}` });
      }
      break;
    }
  }
}

module.exports = { handleUpdate, updateCommands };
