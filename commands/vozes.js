const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const FFMPEG = path.join(ROOT, 'node_modules', '@ffmpeg-installer', 'win32-x64', 'ffmpeg.exe');
const TEMP_DIR = path.join(ROOT, 'temp');
const CACHE_DIR = path.join(TEMP_DIR, 'voz_cache');

const MAX_CHARS = 250;
const CACHE_TTL = 86400000;

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

// ─── TEXT PREPROCESSING ──────────────────────────────────
const ABBREVIATIONS = {
  'vc': 'você', 'tb': 'também', 'pq': 'porque', 'q': 'que',
  'td': 'tudo', 'ngm': 'ninguém', 'obg': 'obrigado', 'blz': 'beleza',
  'dps': 'depois', 'tlgd': 'entendeu', 'mt': 'muito', 'to': 'estou',
  'ta': 'está', 'tá': 'está', 'não': 'não', 'so': 'só',
  'cmg': 'comigo', 'ctg': 'contigo', 'pra': 'para', 'pro': 'para o',
  'num': 'não', 'mto': 'muito', 'mts': 'muitos', 'qnd': 'quando',
  'aki': 'aqui', 'aki': 'aqui', 'pqp': 'puxa',
};
const EMOJI_PATTERN = /[\u{1F300}-\u{1FAD6}\u{1FA00}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE00}-\u{FE0F}]/gu;
const INVALID_CHAR_PATTERN = /[^\w\sáéíóúâêîôûàèìòùãõçäëïöüÁÉÍÓÚÂÊÎÔÛÀÈÌÒÙÃÕÇÄËÏÖÜñÑ.,!?;:()\-"'@#$%&*+=\/\[\]{}|~` ]/g;

function preprocessText(text) {
  let t = text.normalize('NFC');

  // Remove emojis
  t = t.replace(EMOJI_PATTERN, '');

  // Normalize whitespace
  t = t.replace(/\s+/g, ' ').trim();

  // Expand common abbreviations (word boundary)
  t = t.replace(/\b(vc|tb|pq|q|td|ngm|obg|blz|dps|tlgd|mt|to|ta|tá|não|so|cmg|ctg|pra|pro|num|mto|mts|qnd|aki|pqp)\b/gi,
    (m) => ABBREVIATIONS[m.toLowerCase()] || m);

  // Ensure sentence ends with period if missing and long enough
  if (t.length > 10 && !/[.!?;]$/.test(t)) t += '.';

  // Add natural comma after common interjections
  t = t.replace(/\b(Olá|Ola|Oi|Hei|Ei|É|Ah|Oh)\s+(?=\w)/g, '$1, ');

  return t;
}

// ─── TTS ENGINES ─────────────────────────────────────────
function safeUnlink(p) { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {} }

async function sapiTTS(text, voiceName) {
  const wav = path.join(TEMP_DIR, 'sv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.wav');
  const mp3 = path.join(TEMP_DIR, 'sv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.mp3');
  const psFile = path.join(TEMP_DIR, 'sv_ps_' + Date.now() + '.ps1');

  const escapedWav = wav.replace(/\\/g, '\\\\');
  const escapedText = text.replace(/'/g, "''").replace(/"/g, '`"');
  const psCmd = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice("Microsoft Maria Desktop"); $s.SetOutputToWaveFile("${escapedWav}"); $s.Speak('${escapedText.replace(/'/g, "''")}'); $s.Dispose()`;

  fs.writeFileSync(psFile, psCmd, 'utf8');
  try {
    await new Promise((resolve, reject) => {
      execFile('powershell', ['-ExecutionPolicy', 'Bypass', '-File', psFile], { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => {
        safeUnlink(psFile);
        if (err) return reject(new Error('SAPI: ' + (stderr || err.message).slice(0, 200)));
        if (!fs.existsSync(wav)) return reject(new Error('SAPI: no áudio output'));
        resolve();
      });
    });
  } catch (e) {
    safeUnlink(psFile); safeUnlink(wav);
    throw e;
  }
  return { wav, mp3 };
}

async function gttsTTS(text) {
  const gTTS = require('gtts');
  const raw = path.join(TEMP_DIR, 'gt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.mp3');
  const out = path.join(TEMP_DIR, 'gt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.mp3');

  await new Promise((resolve, reject) => {
    const g = new gTTS(text, 'pt');
    g.save(raw, (err) => { if (err) reject(err); else resolve(); });
  });
  return { raw, out };
}

async function generateBaseAudio(text) {
  // Try SAPI first, fall back to gTTS
  try {
    const { wav, mp3 } = await sapiTTS(text);
    return { type: 'wav', path: wav, output: mp3 };
  } catch (sapiErr) {
    console.error('[VOZ] SAPI failed, using gTTS:', sapiErr.message);
    try {
      const { raw, out } = await gttsTTS(text);
      return { type: 'mp3', path: raw, output: out };
    } catch (gttsErr) {
      throw new Error('TTS unavailable: ' + gttsErr.message);
    }
  }
}

// ─── FFMPEG POST-PROCESSING ──────────────────────────────
function buildPitchFilter(pitch) {
  if (!pitch || pitch === 1) return '';
  let target = 1 / pitch;
  const parts = [];
  while (target > 2.0) { parts.push('atempo=2'); target /= 2; }
  while (target < 0.5) { parts.push('atempo=0.5'); target /= 0.5; }
  parts.push('atempo=' + target.toFixed(4));
  return 'asetrate=44100*' + pitch + ',aresample=44100,' + parts.join(',');
}

function buildTempoFilter(tempo) {
  if (!tempo || tempo === 1) return '';
  let t = tempo;
  const parts = [];
  while (t > 2.0) { parts.push('atempo=2'); t /= 2; }
  while (t < 0.5) { parts.push('atempo=0.5'); t /= 0.5; }
  parts.push('atempo=' + t.toFixed(4));
  return parts.join(',');
}

function buildPostFilter(opts) {
  const chain = [];

  // 1. Resample to 44100 Hz for consistency
  chain.push('aresample=44100');

  // 2. Volume normalize (Dynamic Áudio Normalizer)
  chain.push('dynaudnorm=p=0.95:g=15:m=10');

  // 4. Apply voice-specific effects
  const effects = [];

  // Pitch shift (if needed)
  const pf = buildPitchFilter(opts.pitch);
  if (pf) effects.push(pf);

  // Tempo (if needed, only if no pitch shift)
  if (opts.tempo && opts.tempo !== 1 && (!opts.pitch || opts.pitch === 1)) {
    const tf = buildTempoFilter(opts.tempo);
    if (tf) effects.push(tf);
  }

  // Echo/reverb
  if (opts.echo_delay) {
    effects.push('aecho=0.8:' + (opts.echo_decay || 0.3) + ':' + opts.echo_delay + ':0.5');
  }

  // EQ
  if (opts.eq) {
    for (const e of opts.eq) {
      effects.push('equalizer=f=' + e.f + ':width_type=h:width=' + e.w + ':g=' + e.g);
    }
  }

  // Volume adjustment
  if (opts.volume && opts.volume !== 1) {
    effects.push('volume=' + opts.volume);
  }

  // Filters to reduce artifacts from pitch shifting
  if (opts.pitch && opts.pitch < 1) {
    // Male voices: add subtle low-end boost, remove ultrasonic artifacts
    effects.push('lowpass=f=12000');
  } else if (opts.pitch && opts.pitch > 1) {
    // Female/high voices: remove subsonic rumble
    effects.push('highpass=f=60');
  }

  // Lowpass/highpass
  if (opts.lowpass) effects.push('lowpass=f=' + opts.lowpass);
  if (opts.highpass) effects.push('highpass=f=' + opts.highpass);

  // Apply all effects
  if (effects.length) chain.push(effects.join(','));

  // 5. Final limiter to prevent clipping
  chain.push('alimiter=limit=0.95:attack=0.1:release=1');

  return chain.join(',');
}

async function processAudio(inputPath, inputType, voiceOpts) {
  const outputPath = path.join(TEMP_DIR, 'va_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.mp3');
  const filter = buildPostFilter(voiceOpts);

  const args = ['-y', '-i', inputPath, '-af', filter, '-codec:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', outputPath];

  await new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { timeout: 60000 }, (err) => {
      safeUnlink(inputPath);
      if (err) reject(new Error('FFmpeg: ' + (err.message || 'unknown')));
      else if (!fs.existsSync(outputPath)) reject(new Error('FFmpeg: no output'));
      else resolve();
    });
  });

  return outputPath;
}

