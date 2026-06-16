const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const updater = require('../lib/updater');
const { safeRestart } = require('../lib/restart');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies.txt');
const updateCommands = ['update', 'updateytdlp', 'upgrade', 'versão', 'versao', 'rollback', 'meunúmero', 'addcookie', 'delcookie', 'cookieb64', 'cookieinfo', 'cookie', 'warp', 'setproxy', 'delproxy', 'proxytest', 'proxyauto', 'meuownerb64'];

function progressBar(pct, width = 12) {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

async function handleUpdate(sock, { jid, sender, text, prefix, args, commandName, msg }) {
  if (commandName === 'meunúmero') {
    await sock.sendMessage(jid, {
      text: `╭─── *「 INFORMACOES DO USUARIO 」* ───╮\n` +
            `│ 👤 *Nome:* ${msg.pushName || 'N/A'}\n` +
            `│ 📱 *JID:* ${sender}\n` +
            `│ 🔍 *Configurado:* ${config.ownerNumbers.some(n => sender.startsWith(n.split('@')[0])) ? '✅ SIM' : '❌ NAO'}\n` +
            `│ 👑 *Dono:* ${await isOwner(sender, sock) ? '✅ SIM' : '❌ NAO'}\n` +
            `╰──────────────────────────────────╯`
    });
    return;
  }

  if (commandName === 'meuownerb64') {
    await sock.sendMessage(jid, {
      text: `╭─── *「 DADOS DO DONO 」* ───╮\n` +
            `│ 📱 *Seu número:* ${sender.split('@')[0]}\n` +
            `│\n` +
            `│ Cole no painel como *BOT_OWNERS*:\n` +
            `│ \`${sender.split('@')[0]}\`\n` +
            `│\n` +
            `│ Multiplos: separados por virgula\n` +
            `╰────────────────────────╯`
    });
    return;
  }

  const owner = await isOwner(sender, sock);
  if (!owner) {
    await sock.sendMessage(jid, { text: '❌ *Acesso negado.* Apenas o dono do bot pode usar este comando.' });
    return;
  }

  if (!config.githubRepo) {
    await sock.sendMessage(jid, { text: '❌ *Repositorio nao configurado.* Defina *githubRepo* no config.json' });
    return;
  }

  switch (commandName) {
    case 'versão': {
      const local = updater.getCurrentVersion();
      const latest = updater.getLatestVersion();
      const state = updater.getState();
      const hasUpdate = state.latestVersion !== local;

      let txt = `╭─── *「 STATUS DO SISTEMA 」* ───╮\n`;
      txt += `│ 📦 *Versao local:* v${local}\n`;
      txt += `│ 🎯 *Ultima disponivel:* v${latest}\n`;
      txt += `│ 🔄 *Estado:* ${state.state === 'idle' ? '✅ Ocioso' : '⚡ ' + state.state}\n`;
      txt += `│ ${hasUpdate ? '📢 *Nova versao disponivel!*' : '✅ *Sistema atualizado*'}\n`;
      txt += `╰──────────────────────────────────╯\n`;

      if (hasUpdate) {
        const changelog = await updater.getChangelog();
        if (changelog) {
          const lines = changelog.split('\n').slice(0, 8).join('\n');
          txt += `\n📋 *Changelog (v${latest}):*\n\`\`\`${lines}\`\`\`\n`;
        }
        txt += `\n💡 Use \`!update\` para atualizar`;
      }
      await sock.sendMessage(jid, { text: txt });
      break;
    }

    case 'update': {
      const doForce = args[0]?.toLowerCase() === 'force';

      if (doForce) {
        await sock.sendMessage(jid, {
          text: `╭─── *「 ATUALIZACAO INICIADA 」* ───╮\n` +
                `│ 📦 v${updater.getCurrentVersion()} → v${updater.getLatestVersion()}\n` +
                `│ ⏳ Baixando arquivos...\n` +
                `│ 📊 Acompanhe pelo painel web\n` +
                `╰─────────────────────────────────────╯`
        });

        sock.sendPresenceUpdate('recording', jid);

        try {
          const result = await updater.performUpdate();
          const pct = progressBar(100);
          await sock.sendMessage(jid, {
            text: `╭─── *「 ATUALIZACAO CONCLUIDA 」* ───╮\n` +
                  `│ ${pct} 100%\n` +
                  `│ 📦 *v${result.targetVer}*\n` +
                  `│ ✅ *${result.filesSuccess} arquivos* atualizados\n` +
                  `${result.filesFailed > 0 ? `│ ⚠️ *${result.filesFailed} falhas*\n` : ''}` +
                  `│ 🔄 *Reiniciando em 3 segundos...*\n` +
                  `╰──────────────────────────────────────╯`
          });
          setTimeout(() => safeRestart(), 3000);
        } catch (e) {
          await sock.sendMessage(jid, {
            text: `╭─── *「 ERRO NA ATUALIZACAO 」* ───╮\n` +
                  `│ ❌ ${e.message.slice(0, 100)}\n` +
                  `│ 🔄 Backup restaurado automaticamente\n` +
                  `╰──────────────────────────────────╯`
          });
        }
        return;
      }

      const result = await updater.checkForUpdates();
      if (!result || result.error) {
        await sock.sendMessage(jid, {
          text: `╭─── *「 ERRO NA VERIFICACAO 」* ───╮\n` +
                `│ ❌ ${result?.error || 'Falha ao contactar GitHub'}\n` +
                `╰──────────────────────────────────╯`
        });
        return;
      }

      if (result.current) {
        await sock.sendMessage(jid, {
          text: `╭─── *「 SISTEMA ATUALIZADO 」* ───╮\n` +
                `│ ✅ v${updater.getCurrentVersion()}\n` +
                `│ 📌 Voce ja esta na versao mais recente\n` +
                `╰──────────────────────────────────╯`
        });
        return;
      }

      if (result.hasUpdate) {
        const changelog = await updater.getChangelog();
        let txt = `╭─── *「 NOVA VERSAO DISPONIVEL 」* ───╮\n`;
        txt += `│ 📦 *Atual:* v${updater.getCurrentVersion()}\n`;
        txt += `│ 🎯 *Nova:* v${result.version}\n`;
        txt += `│ 📅 *Publicada:* ${new Date(result.published_at).toLocaleDateString('pt-BR')}\n`;
        txt += `│\n`;
        if (changelog) {
          const lines = changelog.split('\n').slice(0, 5).join('\n│ ');
          txt += `│ 📋 *Novidades:*\n│ ${lines}\n│\n`;
        }
        txt += `│ 💡 Confirme com: \`!update force\`\n`;
        txt += `╰─────────────────────────────────────────╯`;
        await sock.sendMessage(jid, { text: txt });
      }
      break;
    }

    case 'updateytdlp':
    case 'upgrade': {
      await sock.sendMessage(jid, {
        text: `╭─── *「 ATUALIZANDO YT-DLP 」* ───╮\n` +
              `│ ⏳ Baixando ultima versao nightly...\n` +
              `╰──────────────────────────────────╯`
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
          text: `╭─── *「 YT-DLP ATUALIZADO 」* ───╮\n` +
                `│ ✅ ${clean || 'Sucesso!'}\n` +
                `│ 🔄 Reiniciando em 3 segundos...\n` +
                `╰──────────────────────────────────╯`
        });
        setTimeout(() => safeRestart(), 3000);
      } catch (e) {
        await sock.sendMessage(jid, {
          text: `╭─── *「 ERRO NO YT-DLP 」* ───╮\n` +
                `│ ❌ ${e.message.slice(0, 150)}\n` +
                `╰──────────────────────────────╯`
        });
      }
      break;
    }

    case 'rollback': {
      await sock.sendMessage(jid, {
        text: `╭─── *「 RESTAURANDO BACKUP 」* ───╮\n` +
              `│ ⏳ Restaurando ultimo backup...\n` +
              `╰──────────────────────────────────╯`
      });
      try {
        const result = await updater.rollback();
        await sock.sendMessage(jid, {
          text: `╭─── *「 BACKUP RESTAURADO 」* ───╮\n` +
                `│ 💾 *Backup:* ${result.backup}\n` +
                `│ 📁 *${result.files} arquivos* restaurados\n` +
                `│ 🔄 Reiniciando em 3 segundos...\n` +
                `╰──────────────────────────────────╯`
        });
        setTimeout(() => safeRestart(), 3000);
      } catch (e) {
        await sock.sendMessage(jid, {
          text: `╭─── *「 ERRO NO ROLLBACK 」* ───╮\n` +
                `│ ❌ ${e.message.slice(0, 150)}\n` +
                `╰──────────────────────────────────╯`
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
        text: `╭─── *「 DIAGNOSTICO DE COOKIES 」* ───╮\n` +
              `│ 📁 *Arquivo:* ${cookieExists ? '✅ EXISTE' : '❌ AUSENTE'}\n` +
              `│ 📏 *Tamanho:* ${formatBytes(cookieSize)}\n` +
              `│ 🔑 *LOGIN_INFO:* ${loginfo ? '✅ PRESENTE' : '❌ AUSENTE'}\n` +
              `│ ⚙️ *cookieBase64 cfg:* ${hasB64 ? '✅ PRESENTE' : '❌ AUSENTE'}\n` +
              `│ 🌍 *Env var:* ${envSet ? '✅ CONFIGURADA' : '❌ AUSENTE'}\n` +
              `╰────────────────────────────────────────╯`
      });
      break;
    }

    case 'addcookie': {
      if (!args.length) {
        return await sock.sendMessage(jid, {
          text: `╭─── *「 CONFIGURAR COOKIES 」* ───╮\n` +
                `│ 📋 *Como usar:*\n` +
                `│ 1. Instale "Get cookies.txt"\n` +
                `│ 2. Faca login no YouTube\n` +
                `│ 3. Exporte os cookies\n` +
                `│ 4. Envie: *addcookie* + conteudo\n` +
                `│\n` +
                `│ 📎 Ou envie o arquivo com *!cookie*\n` +
                `╰──────────────────────────────────╯`
        });
      }
      const input = text.slice(prefix.length + commandName.length).trim();
      if (input.length < 50) {
        return await sock.sendMessage(jid, { text: '❌ *Conteudo muito curto.* Copie todo o cookies.txt' });
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
          text: `╭─── *「 COOKIES SALVOS 」* ───╮\n` +
                `│ ✅ Cookies exportados\n` +
                `│ 📏 ${formatBytes(Buffer.byteLength(input, 'utf-8'))}\n` +
                `│ 🔄 Reinicie com *!reiniciar*\n` +
                `╰──────────────────────────────╯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro:* ${e.message}` });
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
        await sock.sendMessage(jid, { text: '✅ *Cookies removidos com sucesso*' });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro:* ${e.message}` });
      }
      break;
    }

    case 'cookieb64': {
      if (!args.length) {
        return await sock.sendMessage(jid, {
          text: `╭─── *「 GERAR BASE64 」* ───╮\n` +
                `│ Envie: *cookieb64* + conteudo\n` +
                `│ do cookies.txt\n` +
                `│\n` +
                `│ Cole o resultado no painel como\n` +
                `│ *YOUTUBE_COOKIES_B64*\n` +
                `╰────────────────────────────╯`
        });
      }
      const input = text.slice(prefix.length + commandName.length).trim();
      if (input.length < 50) {
        return await sock.sendMessage(jid, { text: '❌ *Conteudo muito curto*' });
      }
      const b64 = Buffer.from(input, 'utf-8').toString('base64');
      const chunks = [];
      for (let i = 0; i < b64.length; i += 2000) {
        chunks.push(b64.slice(i, i + 2000));
      }
      await sock.sendMessage(jid, {
        text: `╭─── *「 BASE64 GERADO 」* ───╮\n` +
              `│ 📏 ${formatBytes(Buffer.byteLength(input, 'utf-8'))}\n` +
              `│ Cole no painel como:\n` +
              `│ *YOUTUBE_COOKIES_B64*\n` +
              `╰──────────────────────────────╯\n\n` +
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
          text: `╭─── *「 ENVIAR COOKIES 」* ───╮\n` +
                `│ Envie o arquivo cookies.txt\n` +
                `│ com a legenda *!cookie*\n` +
                `│\n` +
                `│ O bot salva automaticamente\n` +
                `╰──────────────────────────────╯`
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
          text: `╭─── *「 COOKIES SALVOS 」* ───╮\n` +
                `│ 📏 ${formatBytes(size)}\n` +
                `│ 🔑 LOGIN_INFO: ${hasLogin ? '✅ SIM' : '❌ NAO'}\n` +
                `│ 🔄 Reinicie com *!reiniciar*\n` +
                `╰──────────────────────────────╯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro:* ${e.message}` });
      }
      break;
    }

    case 'warp': {
      try {
        await sock.sendMessage(jid, {
          text: `╭─── *「 CLOUDFLARE WARP 」* ───╮\n` +
                `│ ⏳ Baixando warp-plus...\n` +
                `│ 📡 Porta SOCKS5: 40000\n` +
                `╰────────────────────────────────╯`
        });
        const { execFile, spawn } = require('child_process');
        const https = require('https');
        const warpDir = path.join(__dirname, '..', 'bin');
        if (!fs.existsSync(warpDir)) fs.mkdirSync(warpDir, { recursive: true });
        const warpBin = path.join(warpDir, 'warp-plus');
        if (!fs.existsSync(warpBin)) {
          await sock.sendMessage(jid, { text: '⬇️ *Baixando binario...*' });
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
          await sock.sendMessage(jid, { text: `✅ *warp-plus baixado* (${(fs.statSync(warpBin).size / 1024 / 1024).toFixed(1)} MB)` });
        }
        await sock.sendMessage(jid, { text: '🔄 *Iniciando WARP SOCKS5* na porta 40000...' });
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
          return await sock.sendMessage(jid, { text: `❌ *warp-plus parou:*\n\`\`\`${warpOut.slice(0, 400)}\`\`\`` });
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
          text: `╭─── *「 WARP ATIVADO 」* ───╮\n` +
                `│ 🔗 *SOCKS5:*\n` +
                `│ socks5://127.0.0.1:40000\n` +
                `│ 📋 ${(warpOut || '(vazio)').slice(0, 200)}\n` +
                `│\n` +
                `│ ✅ Teste com *!play*\n` +
                `╰────────────────────────────╯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro WARP:* ${e.message}` });
      }
      break;
    }

    case 'proxyauto':
    case 'proxytest': {
      await sock.sendMessage(jid, {
        text: `╭─── *「 TESTANDO PROXIES BR 」* ───╮\n` +
              `│ 🔍 Testando 10 proxies SOCKS5...\n` +
              `│ ⏳ Isso leva ate 60 segundos\n` +
              `╰───────────────────────────────────╯`
      });
      const proxies = [
        { addr: 'socks5://104.207.49.72:3128',       name: '3xK Tech (SP)' },
        { addr: 'socks5://201.17.134.184:80',         name: 'Claro NXT (MG)' },
        { addr: 'socks5://157.185.173.217:26589',     name: 'Meteverse (SP)' },
        { addr: 'socks5://186.192.78.58:8080',        name: 'AtualNet (CE)' },
        { addr: 'socks5://177.72.115.17:31164',       name: 'Prompt Brasil (SP)' },
        { addr: 'socks5://131.72.191.107:61740',      name: 'Telecab (RN)' },
        { addr: 'socks5://186.251.255.249:31337',     name: 'Seanet (RS)' },
        { addr: 'socks5://187.19.127.253:4153',       name: 'Unidasnet (PB)' },
        { addr: 'socks5://138.94.92.26:7497',         name: 'Facilnet (RN)' },
        { addr: 'socks5://191.252.103.221:40229',     name: 'Locaweb (AM)' },
      ];
      const ytDlpBin = path.join(__dirname, '..', 'bin', 'yt-dlp');
      const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const results = [];
      for (let i = 0; i < proxies.length; i++) {
        const p = proxies[i];
        let resultText = `⏳ Testando ${i + 1}/10 ${p.name}...`;
        if (i === 0 || (i + 1) % 3 === 0) {
          await sock.sendMessage(jid, { text: resultText }).catch(() => {});
        }
        try {
          const start = Date.now();
          const { execFile } = require('child_process');
          const out = await new Promise((resolve, reject) => {
            const child = execFile(ytDlpBin, [
              '--no-warnings', '--no-playlist', '--socket-timeout', '10',
              '--proxy', p.addr,
              '--force-ipv4',
              '--dump-json', testUrl
            ], { timeout: 15000, maxBuffer: 1024 }, (err, stdout) => {
              if (err) reject(new Error(err.message));
              else resolve(stdout);
            });
            child.on('error', reject);
          });
          const json = JSON.parse(out);
          const elapsed = Date.now() - start;
          results.push({ ...p, latency: elapsed, title: json.title, ok: true });
        } catch {
          results.push({ ...p, latency: Infinity, ok: false });
        }
      }
      const working = results.filter(r => r.ok).sort((a, b) => a.latency - b.latency);
      if (working.length === 0) {
        return await sock.sendMessage(jid, {
          text: `╭─── *「 PROXIES - RESULTADO 」* ───╮\n` +
                `│ ❌ Nenhum proxy funcionou.\n` +
                `│ 💡 Tente WARP: \`!warp\`\n` +
                `╰────────────────────────────────────╯`
        });
      }
      let txt = `╭─── *「 PROXIES FUNCIONANDO 」* ───╮\n`;
      txt += `│ ✅ ${working.length}/${results.length} ativos\n│\n`;
      for (const r of working.slice(0, 5)) {
        const ms = r.latency < 1000 ? `${r.latency}ms` : `${(r.latency / 1000).toFixed(1)}s`;
        txt += `│ 🥇 *${r.name}*\n│    ⚡ ${ms} — ${r.title?.slice(0, 30)}\n│\n`;
      }
      if (working.length > 5) txt += `│ ... +${working.length - 5} proxies\n│\n`;
      const best = working[0];
      txt += `│ 🔗 *Proxy rapido:*\`\`\`${best.addr}\`\`\`\n`;
      txt += `│ 💡 Use \`!proxyauto\` para ativar\n`;
      txt += `╰──────────────────────────────────────╯`;
      await sock.sendMessage(jid, { text: txt });

      if (commandName === 'proxyauto' && best) {
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.youtubeProxy = best.addr;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, {
          text: `╭─── *「 PROXY AUTO-CONFIGURADO 」* ───╮\n` +
                `│ 🔗 ${best.addr}\n` +
                `│ ⚡ ${best.latency}ms de latencia\n` +
                `│ 🎵 Video teste: ${best.title?.slice(0, 40)}\n` +
                `│ 🔄 Reinicie com *!reiniciar*\n` +
                `╰──────────────────────────────────────╯`
        });
      }
      break;
    }

    case 'setproxy': {
      const proxyUrl = args.join(' ').trim();
      if (!proxyUrl) {
        return await sock.sendMessage(jid, {
          text: `╭─── *「 CONFIGURAR PROXY 」* ───╮\n` +
                `│ Envie: *setproxy* <url>\n` +
                `│\n` +
                `│ Exemplos:\n` +
                `│ HTTP: http://user:pass@host:port\n` +
                `│ SOCKS5: socks5://host:1080\n` +
                `│\n` +
                `│ Para remover: *delproxy*\n` +
                `╰──────────────────────────────────╯`
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
          text: `╭─── *「 PROXY CONFIGURADO 」* ───╮\n` +
                `│ 🔗 ${proxyUrl}\n` +
                `│ 🔄 Reinicie com *!reiniciar*\n` +
                `╰──────────────────────────────────╯`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro:* ${e.message}` });
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
        await sock.sendMessage(jid, { text: '✅ *Proxy removido com sucesso*' });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro:* ${e.message}` });
      }
      break;
    }
  }
}

module.exports = { handleUpdate, updateCommands };
