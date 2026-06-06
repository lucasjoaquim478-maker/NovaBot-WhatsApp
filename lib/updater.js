const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config.json');
const pkg = require('../package.json');
const Logger = require('./logger');

const logger = new Logger({ level: config.logLevel || 'info', logDir: path.join(process.cwd(), 'logs') });

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const LOCAL_VERSION = pkg.version;
const RAW_BASE = 'https://raw.githubusercontent.com';
const API_BASE = 'https://api.github.com';

const EXCLUDE_PATTERNS = [
  'node_modules/', '.git/', 'backups/', 'temp/', 'sessions/',
  'logs/', 'storage/', 'database/users.json', 'database/groups.json',
  'package-lock.json', 'config.json', 'database/owners.json', '*.log', '.DS_Store',
  'voz_cache/', '*.part', 'node/', 'bin/', 'por.traineddata',
];

let updating = false;
let checkInterval = null;
let latestVersion = LOCAL_VERSION;
let latestReleaseData = null;

function filesToUpdate() {
  const list = [];
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (EXCLUDE_PATTERNS.some(p => {
        if (p.endsWith('/')) return rel === p.slice(0, -1) || rel.startsWith(p);
        if (p.startsWith('*.')) return e.name.endsWith(p.slice(1));
        return rel === p;
      })) continue;
      if (e.isDirectory()) walk(full, rel);
      else list.push(rel.replace(/\\/g, '/'));
    }
  };
  walk(process.cwd(), '');
  return list;
}

