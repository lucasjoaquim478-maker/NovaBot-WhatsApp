const fetch = require('node-fetch');
const ytSearch = require('yt-search');

const cidadeCommands = ['cidade'];
const cache = new Map();
const CACHE_TTL = 3600000;

function cacheGet(key) {
  const entry = cache.get(key.toLowerCase());
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function cacheSet(key, data) {
  if (cache.size > 100) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key.toLowerCase(), { data, ts: Date.now() });
}

async function wikiSummary(title) {
  const candidates = [title, `${title} (cidade)`, `${title} (município)`, `${title} city`];
  for (const c of candidates) {
    try {
      const url = `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(c)}`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'NovaBot/3.0' },
        signal: AbortSignal.timeout(7000)
      });
      if (r.ok) {
        const d = await r.json();
        if (d?.title && d?.extract) return { ...d, lang: 'pt' };
      }
    } catch {}
  }
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'NovaBot/3.0' },
      signal: AbortSignal.timeout(7000)
    });
    if (r.ok) {
      const d = await r.json();
      if (d?.title && d?.extract) return { ...d, lang: 'en' };
    }
  } catch {}
  return null;
}

async function wikiFullExtract(title) {
  try {
    const url = `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&explaintext&format=json&redirects=1`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'NovaBot/3.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    for (const p of Object.values(d.query?.pages || {})) {
      return p.extract || null;
    }
  } catch {}
  return null;
}

