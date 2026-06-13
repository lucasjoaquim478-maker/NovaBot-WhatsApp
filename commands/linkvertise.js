const config = require('../config.json');
const https = require('https');
const http = require('http');

async function bypassViaApi(url) {
  const apis = [
    `https://api.bypass.vip/bypass?url=${encodeURIComponent(url)}`,
    `https://bypass.pm/bypass2?url=${encodeURIComponent(url)}`,
  ];
  for (const api of apis) {
    try {
      const result = await new Promise((resolve, reject) => {
        const u = new URL(api);
        const mod = u.protocol === 'https:' ? https : http;
        mod.get(api, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
          let body = '';
          res.on('data', (c) => body += c);
          res.on('end', () => {
            try { resolve(JSON.parse(body)); } catch { resolve(null); }
          });
        }).on('error', reject);
      });
      if (result && (result.destination || result.url || result.dest || result.final)) {
        return result.destination || result.url || result.dest || result.final;
      }
    } catch {}
  }
  // Fallback: follow redirects with Node.js
  return await followRedirects(url);
}

async function followRedirects(url, maxRedirects = 10) {
  for (let i = 0; i < maxRedirects; i++) {
    const result = await new Promise((resolve, reject) => {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve({ redirected: true, url: new URL(res.headers.location, url).href });
        } else {
          resolve({ redirected: false, url });
        }
      }).on('error', reject);
    });
    if (result.redirected) {
      url = result.url;
    } else {
      return url;
    }
  }
  return url;
}

async function handleLink(sock, { jid, args, msg }) {
  try {
    const url = args.join('').trim();
    if (!url) {
      return await sock.sendMessage(jid, { text: '❌ Use: !link <url_do_linkvertise>\nExemplo: !link https://linkvertise.com/...' }, { quoted: msg });
    }
    if (!url.includes('linkvertise.com') && !url.includes('link-target.net')) {
      return await sock.sendMessage(jid, { text: '❌ Envie um link do Linkvertise (linkvertise.com ou link-target.net)' }, { quoted: msg });
    }
    await sock.sendMessage(jid, { text: '⏳ Bypassando link...' }, { quoted: msg });
    const final = await bypassViaApi(url);
    await sock.sendMessage(jid, { text: `✅ *Destino final:*\n${final}` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro ao bypassar: ${e.message}` }, { quoted: msg });
  }
}

const linkCommands = ['link'];

module.exports = { handleLink, linkCommands };
