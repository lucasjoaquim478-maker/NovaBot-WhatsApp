const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const updater = require('../lib/updater');
const { safeRestart } = require('../lib/restart');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies.txt');
const updateCommands = ['update', 'updateytdlp', 'upgrade', 'versão', 'versao', 'rollback', 'meunúmero', 'addcookie', 'delcookie', 'cookieb64', 'cookieinfo', 'cookie', 'warp', 'setproxy', 'delproxy'];

async function handleUpdate(sock, { jid, sender, text, prefix, args, commandName, msg }) {
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

    case 'updateytdlp':
    case 'upgrade': {
      await sock.sendMessage(jid, { text: '⚡ Atualizando yt-dlp para última versão nightly...' });
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
        await sock.sendMessage(jid, {
          text: `✅ *yt-dlp atualizado!*\n\n${result.slice(0, 500)}\n\n🔄 Reiniciando...`
        });
        setTimeout(() => safeRestart(), 3000);
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro ao atualizar yt-dlp: ${e.message}` });
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
      const input = text.slice(prefix.length + commandName.length).trim();
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
      const input = text.slice(prefix.length + commandName.length).trim();
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

    case 'cookie': {
      const docMsg = msg.message?.documentMessage;
      if (!docMsg) {
        return await sock.sendMessage(jid, {
          text: `📋 *Enviar cookies como arquivo*\n\n1. Exporte os cookies do YouTube com extensao "Get cookies.txt LOCALLY"\n2. Envie o arquivo *cookies.txt* com a legenda *!cookie*\n\nO bot vai salvar o arquivo automaticamente.`
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
          text: `✅ *Cookies salvos do arquivo!*\n\n📁 Tamanho: ${size} bytes\n🔑 LOGIN_INFO: ${hasLogin ? 'PRESENTE' : 'AUSENTE'}\n\n🔄 Reinicie com *!reiniciar* para aplicar`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro ao processar arquivo: ${e.message}` });
      }
      break;
    }

    case 'warp': {
      try {
        await sock.sendMessage(jid, { text: '🔄 Baixando Cloudflare WARP (warp-plus)...' });
        const { execFile, spawn } = require('child_process');
        const https = require('https');
        const warpDir = path.join(__dirname, '..', 'bin');
        if (!fs.existsSync(warpDir)) fs.mkdirSync(warpDir, { recursive: true });
        const warpBin = path.join(warpDir, 'warp-plus');
        if (!fs.existsSync(warpBin)) {
          await sock.sendMessage(jid, { text: '⬇️ Baixando warp-plus...' });
          const tmpDir = path.join(warpDir, '.warp-dl');
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const tarball = path.join(tmpDir, 'warp.tar.gz');
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Download timeout (60s)')), 60000);
            // First, find the actual asset URL from GitHub API
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
                  dl(assetUrl, tarball); // tarball might be a zip now
                } catch (e) { clearTimeout(timeout); reject(e); }
              });
            }).on('error', (e) => { clearTimeout(timeout); reject(e); });
          });
          if (!fs.existsSync(tarball)) throw new Error('Download falhou');
          // Try tar.gz first, then zip, then raw binary
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
            // Maybe it's a raw binary already (not compressed)
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
          await sock.sendMessage(jid, { text: `✅ warp-plus baixado (${(fs.statSync(warpBin).size / 1024 / 1024).toFixed(1)} MB)` });
        }
        await sock.sendMessage(jid, { text: '🔄 Iniciando WARP SOCKS5 na porta 40000 (60s para registrar)...' });
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
          return await sock.sendMessage(jid, { text: `❌ warp-plus morreu:\n${warpOut.slice(0, 500)}` });
        }
        if (warpOut.includes('failed to register')) {
          const warpDir = path.join(os.homedir(), '.cache', 'warp-plus');
          try { fs.rmSync(warpDir, { recursive: true, force: true }); } catch {}
        }
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.youtubeProxy = 'socks5://127.0.0.1:40000';
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, {
          text: `✅ *WARP ativado!*\n\n🔗 SOCKS5: socks5://127.0.0.1:40000\n📋 Log:\n\`\`\`${(warpOut || '(vazio)').slice(0, 500)}\`\`\`\n\nTeste com *!play*`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro WARP: ${e.message}` });
      }
      break;
    }

    case 'setproxy': {
      const proxyUrl = args.join(' ').trim();
      if (!proxyUrl) {
        return await sock.sendMessage(jid, {
          text: `📋 *Configurar proxy para YouTube*\n\nEnvie: *setproxy* <url>\n\nExemplos:\n• HTTP: http://user:pass@host:port\n• SOCKS5: socks5://host:1080\n\nPara remover: *delproxy*`
        });
      }
      try {
        const cfgPath = path.join(__dirname, '..', 'config.json');
        if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
          cfg.youtubeProxy = proxyUrl;
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
        await sock.sendMessage(jid, { text: `✅ Proxy configurado: ${proxyUrl}\n\n🔄 Reinicie com *!reiniciar* para aplicar` });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
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
        await sock.sendMessage(jid, { text: '✅ Proxy removido' });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
  }
}

module.exports = { handleUpdate, updateCommands };
