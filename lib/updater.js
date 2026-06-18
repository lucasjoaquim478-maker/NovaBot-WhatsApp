const EventEmitter = require('events');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const { safeRestart } = require('./restart');

const config = require('../config.json');
const pkg = require('../package.json');
const Logger = require('./logger');

const ROOT = path.resolve(__dirname, '..');
const logger = new Logger({ level: config.logLevel || 'info', logDir: path.join(ROOT, 'logs') });
const BACKUP_DIR = path.join(ROOT, 'backups');
const UPDATE_HISTORY = path.join(ROOT, 'logs', 'updates-history.json');
const UPDATE_LOCK = path.join(ROOT, '.update.lock');
const TMP_UPDATE = path.join(ROOT, 'temp', '.update');
const LOCAL_VERSION = pkg.version;
const API = 'https://api.github.com';

const EXCLUDE_PREFIXES = [
  'node_modules/', '.git/', 'backups/', 'temp/', 'sessions/', 'logs/', 'storage/', 'database/',
  'voz_cache/', '.bot.lock', '.update.lock', '.restarting', '.install_sig',
  'package-lock.json', 'cookies.txt', 'config.json', 'config.local.json',
  'node/', '.DS_Store', '*.log', '*.part', '*.lnk', 'por.traineddata', 'bot-avatar.png',
  'create-shortcut.ps1', 'start.bat', 'start.ps1', 'restarter.js', 'robot.ico',
  '.gitignore', '.npmrc', '.gitattributes'
];

class Updater extends EventEmitter {
  constructor() {
    super();
    this.state = 'idle';
    this.progress = { percent: 0, current: 0, total: 0, file: '', phase: '' };
    this.latestVersion = LOCAL_VERSION;
    this.latestReleaseData = null;
    this.checkInterval = null;
    this._pauseFlag = false;
    this._abortFlag = false;
    this._autoUpdateRunning = false;
    this._history = [];
    this._tempDirs = [];
    this._token = config.githubToken || process.env.GITHUB_TOKEN || '';
    this._loadHistory();
  }

  // ───── Persistence ─────

  _loadHistory() {
    try {
      if (fs.existsSync(UPDATE_HISTORY))
        this._history = JSON.parse(fs.readFileSync(UPDATE_HISTORY, 'utf-8'));
    } catch { this._history = []; }
  }

  _saveHistory() {
    try {
      const dir = path.dirname(UPDATE_HISTORY);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(UPDATE_HISTORY, JSON.stringify(this._history.slice(-100), null, 2));
    } catch {}
  }

  _addHistory(entry) {
    this._history.push({ ...entry, timestamp: new Date().toISOString() });
    this._saveHistory();
  }

  getHistory() { return [...this._history].reverse(); }

  // ───── Events ─────

  _log(level, msg) {
    logger[level](`[UPDATE] ${msg}`);
    this.emit('log', { level, message: msg, timestamp: new Date().toISOString() });
  }

  _setState(s) {
    this.state = s;
    this.emit('state', { state: s, version: this.latestVersion });
  }

  _setProgress(pct, cur, total, file, phase) {
    this.progress = { percent: pct, current: cur || 0, total: total || 0, file: file || '', phase: phase || '' };
    this.emit('progress', { ...this.progress });
  }

  // ───── Public State ─────

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

  getCurrentVersion() { return LOCAL_VERSION; }
  getLatestVersion() { return this.latestVersion || LOCAL_VERSION; }

  // ───── Version helpers ─────

  _parseVersion(tag) {
    const m = String(tag).match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
  }

  _compareVersions(a, b) {
    const va = this._parseVersion(a);
    const vb = this._parseVersion(b);
    if (!va || !vb) return 0;
    if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
    if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
    if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;
    return 0;
  }

  // ───── GitHub API ─────

  async _fetch(url, timeout = 15000) {
    const headers = { 'User-Agent': 'NovaBot-Updater', Accept: 'application/vnd.github.v3+json' };
    if (this._token) headers.Authorization = 'token ' + this._token;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }

  async _getLatestRelease() {
    const repo = config.githubRepo;
    if (!repo) return null;
    const res = await this._fetch(`${API}/repos/${repo}/releases/latest`, 10000);
    return await res.json();
  }

  // ───── Check Updates ─────

