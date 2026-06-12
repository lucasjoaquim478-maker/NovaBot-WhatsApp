const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const qrcodeTerminal = require('qrcode-terminal');
const Logger = require('./logger');

const logger = new Logger({ level: 'info' });

let sock = null;
let onEventsSetup = null;
let optsGlobal = {};
let _saveCreds = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 20;
let reconnectTimer = null;

function saveCredsBeforeExit() {
  if (_saveCreds) { try { _saveCreds(); } catch {} }
}

async function start(setupEvents, opts = {}) {
  onEventsSetup = setupEvents;
  optsGlobal = opts;
  await doConnect();
}

async function doConnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (sock) {
    try { sock.ev.removeAllListeners(); } catch {}
    sock = null;
  }

  const sessionsDir = path.join(process.cwd(), 'sessions');
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
  _saveCreds = saveCreds;

  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Baileys version: ${version.join('.')} (latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    auth: state,
    logger: require('pino')({ level: 'silent' }),
    browser: ['NovaBot', 'Safari', '2.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    emitOwnEvents: false,
    generateHighQualityLinkPreview: false,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 25000,
    retryRequestDelayMs: 5000,
    maxRetryCount: 3,
    fireAndForget: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('');
      console.log('========================================');
      console.log('   ESCANEIE O QR CODE ABAIXO');
      console.log('========================================');
      console.log('');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('');
    }

    if (connection === 'open') {
      reconnectAttempts = 0;
      logger.info('Conectado ao WhatsApp com sucesso!');
      if (sock?.user) logger.info(`Número: ${sock.user.id.split(':')[0]}`);
      if (typeof onEventsSetup === 'function') onEventsSetup(sock);
      if (typeof optsGlobal.onConnected === 'function') optsGlobal.onConnected(sock);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (typeof optsGlobal.onDisconnected === 'function') {
        optsGlobal.onDisconnected(statusCode, isLoggedOut, lastDisconnect?.error?.message || 'Desconectado');
      }

      reconnectAttempts++;

      if (isLoggedOut) {
        logger.error('Sessão encerrada! Delete a pasta sessions e reconecte.');
        try {
          if (fs.existsSync(sessionsDir)) {
            const files = fs.readdirSync(sessionsDir);
            for (const f of files) {
              if (f.endsWith('.json') || f === 'creds.json') {
                fs.unlinkSync(path.join(sessionsDir, f));
              }
            }
          }
        } catch {}
        sock = null;
        process.exit(1);
      }

      if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        logger.error(`Máximo de tentativas de reconexão (${MAX_RECONNECT_ATTEMPTS}) atingido.`);
        sock = null;
        process.exit(1);
      }

      saveCredsBeforeExit();
      sock = null;

      let delay;
      switch (statusCode) {
        case 440:
          delay = Math.min(30000 + (reconnectAttempts * 5000), 120000);
          break;
        case 408:
          delay = Math.min(10000 + (reconnectAttempts * 2000), 60000);
          break;
        case 503:
          delay = 30000;
          break;
        case 515:
          delay = 60000;
          break;
        default:
          delay = Math.min(5000 + (reconnectAttempts * 2000), 60000);
      }

      logger.warn(`Desconectado (${statusCode || '?'}). Tentativa ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}. Reconectando em ${delay / 1000}s...`);

      reconnectTimer = setTimeout(() => {
        doConnect().catch(e => {
          const logPath = path.join(process.cwd(), 'logs', 'crash.log');
          try { fs.appendFileSync(logPath, `[DOCONNECT] ${new Date().toISOString()} ${e.stack || e.message}\n`); } catch {}
        });
      }, delay);
    }
  });
}

function getSock() { return sock; }

module.exports = { start, getSock, logger, saveCredsBeforeExit };