// ─── CACHE ───────────────────────────────────────────────
function getCacheKey(voiceId, text) {
  return crypto.createHash('md5').update(voiceId + ':' + text).digest('hex');
}

function checkCache(key) {
  const f = path.join(CACHE_DIR, key + '.mp3');
  if (fs.existsSync(f)) {
    const age = Date.now() - fs.statSync(f).mtimeMs;
    if (age < CACHE_TTL) return f;
  }
  return null;
}

function writeCache(key, filePath) {
  const dest = path.join(CACHE_DIR, key + '.mp3');
  try { fs.copyFileSync(filePath, dest); } catch {}
}

function cleanCache() {
  try {
    const files = fs.readdirSync(CACHE_DIR);
    for (const f of files) {
      const fp = path.join(CACHE_DIR, f);
      if (Date.now() - fs.statSync(fp).mtimeMs > CACHE_TTL) fs.unlinkSync(fp);
    }
  } catch {}
}

// Clean cache every hour
setInterval(cleanCache, 3600000);

// ─── VOICE DEFINITIONS ───────────────────────────────────
const VOICES = {
  lula: {
    display: 'Lula',
    aliases: ['presidente'],
    opts: { pitch: 0.82, echo_delay: 180, echo_decay: 0.3, volume: 1.1 },
    desc: '🎙️ Voz inspirada no presidente Lula'
  },
  bolsonaro: {
    display: 'Bolsonaro',
    aliases: ['mito'],
    opts: { pitch: 0.95, echo_delay: 60, echo_decay: 0.15, volume: 1.05 },
    desc: '🎙️ Voz inspirada no presidente Bolsonaro'
  },
  narrador: {
    display: 'Narrador',
    aliases: ['narrator', 'epico'],
    opts: { pitch: 0.72, echo_delay: 450, echo_decay: 0.35, volume: 1.15 },
    desc: '🎙️ Voz de narrador épico'
  },
  robo: {
    display: 'Robô',
    aliases: ['robot', 'android', 'maquina'],
    opts: { pitch: 1.0, echo_delay: 25, echo_decay: 0.08, volume: 1.0, eq: [{ f: 800, w: 400, g: 6 }, { f: 3000, w: 800, g: 3 }] },
    desc: '🎙️ Voz robótica'
  },
  vilao: {
    display: 'Vilão',
    aliases: ['villain', 'malvado'],
    opts: { pitch: 0.55, echo_delay: 700, echo_decay: 0.45, volume: 1.2 },
    desc: '🎙️ Voz dramática de vilão'
  },
  heroi: {
    display: 'Herói',
    aliases: ['hero', 'heroico'],
    opts: { pitch: 1.12, echo_delay: 350, echo_decay: 0.3, volume: 1.1 },
    desc: '🎙️ Voz heroica'
  },
  locutor: {
    display: 'Locutor',
    aliases: ['radio', 'apresentador'],
    opts: { echo_delay: 100, echo_decay: 0.2, eq: [{ f: 200, w: 500, g: -6 }, { f: 3000, w: 1000, g: 3 }] },
    desc: '🎙️ Voz de locutor de rádio'
  },
  fantasma: {
    display: 'Fantasma',
    aliases: ['ghost', 'espirito'],
    opts: { pitch: 1.35, echo_delay: 500, echo_decay: 0.5, volume: 0.7 },
    desc: '🎙️ Voz fantasmagórica'
  },
  bebe: {
    display: 'Bebê',
    aliases: ['baby', 'crianca'],
    opts: { pitch: 1.75, echo_delay: 40, echo_decay: 0.08, volume: 0.9 },
    desc: '🎙️ Voz de bebê'
  },
  gigante: {
    display: 'Gigante',
    aliases: ['giant', 'monstro'],
    opts: { pitch: 0.5, echo_delay: 350, echo_decay: 0.25, volume: 1.4, lowpass: 8000 },
    desc: '🎙️ Voz grave de gigante'
  },
  elfo: {
    display: 'Elfo',
    aliases: ['elf'],
    opts: { pitch: 1.3, echo_delay: 150, echo_decay: 0.15, volume: 0.95 },
    desc: '🎙️ Voz élfica'
  },
  fada: {
    display: 'Fada',
    aliases: ['fairy'],
    opts: { pitch: 1.5, echo_delay: 300, echo_decay: 0.35, volume: 0.8 },
    desc: '🎙️ Voz de fada mágica'
  },
  demonio: {
    display: 'Demônio',
    aliases: ['demon', 'diabo', 'satan'],
    opts: { pitch: 0.42, echo_delay: 900, echo_decay: 0.55, volume: 1.3, lowpass: 3500 },
    desc: '🎙️ Voz demoníaca'
  },
  anjo: {
    display: 'Anjo',
    aliases: ['angel'],
    opts: { pitch: 1.25, echo_delay: 400, echo_decay: 0.4, volume: 0.75 },
    desc: '🎙️ Voz angelical'
  },
  chipmunk: {
    display: 'Chipmunk',
    aliases: ['esquilo'],
    opts: { pitch: 1.85, echo_delay: 25, echo_decay: 0.08, volume: 0.85 },
    desc: '🎙️ Voz aguda de chipmunk'
  },
  lento: {
    display: 'Lento',
    aliases: ['slow', 'devagar'],
    opts: { tempo: 0.6, volume: 1.1 },
    desc: '🎙️ Voz lenta e arrastada'
  },
  velho: {
    display: 'Velho',
    aliases: ['old', 'idoso', 'avo'],
    opts: { pitch: 0.78, echo_delay: 80, echo_decay: 0.1, volume: 1.05 },
    desc: '🎙️ Voz de pessoa idosa'
  },
  eco: {
    display: 'Eco',
    aliases: ['echo', 'caverna'],
    opts: { echo_delay: 350, echo_decay: 0.5, volume: 0.9 },
    desc: '🎙️ Voz com eco'
  },
  sussurro: {
    display: 'Sussurro',
    aliases: ['whisper', 'segredo'],
    opts: { volume: 0.25, echo_delay: 40, echo_decay: 0.08, highpass: 800 },
    desc: '🎙️ Voz sussurrada'
  },
  estatica: {
    display: 'Estática',
    aliases: ['static', 'radiochao'],
    opts: { echo_delay: 15, echo_decay: 0.05, eq: [{ f: 600, w: 200, g: 10 }, { f: 3000, w: 500, g: -8 }], lowpass: 4000 },
    desc: '🎙️ Voz com estática de rádio'
  }
};