  async checkForUpdates() {
    if (!config.githubRepo) return { hasUpdate: false, error: 'githubRepo não configurado' };
    try {
      this._setState('checking');
      this._log('info', 'Verificando atualizações...');
      const release = await this._getLatestRelease();
      if (!release) {
        this._setState('idle');
        return { hasUpdate: false, error: 'Não foi possível contactar o GitHub' };
      }
      this.latestReleaseData = release;
      const remoteVer = this._parseVersion(release.tag_name);
      if (!remoteVer) {
        this._setState('idle');
        return { hasUpdate: false, error: 'Tag inválida: ' + release.tag_name };
      }
      const verStr = `${remoteVer.major}.${remoteVer.minor}.${remoteVer.patch}`;
      this.latestVersion = verStr;
      const cmp = this._compareVersions(verStr, LOCAL_VERSION);
      const result = {
        version: verStr,
        release,
        hasUpdate: cmp > 0,
        current: cmp <= 0,
        tag_name: release.tag_name,
        published_at: release.published_at,
        html_url: release.html_url,
        body: release.body,
      };
      if (cmp > 0)
        this._log('info', `Nova versão: v${verStr} (local: v${LOCAL_VERSION})`);
      else
        this._log('info', `Atualizado (v${LOCAL_VERSION})`);
      this._addHistory({ action: 'check', version: verStr, hasUpdate: cmp > 0 });
      this._setState('idle');
      return result;
    } catch (err) {
      this._log('warn', `Erro na verificação: ${err.message}`);
      this._setState('idle');
      return { hasUpdate: false, error: err.message };
    }
  }

  // ───── Download & Extract zipball ─────

