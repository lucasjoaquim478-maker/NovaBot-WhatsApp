const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfgPath = path.join(__dirname, 'config.json');
const cfgExamplePath = path.join(__dirname, 'config.example.json');
if (!fs.existsSync(cfgPath) && fs.existsSync(cfgExamplePath)) {
  fs.copyFileSync(cfgExamplePath, cfgPath);
  console.log('[SETUP] config.json criado a partir de config.example.json');
}
const config = require('./config.json');
const { start, getSock, logger } = require('./lib/baileys');
const db = require('./database/index');
const { backup, scheduleBackup } = require('./database/backup');
const { handleMessages, setHandler } = require('./events/messages.upsert');
const { extractText, isOwner } = require('./lib/utils');
const { handleGroupUpdate } = require('./events/group-update');
const { buildMenu } = require('./commands/menu');
const { handleAdmin, adminCommands } = require('./commands/admin');
const { handleOwner, handleAddDono, ownerCommands } = require('./commands/owner');
const { handleAI, aiCommands, handleImage, imageCommands } = require('./commands/ai');
const { handlePlay, playCommands } = require('./commands/play');
const { handleVideo, videoCommands } = require('./commands/video');
const { handleDownload, downloadCommands } = require('./commands/download');
const { handlePesquisa, pesquisaCommands } = require('./commands/pesquisa');
const { handleFerramentas, ferramentasCommands } = require('./commands/ferramentas');
const { handleDiversao, diversaoCommands } = require('./commands/diversao');
const { handleEconomia, economiaCommands } = require('./commands/economia');
const { handleNiveis, niveisCommands } = require('./commands/niveis');
const { handleInformacao, informacaoCommands, setStartTime } = require('./commands/informacao');
const { handleTikTok, handleTikTokMp3, tiktokCommands, tiktokMp3Commands } = require('./commands/tiktok');
const { handleRoblox, handleTrending, handleTop, handleLancar, handleSimilar, handleReview, handleCreator, robloxCommands, trendCommands, topCommands, lancarCommands, similarCommands, reviewCommands, creatorCommands } = require('./commands/roblox');
const { handleVoices, vozCommands } = require('./commands/vozes');
const { handleUpdate, updateCommands } = require('./commands/update');
const { handleTestUpdate, testUpdateCommands } = require('./commands/testupdate');
const { handleTeste, testeCommands } = require('./commands/testeauto');
const { handleAchar, acharCommands } = require('./commands/achar');
const { handleCidade, cidadeCommands } = require('./commands/cidade');
const { handleCleanup, cleanupCommands } = require('./commands/cleanup');
// Auto-install se faltar dependencias
try { require('sharp'); } catch {
  const { execSync } = require('child_process');
  const npmCmd = require('path').join(__dirname, 'node', 'npm.cmd');
  const cmd = (require('fs').existsSync(npmCmd) ? `"${npmCmd}"` : 'npm') + ' install --no-optional';
  console.log('[STARTUP] Instalando dependencias faltantes...');
  try { execSync(cmd, { cwd: __dirname, stdio: 'pipe', timeout: 300000, shell: true }); } catch (e) { console.error('[STARTUP] npm install falhou:', e.message); }
}
const { handleLink, linkCommands } = require('./commands/linkvertise');

const { handleCultura, culturaCommands } = require('./commands/cultura');
const updater = require('./lib/updater');
const Logger = require('./lib/logger');
const monitor = require('./server/botMonitor');
const logService = require('./server/services/logService');
const tokenManager = require('./server/services/tokenService');
const webServer = require('./server/index');
const os = require('os');

const lockFile = path.join(__dirname, '.bot.lock');
try {
  if (fs.existsSync(lockFile)) {
    const pid = parseInt(fs.readFileSync(lockFile, 'utf-8'), 10);
    if (pid !== process.pid) {
      try {
        process.kill(pid, 0);
        console.error(`[LOCK] Outra instÃ¢ncia jÃ¡ estÃ¡ rodando (PID: ${pid}). Abortando.`);
        process.exit(0);
      } catch {}
    }
    fs.unlinkSync(lockFile);
  }
  fs.writeFileSync(lockFile, String(process.pid));
  process.on('exit', () => { try { fs.unlinkSync(lockFile); } catch {} });
} catch {}

const startTime = Date.now();
global.startTime = startTime;
setStartTime(startTime);

const commandMap = new Map();