function writeUpdateLog(msg) {
  try {
    const dir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'updates.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

async function getLatestRelease() {
  const repo = config.githubRepo;
  if (!repo) return null;
  try {
    const res = await fetch(`${API_BASE}/repos/${repo}/releases/latest`, {
      headers: { 'User-Agent': 'NovaBot-Updater', 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function getTagVersion(tag) {
  const m = tag.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : tag;
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function checkForUpdates() {
  if (!config.autoUpdate || !config.githubRepo) return null;
  try {
    const release = await getLatestRelease();
    if (!release) return null;
    latestReleaseData = release;
    const remoteVer = await getTagVersion(release.tag_name);
    latestVersion = remoteVer;
    const cmp = compareVersions(remoteVer, LOCAL_VERSION);
    if (cmp > 0) {
      logger.info(`[UPDATE] Nova versao disponivel: ${remoteVer} (local: ${LOCAL_VERSION})`);
      writeUpdateLog(`Nova versao encontrada: ${remoteVer} (local: ${LOCAL_VERSION})`);
      return { version: remoteVer, release, hasUpdate: true };
    }
    return { version: remoteVer, release, hasUpdate: false, current: true };
  } catch (err) {
    logger.warn(`[UPDATE] Erro ao verificar: ${err.message}`);
    return null;
  }
}

function createBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `pre-update-${LOCAL_VERSION}-${ts}`);
  if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });

  const files = filesToUpdate();
  let count = 0;
  for (const f of files) {
    const src = path.join(process.cwd(), f);
    const dst = path.join(backupPath, f);
    try {
      if (!fs.existsSync(src)) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      count++;
    } catch (err) {
      logger.warn(`[BACKUP] Falha ao copiar ${f}: ${err.message}`);
    }
  }
  logger.info(`[BACKUP] Backup criado: ${path.basename(backupPath)} (${count} arquivos)`);
  return backupPath;
}

async function downloadFile(repo, filePath, branch) {
  const url = `${RAW_BASE}/${repo}/${branch}/${filePath}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'NovaBot-Updater' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${filePath}`);
  return await res.buffer();
}

async function performUpdate(sock, jid) {
  if (updating) {
    if (jid) await sock.sendMessage(jid, { text: '⏳ Ja existe uma atualizacao em andamento. Aguarde.' });
    return;
  }
  updating = true;

  const repo = config.githubRepo;
  const branch = config.branch || 'main';

  try {
    const check = await checkForUpdates();
    if (!check || !check.hasUpdate) {
      if (jid) await sock.sendMessage(jid, { text: `✅ Voce ja esta na versao mais recente (${LOCAL_VERSION}).` });
      updating = false;
      return;
    }

    const targetVer = check.version;
    const files = filesToUpdate();

    if (jid) {
      await sock.sendMessage(jid, {
        text: `🔄 *Atualizacao iniciada!*\n\n` +
              `📦 Atual: v${LOCAL_VERSION}\n` +
              `🎯 Nova: v${targetVer}\n` +
              `📁 Arquivos: ${files.length}\n` +
              `⏳ Baixando e aplicando...`
      });
    }

    logger.info(`[UPDATE] Iniciando atualizacao: v${LOCAL_VERSION} -> v${targetVer}`);
    writeUpdateLog(`Iniciando atualizacao: v${LOCAL_VERSION} -> v${targetVer}`);

    const backupPath = createBackup();

    let success = 0;
    let failed = 0;
    let modified = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const localPath = path.join(process.cwd(), f);
      const skipPatterns = ['backups/', 'database/users.json', 'database/groups.json', 'database/owners.json', 'config.json'];
      if (skipPatterns.some(sp => f.startsWith(sp))) {
        if (jid) logger.debug(`[UPDATE] Pulando ${f}`);
        continue;
      }

      try {
        const content = await downloadFile(repo, f, branch);
        const localExists = fs.existsSync(localPath);

        if (localExists) {
          const localContent = fs.readFileSync(localPath);
          if (localContent.equals(content)) continue;
        }

        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, content);
        success++;
        modified.push(f);
        logger.debug(`[UPDATE] Atualizado: ${f}`);
      } catch (err) {
        failed++;
        logger.warn(`[UPDATE] Falha ao baixar ${f}: ${err.message}`);
      }

      if (jid && (i % 5 === 0 || i === files.length - 1)) {
        const pct = Math.round(((i + 1) / files.length) * 100);
        await sock.sendMessage(jid, { text: `📥 Progresso: ${pct}% (${i + 1}/${files.length})` }).catch(() => {});
      }
    }

    writeUpdateLog(`Arquivos atualizados: ${success}, falhas: ${failed}`);

    let hasPackageChange = modified.includes('package.json');

    if (hasPackageChange) {
      if (jid) await sock.sendMessage(jid, { text: '📦 package.json alterado. Executando npm install...' }).catch(() => {});
      logger.info('[UPDATE] Executando npm install...');
      try {
        execSync('npm install --production 2>&1', { cwd: process.cwd(), stdio: 'pipe', timeout: 120000 });
        logger.info('[UPDATE] npm install concluido');
      } catch (e) {
        logger.warn(`[UPDATE] npm install: ${e.message}`);
        if (jid) await sock.sendMessage(jid, { text: `⚠️ npm install: ${e.message.slice(0, 100)}` }).catch(() => {});
      }
    }

    if (jid) {
      await sock.sendMessage(jid, {
        text: `✅ *Atualizacao concluida!*\n\n` +
              `📦 v${LOCAL_VERSION} → v${targetVer}\n` +
              `📁 ${success} arquivos atualizados\n` +
              `❌ ${failed} falhas\n` +
              `💾 Backup: ${path.basename(backupPath)}\n\n` +
              `🔄 Reiniciando em 3 segundos...`
      });
    }

    logger.info(`[UPDATE] Atualizacao concluida. Reiniciando...`);
    writeUpdateLog(`Atualizacao concluida. v${LOCAL_VERSION} -> v${targetVer}. Reiniciando.`);

    updating = false;
    setTimeout(() => {
      process.exit(0);
    }, 3000);

  } catch (err) {
    logger.error(`[UPDATE] Erro: ${err.message}`);
    writeUpdateLog(`Erro na atualizacao: ${err.message}`);
    if (jid) {
      await sock.sendMessage(jid, { text: `❌ Erro na atualizacao: ${err.message}` }).catch(() => {});
    }
    updating = false;
  }
}

async function rollback(sock, jid) {
  if (!fs.existsSync(BACKUP_DIR)) {
    if (jid) await sock.sendMessage(jid, { text: '❌ Nenhum backup encontrado.' });
    return;
  }
  const dirs = fs.readdirSync(BACKUP_DIR)
    .map(d => ({ name: d, time: fs.statSync(path.join(BACKUP_DIR, d)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  if (dirs.length === 0) {
    if (jid) await sock.sendMessage(jid, { text: '❌ Nenhum backup disponivel.' });
    return;
  }

  const latest = dirs[0].name;
  const backupPath = path.join(BACKUP_DIR, latest);

  if (jid) await sock.sendMessage(jid, { text: `🔄 Restaurando backup: ${latest}...` });

  let restored = 0;
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = prefix ? prefix + '/' + e.name : e.name;
      if (e.isDirectory()) walk(full, rel);
      else {
        const target = path.join(process.cwd(), rel);
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(full, target);
          restored++;
        } catch (err) {
          logger.warn(`[ROLLBACK] Falha ao restaurar ${rel}: ${err.message}`);
        }
      }
    }
  };
  walk(backupPath, '');

  logger.info(`[ROLLBACK] Backup ${latest} restaurado (${restored} arquivos)`);
  writeUpdateLog(`Rollback: backup ${latest} restaurado (${restored} arquivos)`);

  if (jid) {
    await sock.sendMessage(jid, {
      text: `✅ *Rollback concluido!*\n\n` +
            `💾 Backup: ${latest}\n` +
            `📁 ${restored} arquivos restaurados\n\n` +
            `🔄 Reiniciando em 3 segundos...`
    });
  }

  setTimeout(() => process.exit(0), 3000);
}

async function getChangelog() {
  if (latestReleaseData?.body) return latestReleaseData.body;
  const release = await getLatestRelease();
  return release?.body || 'Nenhum changelog disponivel.';
}

function getCurrentVersion() {
  return LOCAL_VERSION;
}

function getLatestVersion() {
  return latestVersion || LOCAL_VERSION;
}

function startAutoCheck() {
  if (!config.autoUpdate || !config.githubRepo) return;
  if (checkInterval) clearInterval(checkInterval);
  const interval = config.checkInterval || 3600000;

  checkForUpdates().then(r => {
    if (r?.hasUpdate) {
      logger.info(`[UPDATE] v${r.version} disponivel! Use !update para atualizar.`);
    }
  });

  checkInterval = setInterval(() => {
    checkForUpdates().then(r => {
      if (r?.hasUpdate) {
        logger.info(`[UPDATE] v${r.version} disponivel! Use !update para atualizar.`);
      }
    });
  }, interval);

  logger.info(`[UPDATE] Verificacao automatica a cada ${Math.round(interval / 60000)} minutos`);
}

function stopAutoCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

module.exports = {
  checkForUpdates,
  performUpdate,
  rollback,
  getChangelog,
  getCurrentVersion,
  getLatestVersion,
  startAutoCheck,
  stopAutoCheck,
};
