const yts = require('yt-search');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { formatDuration, formatNumber } = require('../lib/utils');

const YT_DLP = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
const FFMPEG = path.join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = execFile(YT_DLP, args, { maxBuffer: 150 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
    child.on('error', reject);
  });
}

async function downloadVídeo(url) {
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outFile = path.join(tempDir, `vid_${Date.now()}`);

  try {
    const args = [
      '-f', 'best[height<=720]/best',
      '--max-filesize', '50M',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFMPEG,
      '--no-warnings',
      '--no-playlist',
      '--output', `${outFile}.%(ext)s`,
      url
    ];

    await runYtDlp(args);

    let vídeoFile = null;
    for (const ext of ['mp4', 'webm', 'mkv']) {
      const p = `${outFile}.${ext}`;
      if (fs.existsSync(p)) { vídeoFile = p; break; }
    }

    if (!vídeoFile) throw new Error('Vídeo não foi gerado');

    const data = fs.readFileSync(vídeoFile);
    const size = data.length;
    fs.unlinkSync(vídeoFile);
    return { success: true, data, size };
  } catch (e) {
    for (const ext of ['mp4', 'webm', 'mkv']) {
      try { fs.unlinkSync(`${outFile}.${ext}`); } catch {}
    }
    return { success: false, error: e.message };
  }
}

async function searchVídeo(query) {
  const result = await yts(query);
  const vídeos = result.vídeos.sort((a, b) => (b.views || 0) - (a.views || 0));
  return vídeos[0] || null;
}

async function handleVídeo(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    return await sock.sendMessage(jid, { text: '❌ Digite o nome. Ex: !vídeo GTA 6 Trailer' });
  }

  const query = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);

  try {
    const vídeo = await searchVídeo(query);
    if (!vídeo) return await sock.sendMessage(jid, { text: '❌ Vídeo não encontrado.' });

    const infoText = `🎬 *${vídeo.title}*\n\n⏱ ${formatDuration(vídeo.seconds)}  👁 ${formatNumber(vídeo.views)}\n📺 ${vídeo.author?.name || 'N/A'}\n\n⏳ Baixando vídeo...`;

    if (vídeo.thumbnail) {
      try {
        await sock.sendMessage(jid, { image: { url: vídeo.thumbnail }, caption: infoText });
      } catch {
        await sock.sendMessage(jid, { text: infoText });
      }
    } else {
      await sock.sendMessage(jid, { text: infoText });
    }

    const result = await downloadVídeo(vídeo.url);

    if (!result.success) {
      return await sock.sendMessage(jid, {
        text: `⚠️ Nao foi possivel baixar.\n\n📹 Link direto:\n${vídeo.url}\n\n💡 Tente um vídeo mais curto.`
      });
    }

    if (result.size > 50 * 1024 * 1024) {
      return await sock.sendMessage(jid, { text: '❌ Vídeo muito grande (limite: 50MB).' });
    }

    await sock.sendMessage(jid, {
      vídeo: result.data,
      mimetype: 'vídeo/mp4',
      caption: `🎬 ${vídeo.title}`
    }, { quoted: msg });

  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro: ${e.message.slice(0, 200)}` });
  }
}

const vídeoCommands = ['vídeo', 'vídeo'];

module.exports = { handleVídeo, vídeoCommands };
