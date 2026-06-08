const fetch = require('node-fetch');
const ytSearch = require('yt-search');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const YT_DLP = path.join(process.cwd(), 'bin', 'yt-dlp.exe');
const FFMPEG = path.join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');
const TEMP_DIR = path.join(process.cwd(), 'temp');

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

async function callWikiAPI(params) {
  const qs = new URLSearchParams({ ...params, format: 'json', redirects: '1', origin: '*' });
  try {
    const r = await fetch(`https://pt.wikipedia.org/w/api.php?${qs}`, {
      headers: { 'User-Agent': 'NovaBot/3.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (r.status === 429) return { rateLimited: true };
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchCityData(title) {
  let d = await callWikiAPI({
    action: 'query', titles: title,
    prop: 'extracts|coordinates|pageimages|pageprops',
    explaintext: '', pithumbsize: '800', piprop: 'original|thumbnail'
  });

  if (d?.rateLimited) return { rateLimited: true };

  let foundPage = null;
  if (d?.query?.pages) {
    for (const p of Object.values(d.query.pages)) {
      if (p.missing !== undefined) continue;
      if (!p.extract || p.extract.length < 10) continue;
      foundPage = p;
      break;
    }
  }

  if (!foundPage) {
    d = await callWikiAPI({
      action: 'query', list: 'search', srsearch: title, srlimit: '5', srprop: ''
    });
    if (d?.rateLimited) return { rateLimited: true };
    if (d?.query?.search?.length) {
      const found = d.query.search[0].title;
      d = await callWikiAPI({
        action: 'query', titles: found,
        prop: 'extracts|coordinates|pageimages|pageprops',
        explaintext: '', pithumbsize: '800', piprop: 'original|thumbnail'
      });
      if (d?.query?.pages) {
        for (const p of Object.values(d.query.pages)) {
          if (p.missing !== undefined) continue;
          if (!p.extract || p.extract.length < 10) continue;
          foundPage = p;
          break;
        }
      }
    }
  }

  if (foundPage) {
    const imgs = [];
    const seen = new Set();
    for (const src of [foundPage.original?.source, foundPage.thumbnail?.source]) {
      if (src && !seen.has(src)) { seen.add(src); imgs.push(src); }
    }
    const result = {
      pageid: foundPage.pageid,
      title: foundPage.title,
      extract: foundPage.extract || null,
      intro: foundPage.extract?.split('\n')[0] || null,
      description: foundPage.description || null,
      coordinates: foundPage.coordinates?.[0] || null,
      images: imgs,
      wikidataId: foundPage.pageprops?.wikibase_item || null,
      lang: 'pt'
    };
    return result;
  }

  try {
    const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { 'User-Agent': 'NovaBot/3.0' }, signal: AbortSignal.timeout(7000)
    });
    if (r.ok) {
      const ed = await r.json();
      if (ed?.title && ed?.extract && !ed.type?.startsWith('https://mediawiki.org/wiki/HyperSwitch/errors/')) {
        return {
          title: ed.title, extract: ed.extract, intro: ed.extract?.split('\n')[0],
          description: ed.description, coordinates: ed.coordinates || null,
          images: ed.thumbnail?.source ? [ed.thumbnail.source] : [],
          lang: 'en'
        };
      }
    }
  } catch {}

  return null;
}

async function commonsImages(title) {
  try {
    const r = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent('"' + title + '"')}&srnamespace=6&format=json&srlimit=8&srprop=`,
      { headers: { 'User-Agent': 'NovaBot/3.0' }, signal: AbortSignal.timeout(7000) }
    );
    if (!r.ok) return [];
    const d = await r.json();
    const titles = (d?.query?.search || []).map(s => s.title).filter(t => t.toLowerCase().includes(title.split(' ')[0].toLowerCase()));
    if (!titles.length) return [];
    const ur = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join('|'))}&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json`,
      { headers: { 'User-Agent': 'NovaBot/3.0' }, signal: AbortSignal.timeout(7000) }
    );
    if (!ur.ok) return [];
    const ud = await ur.json();
    const urls = [];
    const seen = new Set();
    for (const p of Object.values(ud.query?.pages || {})) {
      if (p.imageinfo?.[0]?.url && !seen.has(p.imageinfo[0].url)) {
        seen.add(p.imageinfo[0].url);
        urls.push(p.imageinfo[0].url);
      }
    }
    return urls.slice(0, 6);
  } catch { return []; }
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
        let v = `${q.amount}`.replace(/^\+/, '');
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

  const estadoMatch = text.match(/(?:estado do|estado da|estado de|do estado)\s+([A-Z][a-zA-Záéíóúãõçâêô\s]+?)(?:\s*[,.]|\s+na|\s+em|\s+no|\s+à|\s+a\s)/i);
  if (estadoMatch) data.state = estadoMatch[1].trim();

  return data;
}

function extractSectionText(sections, keywords) {
  for (const kw of keywords) {
    for (const [key, val] of Object.entries(sections)) {
      if (key.includes(kw) && val.length > 20) {
        const lines = val.split('\n').filter(l => l.trim() && !l.match(/^==+/));
        return lines.length > 10
          ? lines.slice(0, 10).join('\n').slice(0, 2000)
          : val.slice(0, 2000);
      }
    }
  }
  return null;
}

async function searchVideo(query) {
  try {
    const r = await ytSearch(`${query} cidade turismo`);
    return r?.videos?.slice(0, 2)
      .filter(v => v.url && v.title && parseInt(v.seconds) < 600)
      .map(v => ({ title: v.title, url: v.url, seconds: parseInt(v.seconds) || 0 })) || [];
  } catch { return []; }
}

function downloadVideoClip(url) {
  return new Promise((resolve) => {
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const outFile = path.join(TEMP_DIR, `cidade_${Date.now()}`);
    const child = execFile(YT_DLP, [
      url, '-f', 'best[height<=720]/best',
      '--max-filesize', '45M',
      '--merge-output-format', 'mp4',
      '--download-sections', '*0:00-0:30',
      '--force-keyframes-at-cuts',
      '--ffmpeg-location', FFMPEG,
      '--output', `${outFile}.%(ext)s`,
      '--no-playlist', '--no-warnings', '--no-progress'
    ], { timeout: 60000, maxBuffer: 50 * 1024 * 1024 }, (err) => {
      if (err) { resolve(null); return; }
      let videoFile = null;
      for (const ext of ['mp4', 'webm', 'mkv']) {
        const p = `${outFile}.${ext}`;
        if (fs.existsSync(p)) { videoFile = p; break; }
      }
      if (!videoFile) { resolve(null); return; }
      const stat = fs.statSync(videoFile);
      if (stat.size > 50 * 1024 * 1024) { fs.unlinkSync(videoFile); resolve(null); return; }
      resolve(videoFile);
    });
    child.on('error', () => resolve(null));
  });
}

function extractCountry(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (lower.includes('brasil') || lower.includes('brasileir')) return 'Brasil';
  if (lower.includes('portugal') || lower.includes('português') || lower.includes('portuguesa') || lower.includes('luso')) return 'Portugal';
  if (lower.includes('angola') || lower.includes('angolano')) return 'Angola';
  if (lower.includes('moçambique') || lower.includes('mocambique') || lower.includes('moçambicano')) return 'Moçambique';
  if (lower.includes('cabo verde') || lower.includes('caboverdiano') || lower.includes('cabo-verdiano')) return 'Cabo Verde';
  if (lower.includes('guiné-bissau') || lower.includes('guine-bissau')) return 'Guiné-Bissau';
  if (lower.includes('são tomé') || lower.includes('sao tome')) return 'São Tomé e Príncipe';
  if (lower.includes('timor-leste') || lower.includes('timor leste')) return 'Timor-Leste';
  if (lower.includes('frança') || lower.includes('francesa') || lower.includes('francês') || lower.includes('frances')) return 'França';
  if (lower.includes('espanha') || lower.includes('espanhol') || lower.includes('espanhola')) return 'Espanha';
  if (lower.includes('itália') || lower.includes('italia') || lower.includes('italiano') || lower.includes('italiana')) return 'Itália';
  if (lower.includes('alemanha') || lower.includes('alemã') || lower.includes('alemão') || lower.includes('alemao')) return 'Alemanha';
  if (lower.includes('inglaterra') || lower.includes('inglês') || lower.includes('ingles') || lower.includes('britânico') || lower.includes('britanico') || lower.includes('reino unido')) return 'Reino Unido';
  if (lower.includes('estados unidos') || lower.includes('americano') || lower.includes('norte-americano')) return 'Estados Unidos';
  if (lower.includes('argentina') || lower.includes('argentino') || lower.includes('argentina')) return 'Argentina';
  if (lower.includes('méxico') || lower.includes('mexico') || lower.includes('mexicano') || lower.includes('mexicana')) return 'México';
  if (lower.includes('canadá') || lower.includes('canada') || lower.includes('canadense') || lower.includes('canadiano')) return 'Canadá';
  if (lower.includes('austrália') || lower.includes('australia') || lower.includes('australiano')) return 'Austrália';
  if (lower.includes('rússia') || lower.includes('russia') || lower.includes('russo') || lower.includes('russa')) return 'Rússia';
  if (lower.includes('japão') || lower.includes('japao') || lower.includes('japonês') || lower.includes('japones') || lower.includes('japonesa')) return 'Japão';
  if (lower.includes('china') || lower.includes('chinês') || lower.includes('chines') || lower.includes('chinesa')) return 'China';
  if (lower.includes('índia') || lower.includes('india') || lower.includes('indiano') || lower.includes('indiana')) return 'Índia';
  if (lower.includes('áfrica do sul') || lower.includes('africa do sul') || lower.includes('sul-africano')) return 'África do Sul';
  if (lower.includes('egito') || lower.includes('egípcio')) return 'Egito';
  if (lower.includes('marrocos') || lower.includes('marroquino')) return 'Marrocos';
  if (lower.includes('peru') || lower.includes('peruano')) return 'Peru';
  if (lower.includes('colômbia') || lower.includes('colombia') || lower.includes('colombiano')) return 'Colômbia';
  if (lower.includes('chile') || lower.includes('chileno')) return 'Chile';
  if (lower.includes('uruguai') || lower.includes('uruguaio')) return 'Uruguai';
  if (lower.includes('paraguai') || lower.includes('paraguaio')) return 'Paraguai';
  if (lower.includes('bolívia') || lower.includes('bolivia') || lower.includes('boliviano')) return 'Bolívia';
  if (lower.includes('venezuela') || lower.includes('venezuelano')) return 'Venezuela';
  if (lower.includes('equador') || lower.includes('equatoriano')) return 'Equador';
  if (lower.includes('cuba') || lower.includes('cubano')) return 'Cuba';
  if (lower.includes('suíça') || lower.includes('suica') || lower.includes('suíço') || lower.includes('suico')) return 'Suíça';
  if (lower.includes('holanda') || lower.includes('neerlândes') || lower.includes('neerlandes') || lower.includes('holandês') || lower.includes('holandes')) return 'Países Baixos';
  if (lower.includes('suécia') || lower.includes('suecia') || lower.includes('sueco') || lower.includes('sueca')) return 'Suécia';
  if (lower.includes('noruega') || lower.includes('norueguês') || lower.includes('noruegues') || lower.includes('norueguesa')) return 'Noruega';
  return null;
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
    const wiki = await fetchCityData(cityName);
    if (wiki?.rateLimited) {
      await sock.sendMessage(jid, { text: `⏳ Muitas consultas seguidas! Aguarde alguns segundos e tente novamente.` });
      return;
    }
    if (!wiki) {
      await sock.sendMessage(jid, { text: `❌ Cidade "${cityName}" não encontrada no Wikipedia. Verifique o nome e tente novamente.` });
      return;
    }

    const title = wiki.title;
    const extractIntro = wiki.extract || '';
    images.push(...(wiki.images || []));

    const commonImgs = await commonsImages(title);
    for (const img of commonImgs) {
      if (!images.includes(img)) images.push(img);
    }

    let fullExtract = wiki.extract || '';
    if (fullExtract) {
      const moreR = await callWikiAPI({
        action: 'query', titles: title,
        prop: 'extracts', explaintext: '', formatversion: '2'
      });
      const p = moreR?.query?.pages?.[0];
      if (p?.extract && p.extract.length > fullExtract.length) fullExtract = p.extract;
    }

    const sections = parseSections(fullExtract);
    const datapoints = extractDataPoints(extractIntro + '\n' + (fullExtract || ''));
    const wd = wiki.wikidataId ? await wikidataInfo(wiki.wikidataId) : null;

    report += `━━━━━━━━━━━━━━━━━━\n`;
    report += `🏙️ *${title.toUpperCase()}*\n`;
    if (wiki.description) report += `📝 ${wiki.description}\n`;
    report += `━━━━━━━━━━━━━━━━━━\n\n`;

    report += `📍 *INFORMAÇÕES GERAIS*\n`;
    report += `📍 Nome: ${title}\n`;
    report += `🌎 País: ${wd?.country || extractCountry(extractIntro) || '❌ Informação indisponível.'}\n`;
    report += `🏛️ Estado: ${wd?.state || datapoints.state || '❌ Informação indisponível.'}\n`;
    report += `👥 População: ${wd?.population || datapoints.population || '❌ Informação indisponível.'}\n`;
    report += `📏 Área: ${wd?.area || datapoints.area || '❌ Informação indisponível.'}\n`;
    report += `📐 Altitude: ${wd?.elevation || datapoints.elevation || '❌ Informação indisponível.'} m\n`;
    report += `🌐 Coordenadas: ${wiki.coordinates ? `${wiki.coordinates.lat.toFixed(4)}, ${wiki.coordinates.lon.toFixed(4)}` : '❌ Informação indisponível.'}\n`;
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

    if (wiki.coordinates) {
      const weather = await getWeather(wiki.coordinates.lat, wiki.coordinates.lon);
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
    await sock.sendMessage(jid, { text: `⏳ Baixando vídeo sobre ${cityName}...` });
    const videoPath = await downloadVideoClip(videoUrl);
    if (videoPath) {
      try {
        const buf = fs.readFileSync(videoPath);
        await sock.sendMessage(jid, { video: buf, caption: `🎥 ${cityName}` });
        fs.unlinkSync(videoPath);
      } catch {
        await sock.sendMessage(jid, { text: `🎥 *Vídeo sobre ${cityName}*\n${videoUrl}` });
      }
    } else {
      await sock.sendMessage(jid, { text: `🎥 *Vídeo sobre ${cityName}*\n${videoUrl}` });
    }
  }

  await sock.sendMessage(jid, { text: `✅ Fim das informações sobre *${cityName}*.\nUse !cidade <outra cidade> para pesquisar novamente.` });
}

module.exports = { handleCidade, cidadeCommands };