// ─── HELPERS ─────────────────────────────────────────────
function findVoice(name) {
  const key = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [id, v] of Object.entries(VOICES)) {
    if (id === key) return v;
    if (v.aliases.some(a => a === key)) return v;
  }
  return null;
}

async function generateVoiceAudio(text, voiceOpts, voiceId) {
  const processedText = preprocessText(text);
  if (!processedText) throw new Error('Texto vazio apos processamento');

  const cacheKey = getCacheKey(voiceId, processedText);
  const cached = checkCache(cacheKey);
  if (cached) {
    return fs.readFileSync(cached);
  }

  const base = await generateBaseAudio(processedText);

  const processedFile = await processAudio(base.path, base.type, voiceOpts);

  writeCache(cacheKey, processedFile);

  const data = fs.readFileSync(processedFile);
  safeUnlink(processedFile);
  return data;
}

// ─── COMMAND HANDLERS ────────────────────────────────────
async function sendVoice(sock, jid, msg, voice, text) {
  const data = await generateVoiceAudio(text, voice.opts, voice.display);
  await sock.sendMessage(jid, { audio: data, mimetype: 'audio/mpeg', ptt: false }, { quoted: msg });
}

async function sendWarning(sock, jid, voice, text) {
  const display = text.slice(0, 100) + (text.length > 100 ? '...' : '');
  await sock.sendMessage(jid, { text: '🎙️ *Voz:* ' + voice.display + '\n📝 *Texto:* ' + display + '\n\n⚠️ *Paródia gerada por IA para entretenimento.*' });
}

