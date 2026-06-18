const fetch = require('node-fetch');
const { formatNumber } = require('../lib/utils');

const searchCache = new Map();
const CACHE_TTL = 1800000;
const _pending = new Map();

async function searchTikTok(query, count = 10) {
  const cacheKey = query.toLowerCase().trim();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;

  const res = await fetch('https://tikwm.com/api/feed/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `keywords=${encodeURIComponent(query)}&count=${count}&cursor=0&region=BR`,
    signal: AbortSignal.timeout(15000)
  });
  const j = await res.json();
  if (j.code !== 0 || !j.data?.videos?.length) return [];

  const videos = j.data.videos.map(v => ({
    id: v.video_id,
    title: v.title?.replace(/[#]\S+/g, '').trim() || 'Sem título',
    author: v.author?.unique_id || 'desconhecido',
    nickname: v.author?.nickname || '',
    plays: v.play_count || 0,
    likes: v.digg_count || 0,
    comments: v.comment_count || 0,
    duration: v.duration || 0,
    videoUrl: v.play,
    videoUrlWm: v.wmplay,
    audioUrl: v.music,
    size: v.size || 0
  }));

  searchCache.set(cacheKey, { data: videos, time: Date.now() });
  return videos;
}

function buildResultsText(videos) {
  let text = '🔍 *Resultados encontrados:*\n\n';
  videos.forEach((v, i) => {
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    text += `${emojis[i] || (i+1)} *${v.title.slice(0, 40)}*\n`;
    text += `   👤 @${v.author}  👁 ${formatNumber(v.plays)}  ❤️ ${formatNumber(v.likes)}\n\n`;
  });
  text += '📌 *Digite o número do vídeo* (1-10)';
  return text;
}

async function handleTikTok(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Digite o termo de busca. Ex: !tiktok danca viral' });
    return;
  }

  const query = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: `🔎 Buscando por "${query}"...` });

  try {
    const videos = await searchTikTok(query);
    if (!videos.length) return await sock.sendMessage(jid, { text: '❌ Nenhum vídeo encontrado.' });

    _pending.set(sender, { videos, query, type: 'video', time: Date.now() });
    await sock.sendMessage(jid, { text: buildResultsText(videos) });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro na busca: ${e.message}` });
  }
}

async function handleTikTokMp3(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Digite o termo. Ex: !tiktokmp3 danca viral' });
    return;
  }

  const query = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: `🔎 Buscando "${query}"...` });

  try {
    const videos = await searchTikTok(query, 1);
    if (!videos.length) return await sock.sendMessage(jid, { text: '❌ Nenhum vídeo encontrado.' });

    const v = videos[0];
    await sock.sendMessage(jid, { text: `🎵 Baixando áudio de: ${v.title.slice(0, 50)} - @${v.author}` });

    const audioRes = await fetch(v.audioUrl, { signal: AbortSignal.timeout(30000) });
    if (!audioRes.ok) throw new Error('Falha ao baixar áudio');
    const buffer = Buffer.from(await audioRes.arrayBuffer());

    await sock.sendMessage(jid, {
      audio: buffer,
      mimetype: 'audio/mpeg',
      ptt: false
    }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
  }
}

async function handleSelection(sock, msg, text, jid, sender) {
  const pending = _pending.get(sender);
  if (!pending || Date.now() - pending.time > 60000) {
    _pending.delete(sender);
    return false;
  }

  const num = parseInt(text);
  if (isNaN(num) || num < 1 || num > pending.videos.length) return false;

  const v = pending.videos[num - 1];
  _pending.delete(sender);

  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: `⬇️ Baixando... ${v.title.slice(0, 50)}` });

  try {
    const dlUrl = pending.type === 'video' ? v.videoUrl : v.audioUrl;
    const res = await fetch(dlUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error('Falha ao baixar');
    const buffer = Buffer.from(await res.arrayBuffer());

    if (pending.type === 'video') {
      const cap = `🎬 *${v.title.slice(0, 100)}*\n👤 @${v.author}\n❤️ ${formatNumber(v.likes)}  👁 ${formatNumber(v.plays)}`;
      await sock.sendMessage(jid, { video: buffer, mimetype: 'video/mp4', caption: cap }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
    }
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Falha ao baixar: ${e.message}` });
  }
  return true;
}

const tiktokCommands = ['tiktok'];
const tiktokMp3Commands = ['tiktokmp3'];

function hasPending(sender) { const p = _pending.get(sender); return p && Date.now() - p.time <= 60000; }

module.exports = { handleTikTok, handleTikTokMp3, handleSelection, hasPending, tiktokCommands, tiktokMp3Commands };
