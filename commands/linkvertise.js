const config = require('../config.json');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch {}
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let browser = null;

async function getBrowser() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: EDGE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--disable-images', '--blink-settings=imagesEnabled=false', '--window-size=1,1']
  });
  return browser;
}

async function bypassLink(url, timeout = 30000) {
  const page = await (await getBrowser()).newPage();
  try {
    await page.setRequestInterception(true);
    let finalUrl = url;
    page.on('request', req => {
      const type = req.resourceType();
      if (type === 'image' || type === 'stylesheet' || type === 'font' || type === 'media') {
        req.abort();
      } else {
        req.continue();
      }
    });
    page.on('response', async res => {
      const status = res.status();
      if (status >= 300 && status < 400) {
        const loc = res.headers()['location'];
        if (loc) finalUrl = loc;
      }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await new Promise(r => setTimeout(r, 1000));
    try {
      await page.waitForNavigation({ timeout: 5000 });
    } catch {}
    if (finalUrl === url) finalUrl = page.url();
    return finalUrl;
  } finally {
    await page.close().catch(() => {});
  }
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
    if (!puppeteer) {
      await sock.sendMessage(jid, { text: '📦 Instalando puppeteer (Chromium Edge)...' }, { quoted: msg });
      const { execFile } = require('child_process');
      const npmCmd = path.join(ROOT, 'node', 'npm.cmd');
      const cmd = fs.existsSync(npmCmd) ? npmCmd : 'npm';
      await new Promise((resolve, reject) => {
        execFile(cmd, ['install', 'puppeteer'], { cwd: ROOT, timeout: 300000 }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
      puppeteer = require('puppeteer');
    }
    await sock.sendMessage(jid, { text: `⏳ Passando pelo link...` }, { quoted: msg });
    const final = await bypassLink(url);
    await sock.sendMessage(jid, { text: `✅ *Destino final:*\n${final}` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro ao bypassar: ${e.message}` }, { quoted: msg });
  }
}

process.on('exit', async () => {
  if (browser) try { await browser.close(); } catch {}
});

const linkCommands = ['link'];

module.exports = { handleLink, linkCommands };
