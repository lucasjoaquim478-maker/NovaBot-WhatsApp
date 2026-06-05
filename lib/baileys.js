const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const qrcode = require('qrcode-terminal');
const Logger = require('./logger');

const logger = new Logger({ level: 'info' });

let sock = null;
let onEventsSetup = null;
let optsGlobal = {};
let _saveCreds = null;

function saveCredsBeforeExit() {
  if (_saveCreds) { try { _saveCreds(); } catch {} }
}

async function start(setupEvents, opts = {}) {
  onEventsSetup = setupEvents;
  optsGlobal = opts;
  await doConnect();
}

async function doConnect() {
  if (sock) {
    try { sock.ev.removeAllListeners(); } catch {}
    sock = null;
  }

  const { state, saveCreds } = await useMultiFileAuthState(path.join(process.cwd(), 'sessions'));
  _saveCreds = saveCreds;

  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`Baileys version: ${version.join('.')} (latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    auth: state,
    logger: require('pino')({ level: 'silent' }),
    browser: ['NovaBot', 'Safari', '2.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    emitOwnEvents: false,
    generateHighQualityLinkPreview: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║   ESCANEIE O QR CODE ABAIXO             ║');
      console.log('║   WhatsApp > Apontados > Dispositivos    ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log('');
      qrcode.generate(qr, { small: true });
      console.log('');
    }

    if (connection === 'open') {
      logger.info('Conectado ao WhatsApp com sucesso!');
      if (sock?.user) logger.info(`Numero: ${sock.user.id.split(':')[0]}`);
      if (typeof onEventsSetup === 'function') onEventsSetup(sock);
      if (typeof optsGlobal.onConnected === 'function') optsGlobal.onConnected(sock);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        logger.error('Sessao encerrada! Delete a pasta sessions e reconecte.');
        sock = null;
        process.exit(1);
      }

      saveCredsBeforeExit();
      sock = null;

      const delay = statusCode === 440 ? 30000 : 5000;
      logger.warn(`Desconectado (${statusCode || '?'}). Reconectando em ${delay / 1000}s...`);

      setTimeout(() => doConnect(), delay);
    }
  });
}

function getSock() { return sock; }

module.exports = { start, getSock, logger, saveCredsBeforeExit };
