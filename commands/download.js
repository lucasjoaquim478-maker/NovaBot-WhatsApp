const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const YT_DLP = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
const FFMPEG = path.join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = execFile(YT_DLP, args, { maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || '').slice(0, 300) || err.message));
      else resolve(stdout);
    });
    child.on('error', (e) => reject(new Error(`yt-dlp: ${e.message}`)));
  });
}

async function downloadYtDlp(url, extraArgs = []) {
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const outFile = path.join(tempDir, `soc_${Date.now()}`);
  const args = ['--no-warnings', '--no-playlist', '--max-filesize', '50M', '--ffmpeg-location', FFMPEG, '--output', `${outFile}.%(ext)s`, ...extraArgs, url];
  try {
    await runYtDlp(args);
    for (const e of ['mp4', 'webm', 'mkv', 'jpg', 'png', 'jpeg', 'gif', 'webp']) {
      const p = `${outFile}.${e}`;
      if (fs.existsSync(p)) { const data = fs.readFileSync(p); fs.unlinkSync(p); return { success: true, data, ext: e }; }
    }
    return { success: false, error: 'Nenhum arquivo gerado' };
  } catch (e) {
    for (const e2 of ['mp4', 'webm', 'mkv', 'jpg', 'png', 'jpeg', 'gif', 'webp']) {
      try { fs.unlinkSync(`${outFile}.${e2}`); } catch {}
    }
    return { success: false, error: e.message };
  }
}

function curlFetch(url) {
  return new Promise((resolve) => {
    execFile('curl', ['-s', '-L', '-m', '10', '-A', 'Mozilla/5.0', url], { maxBuffer: 5 * 1024 * 1024 }, (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout);
    });
  });
}

async function googleSearchPosts(username) {
  try {
    const html = await curlFetch(`https://www.google.com/search?q=site:instagram.com/reel/+${encodeURIComponent(username)}&hl=pt-BR`);
    if (!html) return null;
    const m = html.match(/https?:\/\/(?:www\.)?instagram\.com\/(reel|p)\/([a-zA-Z0-9_-]+)/);
    return m ? `https://www.instagram.com/${m[1]}/${m[2]}/` : null;
  } catch { return null; }
}

async function searchInstaUsername(username) {
  try {
    const html = await curlFetch(`https://www.google.com/search?q=${encodeURIComponent(username)}+instagram&hl=pt-BR`);
    if (!html) return null;
    const m = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/);
    if (m) return m[1];
  } catch {}
  const clean = username.replace(/[^a-z0-9]/g, '');
  return clean.length > 0 ? clean : null;
}

