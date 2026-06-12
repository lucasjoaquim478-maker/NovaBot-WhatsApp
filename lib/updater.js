const EventEmitter = require('events');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, exec } = require('child_process');

const config = require('../config.json');
const pkg = require('../package.json');
const Logger = require('./logger');

const ROOT = path.resolve(__dirname, '..');
const logger = new Logger({ level: config.logLevel || 'info', logDir: path.join(ROOT, 'logs') });

const BACKUP_DIR = path.join(ROOT, 'backups');
const UPDATE_LOG = path.join(ROOT, 'logs', 'updates.json');
const LOCAL_VERSION = pkg.version;
const RAW_BASE = 'https://raw.githubusercontent.com';
const API_BASE = 'https://api.github.com';

const EXCLUDE_PATTERNS = [
  'node_modules/', '.git/', 'backups/', 'temp/', 'sessions/',
  'logs/', 'storage/', 'database/', 'config.json',
  'package-lock.json', '*.log', '.DS_Store',
  'voz_cache/', '*.part', 'node/', '.bot.lock',
  '.install_sig', '.npmrc',
];

class Updater extends EventEmitter {
  constructor() {
    super();
    this.state = 'idle';
    this.progress = { percent: 0, speed: 0, current: 0, total: 0, file: '' };
    this.latestVersion = LOCAL_VERSION;
    this.latestReleaseData = null;
    this.checkInterval = null;
    this._pauseFlag = false;
    this._abortFlag = false;
    this._history = [];
    this._loadHistory();
  }

  _loadHistory() {
    try {
      if (fs.existsSync(UPDATE_LOG)) {
        this._history = JSON.parse(fs.readFileSync(UPDATE_LOG, 'utf-8'));
      }
    } catch { this._history = []; }
  }

  _saveHistory() {
    try {
      const dir = path.dirname(UPDATE_LOG);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(UPDATE_LOG, JSON.stringify(this._history.slice(-100), null, 2));
    } catch {}
  }

  _addHistoryEntry(entry) {
    this._history.push({ ...entry, timestamp: new Date().toISOString() });
    this._saveHistory();
  }

  getHistory() {
    return [...this._history].reverse();
  }

  _log(level, msg) {
    logger[level](`[UPDATE] ${msg}`);
    this.emit('log', { level, message: msg, timestamp: new Date().toISOString() });
  }

  _setState(newState) {
    this.state = newState;
    this.emit('state', { state: newState, version: this.latestVersion });
  }

  _setProgress(pct, speed, current, total, file) {
    this.progress = { percent: pct, speed: speed || 0, current: current || 0, total: total || 0, file: file || '' };
    this.emit('progress', { ...this.progress });
  }

  getState() {
    return {
      state: this.state,
      localVersion: LOCAL_VERSION,
      latestVersion: this.latestVersion,
      progress: this.progress,
      autoUpdate: !!config.autoUpdate,
      checkInterval: config.checkInterval || 3600000,
      repo: config.githubRepo,
    };
  }

  getCurrentVersion() {
    return LOCAL_VERSION;
  }

  getLatestVersion() {
    return this.latestVersion || LOCAL_VERSION;
  }

  filesToUpdate() {
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
    walk(ROOT, '');
    return list;
  }

  async getLatestRelease() {
    const repo = config.githubRepo;
    if (!repo) return null;
    try {
      const res = await fetch(`${API_BASE}/repos/${repo}/releases/latest`, {
        headers: { 'User-Agent': 'NovaBot-Updater', 'Accept': 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async getTagVersion(tag) {
    const m = tag.match(/(\d+\.\d+\.\d+)/);
    return m ? m[1] : tag;
  }

  compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

  async checkForUpdates() {
    if (!config.githubRepo) return { hasUpdate: false, error: 'githubRepo não configurado' };
    try {
      this._setState('checking');
      this._log('info', `Verificando atualizações...`);
      const release = await this.getLatestRelease();
      if (!release) {
        this._setState('idle');
        return { hasUpdate: false, error: 'Não foi possível contactar o GitHub' };
      }
      this.latestReleaseData = release;
      const remoteVer = await this.getTagVersion(release.tag_name);
      this.latestVersion = remoteVer;
      const cmp = this.compareVersions(remoteVer, LOCAL_VERSION);
      const result = {
        version: remoteVer,
        release,
        hasUpdate: cmp > 0,
        current: cmp <= 0,
        tag_name: release.tag_name,
        published_at: release.published_at,
        html_url: release.html_url,
        body: release.body,
      };
      if (cmp > 0) {
        this._log('info', `Nova versão disponível: v${remoteVer} (local: v${LOCAL_VERSION})`);
      } else {
        this._log('info', `Você já está atualizado (v${LOCAL_VERSION})`);
      }
      this._addHistoryEntry({ action: 'check', version: remoteVer, hasUpdate: cmp > 0 });
      this._setState('idle');
      return result;
    } catch (err) {
      this._log('warn', `Erro ao verificar: ${err.message}`);
      this._setState('idle');
      return { hasUpdate: false, error: err.message };
    }
  }

  async downloadFile(repo, filePath, branch) {
    const url = `${RAW_BASE}/${repo}/${branch}/${filePath}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'NovaBot-Updater' },
      signal: AbortSignal.timeout(30000)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${filePath}`);
    const buffer = await res.buffer();
    return { buffer, url };
  }

  createBackup() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `pre-update-${LOCAL_VERSION}-${ts}`);
    if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });

    const files = this.filesToUpdate();
    let count = 0;
    for (const f of files) {
      const src = path.join(ROOT, f);
      const dst = path.join(backupPath, f);
      try {
        if (!fs.existsSync(src)) continue;
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        count++;
      } catch (err) {
        this._log('warn', `Backup falhou ao copiar ${f}: ${err.message}`);
      }
    }
    this._log('info', `Backup criado: ${path.basename(backupPath)} (${count} arquivos)`);
    return backupPath;
  }

