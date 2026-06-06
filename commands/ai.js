const fetch = require('node-fetch');
const config = require('../config.json');
const db = require('../database/index');

const OLLAMA_MODEL = config.ollamaModel || 'gemma3:27b';

async function askOllama(prompt, history = []) {
  const baseUrl = (config.ollamaBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  const apiKey = config.ollamaApiKey;

  const messages = [];
  for (const h of history.slice(-3)) {
    const role = h.role === 'model' ? 'assistant' : h.role;
    messages.push({ role, content: h.text });
  }
  messages.push({ role: 'user', content: prompt });

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: false,
      options: { num_predict: 500, num_ctx: 1024 }
    })
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    if (res.status === 404 && err.includes('not found')) {
      return `❌ Modelo *${OLLAMA_MODEL}* nao encontrado.`;
    }
    throw new Error(`Ollama (${res.status})`);
  }

  const data = await res.json();
  return data.message?.content || '❌ Modelo nao gerou resposta.';
}

async function handleAI(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Digite sua pergunta. Ex: !ia o que sao buracos negros?' });
    return;
  }

  const user = db.getUser(sender);
  const prompt = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);
  const history = user.iaHistory || [];

  try {
    const response = await askOllama(prompt, history);
    history.push({ role: 'user', text: prompt, time: Date.now() });
    history.push({ role: 'assistant', text: response, time: Date.now() });
    if (history.length > 12) history.splice(0, history.length - 12);
    user.iaHistory = history;
    db.save('users');
    await sock.sendMessage(jid, { text: `🤖 *IA Resposta*\n\n${response}` });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
  }
}

async function generateStability(prompt) {
  const key = config.stabilityKey;
  const res = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      text_prompts: [{ text: prompt }],
      cfg_scale: 7, height: 1024, width: 1024, samples: 1, steps: 20
    }),
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Stability (${res.status}): ${err.message || res.statusText}`);
  }
  const data = await res.json();
  const b64 = data.artifacts?.[0]?.base64;
  if (!b64) throw new Error('Stability: sem imagem retornada');
  return Buffer.from(b64, 'base64');
}

async function handleImage(sock, { msg, jid, sender, args }) {
  if (!args.length) {
    await sock.sendMessage(jid, { text: '❌ Digite a descricao da imagem. Ex: !imagem gato cibernetico' });
    return;
  }

  const prompt = args.join(' ');
  await sock.sendPresenceUpdate('composing', jid);
  await sock.sendMessage(jid, { text: '🎨 Gerando imagem...' });

  try {
    const buffer = await generateStability(prompt);
    await sock.sendMessage(jid, { image: buffer, caption: `🎨 *${prompt}*` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ ${e.message}` });
  }
}

const aiCommands = ['ia', 'gpt', 'ask'];
const imageCommands = ['imagem', 'img', 'imaginar', 'draw'];

module.exports = { handleAI, handleImage, aiCommands, imageCommands };
