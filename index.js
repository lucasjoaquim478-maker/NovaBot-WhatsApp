const config = require('./config.json');
const { start, getSock, logger } = require('./lib/baileys');
const db = require('./database/index');
const { backup, scheduleBackup } = require('./database/backup');
const { handleMessages, setHandler } = require('./events/messages.upsert');
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
const { startAutoCheck } = require('./lib/updater');
const os = require('os');

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
    { cmds: ['nivel'], handler: handleNiveis },
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
    { cmds: testUpdateCommands, handler: handleTestUpdate }
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
  out += '  Usuarios: ' + totalUsers + '\n';
  out += '  OS: ' + os.platform() + ' ' + os.release() + '\n';
  out += line + '\n';
  console.log(out);
}

async function handleMenu(sock, ctx) {
  const menu = buildMenu(sock, ctx.sender, ctx.args);
  await sock.sendMessage(ctx.jid, { text: menu });
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

  if (config.autoBackup) {
    scheduleBackup(config.backupInterval || 86400000);
    logger.info('[BACKUP] Backup automatico ativado');
  }

  if (config.autoUpdate) {
    startAutoCheck();
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
          await sock.sendMessage(ctx.jid, { text: `❌ Erro ao executar comando: ${err.message}` });
        } catch {}
      }
    } else {
      try {
        await sock.sendMessage(ctx.jid, { text: `❌ Comando "${ctx.commandName}" nao encontrado. Use ${ctx.prefix}help para ver os comandos disponiveis.` });
      } catch {}
    }
  });

  logger.info('[BOT] Conectando ao WhatsApp...');

  await start(setupEvents, {
    onConnected: async (s) => {
      displayPanel(s);
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
        s.sendMessage(jid, { text: `🤖 *${config.botName || 'NovaBot'} online!*\n\nUse ${config.prefix}help para ver os comandos.` }).catch(() => {});
      }
    }
  });
}

process.on('uncaughtException', (err) => {
  logger.error(`[UNCAUGHT] ${err.message}`);
});

process.on('unhandledRejection', (err) => {
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
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
