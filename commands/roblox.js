const fetch = require('node-fetch');
const config = require('../config.json');

const cache = new Map();
const CACHE_TTL = 600000;
const _pending = new Map();

function fmt(n) {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

// ─── CACHE ───────────────────────────────────────────────
async function cachedFetch(key, url, ttl = CACHE_TTL) {
  const c = cache.get(key);
  if (c && Date.now() - c.time < ttl) return c.data;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  cache.set(key, { data, time: Date.now() });
  return data;
}

// ─── OLLAMA AI ──────────────────────────────────────────
async function askOllama(prompt) {
  const baseUrl = (config.ollamaBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const apiKey = config.ollamaApiKey;
  const model = config.ollamaModel || 'gemma3:27b';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

  const res = await fetch(baseUrl + '/api/chat', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
      options: { num_predict: 1200, num_ctx: 4096 }
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[ROBLOX AI ERROR]', res.status, err.slice(0, 200));
    throw new Error('Ollama ' + res.status);
  }

  const j = await res.json();
  return j.message?.content || '';
}

// ─── WEB SEARCH ─────────────────────────────────────────
async function searchGameUrl(name) {
  const queries = [
    'roblox ' + name + ' game',
    name + ' roblox',
    name,
  ];

  for (const query of queries.slice(0, 3)) {
    try {
      const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000)
      });
      const html = await res.text();
      const matches = [...html.matchAll(/uddg=([^&"]+)/g)];
      const urls = matches.map(m => { try { return decodeURIComponent(m[1]); } catch(e) { return ''; } }).filter(Boolean);

      for (const url of urls) {
        const m = url.match(/\/(?:games?)\/(\d{7,})/);
        if (m) return m[1];
      }
    } catch {}
  }
  return null;
}

// ─── ROBLOX DATA ────────────────────────────────────────
async function scrapeGamePage(placeId) {
  const key = 'scrape:' + placeId;
  const c = cache.get(key);
  if (c && Date.now() - c.time < CACHE_TTL) return c.data;

  const res = await fetch('https://www.roblox.com/games/' + placeId, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000)
  });
  const html = await res.text();
  const universeId = (html.match(/data-universe-id[= ]['"](\d+)['"]/) || [])[1] || null;
  const thumbnailUrl = (html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/) || [])[1] || null;

  const result = { universeId, thumbnailUrl, placeId };
  cache.set(key, { data: result, time: Date.now() });
  return result;
}

async function getGameDetails(universeId) {
  const data = await cachedFetch('det:' + universeId, 'https://games.roblox.com/v1/games?universeIds=' + universeId);
  return (data.data || [])[0] || null;
}

async function getGameVotes(universeId) {
  const data = await cachedFetch('vot:' + universeId, 'https://games.roblox.com/v1/games/votes?universeIds=' + universeId);
  return (data.data || [])[0] || null;
}

async function getThumbnails(universeId) {
  const data = await cachedFetch('thb:' + universeId, 'https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=' + universeId + '&countPerUniverse=1&defaults=true&size=768x432&format=Jpeg');
  return (data.data || [])[0] || null;
}

async function getIcon(universeId) {
  const data = await cachedFetch('ico:' + universeId, 'https://thumbnails.roblox.com/v1/games/icons?universeIds=' + universeId + '&size=512x512&format=Jpeg');
  return (data.data || [])[0] || null;
}

async function searchUser(name) {
  const data = await cachedFetch('usr:' + name.toLowerCase(), 'https://users.roblox.com/v1/users/search?keyword=' + encodeURIComponent(name) + '&limit=1');
  return data.data || [];
}

async function getUserById(id) {
  return await cachedFetch('uid:' + id, 'https://users.roblox.com/v1/users/' + id);
}

async function getCreatorGames(userId) {
  const data = await cachedFetch('crg:' + userId, 'https://games.roblox.com/v2/users/' + userId + '/games?limit=10&sortOrder=Asc');
  return data.data || [];
}

// ─── FORMAT HELPERS ─────────────────────────────────────
function formatDate(iso) {
  if (!iso) return 'Desconhecido';
  return new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function calcScore(detail, votes) {
  let score = 5;
  const playing = detail.playing || 0;
  const visits = detail.visits || 0;
  const favorited = detail.favoritedCount || 0;

  if (playing > 100000) score += 1.5;
  else if (playing > 10000) score += 1;
  else if (playing > 1000) score += 0.5;

  if (visits > 1e9) score += 1.5;
  else if (visits > 1e7) score += 0.7;

  if (favorited > 100000) score += 1;
  else if (favorited > 10000) score += 0.5;

  if (votes) {
    const total = (votes.upVotes || 0) + (votes.downVotes || 0);
    if (total > 0) {
      const pct = votes.upVotes / total;
      if (pct > 0.95) score += 0.8;
      else if (pct > 0.85) score += 0.3;
    }
  }

  if (detail.updated) {
    const days = (Date.now() - new Date(detail.updated).getTime()) / 86400000;
    if (days < 30) score += 0.5;
    else if (days < 90) score += 0.2;
  } else {
    score -= 0.5;
  }

  return Math.min(10, Math.max(0, Math.round(score * 10) / 10));
}

function buildAnalysisPrompt(name, detail, votes) {
  const playing = detail.playing?.toLocaleString() || 'N/A';
  const visits = detail.visits?.toLocaleString() || 'N/A';
  const favorited = detail.favoritedCount?.toLocaleString() || 'N/A';
  const genre = detail.genre || 'N/A';
  const desc = (detail.description || 'Sem descricao').slice(0, 300);
  const created = formatDate(detail.created);
  const updated = formatDate(detail.updated);
  const creator = detail.creator?.name || 'Desconhecido';

  let likePct = 'N/A';
  if (votes) {
    const total = (votes.upVotes || 0) + (votes.downVotes || 0);
    if (total > 0) likePct = ((votes.upVotes / total) * 100).toFixed(1) + '%';
  }

  return `Analise o jogo Roblox abaixo e gere uma review completa em PORTUGUES BRASILEIRO:

DADOS OFICIAIS:
Nome: ${name}
Criador: ${creator}
Jogadores ativos: ${playing}
Visitas totais: ${visits}
Favoritos: ${favorited}
Avaliacao: ${likePct} de curtidas
Genero: ${genre}
Criado em: ${created}
Ultima atualizacao: ${updated}
Descricao original (${'ingles'}): ${desc}

Com base NESTES DADOS REAIS, gere:

1. 📝 DESCRICAO (traduza a descricao acima para portugues brasileiro).
2. 🔥 ANALISE (5-10 linhas): explique o objetivo do jogo, como funciona, o que o torna popular, se ainda vale a pena jogar hoje.
3. ✅ PONTOS FORTES: 3 pontos especificos baseados nos dados.
4. ❌ PONTOS FRACOS: 2-3 pontos especificos baseados nos dados.
5. 🎯 RECOMENDADO PARA: tipos de jogadores.
6. 🏆 NOTA: X.X/10 baseada nos dados.

Use o formato:
📝 DESCRICAO
(texto traduzido)

🔥 ANALISE
...

✅ PONTOS FORTES
• ...
❌ PONTOS FRACOS
• ...
🎯 RECOMENDADO PARA
• ...
🏆 NOTA: X.X/10`;
}

// ─── BUILD OUTPUT ──────────────────────────────────────
function buildHeader(name, detail, votes) {
  const playing = fmt(detail.playing);
  const visits = fmt(detail.visits);
  const favorited = fmt(detail.favoritedCount);
  const creator = detail.creator?.name || 'Desconhecido';
  const genre = detail.genre || 'N/A';
  const created = formatDate(detail.created);
  const updated = formatDate(detail.updated);
  const link = 'https://www.roblox.com/games/' + (detail.rootPlaceId || detail.universeId);

  let likePct = 'N/A';
  if (votes) {
    const total = (votes.upVotes || 0) + (votes.downVotes || 0);
    if (total > 0) likePct = ((votes.upVotes / total) * 100).toFixed(1) + '%';
  }

  let text = '╔═══════════════════════╗\n';
  text += '║     🎮 *' + name.toUpperCase() + '*\n';
  text += '╚═══════════════════════╝\n\n';
  text += '┃ 👨‍💻 *Criador:* ' + creator + '\n';
  text += '┃ 👥 *Jogando agora:* ' + playing + '\n';
  text += '┃ 👍 *Avaliacao:* ' + likePct + '\n';
  text += '┃ ⭐ *Favoritos:* ' + favorited + '\n';
  text += '┃ 👁️ *Visitas:* ' + visits + '\n';
  text += '┃ 🏷️ *Genero:* ' + genre + '\n';
  text += '┃ 📅 *Criado em:* ' + created + '\n';
  text += '┃ 🔄 *Atualizado:* ' + updated + '\n\n';
  text += '┃ 🔗 *Jogar:* ' + link;
  return { text, link };
}

function buildResultList(items) {
  const nums = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let text = '🔍 *Resultados:*\n\n';
  items.forEach((g, i) => {
    text += (nums[i] || (i+1)) + ' *' + (g.name || '?') + '*\n';
    text += '   👤 ' + (g.creator?.name || '?') + '  👥 ' + fmt(g.playing || 0) + '\n\n';
  });
  text += '📌 *Digite o numero* (1-' + items.length + ')';
  return text;
}

// ─── SEND GAME INFO ─────────────────────────────────────
async function sendGameInfo(sock, jid, msg, detail) {
  const uid = detail.universeId || detail.rootPlaceId;
  const placeId = detail.rootPlaceId || uid;
  if (!uid) return await sock.sendMessage(jid, { text: '❌ ID do jogo nao encontrado.' });

  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '📊 Coletando dados...' });

  try {
    const [votes, page] = await Promise.all([
      getGameVotes(uid).catch(() => null),
      scrapeGamePage(placeId).catch(() => null)
    ]);

    const thumbnailUrl = page?.thumbnailUrl;

    const { text: headerText, link } = buildHeader(detail.name || 'Jogo', detail, votes);

    // Send header
    await sock.sendMessage(jid, { text: headerText });

    // Send game thumbnail (from og:image on game page)
    if (thumbnailUrl) {
      try {
        const tRes = await fetch(thumbnailUrl, { signal: AbortSignal.timeout(20000) });
        if (tRes.ok) {
          const tBuf = await tRes.buffer();
          if (tBuf.length > 1024) {
            await sock.sendMessage(jid, { image: tBuf, mimetype: 'image/jpeg', caption: '🎮 *' + detail.name + '*\n👥 ' + fmt(detail.playing) + ' jogando agora\n🔗 ' + link }, { quoted: msg });
          }
        }
      } catch (e) { console.error('[ROBLOX IMG]', e.message); }
    }

    // Generate AI analysis
    await sock.sendPresenceUpdate('composing', jid);
    await sock.sendMessage(jid, { text: '🤖 Gerando analise com IA...' });

    const analysisPrompt = buildAnalysisPrompt(detail.name || 'Jogo', detail, votes);
    let analysis = '';
    try {
      analysis = await askOllama(analysisPrompt);
    } catch (e) {
      analysis = '⚠️ Analise indisponivel no momento.';
    }

    const score = calcScore(detail, votes);

    let finalText = '━━━━━━━━━━━━━━━━━━━━━\n\n';
    finalText += (analysis || '🤖 *ANALISE*\n\n' + analysisPrompt.slice(0, 300) + '...');
    if (!analysis.includes('🏆')) {
      finalText += '\n\n━━━━━━━━━━━━━━━━━━━━━';
      finalText += '\n🏆 *Nota NovaBot:* ' + score.toFixed(1) + '/10';
      finalText += '\n\n🔗 ' + link;
    }
    finalText += '\n\n━━━━━━━━━━━━━━━━━━━━━';
    finalText += '\n📊 *Fonte:* DuckDuckGo + Roblox API + IA';

    await sock.sendMessage(jid, { text: finalText });

  } catch (e) {
    await sock.sendMessage(jid, { text: '❌ Erro ao carregar dados: ' + e.message + '\n\n🔗 https://www.roblox.com/games/' + uid });
  }
}

// ─── COMMAND HANDLERS ──────────────────────────────────
async function handleRoblox(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ *Use:*\n!roblox [URL] — ver info\n!roblox [nome] — buscar na internet\n!roblox [ID] — ver por ID\n\n*Ex:*\n!roblox blox fruits\n!roblox https://www.roblox.com/games/2753915549\n!roblox 2753915549' });
    return;
  }

  const input = args.join(' ').trim();
  let placeId = null;

  // Check for URL or direct ID
  const urlMatch = input.match(/roblox\.com\/games\/(\d+)/);
  if (urlMatch) placeId = urlMatch[1];
  else if (/^\d{7,}$/.test(input)) placeId = input;

  if (placeId) {
    await sock.sendPresenceUpdate('composing', jid);
    await sock.sendMessage(jid, { text: '🔎 Obtendo dados do jogo...' });
    try {
      const page = await scrapeGamePage(placeId);
      if (!page.universeId) throw new Error('Jogo nao encontrado (ID invalido)');
      const detail = await getGameDetails(page.universeId);
      if (!detail) throw new Error('Dados nao disponiveis');
      await sendGameInfo(sock, jid, msg, detail);
    } catch (e) {
      await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message });
    }
    return;
  }

  // Search by name
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '🔎 Buscando "' + input + '" na internet...' });

  try {
    const found = await searchGameUrl(input);
    if (!found) {
      await sock.sendMessage(jid, { text: '❌ Nao encontrei o jogo "' + input + '".\nTente usar a URL direta:\n!roblox https://www.roblox.com/games/ID/Nome' });
      return;
    }

    await sock.sendMessage(jid, { text: '✅ Encontrado! Place ID: ' + found + '\n🔎 Obtendo dados...' });

    const page = await scrapeGamePage(found);
    if (!page.universeId) throw new Error('Nao foi possivel obter dados do jogo');
    const detail = await getGameDetails(page.universeId);
    if (!detail) throw new Error('Dados nao disponiveis');
    await sendGameInfo(sock, jid, msg, detail);
  } catch (e) {
    await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message });
  }
}

