const db = require('../database/index');
const fetch = require('node-fetch');
const https = require('https');
const fs = require('fs');
const path = require('path');

const piadas = [
  'Por que o programador foi preso? Porque ele usou um codigo malicioso!',
  'O que o HTML falou para o CSS? Você me deixa estiloso!',
  'Por que o Java developer usa oculos? Porque ele não consegue C#!',
  'Qual o animal favorito do programador? O panda (panda = "from pandas import *")',
  'O que o zero disse para o oito? Belo cinto!',
  'Por que o livro de matematica estava triste? Porque tinha muitos problemas!',
  'O que o pato falou para a pata? Vem qua!',
  'Por que o esqueleto não lutou boxe? Porque ele não tem estomago pra isso!',
  'Qual o cafe mais perigoso do mundo? O ex-pres-sionista!',
  'O que o peixe falou quando caiu na agua? Nada!'
];

const memes = [
  'https://i.imgur.com/LPLxYxL.jpg',
  'https://i.imgur.com/6VBx3Mv.jpg',
  'https://i.imgur.com/3A7qYQk.jpg',
  'https://i.imgur.com/Xq3cT0D.jpg',
  'https://i.imgur.com/1mVN6F3.jpg'
];

let memeIndex = 0;

async function searchMyinstants(query) {
  const url = `https://www.myinstants.com/pt/search/?name=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const results = [];
  const playRegex = /onclick="play\('([^']+)'/g;
  let pMatch;
  const playMatches = [];
  while ((pMatch = playRegex.exec(html)) !== null) {
    playMatches.push({ url: 'https://www.myinstants.com' + pMatch[1], index: pMatch.index });
  }
  const titleRegex = /<a[^>]*class="instant-link[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let tMatch;
  while ((tMatch = titleRegex.exec(html)) !== null) {
    const title = tMatch[1].replace(/<[^>]+>/g, '').trim();
    if (!title) continue;
    const nearestPlay = playMatches.find(p => p.index > tMatch.index);
    if (nearestPlay && nearestPlay.index - tMatch.index < 500) {
      if (!results.some(r => r.url === nearestPlay.url)) {
        results.push({ title, url: nearestPlay.url });
      }
    } else {
      results.push({ title, url: '' });
    }
  }
  return results.filter(r => r.url);
}

const myinstantsCache = new Map();

async function handleMeme(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    const url = memes[memeIndex % memes.length];
    memeIndex++;
    return await sock.sendMessage(jid, { image: { url }, caption: '😂 Meme para você!' }, { quoted: msg });
  }

  const query = args.join(' ');
  await sock.sendMessage(jid, { text: `🔍 Buscando memes: *${query}*...` });

  try {
    const results = await searchMyinstants(query);
    if (!results.length) return await sock.sendMessage(jid, { text: '❌ Nenhum meme encontrado.' });

    const key = sender + ':' + Date.now();
    myinstantsCache.set(key, { results, time: Date.now() });

    let txt = `╭─── *「 MEMES ENCONTRADOS 」* ───╮\n`;
    txt += `│ 🔍 "${query}"\n│\n`;
    const maxResults = Math.min(results.length, 10);
    for (let i = 0; i < maxResults; i++) {
      const r = results[i];
      const num = (i + 1).toString().padStart(2, '0');
      txt += `│ ${num}. ${r.title.slice(0, 40)}\n│\n`;
    }
    if (results.length > maxResults) txt += `│ ... +${results.length - maxResults} resultados\n│\n`;
    txt += `│ 💡 Responda com *!memesel <n>*\n`;
    txt += `╰──────────────────────────────────╯\n`;
    txt += `\`\`\`Código: ${key}\`\`\``;
    await sock.sendMessage(jid, { text: txt });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro na busca: ${e.message.slice(0, 200)}` });
  }
}

async function downloadMyinstantsAudio(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadMyinstantsAudio(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function handleMemeSel(sock, { msg, jid, sender, args }) {
  if (!args.length) return await sock.sendMessage(jid, { text: '❌ Use: !memesel <numero>' });

  const num = parseInt(args[0]);
  if (isNaN(num) || num < 1) return await sock.sendMessage(jid, { text: '❌ Número inválido.' });

  let found = null;
  for (const [key, data] of myinstantsCache) {
    if (key.startsWith(sender) && Date.now() - data.time < 120000) {
      if (num <= data.results.length) {
        found = data.results[num - 1];
        myinstantsCache.delete(key);
        break;
      }
    }
  }
  if (!found) return await sock.sendMessage(jid, { text: '❌ Resultado expirado. Busque novamente com !meme <termo>' });

  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const mp3Path = path.join(tempDir, `meme_${Date.now()}.mp3`);

  await sock.sendMessage(jid, { text: `⬇️ Baixando: *${found.title}*...` });

  try {
    await downloadMyinstantsAudio(found.url, mp3Path);
    const data = fs.readFileSync(mp3Path);
    fs.unlinkSync(mp3Path);
    await sock.sendMessage(jid, { audio: data, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
  } catch (e) {
    try { fs.unlinkSync(mp3Path); } catch {}
    await sock.sendMessage(jid, { text: `❌ Erro ao baixar: ${e.message.slice(0, 200)}` });
  }
}

async function handleDiversao(sock, { msg, jid, sender, args, commandName }) {
  switch (commandName) {
    case 'meme': return await handleMeme(sock, { msg, jid, sender, args });
    case 'memesel': return await handleMemeSel(sock, { msg, jid, sender, args });
    case 'piada': {
      const piada = piadas[Math.floor(Math.random() * piadas.length)];
      await sock.sendMessage(jid, { text: `😂 *Piada:*\n\n${piada}` });
      break;
    }
    case 'dado': {
      const result = Math.floor(Math.random() * 6) + 1;
      await sock.sendMessage(jid, { text: `🎲 *Dado:* Caiu no número *${result}*!` });
      break;
    }
    case 'moeda': {
      const result = Math.random() < 0.5 ? 'Cara' : 'Coroa';
      await sock.sendMessage(jid, { text: `🪙 *Moeda:* ${result}!` });
      break;
    }
    case 'roleta': {
      const boom = Math.random() < 0.3;
      if (boom) {
        await sock.sendMessage(jid, { text: `💥 *ROLETA RUSSA* 💥\n\n🔫 Você morreu! Tente novamente.` });
      } else {
        await sock.sendMessage(jid, { text: `🍀 *ROLETA RUSSA* 🍀\n\n🔫 Você sobreviveu!` });
      }
      break;
    }
    case 'perfil': {
      const user = db.getUser(sender);
      const name = user.name || sender.split('@')[0];
      await sock.sendMessage(jid, {
        text: `👤 *Perfil de ${name}*\n\n📊 *Nível:* ${user.level || 1}\n⭐ *XP:* ${user.xp || 0}\n💰 *Coins:* ${user.coins || 0}\n🏦 *Banco:* ${user.bank || 0}\n💬 *Mensagens:* ${user.messages || 0}\n⚡ *Comandos:* ${user.commands || 0}`
      });
      break;
    }
  }
}

const diversaoCommands = ['meme', 'piada', 'dado', 'moeda', 'roleta', 'perfil', 'memesel'];

module.exports = { handleDiversao, diversaoCommands };