  fileHash(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    } catch { return null; }
  }

  async _applyUpdate(repo, branch, targetVer, files, onFile) {
    let success = 0;
    let failed = 0;
    let modified = [];
    let hasPackageChange = false;

    for (let i = 0; i < files.length; i++) {
      if (this._abortFlag) throw new Error('Atualização cancelada pelo usuário');
      while (this._pauseFlag) {
        await new Promise(r => setTimeout(r, 500));
        if (this._abortFlag) throw new Error('Atualização cancelada pelo usuário');
      }

      const f = files[i];
      const skipPatterns = ['backups/', 'database/', 'config.json'];
      if (skipPatterns.some(sp => f.startsWith(sp))) continue;

      const localPath = path.join(ROOT, f);
      const pct = Math.round(((i + 1) / files.length) * 100);

      try {
        this._setProgress(pct, 0, i + 1, files.length, f);
        const result = await this.downloadFile(repo, f, branch);
        if (result === null) continue;

        const { buffer } = result;
        const backupHash = this.fileHash(localPath);
        const newHash = crypto.createHash('sha256').update(buffer).digest('hex');

        if (backupHash === newHash) continue;

        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, buffer);

        if (f === 'package.json') hasPackageChange = true;
        success++;
        modified.push(f);
        this._log('debug', `Atualizado: ${f}`);
      } catch (err) {
        failed++;
        this._log('warn', `Falha ao atualizar ${f}: ${err.message}`);
      }

      if (onFile) onFile(pct, i + 1, files.length, success, failed);
    }

    return { success, failed, modified, hasPackageChange };
  }

  async performUpdate(onProgress) {
    if (this.state === 'downloading' || this.state === 'installing') {
      throw new Error('Já existe uma atualização em andamento');
    }

    const repo = config.githubRepo;
    const branch = config.branch || 'main';

    const check = await this.checkForUpdates();
    if (!check || !check.hasUpdate) {
      throw new Error('Nenhuma atualização disponível');
    }

    const targetVer = check.version;
    const sourceRef = check.release.tag_name || branch;
    const files = this.filesToUpdate();

    this._setState('downloading');
    this._pauseFlag = false;
    this._abortFlag = false;
    this._log('info', `Iniciando atualização: v${LOCAL_VERSION} -> v${targetVer}`);
    this._addHistoryEntry({ action: 'start', from: LOCAL_VERSION, to: targetVer, files: files.length });

    const backupPath = this.createBackup();
    let success = 0, failed = 0;

    try {
      const result = await this._applyUpdate(repo, sourceRef, targetVer, files, (pct, cur, total, ok, fail) => {
        success = ok;
        failed = fail;
        this._setProgress(pct, 0, cur, total, '');
        if (onProgress) onProgress(pct, cur, total);
      });

      success = result.success;
      failed = result.failed;

      this._setState('installing');
      this._log('info', `Arquivos: ${success} atualizados, ${failed} falhas`);

      if (result.hasPackageChange) {
        this._log('info', 'Executando npm install...');
        try {
          const npmCmd = process.platform === 'win32'
            ? path.join(ROOT, 'node', 'npm.cmd')
            : path.join(ROOT, 'node', 'npm');
          const cmdPath = fs.existsSync(npmCmd) ? `"${npmCmd}"` : 'npm';
          await new Promise((resolve, reject) => {
            exec(`${cmdPath} install --production`, { cwd: ROOT, timeout: 180000, shell: true }, (err, stdout, stderr) => {
              if (err) reject(new Error(stderr || err.message));
              else resolve();
            });
          });
          this._log('info', 'npm install concluído');
        } catch (e) {
          this._log('warn', `npm install: ${e.message}`);
        }
      }

      this._setProgress(100, 0, files.length, files.length, '');
      this._addHistoryEntry({
        action: 'completed', from: LOCAL_VERSION, to: targetVer,
        files_success: success, files_failed: failed, backup: path.basename(backupPath)
      });
      this._log('info', `Atualização concluída: v${LOCAL_VERSION} -> v${targetVer}`);

      this._setState('idle');
      return { success: true, targetVer, filesSuccess: success, filesFailed: failed, backupPath };

    } catch (err) {
      this._log('error', `Erro na atualização: ${err.message}`);
      this._addHistoryEntry({ action: 'error', from: LOCAL_VERSION, to: targetVer, error: err.message });

      this._log('info', 'Restaurando backup automaticamente...');
      try {
        await this.restoreBackup(backupPath);
      } catch (restoreErr) {
        this._log('error', `Falha ao restaurar backup: ${restoreErr.message}`);
      }

      this._setState('idle');
      throw err;
    }
  }

  pause() {
    if (this.state !== 'downloading') return false;
    this._pauseFlag = true;
    this._log('info', 'Download pausado');
    this.emit('state', { state: 'paused', version: this.latestVersion });
    return true;
  }

  resume() {
    if (!this._pauseFlag) return false;
    this._pauseFlag = false;
    this._log('info', 'Download retomado');
    this.emit('state', { state: 'downloading', version: this.latestVersion });
    return true;
  }

  abort() {
    if (this.state !== 'downloading') return false;
    this._abortFlag = true;
    this._pauseFlag = false;
    this._log('warn', 'Atualização cancelada pelo usuário');
    return true;
  }

  async restoreBackup(backupPath) {
    if (!fs.existsSync(backupPath)) throw new Error(`Backup não encontrado: ${backupPath}`);

    let restored = 0;
    const walk = (dir, prefix) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        const rel = prefix ? prefix + '/' + e.name : e.name;
        if (e.isDirectory()) walk(full, rel);
        else {
          const target = path.join(ROOT, rel);
          try {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(full, target);
            restored++;
          } catch (err) {
            this._log('warn', `Falha ao restaurar ${rel}: ${err.message}`);
          }
        }
      }
    };
    walk(backupPath, '');

    this._log('info', `Backup restaurado: ${path.basename(backupPath)} (${restored} arquivos)`);
    return restored;
  }

  async rollback() {
    if (!fs.existsSync(BACKUP_DIR)) throw new Error('Nenhum backup encontrado');

    const dirs = fs.readdirSync(BACKUP_DIR)
      .map(d => ({ name: d, time: fs.statSync(path.join(BACKUP_DIR, d)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (dirs.length === 0) throw new Error('Nenhum backup disponível');

    const latest = dirs[0].name;
    const backupPath = path.join(BACKUP_DIR, latest);

    this._log('info', `Restaurando backup: ${latest}...`);
    const restored = await this.restoreBackup(backupPath);

    this._addHistoryEntry({ action: 'rollback', backup: latest, files: restored });
    return { backup: latest, files: restored };
  }

  async getChangelog() {
    if (this.latestReleaseData?.body) return this.latestReleaseData.body;
    const release = await this.getLatestRelease();
    return release?.body || 'Nenhum changelog disponível.';
  }

  listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .map(d => {
        const p = path.join(BACKUP_DIR, d);
        try {
          const stat = fs.statSync(p);
          const count = fs.readdirSync(p).length;
          return { name: d, date: stat.mtime, size: this._dirSize(p), files: count };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  _dirSize(dir) {
    let total = 0;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) total += this._dirSize(full);
        else total += fs.statSync(full).size;
      }
    } catch {}
    return total;
  }

  startAutoCheck() {
    if (!config.autoUpdate || !config.githubRepo) {
      this._log('info', 'Auto-update desativado na configuração');
      return;
    }
    if (this.checkInterval) clearInterval(this.checkInterval);
    const interval = config.checkInterval || 3600000;

    setTimeout(() => this.checkForUpdates(), 5000);

    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, interval);

    this._log('info', `Verificação automática a cada ${Math.round(interval / 60000)} minutos`);
  }

  stopAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

const updater = new Updater();
module.exports = updater;