function registerCommands() {
  const registrations = [
    { cmds: ['help', 'menu'], handler: handleMenu },
    { cmds: adminCommands, handler: handleAdmin },
    { cmds: ownerCommands, handler: handleOwner },
    { cmds: ['adddono'], handler: handleAddDono },
    { cmds: aiCommands, handler: handleAI },
    { cmds: playCommands, handler: handlePlay },
    { cmds: videoCommands, handler: handleVideo },
    { cmds: downloadCommands, handler: handleDownload },
    { cmds: pesquisaCommands, handler: handlePesquisa },
    { cmds: ferramentasCommands, handler: handleFerramentas },
    { cmds: imageCommands, handler: handleImage },
    { cmds: ['meme', 'piada', 'dado', 'moeda', 'roleta', 'perfil'], handler: handleDiversao },
    { cmds: ['saldo', 'daily', 'trabalhar', 'depositar', 'sacar', 'ranking'], handler: handleEconomia },
    { cmds: ['nÃ­vel'], handler: handleNiveis },
    { cmds: ['ping', 'uptime', 'status', 'grupoinfo'], handler: handleInformacao },
    { cmds: tiktokCommands, handler: handleTikTok },
    { cmds: tiktokMp3Commands, handler: handleTikTokMp3 },
    { cmds: robloxCommands, handler: handleRoblox },
    { cmds: trendCommands, handler: handleTrending },
    { cmds: topCommands, handler: handleTop },
    { cmds: lancarCommands, handler: handleLancar },
    { cmds: similarCommands, handler: handleSimilar },
    { cmds: reviewCommands, handler: handleReview },
    { cmds: creatorCommands, handler: handleCreator },
    { cmds: vozCommands, handler: handleVoices },
    { cmds: updateCommands, handler: handleUpdate },
    { cmds: testUpdateCommands, handler: handleTestUpdate },
    { cmds: testeCommands, handler: handleTeste },
    { cmds: acharCommands, handler: handleAchar },
    { cmds: cidadeCommands, handler: handleCidade },
    { cmds: linkCommands, handler: handleLink },
    { cmds: culturaCommands, handler: handleCultura },
    { cmds: ['confirma'], handler: handleConfirma },
    { cmds: ['token'], handler: handleToken },
    { cmds: cleanupCommands, handler: handleCleanup }
  ];

  for (const reg of registrations) {
    for (const cmd of reg.cmds) {
      commandMap.set(cmd, reg.handler);
    }
  }


  logger.info(`[COMANDOS] ${commandMap.size} comandos registrados`);
}

function displayPanel(sock) {
  const used = process.memoryUsage();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  const totalCommands = db.getCommandCount();
  const totalUsers = db.getUserCount();
  const totalGroups = db.getGroupCount();

  const line = '='.repeat(40);
  let out = '\n' + line + '\n';
  out += '     NovaBot WhatsApp - Premium\n';
  out += line + '\n';
  if (sock?.user) {
    const num = sock.user.id?.split(':')[0] || 'N/A';
    out += '  Telefone: ' + num + '\n';
  }
  out += '  Uptime: ' + Math.floor(uptime / 3600) + 'h ' + Math.floor((uptime % 3600) / 60) + 'm ' + uptime % 60 + 's\n';
  out += '  RAM: ' + (used.heapUsed / 1024 / 1024).toFixed(1) + 'MB\n';
  out += '  Comandos: ' + totalCommands + '\n';
  out += '  Grupos: ' + totalGroups + '\n';
  out += '  UsuÃ¡rios: ' + totalUsers + '\n';
  out += '  OS: ' + os.platform() + ' ' + os.release() + '\n';
  out += line + '\n';
  console.log(out);
}

async function handleMenu(sock, ctx) {
  const menu = buildMenu(sock, ctx.sender, ctx.args);
  await sock.sendMessage(ctx.jid, { text: menu });
}

async function handleConfirma(sock, ctx) {
  if (!await isOwner(ctx.sender, sock)) {
    return await sock.sendMessage(ctx.jid, { text: 'âŒ Apenas o dono pode usar este comando.' });
  }
  await sock.sendMessage(ctx.jid, { text: 'âš¡ ForÃ§ando atualizaÃ§Ã£o...' });
  try {
    const result = await updater.performUpdate();
    await sock.sendMessage(ctx.jid, {
      text: `âœ… *AtualizaÃ§Ã£o concluÃ­da!*\n\nðŸ“¦ v${updater.getCurrentVersion()} â†’ v${result.targetVer}\nðŸ“ ${result.filesSuccess} arquivos\nâŒ ${result.filesFailed} falhas\n\nðŸ”„ Reiniciando em 3 segundos...`
    });
    setTimeout(() => process.exit(1), 3000);
  } catch (e) {
    await sock.sendMessage(ctx.jid, { text: `âŒ Falha na atualizaÃ§Ã£o: ${e.message}` });
  }
}