async function tryOembed(url) {
  try {
    const json = await curlFetch(`https://api.instagram.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!json) return null;
    const d = JSON.parse(json);
    if (d?.thumbnail_url) return { mediaUrl: d.thumbnail_url, type: 'image' };
    return null;
  } catch { return null; }
}

async function handleSocial(sock, { msg, jid, args, commandName }) {
  const input = args.join(' ').trim();
  if (!input) {
    return await sock.sendMessage(jid, { text: `❌ Informe URL ou @usuário.\n📌 !instagram https://instagram.com/reel/...\n📌 !instagram @usuário` });
  }

  await sock.sendPresenceUpdate('composing', jid);
  let url = input;
  const isUrl = !!input.match(/^https?:\/\//i);

  if (!isUrl && commandName === 'instagram') {
    let username = input.replace(/^@/, '').replace(/\s+/g, '').toLowerCase();
    if (!username) return await sock.sendMessage(jid, { text: '❌ Informe o nome.' });

    await sock.sendMessage(jid, { text: `🔍 Buscando @${username}...` });

    const foundUser = await searchInstaUsername(username);
    if (foundUser) username = foundUser;

    const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;

    const yt = await downloadYtDlp(profileUrl);
    if (yt.success) {
      const v = ['mp4', 'webm', 'mkv'].includes(yt.ext);
      await sock.sendMessage(jid, { [v ? 'video' : 'image']: yt.data, mimetype: v ? 'video/mp4' : `image/${yt.ext === 'jpg' ? 'jpeg' : yt.ext}`, caption: `📥 @${username}` }, { quoted: msg });
      return;
    }

    const googleUrl = await googleSearchPosts(username);
    if (googleUrl) {
      await sock.sendMessage(jid, { text: `✅ Encontrado! Baixando...` });
      for (const v of [
        { args: [], label: 'yt-dlp' },
        { args: ['--extractor-args', 'instagram:api=web'], label: 'api=web' },
      ]) {
        const r = await downloadYtDlp(googleUrl, v.args);
        if (r.success) {
          const isV = ['mp4', 'webm', 'mkv'].includes(r.ext);
          await sock.sendMessage(jid, { [isV ? 'video' : 'image']: r.data, mimetype: isV ? 'video/mp4' : `image/${r.ext === 'jpg' ? 'jpeg' : r.ext}`, caption: `📥 @${username}` }, { quoted: msg });
          return;
        }
      }
    }

    const oembed = await tryOembed(profileUrl);
    if (oembed) {
      const buf = await curlFetch(oembed.mediaUrl);
      if (buf && buf.length > 1024) {
        await sock.sendMessage(jid, { image: Buffer.from(buf, 'binary'), mimetype: 'image/jpeg', caption: `📥 @${username} (miniatura)` }, { quoted: msg });
        return;
      }
    }

    return await sock.sendMessage(jid, {
      text: `❌ Não encontrei posts de @${username}.\n\n📌 Tente com a URL direta:\n!instagram https://instagram.com/reel/...`
    });
  }

  if (!isUrl) {
    return await sock.sendMessage(jid, { text: `❌ Informe URL.\n📌 !${commandName} https://${commandName}.com/...` });
  }

  await sock.sendMessage(jid, { text: '⏳ Baixando...' });

  const ytVariants = [
    { args: [], label: 'yt-dlp padrao' },
    { args: ['--extractor-args', 'instagram:api=web'], label: 'api=web' },
    { args: ['--cookies-from-browser', 'chrome'], label: 'chrome' },
    { args: ['--cookies-from-browser', 'firefox'], label: 'firefox' },
    { args: ['--cookies-from-browser', 'edge'], label: 'edge' },
    { args: ['--cookies-from-browser', 'brave'], label: 'brave' },
    { args: ['--cookies-from-browser', 'opera'], label: 'opera' },
  ];

  for (const v of ytVariants) {
    const r = await downloadYtDlp(url, v.args);
    if (r.success) {
      const isV = ['mp4', 'webm', 'mkv'].includes(r.ext);
      await sock.sendMessage(jid, { [isV ? 'video' : 'image']: r.data, mimetype: isV ? 'video/mp4' : `image/${r.ext === 'jpg' ? 'jpeg' : r.ext}`, caption: `📥 De ${commandName}` }, { quoted: msg });
      return;
    }
  }

  const oembed = await tryOembed(url);
  if (oembed) {
    const buf = await curlFetch(oembed.mediaUrl);
    if (buf && buf.length > 1024) {
      await sock.sendMessage(jid, { image: Buffer.from(buf, 'binary'), mimetype: 'image/jpeg', caption: '📥 Miniatura do Instagram' }, { quoted: msg });
      return;
    }
  }

  await sock.sendMessage(jid, { text: `❌ Nao foi possivel baixar.\n\n📌 Pode ser porque:\n1. O Instagram bloqueia downloads sem login\n2. Sua rede/ISP bloqueia sites de download\n3. O perfil/post e privado\n\n💡 Tente: !instagram https://instagram.com/reel/...` });
}

async function handleDownload(sock, ctx) {
  return handleSocial(sock, ctx);
}

const downloadCommands = ['instagram', 'facebook'];

module.exports = { handleDownload, downloadCommands };