async function handleVoz(sock, { msg, jid, args }) {
  if (!args.length) {
    let list = '*🎙️ VOZES DISPONÍVEIS*\n\n';
    for (const v of Object.values(VOICES)) {
      list += '• *' + v.display + '*\n  ' + v.desc + '\n\n';
    }
    list += '📌 *Ex:* !voz lula Olá pessoal\n📌 *Ex:* !vozaleatoria Teste aleatório\n📌 *Ex:* !narrador Era uma vez...';
    return await sock.sendMessage(jid, { text: list });
  }

  const voiceName = args[0].toLowerCase();
  const voice = findVoice(voiceName);
  if (!voice) {
    return await sock.sendMessage(jid, { text: '❌ Voz "' + args[0] + '" não encontrada.\nUse *!voz* para ver as vozes disponíveis.' });
  }

  const text = args.slice(1).join(' ').trim();
  if (!text) {
    return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !voz ' + args[0] + ' Olá pessoal' });
  }
  if (text.length > MAX_CHARS) {
    return await sock.sendMessage(jid, { text: '❌ Texto muito longo! Máximo ' + MAX_CHARS + ' caracteres.' });
  }

  await sock.sendPresenceUpdate('composing', jid);
  await sendWarning(sock, jid, voice, text);

  try {
    await sendVoice(sock, jid, msg, voice, text);
  } catch (e) {
    await sock.sendMessage(jid, { text: '❌ Erro ao gerar áudio: ' + e.message });
  }
}

