const yts = require('yt-search');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { formatDuration, formatNumber } = require('../lib/utils');

const searchCache = new Map();
const CACHE_TTL = 3600000;

const YT_DLP = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
const FFMPEG = path.join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = execFile(YT_DLP, args, { maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve(stdout);
      }
    });
    child.on('error', reject);
  });
}

async function downloadAudio(url) {
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outFile = path.join(tempDir, `audio_${Date.now()}`);

  try {
    const args = [
      '-f', 'bestaudio[ext=m4a]/bestaudio',
      '--max-filesize', '25M',
      '--ffmpeg-location', FFMPEG,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '128K',
      '--output', `${outFile}.%(ext)s`,
      '--no-warnings',
      '--no-playlist',
      url
    ];

    await runYtDlp(args);

    const mp3File = `${outFile}.mp3`;
    if (!fs.existsSync(mp3File)) {
      throw new Error('Arquivo de audio nao foi gerado');
    }

    const data = fs.readFileSync(mp3File);
    fs.unlinkSync(mp3File);
    return { success: true, data };
  } catch (e) {
    try { fs.unlinkSync(`${outFile}.mp3`); } catch {}
    try { fs.unlinkSync(`${outFile}.webm`); } catch {}
    try { fs.unlinkSync(`${outFile}.m4a`); } catch {}
    return { success: false, error: e.message };
  }
}

async function searchMusic(query) {
  const cacheKey = query.toLowerCase().trim();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;

  const result = await yts(query);
  const videos = result.videos
    .filter(v => v.seconds < 900)
    .sort((a, b) => b.views - a.views);

  if (!videos.length) return null;

  const best = videos[0];
  searchCache.set(cacheKey, { data: best, time: Date.now() });
  return best;
}

async function handlePlay(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    return await sock.sendMessage(jid, { text: '❌ Digite o nome da musica. Ex: !play Believer' });
  }

  const query = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);

  try {
    const video = await searchMusic(query);
    if (!video) return await sock.sendMessage(jid, { text: '❌ Musica nao encontrada.' });

    const infoText = `🎵 *${video.title}*\n\n⏱ ${formatDuration(video.seconds)}  👁 ${formatNumber(video.views)}\n📺 ${video.author?.name || 'N/A'}\n\n⏳ Baixando audio...`;

    if (video.thumbnail) {
      try {
        await sock.sendMessage(jid, { image: { url: video.thumbnail }, caption: infoText });
      } catch {
        await sock.sendMessage(jid, { text: infoText });
      }
    } else {
      await sock.sendMessage(jid, { text: infoText });
    }

    const result = await downloadAudio(video.url);

    if (!result.success) {
      return await sock.sendMessage(jid, {
        text: `⚠️ Nao foi possivel baixar.\n\n📹 Link direto:\n${video.url}\n\n💡 Tente novamente ou use outro termo de busca.`
      });
    }

    await sock.sendMessage(jid, {
      audio: result.data,
      mimetype: 'audio/mpeg',
      ptt: false
    }, { quoted: msg });

  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro: ${e.message.slice(0, 200)}` });
  }
}

const playCommands = ['play', 'musica', 'music'];

module.exports = { handlePlay, playCommands };
