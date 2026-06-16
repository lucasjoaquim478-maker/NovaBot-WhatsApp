const yts = require('yt-search');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { formatDuration, formatNumber, convertToMp4, getYtDlpPath, getFfmpegPath, ytDlpArgs, ytDlpAttempts, ytDlpIsVideoUrl } = require('../lib/utils');
const ytdl = require('../lib/youtube-dl');

const YT_DLP = getYtDlpPath();
const FFMPEG = getFfmpegPath();

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = execFile(YT_DLP, args, { maxBuffer: 150 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message || '').slice(0, 500)));
      else resolve(stdout);
    });
    child.on('error', (e) => reject(new Error(`yt-dlp: ${e.message}`)));
  });
}

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function downloadVideoNative(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('URL invalida');
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outFile = path.join(tempDir, `vid_${Date.now()}_`);
  const maxNative = ytdl.maxAttempts();
  for (let attempt = 0; attempt < maxNative; attempt++) {
    try {
      const result = await ytdl.getBestVideo(videoId, attempt);
      if (!result.video || !result.video.url) throw new Error('Sem URL de video');
      if (!result.audio || !result.audio.url) throw new Error('Sem URL de audio');
      const videoRaw = outFile + 'v.mp4';
      const audioRaw = outFile + 'a.m4a';
      const merged = outFile + '.mp4';
      await ytdl.downloadUrl(result.video.url, videoRaw);
      await ytdl.downloadUrl(result.audio.url, audioRaw);
      await new Promise((resolve, reject) => {
        execFile(FFMPEG, ['-i', videoRaw, '-i', audioRaw, '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', '-y', merged], { timeout: 120000 }, (err) => {
          try { fs.unlinkSync(videoRaw); } catch {}
          try { fs.unlinkSync(audioRaw); } catch {}
          err ? reject(err) : resolve();
        });
      });
      if (!fs.existsSync(merged)) throw new Error('Merge falhou');
      const data = fs.readFileSync(merged);
      fs.unlinkSync(merged);
      return { success: true, data, source: `native-${attempt}`, title: result.title };
    } catch (e) {
      console.log('[VIDEO NATIVE] Tentativa ' + attempt + ' falhou: ' + (e.message || '').slice(0, 100));
    }
  }
  try {
    for (const f of ['v.mp4', 'a.m4a', '.mp4']) { try { fs.unlinkSync(outFile + f); } catch {} }
  } catch {}
  throw new Error('Nativo falhou');
}

async function downloadVideo(url) {
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outFile = path.join(tempDir, `vid_${Date.now()}`);

  const nativeResult = await downloadVideoNative(url).catch(() => null);
  if (nativeResult) return nativeResult;

  let lastError;
  const maxAttempts = ytDlpAttempts();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const args = [
        ...ytDlpArgs(attempt),
        '-f', 'best[height<=1080]/best',
        '--max-filesize', '50M',
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', FFMPEG,
        '--output', `${outFile}.%(ext)s`,
        ytDlpIsVideoUrl(url, attempt)
      ];
      await runYtDlp(args);
      let videoFile = null;
      for (const ext of ['mp4', 'webm', 'mkv']) {
        const p = `${outFile}.${ext}`;
        if (fs.existsSync(p)) { videoFile = p; break; }
      }
      if (!videoFile) throw new Error('Video nao foi gerado');
      if (videoFile.endsWith('.webm') || videoFile.endsWith('.mkv')) {
        try { videoFile = await convertToMp4(videoFile); } catch {}
      }
      const data = fs.readFileSync(videoFile);
      const size = data.length;
      fs.unlinkSync(videoFile);
      return { success: true, data, size };
    } catch (e) {
      lastError = e;
    }
  }
  for (const ext of ['mp4', 'webm', 'mkv']) {
    try { fs.unlinkSync(`${outFile}.${ext}`); } catch {}
  }
  return { success: false, error: lastError.message };
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
        text: `⚠️ Nao foi possivel baixar.\n📹 Link: ${video.url}\n❌ Erro: ${result.error}\n💡 Tente um video mais curto.`
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
