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

function getRandomHex(length = 8) {
  return Math.random().toString(16).slice(2, 2 + length);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const config = require('../config.json');

async function isOwner(sender, sock) {
  if (!sender) return false;
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

function válidateNumber(number) {
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
  válidateNumber,
  isOwner
};