  async _downloadZip(repo, ref) {
    const url = `${API}/repos/${repo}/zipball/${ref}`;
    this._log('info', 'Baixando zipball do GitHub...');
    this._setProgress(0, 0, 0, '', 'download');

    const res = await this._fetch(url, 180000);
    const total = parseInt(res.headers.get('content-length') || '0', 10);
    let downloaded = 0;
    const chunks = [];

    for await (const chunk of res.body) {
      chunks.push(chunk);
      downloaded += chunk.length;
      if (total > 0) {
        const pct = Math.round((downloaded / total) * 10);
        this._setProgress(pct, downloaded, total, '', 'download');
      }
      if (this._abortFlag) throw new Error('Cancelado pelo usuário');
      while (this._pauseFlag) {
        await new Promise(r => setTimeout(r, 500));
        if (this._abortFlag) throw new Error('Cancelado pelo usuário');
      }
    }

    const buffer = Buffer.concat(chunks);
    this._log('info', `Download concluído (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
    return buffer;
  }

  _unzip(buffer, dest) {
    this._log('info', 'Extraindo arquivos...');
    this._setProgress(10, 0, 0, '', 'extract');

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buffer);

    const entries = zip.getEntries();
    let rootFolder = '';

    for (const entry of entries) {
      if (rootFolder) break;
      const parts = entry.entryName.split('/');
      if (parts.length > 1 && parts[0]) {
        rootFolder = parts[0] + '/';
      }
    }

    if (!rootFolder) throw new Error('Estrutura do zip inválida');

    let extracted = 0;
    for (const entry of entries) {
      const relPath = entry.entryName.startsWith(rootFolder)
        ? entry.entryName.slice(rootFolder.length)
        : entry.entryName;
      if (!relPath) continue;

      const outPath = path.join(dest, relPath);
      if (entry.isDirectory) {
        fs.mkdirSync(outPath, { recursive: true });
      } else {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, entry.getData());
        extracted++;
      }
    }

    this._log('info', `Extraídos ${extracted} arquivos`);
    return dest;
  }

  // ───── File walking ─────

  _walkFiles(dir, prefix = '') {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? prefix + '/' + e.name : e.name;
      const full = path.join(dir, e.name);
      if (EXCLUDE_PREFIXES.some(p => {
        if (p.endsWith('/') && (rel === p.slice(0, -1) || rel.startsWith(p))) return true;
        if (p.startsWith('*.')) return e.name.endsWith(p.slice(1));
        if (p.endsWith('*') && !p.includes('/')) {
          const base = p.slice(0, -1);
          return e.name.startsWith(base);
        }
        return rel === p;
      })) continue;
      if (e.isDirectory()) {
        results.push(...this._walkFiles(full, rel));
      } else {
        results.push(rel.replace(/\\/g, '/'));
      }
    }
    return results;
  }

  // ───── Backup ─────

  _createBackup(changedFiles) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `v${LOCAL_VERSION}-${ts}`);
    fs.mkdirSync(backupPath, { recursive: true });

    let count = 0;
    for (const f of changedFiles) {
      const src = path.join(ROOT, f);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(backupPath, f);
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
        count++;
      } catch (err) {
        this._log('warn', `Backup falhou: ${f} — ${err.message}`);
      }
    }
    this._log('info', `Backup criado: ${path.basename(backupPath)} (${count} arquivos)`);
    return backupPath;
  }

  _restoreBackup(backupPath) {
    if (!fs.existsSync(backupPath)) return 0;
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

  // ───── Apply Update ─────

  async _applyFiles(sourceDir, files) {
    const changed = [];
    let success = 0;

    this._setProgress(10, 0, files.length, '', 'apply');

    for (let i = 0; i < files.length; i++) {
      if (this._abortFlag) throw new Error('Cancelado pelo usuário');
      while (this._pauseFlag) {
        await new Promise(r => setTimeout(r, 500));
        if (this._abortFlag) throw new Error('Cancelado pelo usuário');
      }

      const f = files[i];
      const src = path.join(sourceDir, f);
      const dst = path.join(ROOT, f);

      if (!fs.existsSync(src)) continue;
      if (fs.existsSync(dst)) {
        const srcHash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
        const dstHash = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex');
        if (srcHash === dstHash) continue;
      }

      const pct = 10 + Math.round(((i + 1) / files.length) * 80);
      this._setProgress(pct, i + 1, files.length, f, 'apply');

      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const tmp = dst + '.update-tmp';
      fs.writeFileSync(tmp, fs.readFileSync(src));
      fs.renameSync(tmp, dst);
      changed.push(f);
      success++;
    }

    this._setProgress(90, success, files.length, '', 'apply');
    this._log('info', `${success} arquivos atualizados`);
    return changed;
  }

  // ───── npm install ─────

  async _runNpmInstall() {
    this._log('info', 'Executando npm install...');
    this._setProgress(92, 0, 0, '', 'npm');

    const npmCmd = process.platform === 'win32'
      ? 'npm.cmd'
      : 'npm';

    await new Promise((resolve, reject) => {
      const child = exec(`"${npmCmd}" install --production`, {
        cwd: ROOT,
        timeout: 300000,
        shell: true,
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
      child.stdout?.on('data', d => this._log('debug', d.toString().trim()));
      child.stderr?.on('data', d => {
        const s = d.toString().trim();
        if (s && !s.includes('warning')) this._log('warn', `npm: ${s}`);
      });
    });

    this._log('info', 'npm install concluído');
    this._setProgress(95, 0, 0, '', 'npm');
  }

  // ───── Lock ─────

  _acquireLock() {
    if (fs.existsSync(UPDATE_LOCK)) {
      try {
        const pid = parseInt(fs.readFileSync(UPDATE_LOCK, 'utf-8'), 10);
        if (pid && pid !== process.pid) {
          try { process.kill(pid, 0); throw new Error('Já existe uma atualização em andamento'); } catch (e) {
            if (e.message === 'Já existe uma atualização em andamento') throw e;
          }
        }
      } catch {}
    }
    fs.writeFileSync(UPDATE_LOCK, String(process.pid));
  }

  _releaseLock() {
    try { fs.unlinkSync(UPDATE_LOCK); } catch {}
  }

  // ───── Public: Perform Update ─────

  async performUpdate(knownVersion = null) {
    if (this.state === 'downloading' || this.state === 'installing')
      throw new Error('Já existe uma atualização em andamento');

    const repo = config.githubRepo;
    const branch = config.branch || 'main';

    let targetVer, ref;
    if (knownVersion) {
      targetVer = knownVersion;
      if (this._compareVersions(targetVer, LOCAL_VERSION) <= 0)
        throw new Error('Nenhuma atualização disponível');
      ref = this.latestReleaseData?.tag_name || branch;
    } else {
      const check = await this.checkForUpdates();
      if (!check || !check.hasUpdate)
        throw new Error('Nenhuma atualização disponível');
      targetVer = check.version;
      ref = check.tag_name || branch;
    }

    this._acquireLock();
    let backupPath = null;
    let sourceDir = null;
    let tempDir = null;

    try {
      this._setState('downloading');
      this._pauseFlag = false;
      this._abortFlag = false;
      this._log('info', `Atualizando: v${LOCAL_VERSION} → v${targetVer}`);
      this._addHistory({ action: 'start', from: LOCAL_VERSION, to: targetVer });

      // 1. Download zipball
      const zipBuffer = await this._downloadZip(repo, ref);
      this._setProgress(10, 0, 0, '', 'extract');

      // 2. Extract
      tempDir = TMP_UPDATE + '-' + Date.now();
      fs.mkdirSync(tempDir, { recursive: true });
      this._tempDirs.push(tempDir);
      sourceDir = this._unzip(zipBuffer, tempDir);
      this._setProgress(15, 0, 0, '', 'apply');

      // 3. Walk files from extracted source
      const allFiles = this._walkFiles(sourceDir);
      this._log('info', `${allFiles.length} arquivos para processar`);
      this._setProgress(15, 0, allFiles.length, '', 'apply');

      // 4. Backup only files that exist locally (will be updated)
      const existingFiles = allFiles.filter(f => fs.existsSync(path.join(ROOT, f)));
      backupPath = this._createBackup(existingFiles);

      // 5. Apply update (copy changed files)
      const changedFiles = await this._applyFiles(sourceDir, allFiles);

      // 6. npm install if package.json changed
      if (changedFiles.includes('package.json')) {
        this._setState('installing');
        await this._runNpmInstall();
      }

      // 7. Done
      this._setProgress(100, allFiles.length, allFiles.length, '', 'done');
      this._addHistory({
        action: 'completed', from: LOCAL_VERSION, to: targetVer,
        files: changedFiles.length, backup: path.basename(backupPath)
      });
      this._log('info', `Atualização concluída: v${LOCAL_VERSION} → v${targetVer}`);
      this._setState('idle');

      this._releaseLock();
      this._cleanupTemp();

      return {
        targetVer,
        filesSuccess: changedFiles.length,
        filesFailed: allFiles.length - changedFiles.length,
        changedFiles,
        backupPath,
      };

    } catch (err) {
      this._log('error', `Falha na atualização: ${err.message}`);
      this._addHistory({ action: 'error', from: LOCAL_VERSION, to: targetVer, error: err.message });

      // Auto-rollback if backup exists
      if (backupPath && fs.existsSync(backupPath)) {
        this._log('info', 'Restaurando backup automaticamente...');
        try {
          this._restoreBackup(backupPath);
        } catch (re) {
          this._log('error', `Falha ao restaurar backup: ${re.message}`);
        }
      }

      this._setState('idle');
      this._releaseLock();
      this._cleanupTemp();

      throw err;
    }
  }

  // ───── Pause / Resume / Abort ─────

  pause() {
    if (this.state !== 'downloading') return false;
    this._pauseFlag = true;
    this._log('info', 'Download pausado');
    return true;
  }

  resume() {
    if (!this._pauseFlag) return false;
    this._pauseFlag = false;
    this._log('info', 'Download retomado');
    return true;
  }

  abort() {
    if (this.state !== 'downloading' && this.state !== 'installing') return false;
    this._abortFlag = true;
    this._pauseFlag = false;
    this._log('warn', 'Atualização cancelada pelo usuário');
    return true;
  }

  // ───── Rollback ─────

  async rollback() {
    if (!fs.existsSync(BACKUP_DIR)) throw new Error('Nenhum backup encontrado');
    const dirs = fs.readdirSync(BACKUP_DIR)
      .map(d => ({ name: d, time: fs.statSync(path.join(BACKUP_DIR, d)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    if (dirs.length === 0) throw new Error('Nenhum backup disponível');

    const latest = dirs[0].name;
    const backupPath = path.join(BACKUP_DIR, latest);
    this._log('info', `Restaurando backup: ${latest}...`);
    const files = this._restoreBackup(backupPath);
    this._addHistory({ action: 'rollback', backup: latest, files });
    return { backup: latest, files };
  }

  // ───── Changelog & Backups ─────

  async getChangelog() {
    if (this.latestReleaseData?.body) return this.latestReleaseData.body;
    try {
      const release = await this._getLatestRelease();
      return release?.body || 'Nenhum changelog disponível.';
    } catch { return 'Nenhum changelog disponível.'; }
  }

  listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .map(d => {
        const p = path.join(BACKUP_DIR, d);
        try {
          const stat = fs.statSync(p);
          const files = fs.readdirSync(p).length;
          return { name: d, date: stat.mtime, files, size: this._dirSize(p) };
        } catch { return null; }
      }).filter(Boolean)
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

  // ───── Temp cleanup ─────

  _cleanupTemp() {
    for (const d of this._tempDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch {}
    }
    this._tempDirs = [];
    try {
      const tmpRoot = path.join(ROOT, 'temp');
      if (fs.existsSync(tmpRoot)) {
        for (const e of fs.readdirSync(tmpRoot)) {
          if (e.startsWith('.update-')) {
            try { fs.rmSync(path.join(tmpRoot, e), { recursive: true, force: true }); } catch {}
          }
        }
      }
    } catch {}
  }

  // ───── Auto Check ─────

  startAutoCheck() {
    if (!config.autoUpdate || !config.githubRepo) {
      this._log('info', 'Auto-update desativado');
      return;
    }
    if (this.checkInterval) clearInterval(this.checkInterval);
    const interval = config.checkInterval || 3600000;
    setTimeout(() => this._autoCheckAndUpdate(), 5000);
    this.checkInterval = setInterval(() => this._autoCheckAndUpdate(), interval);
    this._log('info', `Auto-check a cada ${Math.round(interval / 60000)} min`);
  }

  async _autoCheckAndUpdate() {
    try {
      const result = await this.checkForUpdates();
      if (result && result.hasUpdate) {
        this._log('info', `Nova versão v${result.version} disponível. Use !update ou painel web para atualizar.`);
      }
    } catch (err) {
      this._log('warn', `Auto-check falhou: ${err.message}`);
    }
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