async function handleToken(sock, ctx) {
  const input = ctx.args.join(' ');
  if (!input) {
    return await sock.sendMessage(ctx.jid, { text: `âŒ Use ${ctx.prefix}token <cÃ³digo>` });
  }

  // Check MASTER_OWNER_TOKEN env var first (persiste no PhanomCloud)
  const masterToken = process.env.MASTER_OWNER_TOKEN;
  if (masterToken && input === masterToken) {
    return await grantOwner(sock, ctx);
  }

  // Check config.json stored tokens
  const cfgPath = path.join(__dirname, 'config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    if (cfg.tokens) {
      const match = cfg.tokens.find(t => t.token === input);
      if (match) {
        return await grantOwner(sock, ctx);
      }
    }
  } catch {}

  // Check tokenManager (legacy generated tokens)
  const result = tokenManager.validate(input);
  if (!result) {
    logService.add('warn', `Token invÃ¡lido tentado por ${ctx.sender.split('@')[0]}`);
    return await sock.sendMessage(ctx.jid, { text: 'âŒ Token invÃ¡lido ou revogado.' });
  }
  if (result.error) {
    logService.add('warn', `Token expirado por ${ctx.sender.split('@')[0]}: ${result.error}`);
    return await sock.sendMessage(ctx.jid, { text: `âŒ ${result.error}.` });
  }
  tokenManager.use(input, ctx.sender);
  return await grantOwner(sock, ctx);
}

async function grantOwner(sock, ctx) {
  if (!global.resolvedOwnerJids) global.resolvedOwnerJids = new Set();
  global.resolvedOwnerJids.add(ctx.sender);
  try {
    const ownersFile = path.join(__dirname, 'database', 'owners.json');
    let owners = [];
    try { if (fs.existsSync(ownersFile)) owners = JSON.parse(fs.readFileSync(ownersFile, 'utf-8')); } catch {}
    if (!owners.includes(ctx.sender)) {
      owners.push(ctx.sender);
      fs.writeFileSync(ownersFile, JSON.stringify(owners, null, 2));
    }
  } catch {}
  try {
    const cfgPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const phone = ctx.sender.split('@')[0];
      if (!cfg.ownerNumbers.some(n => n.startsWith(phone))) {
        cfg.ownerNumbers.push(phone + '@s.whatsapp.net');
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      }
    }
  } catch {}
  logService.add('success', `${ctx.sender.split('@')[0]} agora Ã© admin`);
  await sock.sendMessage(ctx.jid, {
    text: `âœ… *Token vÃ¡lido!*\n\nAgora vocÃª tem acesso administrativo ao bot.\nUse ${ctx.prefix}help para ver os comandos.`
  });
}

function setupEvents(sock) {
  sock.ev.removeAllListeners('messages.upsert');
  sock.ev.removeAllListeners('groups.update');
  sock.ev.removeAllListeners('group-participants.update');

  sock.ev.on('messages.upsert', async ({ messages }) => {
    logger.debug(`Mensagem recebida: ${messages.length}`);
    await handleMessages(sock, messages);
  });

  sock.ev.on('groups.update', async (updates) => {
    await handleGroupUpdate(sock, updates);
  });

  sock.ev.on('group-participants.update', async (update) => {
    await handleGroupUpdate(sock, [update]);
  });

  logger.debug('[EVENTOS] Handlers registrados no socket');
}