async function handleVozes(sock, { msg, jid }) {
  let list = '*🎙️ TODAS AS VOZES DISPONÍVEIS*\n\n';
  for (const [id, v] of Object.entries(VOICES)) {
    list += '▸ *' + id + '*';
    if (v.aliases.length) list += ' (' + v.aliases.join(', ') + ')';
    list += '\n  ' + v.desc + '\n\n';
  }
  list += '📌 Use: *!voz [personagem] [texto]*\n📌 Use: *!vozaleatoria [texto]* para surpresa!';
  await sock.sendMessage(jid, { text: list });
}

async function handleVozAleatoria(sock, { msg, jid, args }) {
  if (!args.length) {
    return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !vozaleatoria Testando 1 2 3' });
  }
  const text = args.join(' ').trim();
  if (text.length > MAX_CHARS) {
    return await sock.sendMessage(jid, { text: '❌ Texto muito longo! Máximo ' + MAX_CHARS + ' caracteres.' });
  }
  const keys = Object.keys(VOICES);
  const randomKey = keys[Math.floor(Math.random() * keys.length)];
  const voice = VOICES[randomKey];

  await sock.sendPresenceUpdate('composing', jid);
  await sendWarning(sock, jid, voice, text);
  try { await sendVoice(sock, jid, msg, voice, text); }
  catch (e) { await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message }); }
}