async function handleTrending(sock, { msg, jid }) {
  const popular = [
    { n: 'Blox Fruits', id: '2753915549' },
    { n: 'Adopt Me!', id: '920587237' },
    { n: 'Brookhaven RP', id: '4924922222' },
    { n: 'Doors', id: '4606295963' },
    { n: 'Tower of Hell', id: '3707314156' },
    { n: 'Pet Simulator X', id: '6284587330' },
    { n: 'Jailbreak', id: '606849829' },
    { n: 'Murder Mystery 2', id: '142823291' },
    { n: 'Arsenal', id: '286090429' },
    { n: 'Fisch', id: '16732604052' },
  ];

  const nums = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  let text = '🔥 *TOP 10 JOGOS POPULARES*\n\n';
  popular.forEach((g, i) => {
    text += nums[i] + ' *' + g.n + '*\n';
    text += '   🔗 roblox.com/games/' + g.id + '\n\n';
  });
  text += '📌 Use *!roblox [nome/URL]* para ver detalhes + analise IA';

  // Try to get first game thumbnail
  try {
    const page = await scrapeGamePage(popular[0].id);
    if (page?.universeId) {
      const icon = await getIcon(page.universeId);
      if (icon?.imageUrl) {
        const iRes = await fetch(icon.imageUrl, { signal: AbortSignal.timeout(10000) });
        if (iRes.ok) {
          await sock.sendMessage(jid, { image: Buffer.from(await iRes.arrayBuffer()), caption: text });
          return;
        }
      }
    }
  } catch {}
  await sock.sendMessage(jid, { text });
}