async function main() {
  console.log('');
  console.log('=======================================');
  console.log('     NovaBot WhatsApp - Premium        ');
  console.log('     Inicializando...                  ');
  console.log('=======================================');
  console.log('');

  registerCommands();

  Logger.setOnLog((level, msg) => {
    logService.add(level, msg);
  });

  try {
    await webServer.start(config.webPort);
    logger.info('[WEB] Painel web iniciado');
  } catch (e) {
    logger.warn(`[WEB] Erro ao iniciar servidor: ${e.message}`);
  }

  // Load persisted owners
  try {
    const ownersFile = path.join(__dirname, 'database', 'owners.json');
    let owners = [];

    // Priority 1: env var BOT_OWNERS (persiste no painel PhanomCloud)
    const envOwners = process.env.BOT_OWNERS;
    if (envOwners) {
      owners = envOwners.split(',').map(s => s.trim()).filter(Boolean);
      logger.info(`[OWNER] ${owners.length} donos carregados de BOT_OWNERS env`);
    }

    // Priority 2: database/owners.json
    if (!owners.length && fs.existsSync(ownersFile)) {
      owners = JSON.parse(fs.readFileSync(ownersFile, 'utf-8'));
    }

    // Priority 3: config.json ownerNumbers
    if (!owners.length && config.ownerNumbers?.length) {
      owners = config.ownerNumbers.map(n => n.startsWith('@') ? n : n);
    }

    if (owners.length) {
      if (!global.resolvedOwnerJids) global.resolvedOwnerJids = new Set();
      for (const jid of owners) {
        const clean = jid.includes('@') ? jid : jid + '@s.whatsapp.net';
        global.resolvedOwnerJids.add(clean);
        global.resolvedOwnerJids.add(jid.split('@')[0]);
      }
      logger.info(`[OWNER] ${owners.length} donos persistentes carregados`);
    }
  } catch (e) {
    logger.warn(`[OWNER] Erro ao carregar donos: ${e.message}`);
  }

  if (config.autoBackup) {
    scheduleBackup(config.backupInterval || 86400000);
    logger.info('[BACKUP] Backup automÃ¡tico ativado');
  }

  if (config.autoUpdate) {
    updater.startAutoCheck();
  } else {
    logger.info('[UPDATE] Auto-update desativado');
  }

  if (config.ollamaApiKey) {
    logger.info(`[OLLAMA] API configurada, modelo: ${config.ollamaModel || 'gemma3:27b'}`);
  } else {
    logger.warn('[IA] Nenhuma API de Ollama configurada');
  }

  setHandler(async (sock, ctx) => {
    const handler = commandMap.get(ctx.commandName);
    if (handler) {
      try {
        await handler(sock, ctx);
      } catch (err) {
        logger.error(`[COMANDO] Erro em "${ctx.commandName}": ${err.message}`);
        try {
          await sock.sendMessage(ctx.jid, { text: `âŒ Erro ao executar comando: ${err.message}` });
        } catch {}
      }
    } else {
      try {
        await sock.sendMessage(ctx.jid, { text: `âŒ Comando "${ctx.commandName}" nÃ£o encontrado. Use ${ctx.prefix}help para ver os comandos disponÃ­veis.` });
      } catch {}
    }
  });

  logger.info('[BOT] Conectando ao WhatsApp...');

  await start(setupEvents, {
    onQR: (qr) => { monitor.setQR(qr); },
    onConnected: async (s) => {
      displayPanel(s);
      monitor.setOnline(s.user);
      s.ev.on('connection.update', (update) => {
        if (update.qr) monitor.info('QR Code gerado â€” escaneie para conectar');
      });
      global.resolvedOwnerJids = new Set();
      const ownerPhones = config.ownerNumbers || [config.ownerNumber].filter(Boolean);
      for (const num of ownerPhones) {
        const phone = num.split('@')[0];
        global.resolvedOwnerJids.add(phone);
        try {
          if (s?.onWhatsApp) {
            const r = await s.onWhatsApp(phone);
            if (r?.length) r.forEach(x => global.resolvedOwnerJids.add(x.jid));
          }
        } catch {}
      }
      if (s.user?.id) global.resolvedOwnerJids.add(s.user.id);
      const jid = s.user?.id;
      if (jid) {
        s.sendMessage(jid, { text: `ðŸ¤– *${config.botName || 'NovaBot'} online!*\n\nUse ${config.prefix}help para ver os comandos.` }).catch(() => {});
      }
    },
    onDisconnected: (code, loggedOut, reason) => {
      monitor.setOffline(loggedOut ? 'SessÃ£o encerrada' : reason);
    }
  });
}

process.on('uncaughtException', (err) => {
  const logPath = path.join(__dirname, 'logs', 'crash.log');
  try { fs.appendFileSync(logPath, `[UNCAUGHT] ${new Date().toISOString()} ${err.stack || err.message}\n`); } catch {}
  logger.error(`[UNCAUGHT] ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  const logPath = path.join(__dirname, 'logs', 'crash.log');
  try { fs.appendFileSync(logPath, `[UNHANDLED] ${new Date().toISOString()} ${err?.stack || err?.message || err}\n`); } catch {}
  logger.warn(`[UNHANDLED] ${err?.message || err}`);
});

process.on('exit', () => {
  try { require('./lib/baileys').saveCredsBeforeExit(); } catch {}
  db.flushAll();
  db.saveAll();
});

process.on('SIGINT', () => {
  logger.info('[BOT] Bot desligado.');
  process.exit(0);
});

main().catch(err => {
  const logPath = path.join(__dirname, 'logs', 'crash.log');
  try { fs.appendFileSync(logPath, `[FATAL] ${new Date().toISOString()} ${err.stack || err.message}\n`); } catch {}
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
