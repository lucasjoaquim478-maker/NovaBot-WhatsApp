const fetch = require('node-fetch');
const config = require('../config.json');
const ytSearch = require('yt-search');

const OLLAMA_BASE = (config.ollamaBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_KEY = config.ollamaApiKey;
const OLLAMA_MODEL = config.ollamaModel || 'gemma3:27b';
const cidadeCommands = ['cidade'];

async function ollama(prompt) {
  const headers = { 'Content-Type': 'application/json' };
  if (OLLAMA_KEY) headers['Authorization'] = `Bearer ${OLLAMA_KEY}`;
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST', headers, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [{ role: 'user', content: prompt }],
      stream: false, options: { num_predict: 2048, num_ctx: 4096, temperature: 0.3 }
    })
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return data.message?.content || '';
}

async function wikiSummary(title) {
  const sources = [
    `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ .*/, ''))}`,
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
  ];
  for (const url of sources) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'NovaBot/3' }, signal: AbortSignal.timeout(7000) });
      if (r.ok) return await r.json();
    } catch {}
  }
  return null;
}

async function wikiCoords(title) {
  try {
    const r = await fetch(
      `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=coordinates&format=json`,
      { headers: { 'User-Agent': 'NovaBot/3' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    for (const p of Object.values(d.query?.pages || {})) {
      if (p.coordinates?.[0]) return p.coordinates[0];
    }
  } catch {}
  return null;
}

async function wikiImages(title) {
  try {
    const r = await fetch(
      `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&piprop=original|thumbnail&pithumbsize=600`,
      { headers: { 'User-Agent': 'NovaBot/3' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return [];
    const d = await r.json();
    const urls = [];
    for (const p of Object.values(d.query?.pages || {})) {
      if (p.thumbnail?.source) urls.push(p.thumbnail.source);
      if (p.original?.source) urls.push(p.original.source);
    }
    return urls;
  } catch { return []; }
}

async function getWeather(lat, lon) {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function formatWeather(w, name) {
  if (!w) return '🌤️ Dados meteorológicos não encontrados.\n';
  const c = w.current;
  const d = w.daily;
  let txt = `🌡️ *Temperatura:* ${c.temperature_2m}°C\n`;
  txt += `🤔 *Sensação:* ${c.apparent_temperature}°C\n`;
  txt += `💧 *Umidade:* ${c.relative_humidity_2m}%\n`;
  txt += `💨 *Vento:* ${c.wind_speed_10m} km/h\n\n📅 *Previsão 5 dias:*\n`;
  for (let i = 1; i < d.time.length && i <= 5; i++) {
    txt += `  ${d.time[i]}: 🌡️ ${d.temperature_2m_min[i]}~${d.temperature_2m_max[i]}°C\n`;
  }
  return txt;
}

async function searchVideo(query) {
  try {
    const r = await ytSearch(`${query} cidade turismo`);
    return r?.videos?.slice(0, 3).map(v => ({
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      duration: v.duration?.toString() || 'N/A'
    })) || [];
  } catch { return []; }
}

async function handleCidade(sock, { jid, sender, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Use: !cidade <nome da cidade>\nExemplo: !cidade Nova York' });
    return;
  }

  const cityName = args.join(' ');
  await sock.sendMessage(jid, { text: `🔍 Pesquisando *${cityName}*...` });

  let report = '';
  const imagesToSend = [];
  let videoUrl = '';

  try {
    const wiki = await wikiSummary(cityName);
    const title = wiki?.title || cityName;
    const coords = wiki?.coordinates || await wikiCoords(title);
    const imgs = await wikiImages(title);
    imagesToSend.push(...imgs);

    if (wiki) {
      const extract = (wiki.extract || '').slice(0, 3000);
      report += `🏙️ *${wiki.title}*\n`;
      if (wiki.description) report += `📝 *${wiki.description}*\n\n`;

      const prompt = `Gere um relatório COMPLETO e DETALHADO sobre a cidade "${title}" em português. Use EXATAMENTE o formato abaixo, preenchendo cada seção. Se não souber algum dado, escreva "Dados não encontrados".

      🏙️ INFORMAÇÕES GERAIS
      - Nome completo:
      - Estado/Província:
      - País:
      - População:
      - Área territorial:
      - Densidade demográfica:
      - Fuso horário:
      - Coordenadas geográficas: ${coords ? `${coords.lat}, ${coords.lon}` : 'Dados não encontrados'}
      - Altitude:

      📜 HISTÓRIA
      - Fundação:
      - Origem do nome:
      - Principais acontecimentos históricos:
      - Evolução da cidade:

      🎭 CULTURA
      - Festas tradicionais:
      - Costumes locais:
      - Gastronomia típica:
      - Música e danças regionais:
      - Artesanato:

      🏛️ ECONOMIA
      - Principais atividades econômicas:
      - Empresas importantes:
      - PIB:
      - Setores de destaque:

      🌳 NATUREZA
      - Biomas presentes:
      - Rios, lagos, montanhas:
      - Parques naturais e áreas de preservação:

      🐾 FAUNA
      - Animais nativos e espécies raras:
      - Aves, mamíferos, répteis e peixes da região:

      🏫 EDUCAÇÃO
      - Escolas e universidades:
      - Índices educacionais:

      🏥 SAÚDE
      - Hospitais principais:
      - Indicadores de saúde:

      🚗 INFRAESTRUTURA
      - Rodovias, aeroportos, transporte público:
      - Energia e saneamento:

      🗺️ TURISMO
      - Principais atrações:
      - Melhores épocas para visitar:

      ⭐ CURIOSIDADES
      - Fatos interessantes, recordes:
      - Personalidades famosas nascidas na cidade:

      Informações adicionais do Wikipedia: ${extract.slice(0, 2000)}`;

      const aiReport = await ollama(prompt);
      report += aiReport;
    } else {
      const prompt = `Gere um relatório COMPLETO e DETALHADO sobre a cidade "${cityName}" em português. Use o formato com todas as seções abaixo, preenchendo cada uma:

      🏙️ INFORMAÇÕES GERAIS
      📜 HISTÓRIA
      🎭 CULTURA
      🏛️ ECONOMIA
      🌳 NATUREZA
      🐾 FAUNA
      🏫 EDUCAÇÃO
      🏥 SAÚDE
      🚗 INFRAESTRUTURA
      🗺️ TURISMO
      ⭐ CURIOSIDADES`;

      const aiReport = await ollama(prompt);
      report += `🏙️ *${cityName.toUpperCase()}*\n\n${aiReport}`;
    }

    const weather = coords ? await getWeather(coords.lat, coords.lon) : null;
    if (weather) {
      report += `\n\n🌦️ *CLIMA ATUAL EM ${title.toUpperCase()}*\n${formatWeather(weather, title)}`;
    }

    const videos = await searchVideo(title);
    if (videos.length > 0) {
      videoUrl = videos[0].url;
      report += `\n\n🎥 *VÍDEO*\n${videoUrl}`;
    }

    const totalLen = report.length;
  } catch (err) {
    report += `\n\n❌ *Erro:* ${err.message}`;
  }

  const maxMsgLen = 4000;
  if (report.length > maxMsgLen) {
    const parts = [];
    let remaining = report;
    while (remaining.length > 0) {
      let cut = remaining.slice(0, maxMsgLen);
      const lastBreak = cut.lastIndexOf('\n\n');
      if (lastBreak > 100 && remaining.length > maxMsgLen) {
        cut = remaining.slice(0, lastBreak);
      }
      parts.push(cut);
      remaining = remaining.slice(cut.length);
    }
    for (const part of parts) {
      await sock.sendMessage(jid, { text: part });
    }
  } else {
    await sock.sendMessage(jid, { text: report });
  }

  for (const imgUrl of imagesToSend.slice(0, 6)) {
    try {
      const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(8000) });
      if (imgRes.ok) {
        const buf = await imgRes.buffer();
        await sock.sendMessage(jid, { image: buf });
      }
    } catch {}
  }

  if (videoUrl && report.length < 6000) {
    try {
      const vidRes = await fetch(videoUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (vidRes.ok) {
        await sock.sendMessage(jid, { text: `🎥 *Vídeo sobre ${cityName}*\n${videoUrl}` });
      }
    } catch {}
  }
}

module.exports = { handleCidade, cidadeCommands };