async function handleTop(sock, { msg, jid }) {
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '📊 Use *!robloxtrend* para ver os jogos mais populares!\n\nOu busque direto:\n!roblox [nome do jogo]' });
}

async function handleLancar(sock, { msg, jid }) {
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '🆕 *Jogos recem-lancados*\n\nPara ver jogos novos, acesse:\nhttps://www.roblox.com/discover\n\nE use *!roblox [URL]* para analisar qualquer jogo!' });
}

async function handleSimilar(sock, { msg, jid, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Ex: !robloxsimilar blox fruits' });
    return;
  }
  const query = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '🔎 Buscando jogos similares a "' + query + '"...\n\nUse *!roblox [nome]* para buscar um jogo especifico.' });
}

async function handleReview(sock, { msg, jid, args }) {
  await handleRoblox(sock, { msg, jid, sender: jid, args });
}

async function handleCreator(sock, { msg, jid, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Ex: !robloxcriador Gamer Robot Inc' });
    return;
  }

  const name = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '🔎 Buscando criador "' + name + '"...' });

  try {
    const users = await searchUser(name);
    if (!users.length) return await sock.sendMessage(jid, { text: '❌ Criador nao encontrado.' });

    const user = users[0];
    const userInfo = await getUserById(user.id).catch(() => ({}));
    const games = await getCreatorGames(user.id);

    let text = '┏━━━━━━━━━━━━━━━━━┓\n';
    text += '┃  👨‍💻 *' + (userInfo.displayName || user.name || user.displayName).toUpperCase() + '*\n';
    text += '┃  🆔 ID: ' + user.id + '\n';
    text += '┃  📅 ' + formatDate(userInfo.created) + '\n';
    text += '┗━━━━━━━━━━━━━━━━━┛\n\n';

    if (games.length) {
      text += '*Jogos (' + games.length + '):*\n';
      games.forEach((g, i) => {
        text += (i+1) + '. *' + g.name + '* — 👥 ' + fmt(g.playing || 0) + ' 👁 ' + fmt(g.visits || 0) + '\n';
      });
    } else {
      text += 'Nenhum jogo encontrado.\n';
    }

    text += '\n🔗 https://www.roblox.com/users/' + user.id + '/profile';
    await sock.sendMessage(jid, { text });
  } catch (e) {
    await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message });
  }
}

async function handleSelection(sock, msg, text, jid, sender) {
  const pending = _pending.get(sender);
  if (!pending || pending.type !== 'roblox' || Date.now() - pending.time > 60000) {
    _pending.delete(sender);
    return false;
  }
  const num = parseInt(text);
  if (isNaN(num) || num < 1 || num > pending.games.length) return false;
  const game = pending.games[num - 1];
  _pending.delete(sender);
  await sendGameInfo(sock, jid, msg, game);
  return true;
}

const robloxCommands = ['roblox'];
const trendCommands = ['robloxtrend'];
const topCommands = ['robloxtop'];
const lancarCommands = ['robloxlancar'];
const similarCommands = ['robloxsimilar'];
const reviewCommands = ['robloxreview'];
const creatorCommands = ['robloxcriador'];

module.exports = {
  handleRoblox, handleTrending, handleTop, handleLancar, handleSimilar, handleReview, handleCreator, handleSelection,
  robloxCommands, trendCommands, topCommands, lancarCommands, similarCommands, reviewCommands, creatorCommands
};
