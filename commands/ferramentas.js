const fs = require('fs');
const path = require('path');
const { downloadMedia, getMediaMessage } = require('../lib/utils');
const ROOT = path.resolve(__dirname, '..');

const heavyModules = {};
function lazyLoad(name) {
  if (!heavyModules[name]) heavyModules[name] = require(name);
  return heavyModules[name];
}

async function handleFerramentas(sock, { msg, jid, sender, args, commandName }) {
  switch (commandName) {
    case 'sticker': {
      const hasImage = getMediaMessage(msg, 'image');
      const hasVideo = getMediaMessage(msg, 'video');
      if (!hasImage && !hasVideo) {
        return await sock.sendMessage(jid, { text: '❌ Envie ou marque uma imagem/vídeo para criar sticker.' });
      }
      try {
        const type = hasImage ? 'image' : 'video';
        const media = await downloadMedia(msg, type);
        if (!media) return await sock.sendMessage(jid, { text: '❌ Erro ao baixar mídia.' });
        let stickerData = media;
        if (type === 'image') {
          const sharp = lazyLoad('sharp');
          try { stickerData = await sharp(media).webp({ quality: 80 }).toBuffer(); } catch {}
        }
        await sock.sendMessage(jid, { sticker: stickerData, mimetype: 'image/webp' }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
    case 'toimg': {
      if (!getMediaMessage(msg, 'sticker')) return await sock.sendMessage(jid, { text: '❌ Marque um sticker.' });
      try {
        const media = await downloadMedia(msg, 'sticker');
        if (!media) return await sock.sendMessage(jid, { text: '❌ Erro ao processar sticker.' });
        await sock.sendMessage(jid, { image: media, caption: '✅ Sticker convertido!' }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
    case 'ocr': {
      if (!getMediaMessage(msg, 'image')) return await sock.sendMessage(jid, { text: '❌ Envie ou marque uma foto.' });
      try {
        const media = await downloadMedia(msg, 'image');
        if (!media) return await sock.sendMessage(jid, { text: '❌ Erro ao baixar imagem.' });
        const Tesseract = lazyLoad('tesseract.js');
        const { data } = await Tesseract.recognize(media, 'por');
        await sock.sendMessage(jid, {
          text: `📝 *Texto extraido:*\n\n${data.text || 'Nenhum texto encontrado.'}`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
    case 'tts': {
      if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !tts Ola mundo' });
      try {
        const gTTS = lazyLoad('gtts');
        const text = args.join(' ');
        const tempDir = path.join(ROOT, 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const audioPath = path.join(tempDir, `tts-${Date.now()}.mp3`);
        await new Promise((resolve, reject) => {
          const gtts = new gTTS(text, 'pt');
          gtts.save(audioPath, (err) => { if (err) reject(err); else resolve(); });
        });
        const audioData = fs.readFileSync(audioPath);
        await sock.sendMessage(jid, { audio: audioData, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
        fs.unlinkSync(audioPath);
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
    case 'traduzir': {
      if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !traduzir Hello world' });
      try {
        const translate = lazyLoad('@vitalets/google-translate-api');
        const text = args.join(' ');
        const result = await translate(text, { to: 'pt' });
        await sock.sendMessage(jid, {
          text: `🌐 *Tradução (${result.from?.language?.iso || 'auto'} \u2192 pt)*\n\n${result.text}`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
    case 'qr': {
      if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !qr https://google.com' });
      try {
        const QRCode = lazyLoad('qrcode');
        const text = args.join(' ');
        const qrBuffer = await QRCode.toBuffer(text, { width: 500, margin: 2 });
        await sock.sendMessage(jid, { image: qrBuffer, caption: `✅ QR Code gerado` }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
  }
}

const ferramentasCommands = ['sticker', 'toimg', 'ocr', 'tts', 'traduzir', 'qr'];

module.exports = { handleFerramentas, ferramentasCommands };