async function wikiImages(title) {
  try {
    const r = await fetch(
      `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&piprop=original|thumbnail&pithumbsize=800&pilimit=5`,
      { headers: { 'User-Agent': 'NovaBot/3.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) return [];
    const d = await r.json();
    const seen = new Set();
    const urls = [];
    for (const p of Object.values(d.query?.pages || {})) {
      for (const src of [p.original?.source, p.thumbnail?.source]) {
        if (src && !seen.has(src)) { seen.add(src); urls.push(src); }
      }
    }
    return urls;
  } catch { return []; }
}

async function wikiCoords(title) {
  try {
    const r = await fetch(
      `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=coordinates&format=json&redirects=1`,
      { headers: { 'User-Agent': 'NovaBot/3.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    for (const p of Object.values(d.query?.pages || {})) {
      if (p.coordinates?.[0]) return p.coordinates[0];
    }
  } catch {}
  return null;
}

async function wikiPageProps(title) {
  try {
    const r = await fetch(
      `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&format=json&redirects=1`,
      { headers: { 'User-Agent': 'NovaBot/3.0' }, signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    for (const p of Object.values(d.query?.pages || {})) {
      return p.pageprops || null;
    }
  } catch {}
  return null;
}

async function wikidataInfo(qid) {
  if (!qid) return null;
  try {
    const r = await fetch(
      `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
      { headers: { 'User-Agent': 'NovaBot/3.0' }, signal: AbortSignal.timeout(7000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const entity = d.entities?.[qid];
    if (!entity) return null;
    const claims = entity.claims || {};
    const getVal = (pid) => {
      const c = claims[pid];
      if (!c?.[0]) return null;
      const mainsnak = c[0].mainsnak;
      if (mainsnak?.datatype === 'quantity') {
        const q = mainsnak.datavalue?.value;
        if (!q) return null;
        let v = `${q.amount}`;
        if (q.unit?.includes('Q712226')) v += ' km²';
        else if (q.unit?.includes('Q11570')) v += ' km²';
        return v;
      }
      if (mainsnak?.datatype === 'string') return mainsnak.datavalue?.value;
      if (mainsnak?.datatype === 'wikibase-item') {
        const id = mainsnak.datavalue?.value?.id;
        if (!id) return null;
        const label = entity.labels?.['pt']?.value || entity.labels?.['en']?.value || id;
        return label;
      }
      if (mainsnak?.datatype === 'globe-coordinate') {
        const coord = mainsnak.datavalue?.value;
        if (coord) return `${coord.latitude}, ${coord.longitude}`;
      }
      if (mainsnak?.datatype === 'time') return mainsnak.datavalue?.value?.time?.replace(/^\+/, '').replace(/T00:00:00Z/, '') || null;
      if (mainsnak?.datatype === 'monolingualtext') return mainsnak.datavalue?.value?.text;
      if (mainsnak?.datatype === 'external-id') return mainsnak.datavalue?.value;
      if (mainsnak?.datavalue?.value) return String(mainsnak.datavalue.value);
      return null;
    };
    return {
      population: getVal('P1082'),
      area: getVal('P2046'),
      founded: getVal('P571'),
      elevation: getVal('P2044'),
      country: getVal('P17'),
      state: getVal('P131'),
      postalCode: getVal('P281'),
      website: getVal('P856'),
      timezone: getVal('P421'),
      demonym: getVal('P1549'),
      density: getVal('P2196'),
      mayor: getVal('P6'),
    };
  } catch { return null; }
}

async function getWeather(lat, lon) {
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=3`,
      { signal: AbortSignal.timeout(7000) }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function parseSections(extract) {
  const sections = {};
  const lines = extract.split('\n');
  let current = 'introdução';
  let text = [];
  for (const line of lines) {
    const m = line.match(/^==\s*(.+?)\s*==$/);
    if (m) {
      if (text.length) { sections[current] = text.join('\n').trim(); text = []; }
      current = m[1].trim().toLowerCase();
    } else {
      text.push(line);
    }
  }
  if (text.length) sections[current] = text.join('\n').trim();
  return sections;
}

function extractDataPoints(text) {
  const data = {};
  if (!text) return data;

  const popMatch = text.match(/(?:população|habitantes|pop\.)[^.]*?(?:é|de|cerca de|aproximadamente|tem)\s*(\d[\d\s.]*(?:milh[ãa]o|milhões|mil|bilhão|bilhões)?)/i);
  if (popMatch) data.population = popMatch[1].trim();

  const pop2 = text.match(/(\d[\d\s.]*\d+)\s*(?:habitantes|pessoas|moradores|pessoas vivem)/i);
  if (pop2 && !data.population) data.population = pop2[1].trim();

  const areaMatch = text.match(/[áa]rea[^.]{0,60}?(?:é|de|tem|total)\s*[^.]{0,30}?(\d[\d\s.,]*(?:km²|km2|quilômetros|quilometros))/i);
  if (areaMatch) data.area = areaMatch[1].trim();

  const dataMatch = text.match(/fundad[ao][^.]{0,50}(?:em|no|na|a)[^.]{0,40}(\d{4})/i);
  if (dataMatch) data.founded = dataMatch[1].trim();

  const altMatch = text.match(/altitude[^.]{0,60}(?:de|média)[^.]{0,40}(\d[\d.]*)\s*m(?:etros)?/i);
  if (altMatch) data.elevation = altMatch[1].trim();

  const climaMatch = text.match(/clima[^.]{0,100}/i);
  if (climaMatch) data.climate = climaMatch[0].trim();

  const estadoMatch = text.match(/(?:estado|estado do|estado da|estado de|província|provincia)[^.]{0,80}/i);
  if (estadoMatch) data.state = estadoMatch[0].trim();

  return data;
}

function extractSectionText(sections, keywords) {
  for (const kw of keywords) {
    for (const [key, val] of Object.entries(sections)) {
      if (key.includes(kw) && val.length > 20) {
        const lines = val.split('\n').filter(l => l.trim() && !l.match(/^==+/));
        return lines.length > 5
          ? lines.slice(0, 5).join('\n').slice(0, 800)
          : val.slice(0, 800);
      }
    }
  }
  return null;
}

async function searchVideo(query) {
  try {
    const r = await ytSearch(`${query} cidade`);
    return r?.videos?.slice(0, 2)
      .filter(v => v.url && v.title)
      .map(v => ({ title: v.title, url: v.url })) || [];
  } catch { return []; }
}

function extractCountry(text) {
  if (!text) return null;
  const countries = ['Brasil', 'Portugal', 'Angola', 'Moçambique', 'Cabo Verde', 'Guiné-Bissau',
    'São Tomé e Príncipe', 'Timor-Leste', 'Estados Unidos', 'França', 'Inglaterra', 'Espanha',
    'Itália', 'Alemanha', 'Japão', 'China', 'Índia', 'Argentina', 'México', 'Canadá',
    'Austrália', 'Rússia', 'Reino Unido', 'África do Sul', 'Egito', 'Marrocos', 'Peru',
    'Colômbia', 'Chile', 'Uruguai', 'Paraguai', 'Bolívia', 'Venezuela', 'Equador', 'Cuba'];
  for (const c of countries) {
    if (text.includes(c)) return c;
  }
  const m = text.match(/(?:país|no|da|do|na)\s+([A-Z][a-záéíóúãõçâêô]+)/);
  return m?.[1] || null;
}

async function handleCidade(sock, { jid, sender, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Use: !cidade <nome da cidade>\nExemplo: !cidade Paris' });
    return;
  }

  const cityName = args.join(' ').trim();
  const cached = cacheGet(cityName);
  if (cached) {
    await sock.sendMessage(jid, { text: cached.report });
    for (const img of cached.images.slice(0, 4)) {
      try {
        const r = await fetch(img, { signal: AbortSignal.timeout(6000) });
        if (r.ok) await sock.sendMessage(jid, { image: await r.buffer() });
      } catch {}
    }
    if (cached.video) {
      await sock.sendMessage(jid, { text: `🎥 *Vídeo*\n${cached.video}` });
    }
    return;
  }

  await sock.sendMessage(jid, { text: `🔍 Pesquisando *${cityName}*...` });

  let report = '';
  const images = [];
  let videoUrl = '';
  let erro = '';

  try {
    const wiki = await wikiSummary(cityName);
    if (!wiki) {
      await sock.sendMessage(jid, { text: `❌ Cidade "${cityName}" não encontrada. Verifique o nome e tente novamente.` });
      return;
    }

    const title = wiki.title;
    const description = wiki.description || '';
    const extractIntro = wiki.extract || '';
    const coords = wiki.coordinates || await wikiCoords(title);
    const props = await wikiPageProps(title);
    const wd = props?.wikibase_item ? await wikidataInfo(props.wikibase_item) : null;
    const fullExtract = await wikiFullExtract(title) || extractIntro;

    const sections = parseSections(fullExtract);
    const datapoints = extractDataPoints(fullExtract);
    const wikiImgs = await wikiImages(title);
    images.push(...wikiImgs);

    report += `━━━━━━━━━━━━━━━━━━\n`;
    report += `🏙️ *${title.toUpperCase()}*\n`;
    if (description) report += `📝 ${description}\n`;
    report += `━━━━━━━━━━━━━━━━━━\n\n`;

    report += `📍 *INFORMAÇÕES GERAIS*\n`;
    report += `📍 Nome: ${title}\n`;
    report += `🌎 País: ${wd?.country || extractCountry(extractIntro) || '❌ Informação indisponível.'}\n`;
    report += `🏛️ Estado: ${wd?.state || datapoints.state || '❌ Informação indisponível.'}\n`;
    report += `👥 População: ${wd?.population || datapoints.population || '❌ Informação indisponível.'}\n`;
    report += `📏 Área: ${wd?.area || datapoints.area || '❌ Informação indisponível.'}\n`;
    report += `📐 Altitude: ${wd?.elevation || datapoints.elevation || '❌ Informação indisponível.'} m\n`;
    report += `🌐 Coordenadas: ${coords ? `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : '❌ Informação indisponível.'}\n`;
    report += `🕐 Fuso: ${wd?.timezone || '❌ Informação indisponível.'}\n`;
    if (wd?.founded || datapoints.founded) report += `📅 Fundação: ${wd?.founded || datapoints.founded}\n`;
    if (wd?.demonym) report += `👤 Gentílico: ${wd.demonym}\n`;

    const clima = extractSectionText(sections, ['clima']);
    if (clima) report += `\n🌤️ *CLIMA*\n${clima}\n`;

    const history = extractSectionText(sections, ['história', 'historia', 'origem', 'funda']);
    if (history) report += `\n📜 *HISTÓRIA*\n${history}\n`;

    const culture = extractSectionText(sections, ['cultura']);
    if (culture) report += `\n🎭 *CULTURA*\n${culture}\n`;

    const economy = extractSectionText(sections, ['economia']);
    if (economy) report += `\n🏛️ *ECONOMIA*\n${economy}\n`;

    const geography = extractSectionText(sections, ['geografia']);
    if (geography) report += `\n🌳 *GEOGRAFIA*\n${geography}\n`;

    const tourism = extractSectionText(sections, ['turismo']);
    if (tourism) report += `\n🗺️ *TURISMO*\n${tourism}\n`;

    const gastronomy = extractSectionText(sections, ['gastronomia', 'culinária', 'culinaria']);
    if (gastronomy) report += `\n🍽️ *GASTRONOMIA*\n${gastronomy}\n`;

    const education = extractSectionText(sections, ['educaçao', 'educação']);
    if (education) report += `\n🏫 *EDUCAÇÃO*\n${education}\n`;

    const health = extractSectionText(sections, ['saude', 'saúde']);
    if (health) report += `\n🏥 *SAÚDE*\n${health}\n`;

    const infra = extractSectionText(sections, ['infraestrutura', 'infra-estrutura', 'transporte']);
    if (infra) report += `\n🚗 *INFRAESTRUTURA*\n${infra}\n`;

    const fauna = extractSectionText(sections, ['fauna']);
    if (fauna) report += `\n🐾 *FAUNA*\n${fauna}\n`;

    const events = extractSectionText(sections, ['festas', 'eventos']);
    if (events) report += `\n🎉 *EVENTOS*\n${events}\n`;

    const curiosities = extractSectionText(sections, ['curiosidades']);
    if (curiosities) report += `\n⭐ *CURIOSIDADES*\n${curiosities}\n`;

    const people = extractSectionText(sections, ['personalidades', 'pessoas notáveis', 'pessoas notaveis', 'nativos notáveis', 'nativos notaveis']);
    if (people) report += `\n👤 *PERSONALIDADES*\n${people}\n`;

    const intro = extractIntro.slice(0, 1500);
    if (intro && Object.keys(sections).length <= 2) {
      report += `\n📖 *SOBRE*\n${intro}\n`;
    }

    if (coords) {
      const weather = await getWeather(coords.lat, coords.lon);
      if (weather && weather.current) {
        report += `\n🌦️ *CLIMA ATUAL*\n`;
        report += `🌡️ Temperatura: ${weather.current.temperature_2m}°C\n`;
        report += `🤔 Sensação: ${weather.current.apparent_temperature}°C\n`;
        report += `💧 Umidade: ${weather.current.relative_humidity_2m}%\n`;
        report += `💨 Vento: ${weather.current.wind_speed_10m} km/h\n`;
        if (weather.daily) {
          report += `🌅 Nascer: ${weather.daily.sunrise?.[0]?.split('T')[1] || 'N/A'}\n`;
          report += `🌇 Pôr: ${weather.daily.sunset?.[0]?.split('T')[1] || 'N/A'}\n`;
          report += `\n📅 *PREVISÃO*\n`;
          for (let i = 1; i < weather.daily.time.length; i++) {
            const date = weather.daily.time[i].split('-').slice(1).join('/');
            report += `  ${date}: 🌡️ ${weather.daily.temperature_2m_min[i]}~${weather.daily.temperature_2m_max[i]}°C\n`;
          }
        }
      }
    }

    const videos = await searchVideo(title);
    if (videos.length > 0) {
      videoUrl = videos[0].url;
    }
  } catch (err) {
    erro = err.message;
    report += `\n❌ *Erro ao processar:* ${erro}`;
  }

  const toCache = { report, images, video: videoUrl };
  cacheSet(cityName, toCache);

  const MAX = 4000;
  if (report.length > MAX) {
    let r = report;
    while (r.length > 0) {
      let cut = r.slice(0, MAX);
      const brk = cut.lastIndexOf('\n\n');
      if (brk > 50 && r.length > MAX) cut = r.slice(0, brk);
      await sock.sendMessage(jid, { text: cut });
      r = r.slice(cut.length);
    }
  } else {
    await sock.sendMessage(jid, { text: report });
  }

  for (const img of images.slice(0, 4)) {
    try {
      const r = await fetch(img, { signal: AbortSignal.timeout(7000) });
      if (r.ok) await sock.sendMessage(jid, { image: await r.buffer() });
    } catch {}
  }

  if (videoUrl) {
    await sock.sendMessage(jid, { text: `🎥 *Vídeo sobre ${cityName}*\n${videoUrl}` });
  }

  await sock.sendMessage(jid, { text: `✅ Fim das informações sobre *${cityName}*.\nUse !cidade <outra cidade> para pesquisar novamente.` });
}

module.exports = { handleCidade, cidadeCommands };
