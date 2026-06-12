const yts = require('yt-search');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { formatDuration, formatNumber, convertToMp4 } = require('../lib/utils');

const ROOT = path.resolve(__dirname, '..');
const YT_DLP = path.join(ROOT, 'bin', 'yt-dlp.exe');
const FFMPEG = path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = execFile(YT_DLP, args, { maxBuffer: 150 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').slice(0, 500)));
      else resolve(stdout);
    });
    child.on('error', (e) => reject(new Error(`yt-dlp: ${e.message}`)));
  });
}

async function downloadVideo(url) {
  const tempDir = path.join(ROOT, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outFile = path.join(tempDir, `vid_${Date.now()}`);

  try {
    const args = [
      '-f', 'best[height<=720]/best',
      '--max-filesize', '50M',
      '--merge-output-format', 'mp4',
      '--ffmpeg-location', FFMPEG,
      '--js-runtimes', 'node',
      '--no-warnings',
      '--no-playlist',
      '--output', `${outFile}.%(ext)s`,
      url
    ];

    await runYtDlp(args);

    let videoFile = null;
    for (const ext of ['mp4', 'webm', 'mkv']) {
      const p = `${outFile}.${ext}`;
      if (fs.existsSync(p)) { videoFile = p; break; }
    }

    if (!videoFile) throw new Error('Video nao foi gerado');

    if (videoFile.endsWith('.webm') || videoFile.endsWith('.mkv')) {
      try {
        videoFile = await convertToMp4(videoFile);
      } catch {}
    }

    const data = fs.readFileSync(videoFile);
    const size = data.length;
    fs.unlinkSync(videoFile);
    return { success: true, data, size };
  } catch (e) {
    for (const ext of ['mp4', 'webm', 'mkv']) {
      try { fs.unlinkSync(`${outFile}.${ext}`); } catch {}
    }
    return { success: false, error: e.message };
  }
}

async function searchVideo(query) {
  const result = await yts(query);
  const videos = result.videos.sort((a, b) => (b.views || 0) - (a.views || 0));
  return videos[0] || null;
}

async function handleVideo(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    return await sock.sendMessage(jid, { text: '❌ Digite o nome. Ex: !video GTA 6 Trailer' });
  }

  const query = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);

  try {
    const video = await searchVideo(query);
    if (!video) return await sock.sendMessage(jid, { text: '❌ Video nao encontrado.' });

    const infoText = `🎬 *${video.title}*\n\n⏱ ${formatDuration(video.seconds)}  👁 ${formatNumber(video.views)}\n📺 ${video.author?.name || 'N/A'}\n\n⏳ Baixando...`;

    if (video.thumbnail) {
      try {
        await sock.sendMessage(jid, { image: { url: video.thumbnail }, caption: infoText });
      } catch {
        await sock.sendMessage(jid, { text: infoText });
      }
    } else {
      await sock.sendMessage(jid, { text: infoText });
    }

    const result = await downloadVideo(video.url);

    if (!result.success) {
      const logService = require('../server/services/logService');
      logService.add('error', `Download video falhou: ${result.error}`);
      return await sock.sendMessage(jid, {
        text: `⚠️ Nao foi possivel baixar.\n\n📹 Link direto:\n${video.url}\n\n💡 Tente um video mais curto.`
      });
    }

    if (result.size > 50 * 1024 * 1024) {
      return await sock.sendMessage(jid, { text: '❌ Video muito grande (limite: 50MB).' });
    }

    await sock.sendMessage(jid, {
      video: result.data,
      mimetype: 'video/mp4',
      caption: `🎬 ${video.title}`
    }, { quoted: msg });

  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro: ${e.message.slice(0, 200)}` });
  }
}

const videoCommands = ['vídeo', 'video'];

module.exports = { handleVideo, videoCommands };
