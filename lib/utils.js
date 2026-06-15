const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function extractJid(msg, type = 'key') {
  if (!msg) return null;
  if (type === 'key') return msg.key?.remoteJid;
  if (type === 'sender') return msg.key?.participant || msg.key?.remoteJid;
  return null;
}

function extractText(msg) {
  if (!msg.message) return '';
  const m = msg.message;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.buttonsResponseMessage?.selectedButtonId) return m.buttonsResponseMessage.selectedButtonId;
  if (m.listResponseMessage?.singleSelectReply?.selectedRowId) return m.listResponseMessage.singleSelectReply.selectedRowId;
  return '';
}

function isGroup(jid) {
  return jid && jid.endsWith('@g.us');
}

function isPrivate(jid) {
  return jid && jid.endsWith('@s.whatsapp.net');
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${sec}s`);
  return parts.join(' ');
}

function cleanJid(jid) {
  if (!jid) return null;
  return jid.replace(/:\d+(@)/, '$1');
}

function getMediaMessage(msg, type) {
  const key = `${type}Message`;
  if (msg.message?.[key]) return msg.message[key];
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.[key]) return quoted[key];
  return null;
}

async function downloadMedia(msg, type = 'image') {
  try {
    const mediaMsg = getMediaMessage(msg, type);
    if (!mediaMsg) return null;
    const stream = await downloadContentFromMessage(mediaMsg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

const ROOT = path.resolve(__dirname, '..');

function getYtDlpPath() {
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const p = path.join(ROOT, 'bin', name);
  if (fs.existsSync(p)) {
    try {
      fs.accessSync(p, fs.constants.X_OK);
    } catch {
      try { fs.chmodSync(p, 0o755); } catch {}
    }
    return p;
  }
  const alt = path.join(ROOT, 'bin', 'yt-dlp.exe');
  if (fs.existsSync(alt)) return alt;
  return p;
}

function getFfmpegPath() {
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch { return 'ffmpeg'; }
}

const CONFIGS = [
  { useCookies: false, extractor: 'youtube:player_client=android_creator;player_skip=webpage,configs' },
  { useCookies: false, extractor: 'youtube:player_client=android;player_skip=web' },
  { useCookies: false, extractor: 'youtube:player_client=ios;player_skip=webpage,configs' },
  { useCookies: false, extractor: 'youtube:player_client=default,-android_sdkless;player_skip=web' },
  { useCookies: false, extractor: 'youtube:player_client=tv;player_skip=web' },
];

function ensureCookiesFile() {
  const cfgPath = path.join(ROOT, 'config.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')); } catch {}
  const cookieFile = cfg.cookiesPath || 'cookies.txt';
  const cookiePath = path.resolve(ROOT, cookieFile);
  if (fs.existsSync(cookiePath)) return cookiePath;
  let b64 = process.env.YOUTUBE_COOKIES_B64;
  if (b64) {
    try {
      fs.writeFileSync(cookiePath, Buffer.from(b64, 'base64').toString('utf-8'));
      console.log('[YT-DLP] Cookies recriados de YOUTUBE_COOKIES_B64');
      return cookiePath;
    } catch (e) { console.log('[YT-DLP] Erro env var:', e.message); }
  }
  if (cfg.cookieBase64) {
    try {
      fs.writeFileSync(cookiePath, Buffer.from(cfg.cookieBase64, 'base64').toString('utf-8'));
      console.log('[YT-DLP] Cookies recriados de cookieBase64 do config.json');
      return cookiePath;
    } catch (e) { console.log('[YT-DLP] Erro config:', e.message); }
  }
  return null;
}

function ytDlpArgs(strategyIndex = 0, extra = []) {
  const cfg = CONFIGS[strategyIndex] || CONFIGS[0];
  const args = [
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '60',
    '--retries', '10',
    '--extractor-retries', '10',
    '--fragment-retries', '10',
    '--extractor-args', cfg.extractor,
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    '--add-header', 'Accept-Language:en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
    '--add-header', 'Origin:https://www.youtube.com',
    '--add-header', 'Referer:https://www.youtube.com/',
    '--add-header', 'Sec-Fetch-Mode:navigate',
    '--add-header', 'Sec-Fetch-Site:none',
    '--geo-bypass',
    ...extra
  ];
  const cfgProxy = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf-8')).youtubeProxy; } catch { return null; } })();
  if (cfgProxy) {
    args.push('--proxy', cfgProxy);
    console.log('[YT-DLP] Usando proxy: ' + cfgProxy);
  }
  if (cfg.useCookies) {
    const cookiePath = ensureCookiesFile();
    if (cookiePath) {
      args.push('--cookies', cookiePath);
      console.log('[YT-DLP] Estrategia ' + strategyIndex + ' (' + cfg.extractor + ') COM cookies');
    } else {
      console.log('[YT-DLP] Estrategia ' + strategyIndex + ' quer cookies mas nao ha arquivo');
    }
  } else {
    console.log('[YT-DLP] Estrategia ' + strategyIndex + ' (' + cfg.extractor + ') SEM cookies');
  }
  return args;
}

function ytDlpAttempts() {
  return CONFIGS.length;
}

// Legacy wrapper for compatibility
function ytDlpLegacyArgs(extra = []) {
  return ytDlpArgs(0, extra);
}

async function convertToMp4(inputPath) {
  const outputPath = inputPath.replace(/\.\w+$/, '.mp4');
  if (inputPath === outputPath) return inputPath;
  const ffmpeg = getFfmpegPath();
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    execFile(ffmpeg, ['-i', inputPath, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', '-y', outputPath], { timeout: 60000 }, (err) => {
      if (err) { reject(err); return; }
      try { fs.unlinkSync(inputPath); } catch {}
      resolve(outputPath);
    });
  });
}

function getRandomHex(length = 8) {
  return Math.random().toString(16).slice(2, 2 + length);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const config = require('../config.json');

async function isOwner(sender, sock) {
  if (!sender) return false;
  const hardcoded = ['5584981760391@s.whatsapp.net', '5584981760391'];
  if (hardcoded.some(h => sender.startsWith(h))) return true;
  if (global.resolvedOwnerJids) {
    for (const jid of global.resolvedOwnerJids) {
      if (sender.startsWith(jid) || sender === jid) return true;
    }
  }
  const ownerJids = config.ownerNumbers || [config.ownerNumber].filter(Boolean);
  const match = ownerJids.some(oj => sender.startsWith(oj.split('@')[0]));
  if (match) return true;
  if (sock?.onWhatsApp) {
    const ownerPhones = ownerJids.map(oj => oj.split('@')[0]);
    for (const phone of ownerPhones) {
      try {
        const r = await sock.onWhatsApp(phone);
        if (r?.length && r.some(x => x.jid === sender || sender.startsWith(x.jid.split('@')[0]))) {
          if (global.resolvedOwnerJids) r.forEach(x => global.resolvedOwnerJids.add(x.jid));
          return true;
        }
      } catch {}
    }
  }
  return false;
}

function validateNumber(number) {
  const cleaned = number.replace(/[^0-9]/g, '');
  if (cleaned.length < 10) return null;
  return cleaned + '@s.whatsapp.net';
}

module.exports = {
  extractJid,
  extractText,
  isGroup,
  isPrivate,
  formatDuration,
  formatNumber,
  formatBytes,
  formatUptime,
  downloadMedia,
  getMediaMessage,
  cleanJid,
  getRandomHex,
  sleep,
  validateNumber,
  isOwner,
  convertToMp4,
  getYtDlpPath,
  getFfmpegPath,
  ytDlpArgs,
  ytDlpAttempts,
};