async function handleNarrador(sock, { msg, jid, args }) {
  if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !narrador Era uma vez...' });
  const text = args.join(' ').trim();
  if (text.length > MAX_CHARS) return await sock.sendMessage(jid, { text: '❌ Texto muito longo! Máximo ' + MAX_CHARS + ' caracteres.' });
  const voice = VOICES['narrador'];
  await sock.sendPresenceUpdate('composing', jid);
  await sendWarning(sock, jid, voice, text);
  try { await sendVoice(sock, jid, msg, voice, text); }
  catch (e) { await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message }); }
}

async function handleRobo(sock, { msg, jid, args }) {
  if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !robo Eu sou uma IA' });
  const text = args.join(' ').trim();
  if (text.length > MAX_CHARS) return await sock.sendMessage(jid, { text: '❌ Texto muito longo! Máximo ' + MAX_CHARS + ' caracteres.' });
  const voice = VOICES['robo'];
  await sock.sendPresenceUpdate('composing', jid);
  await sendWarning(sock, jid, voice, text);
  try { await sendVoice(sock, jid, msg, voice, text); }
  catch (e) { await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message }); }
}

async function handleLocutor(sock, { msg, jid, args }) {
  if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !locutor Atenção, ouvintes!' });
  const text = args.join(' ').trim();
  if (text.length > MAX_CHARS) return await sock.sendMessage(jid, { text: '❌ Texto muito longo! Máximo ' + MAX_CHARS + ' caracteres.' });
  const voice = VOICES['locutor'];
  await sock.sendPresenceUpdate('composing', jid);
  await sendWarning(sock, jid, voice, text);
  try { await sendVoice(sock, jid, msg, voice, text); }
  catch (e) { await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message }); }
}

async function handleVilao(sock, { msg, jid, args }) {
  if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !vilao Eu vou dominar o mundo!' });
  const text = args.join(' ').trim();
  if (text.length > MAX_CHARS) return await sock.sendMessage(jid, { text: '❌ Texto muito longo! Máximo ' + MAX_CHARS + ' caracteres.' });
  const voice = VOICES['vilao'];
  await sock.sendPresenceUpdate('composing', jid);
  await sendWarning(sock, jid, voice, text);
  try { await sendVoice(sock, jid, msg, voice, text); }
  catch (e) { await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message }); }
}

async function handleHeroi(sock, { msg, jid, args }) {
  if (!args.length) return await sock.sendMessage(jid, { text: '❌ Digite o texto. Ex: !heroi Não tenha medo!' });
  const text = args.join(' ').trim();
  if (text.length > MAX_CHARS) return await sock.sendMessage(jid, { text: '❌ Texto muito longo! Máximo ' + MAX_CHARS + ' caracteres.' });
  const voice = VOICES['heroi'];
  await sock.sendPresenceUpdate('composing', jid);
  await sendWarning(sock, jid, voice, text);
  try { await sendVoice(sock, jid, msg, voice, text); }
  catch (e) { await sock.sendMessage(jid, { text: '❌ Erro: ' + e.message }); }
}

async function handleVoices(sock, { msg, jid, sender, args, commandName }) {
  switch (commandName) {
    case 'voz': return handleVoz(sock, { msg, jid, args, commandName });
    case 'vozes': return handleVozes(sock, { msg, jid });
    case 'vozaleatoria': return handleVozAleatoria(sock, { msg, jid, args });
    case 'narrador': return handleNarrador(sock, { msg, jid, args });
    case 'robo': return handleRobo(sock, { msg, jid, args });
    case 'locutor': return handleLocutor(sock, { msg, jid, args });
    case 'vilao': return handleVilao(sock, { msg, jid, args });
    case 'heroi': return handleHeroi(sock, { msg, jid, args });
  }
}

const vozCommands = ['voz', 'vozes', 'vozaleatoria', 'narrador', 'robo', 'locutor', 'vilao', 'heroi'];

module.exports = { handleVoices, vozCommands };
