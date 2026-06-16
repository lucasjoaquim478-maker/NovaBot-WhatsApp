const socket = io();

/* ─── Log Exporter ─── */
class LogExporter {
  static toTXT(logs) {
    return logs.map(e => `[${new Date(e.timestamp).toISOString()}] [${e.type}] [${e.source || 'system'}] ${e.message}`).join('\n');
  }
  static toJSON(logs) {
    return JSON.stringify(logs, null, 2);
  }
  static toCSV(logs) {
    const header = 'timestamp,type,source,message';
    const rows = logs.map(e => {
      const msg = '"' + e.message.replace(/"/g, '""') + '"';
      return `${new Date(e.timestamp).toISOString()},${e.type},${e.source || 'system'},${msg}`;
    });
    return header + '\n' + rows.join('\n');
  }
  static download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

/* ─── Notification Manager ─── */
class NotificationManager {
  constructor() {
    this.container = document.getElementById('notificationArea');
  }
  show(type, title, message, duration) {
    const icons = { error: '✕', warning: '⚠', info: 'ℹ', success: '✓' };
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    el.innerHTML = `
      <span class="notif-icon">${icons[type] || 'ℹ'}</span>
      <div class="notif-body">
        <div class="notif-title">${this._esc(title)}</div>
        <div class="notif-msg">${this._esc(message)}</div>
      </div>
      <button class="notif-close">&times;</button>`;
    el.querySelector('.notif-close').onclick = () => el.remove();
    this.container.appendChild(el);
    if (duration !== Infinity) setTimeout(() => { if (el.parentNode) el.remove(); }, duration || 5000);
  }
  error(title, msg) { this.show('error', title, msg, 8000); }
  warn(title, msg) { this.show('warning', title, msg, 5000); }
  info(title, msg) { this.show('info', title, msg, 4000); }
  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

/* ─── Log Chart ─── */
class LogChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.data = []; // { timestamp, count }
    this.maxPoints = 60;
    this.animId = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const rect = this.canvas.parentNode.getBoundingClientRect();
    this.canvas.width = rect.width * 2;
    this.canvas.height = 80 * 2;
    this.ctx.scale(2, 2);
    this.draw();
  }
  push(timestamp) {
    const key = Math.floor(timestamp / 1000);
    if (this.data.length && this.data[this.data.length - 1].key === key) {
      this.data[this.data.length - 1].count++;
    } else {
      this.data.push({ key, count: 1, time: timestamp });
    }
    if (this.data.length > this.maxPoints) this.data.shift();
    this.draw();
  }
  draw() {
    const ctx = this.ctx;
    const w = this.canvas.width / 2;
    const h = this.canvas.height / 2;
    if (!ctx || !w) return;

    ctx.clearRect(0, 0, w, h);

    if (this.data.length < 2) {
      ctx.fillStyle = '#6e7681';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Aguardando atividade...', w / 2, h / 2 + 4);
      return;
    }

    const max = Math.max(1, ...this.data.map(d => d.count));
    const pad = 4;
    const barW = Math.max(2, (w - pad * 2) / this.data.length - 1);
    const grad = ctx.createLinearGradient(0, h, 0, pad);
    grad.addColorStop(0, 'rgba(88, 166, 255, 0)');
    grad.addColorStop(0.3, 'rgba(88, 166, 255, 0.3)');
    grad.addColorStop(0.7, 'rgba(88, 166, 255, 0.6)');
    grad.addColorStop(1, 'rgba(88, 166, 255, 0.9)');

    ctx.beginPath();
    this.data.forEach((d, i) => {
      const x = pad + i * (barW + 1);
      const bh = (d.count / max) * (h - pad * 2);
      ctx.rect(x, h - pad - bh, barW, bh);
    });
    ctx.fillStyle = grad;
    ctx.fill();
  }
}

/* ─── Log Manager ─── */
class LogManager {
  constructor() {
    this.allLogs = [];
    this.filterType = 'all';
    this.searchQuery = '';
    this.sourceQuery = '';
    this.maxLogs = 2000;
    this.listeners = [];
  }
  addLogs(logs) {
    for (const l of logs) this._add(l);
    this._notify();
  }
  addLog(entry) {
    this._add(entry);
    this._notify();
  }
  _add(entry) {
    if (!entry.source) {
      const m = entry.message.match(/^\[(\w+)\]/);
      entry.source = m ? m[1].toLowerCase() : 'system';
    }
    this.allLogs.push(entry);
    if (this.allLogs.length > this.maxLogs) {
      this.allLogs.splice(0, this.allLogs.length - this.maxLogs);
    }
  }
  clear() {
    this.allLogs = [];
    this._notify();
  }
  getFiltered() {
    return this.allLogs.filter(e => {
      if (this.filterType !== 'all' && e.type !== this.filterType) return false;
      if (this.searchQuery && !e.message.toLowerCase().includes(this.searchQuery)) return false;
      if (this.sourceQuery && (!e.source || !e.source.toLowerCase().includes(this.sourceQuery))) return false;
      return true;
    });
  }
  getStats() {
    const s = { total: this.allLogs.length, SUCCESS: 0, INFO: 0, WARNING: 0, ERROR: 0, DEBUG: 0 };
    for (const l of this.allLogs) { if (s.hasOwnProperty(l.type)) s[l.type]++; }
    return s;
  }
  onChange(fn) { this.listeners.push(fn); }
  _notify() { for (const fn of this.listeners) fn(); }
}

/* ─── Log Renderer (Virtual Scrolling) ─── */
class LogRenderer {
  constructor(containerId, manager) {
    this.container = document.getElementById(containerId);
    this.manager = manager;
    this.placeholder = this.container.querySelector('.console-placeholder');
    this.virtualizer = document.getElementById('logVirtualizer');
    this.rowHeight = 22;
    this.buffer = 10;
    this.rendered = [];
    this.expanded = new Set();

    this.container.addEventListener('scroll', () => this._onScroll());
    this.container.addEventListener('click', (e) => this._onClick(e));
    manager.onChange(() => this.scheduleRender());
  }

  scheduleRender() {
    if (this._pendingRender) return;
    this._pendingRender = requestAnimationFrame(() => {
      this._pendingRender = null;
      this.render();
    });
  }

  render() {
    const items = this.manager.getFiltered();
    const ct = this.container;
    const st = ct.scrollTop || 0;
    const vh = ct.clientHeight || 400;

    if (!items.length) {
      this.virtualizer.innerHTML = '';
      this.virtualizer.style.height = 'auto';
      if (this.placeholder) this.placeholder.style.display = 'block';
      return;
    }
    if (this.placeholder) this.placeholder.style.display = 'none';

    const totalH = items.length * this.rowHeight;
    this.virtualizer.style.height = totalH + 'px';
    this.virtualizer.style.position = 'relative';

    const startIdx = Math.max(0, Math.floor(st / this.rowHeight) - this.buffer);
    const endIdx = Math.min(items.length, Math.ceil((st + vh) / this.rowHeight) + this.buffer);

    const visible = new Set();
    const frag = document.createDocumentFragment();
    let lastEl = null;

    for (let i = startIdx; i < endIdx; i++) {
      visible.add(i);
      const item = items[i];
      const key = item.id || i;
      const existing = this.virtualizer.querySelector(`[data-idx="${i}"]`);

      if (existing) {
        lastEl = existing;
        continue;
      }

      const el = this._createRow(item, i);
      el.dataset.idx = i;
      if (lastEl) {
        lastEl.insertAdjacentElement('afterend', el);
      } else {
        this.virtualizer.prepend(el);
      }
      lastEl = el;
    }

    // Remove non-visible rows
    const children = this.virtualizer.children;
    for (let ci = children.length - 1; ci >= 0; ci--) {
      const child = children[ci];
      if (child.dataset.idx === undefined) continue;
      const idx = parseInt(child.dataset.idx);
      if (!visible.has(idx)) {
        // Detach but keep reference for fast re-add
        child.remove();
      }
    }

    // Position visible rows
    const kids = this.virtualizer.querySelectorAll('[data-idx]');
    for (const kid of kids) {
      const idx = parseInt(kid.dataset.idx);
      kid.style.position = 'absolute';
      kid.style.top = (idx * this.rowHeight) + 'px';
      kid.style.left = '0';
      kid.style.right = '0';
      kid.style.height = this.rowHeight + 'px';
    }

    this.rendered = items;
  }

  _createRow(item, idx) {
    const el = document.createElement('div');
    const time = new Date(item.timestamp).toLocaleTimeString();
    const full = new Date(item.timestamp).toLocaleString();
    const msg = this._esc(item.message);
    const src = item.source || 'system';
    const isExpanded = this.expanded.has(item.id);
    el.className = 'log-entry' + (isExpanded ? ' log-entry-expanded' : '');
    el.dataset.type = item.type;
    el.dataset.id = item.id || '';
    el.title = full;
    el.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-source">${this._esc(src)}</span>
      <span class="log-type ${item.type}">[${item.type}]</span>
      <span class="log-msg">${msg}</span>
      <button class="log-copy-btn" title="Copiar"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>`;
    return el;
  }

  _onScroll() {
    if (this._scrollRaf) return;
    this._scrollRaf = requestAnimationFrame(() => {
      this._scrollRaf = null;
      this.render();
    });
  }

  _onClick(e) {
    const entry = e.target.closest('.log-entry');
    if (!entry) return;

    // Copy button
    if (e.target.closest('.log-copy-btn')) {
      const msgEl = entry.querySelector('.log-msg');
      if (msgEl) {
        navigator.clipboard.writeText(msgEl.textContent).catch(() => {});
        this._toast('Copiado!');
      }
      return;
    }

    // Expand/collapse
    const id = entry.dataset.id;
    if (id) {
      if (this.expanded.has(id)) this.expanded.delete(id);
      else this.expanded.add(id);
      entry.classList.toggle('log-entry-expanded');
    }
  }

  scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _toast(msg) {
    let t = document.querySelector('.toast-msg');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast-msg';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 1500);
  }
}

/* ─── Main Dashboard ─── */
class Dashboard {
  constructor() {
    this.logManager = new LogManager();
    this.notifications = new NotificationManager();
    this.chart = new LogChart('logChart');
    this.logRenderer = new LogRenderer('logsConsole', this.logManager);

    this.uptimeInterval = null;
    this.allLiveLogs = [];
    this.liveConsole = document.getElementById('liveConsole');
    this.paused = false;
    this._autoScroll = true;
    this._tokenSearch = '';

    this.activeTokensBody = document.querySelector('#activeTokensTable tbody');
    this.usedTokensBody = document.querySelector('#usedTokensTable tbody');

    this.bindSocket();
    this.bindUI();
    this.fetchStats();
    this.fetchTokens();
    this.fetchUpdateState();
    this.logManager.onChange(() => this.updateUI());
  }

  /* ─── Socket ─── */
  bindSocket() {
    socket.on('status', (state) => this.onStatus(state));
    socket.on('logs', (logs) => {
      this.logManager.addLogs(logs);
      this.renderLive(logs);
      this.updateCounts();
    });
    socket.on('log', (entry) => {
      this.logManager.addLog(entry);
      if (!this.paused) this.appendLive(entry);
      this.chart.push(new Date(entry.timestamp).getTime());
      this.updateCounts();

      // Notify on ERROR
      if (entry.type === 'ERROR') {
        this.notifications.error('Erro detectado', entry.message.substring(0, 120));
      }
    });
    socket.on('logsCleared', () => {
      this.logManager.clear();
      this.allLiveLogs = [];
      this.liveConsole.innerHTML = '<div class="console-placeholder">Aguardando logs...</div>';
      this.updateCounts();
    });
    socket.on('tokens', (data) => this.renderTokens(data));
    socket.on('qr', (qrUrl) => this.onQR(qrUrl));
    socket.on('connect', () => this.updateConnectionStatus(true));
    socket.on('disconnect', () => this.updateConnectionStatus(false));

    // Update socket events
    socket.on('updateState', (data) => {
      this._renderUpdateState(data);
      if (data.state === 'idle') {
        document.getElementById('updateProgressArea').style.display = 'none';
        this.fetchUpdateHistory();
        this.fetchUpdateBackups();
      }
    });
    socket.on('updateProgress', (data) => {
      document.getElementById('updateProgressArea').style.display = '';
      document.getElementById('updateProgressBar').style.width = data.percent + '%';
      document.getElementById('updateProgressPct').textContent = data.percent + '%';
      document.getElementById('updateProgressCount').textContent = `${data.current} / ${data.total}`;
      document.getElementById('updateProgressFile').textContent = data.file || 'Baixando...';
      if (data.speed) document.getElementById('updateProgressSpeed').textContent = data.speed;
    });
    socket.on('updateLog', (data) => {
      if (data.level === 'error') this.notifications.error('Update', data.message.substring(0, 120));
    });
  }

  updateConnectionStatus(connected) {
    const el = document.querySelector('.panel-logs .panel-header h3');
    if (!el) return;
    if (connected) {
      el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Logs ao Vivo <span style="color:var(--green);font-size:10px">●</span>';
    } else {
      el.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Logs ao Vivo <span style="color:var(--red);font-size:10px">●</span>';
    }
  }

  /* ─── UI Events ─── */
  bindUI() {
    // Tabs
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = document.getElementById('tab-' + btn.dataset.tab);
        if (tab) tab.classList.add('active');
        if (btn.dataset.tab === 'logs') this.logRenderer.render();
      });
    });

    // Restart
    document.getElementById('restartBtn').addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja reiniciar o bot?')) return;
      try { await fetch('/api/bot/restart', { method: 'POST' }); } catch {}
    });

    // Live Export (sidebar)
    document.getElementById('exportLogsBtn').addEventListener('click', () => this.exportLogs());

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.logManager.filterType = btn.dataset.filter;
        this.logRenderer.render();
      });
    });

    // Search
    document.getElementById('logSearch').addEventListener('input', (e) => {
      this.logManager.searchQuery = e.target.value.toLowerCase();
      this.logRenderer.render();
    });

    // Source search
    document.getElementById('sourceSearch').addEventListener('input', (e) => {
      this.logManager.sourceQuery = e.target.value.toLowerCase();
      this.logRenderer.render();
    });

    // Auto scroll
    document.getElementById('autoScroll').addEventListener('change', (e) => {
      this._autoScroll = e.target.checked;
    });

    // Pause
    document.getElementById('pauseLogs').addEventListener('change', (e) => {
      this.paused = e.target.checked;
      const badge = document.getElementById('liveLogCount');
      if (this.paused) {
        badge.textContent = '⏸';
        badge.style.color = 'var(--yellow)';
      } else {
        this._flushLiveBuffer();
        this.updateCounts();
      }
    });

    // Clear
    document.getElementById('clearLogsBtn').addEventListener('click', async () => {
      try { await fetch('/api/logs', { method: 'DELETE' }); } catch {}
    });

    // Export dropdown
    const exportBtn = document.getElementById('exportBtn');
    const dropdown = document.getElementById('exportDropdown');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.export-group')) dropdown.classList.remove('show');
      });
      dropdown.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const format = btn.dataset.format;
          this.exportLogs(format);
          dropdown.classList.remove('show');
        });
      });
    }

    // Token creation
    document.getElementById('createTokenBtn').addEventListener('click', async () => {
      const label = document.getElementById('tokenLabel').value.trim() || ('token-' + Date.now().toString(36));
      try {
        const res = await fetch('/api/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label })
        });
        const data = await res.json();
        document.getElementById('tokenDisplay').textContent = data.token;
        document.getElementById('tokenModal').classList.add('show');
        this.fetchTokens();
      } catch {}
    });

    document.getElementById('copyTokenBtn').addEventListener('click', () => {
      const text = document.getElementById('tokenDisplay').textContent;
      navigator.clipboard.writeText(text).catch(() => {});
      this._toast('Token copiado!');
    });

    document.getElementById('closeTokenModal').addEventListener('click', () => {
      document.getElementById('tokenModal').classList.remove('show');
    });
    document.getElementById('tokenModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) document.getElementById('tokenModal').classList.remove('show');
    });

    document.getElementById('tokenSearch').addEventListener('input', (e) => {
      this._tokenSearch = e.target.value.toLowerCase();
      this.renderTokens(this._lastTokenData);
    });

    // Update panel
    document.getElementById('updateCheckBtn').addEventListener('click', () => this.handleUpdateCheck());
    document.getElementById('updateStartBtn').addEventListener('click', () => this.handleUpdateStart());
    document.getElementById('updatePauseBtn').addEventListener('click', () => this.handleUpdatePause());
    document.getElementById('updateResumeBtn').addEventListener('click', () => this.handleUpdateResume());
    document.getElementById('updateAbortBtn').addEventListener('click', () => this.handleUpdateAbort());
    document.getElementById('updateRollbackBtn').addEventListener('click', () => this.handleUpdateRollback());
    document.querySelector('[data-tab="update"]').addEventListener('click', () => {
      this.fetchUpdateState();
      this.fetchUpdateHistory();
      this.fetchUpdateBackups();
    });
  }

  /* ─── Stats ─── */
  async fetchStats() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data.phone) document.getElementById('cardPhone').textContent = data.phone;
      const subtitle = document.getElementById('subtitleStatus');
      if (data.server) {
        const plat = data.server.platform === 'win32' ? 'Windows' : 'Linux';
        subtitle.textContent = `v${data.server.version} · ${plat} · Node ${data.server.nodeVersion}`;
      }
    } catch {}
  }

  /* ─── Live Console ─── */
  renderLive(logs) {
    this.allLiveLogs = logs;
    if (!logs.length) {
      this.liveConsole.innerHTML = '<div class="console-placeholder">Aguardando logs...</div>';
      return;
    }
    const html = logs.slice(-100).map(e => this._formatLiveEntry(e)).join('');
    this.liveConsole.innerHTML = html;
    if (this._autoScroll) this.liveConsole.scrollTop = this.liveConsole.scrollHeight;
  }

  appendLive(entry) {
    if (this.paused) {
      this._liveBuffer = this._liveBuffer || [];
      this._liveBuffer.push(entry);
      return;
    }
    this.allLiveLogs.push(entry);
    if (this.allLiveLogs.length > 500) this.allLiveLogs.splice(0, this.allLiveLogs.length - 500);
    const ph = this.liveConsole.querySelector('.console-placeholder');
    if (ph) ph.remove();
    // Remove oldest if over limit
    const maxLive = 100;
    while (this.liveConsole.children.length > maxLive) {
      this.liveConsole.removeChild(this.liveConsole.firstChild);
    }
    this.liveConsole.insertAdjacentHTML('beforeend', this._formatLiveEntry(entry));
    if (this._autoScroll) this.liveConsole.scrollTop = this.liveConsole.scrollHeight;
  }

  _flushLiveBuffer() {
    const buf = this._liveBuffer || [];
    this._liveBuffer = [];
    for (const entry of buf) {
      this.appendLive(entry);
    }
  }

  _formatLiveEntry(log) {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const msg = this._esc(log.message);
    const src = log.source || 'system';
    return `<div class="log-entry" title="${new Date(log.timestamp).toLocaleString()}" data-type="${log.type}">
      <span class="log-time">[${time}]</span>
      <span class="log-source">${this._esc(src)}</span>
      <span class="log-type ${log.type}">[${log.type}]</span>
      <span class="log-msg">${msg}</span>
    </div>`;
  }

  /* ─── Status ─── */
  onStatus(state) {
    const dot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');
    const cardStatus = document.getElementById('cardStatus');
    const uptimeEl = document.getElementById('cardUptime');
    const uptimeSub = document.getElementById('statusUptime');
    const badge = document.getElementById('badge-status');

    if (state.status === 'online') {
      dot.className = 'status-dot online';
      statusText.textContent = 'Online';
      if (cardStatus) cardStatus.textContent = 'Online';
      if (badge) { badge.style.color = 'var(--green)'; badge.textContent = '●'; }
      if (this.uptimeInterval) clearInterval(this.uptimeInterval);
      this.uptimeInterval = setInterval(() => {
        if (state.connectedAt) {
          const sec = Math.floor((Date.now() - new Date(state.connectedAt).getTime()) / 1000);
          const h = Math.floor(sec / 3600);
          const m = Math.floor((sec % 3600) / 60);
          const s = sec % 60;
          const str = h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
          if (uptimeEl) uptimeEl.textContent = str;
          if (uptimeSub) uptimeSub.textContent = str;
        }
      }, 1000);
    } else {
      dot.className = 'status-dot offline';
      statusText.textContent = 'Offline';
      if (cardStatus) cardStatus.textContent = 'Offline';
      if (badge) { badge.style.color = 'var(--red)'; badge.textContent = '●'; }
      if (uptimeEl) uptimeEl.textContent = '—';
      if (uptimeSub) uptimeSub.textContent = '';
      if (this.uptimeInterval) { clearInterval(this.uptimeInterval); this.uptimeInterval = null; }
    }
  }

  /* ─── QR ─── */
  onQR(qrUrl) {
    const img = document.getElementById('qrImage');
    const status = document.getElementById('qrStatus');
    const placeholder = document.querySelector('.qr-placeholder');
    if (qrUrl) {
      img.src = qrUrl;
      img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      status.textContent = 'Escaneie o QR code com o WhatsApp';
      status.style.color = 'var(--accent)';
    } else {
      img.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
      status.textContent = 'Bot conectado!';
      status.style.color = 'var(--green)';
    }
  }

  /* ─── Counts & Stats ─── */
  updateCounts() {
    const stats = this.logManager.getStats();
    document.getElementById('cardLogs').textContent = stats.total;
    document.getElementById('badge-logs').textContent = stats.total > 99 ? '99+' : stats.total;

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statSuccess').textContent = stats.SUCCESS;
    document.getElementById('statInfo').textContent = stats.INFO;
    document.getElementById('statWarning').textContent = stats.WARNING;
    document.getElementById('statError').textContent = stats.ERROR;

    document.getElementById('count-all').textContent = stats.total;
    document.getElementById('count-SUCCESS').textContent = stats.SUCCESS;
    document.getElementById('count-INFO').textContent = stats.INFO;
    document.getElementById('count-WARNING').textContent = stats.WARNING;
    document.getElementById('count-ERROR').textContent = stats.ERROR;

    const badge = document.getElementById('liveLogCount');
    if (!this.paused) { badge.textContent = stats.total; badge.style.color = ''; }
  }

  updateUI() {
    this.updateCounts();
  }

  /* ─── Export ─── */
  exportLogs(format) {
    const logs = this.logManager.allLogs;
    if (!logs.length) { this._toast('Nenhum log para exportar'); return; }
    format = format || 'txt';
    const date = new Date().toISOString().slice(0, 10);
    let content, mime, ext;
    switch (format) {
      case 'json':
        content = LogExporter.toJSON(logs);
        mime = 'application/json';
        ext = 'json';
        break;
      case 'csv':
        content = LogExporter.toCSV(logs);
        mime = 'text/csv';
        ext = 'csv';
        break;
      default:
        content = LogExporter.toTXT(logs);
        mime = 'text/plain';
        ext = 'txt';
    }
    LogExporter.download(content, `novabot-logs-${date}.${ext}`, mime);
    this._toast(`Exportado como .${ext}`);
  }

  /* ─── Tokens ─── */
  async fetchTokens() {
    try {
      const res = await fetch('/api/tokens');
      const data = await res.json();
      this._lastTokenData = data;
      this.renderTokens(data);
    } catch {}
  }

  renderTokens(data) {
    if (!data) return;
    this._lastTokenData = data;
    const search = this._tokenSearch || '';
    const activeFiltered = data.active.filter(t => !search || t.raw.toLowerCase().includes(search) || (t.label || '').toLowerCase().includes(search));
    const revokedFiltered = data.revoked.filter(t => !search || t.raw.toLowerCase().includes(search));
    const usedFiltered = data.used.filter(t => !search || t.raw.toLowerCase().includes(search));

    document.getElementById('badge-tokens').textContent = data.active.length;

    // Master token indicator
    let masterHtml = '';
    if (data.masterTokenSet) {
      masterHtml = '<div class="master-token-badge" style="background:#1a3a1a;color:#4caf50;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:13px">🔑 MASTER_OWNER_TOKEN configurado na env var</div>';
    }

    const activeBody = this.activeTokensBody;
    if (activeFiltered.length === 0) {
      activeBody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhum token ativo.</td></tr>';
    } else {
      activeBody.innerHTML = activeFiltered.map(t => {
        const label = t.label || '—';
        const expires = t.expiresAt ? new Date(t.expiresAt).toLocaleString() : '—';
        const singleUse = t.singleUse ? 'Sim' : (t.singleUse === false ? 'Não' : (t.revocable !== undefined ? '—' : 'Não'));
        return `<tr><td><code>${this._esc(t.raw)}</code></td><td>${this._esc(label)}</td><td>${new Date(t.createdAt).toLocaleString()}</td><td>${expires}</td><td>${singleUse}</td><td><button class="revoke-btn" data-id="${t.id}">Revogar</button></td></tr>`;
      }).join('');
      activeBody.querySelectorAll('.revoke-btn').forEach(btn => {
        btn.addEventListener('click', () => this.revokeToken(btn.dataset.id));
      });
    }

    // Insert master token badge before the table
    const activeSection = document.querySelector('.section-title');
    if (activeSection && masterHtml) {
      let existing = activeSection.parentElement.querySelector('.master-token-badge');
      if (!existing) {
        const div = document.createElement('div');
        div.innerHTML = masterHtml;
        activeSection.parentElement.insertBefore(div.firstElementChild, activeSection.nextElementSibling);
      }
    }

    const revokedBody = document.querySelector('#revokedTokensTable tbody');
    if (revokedBody) {
      if (revokedFiltered.length === 0) {
        revokedBody.innerHTML = '<tr class="empty-row"><td colspan="3">Nenhum token revogado.</td></tr>';
      } else {
        revokedBody.innerHTML = revokedFiltered.map(t =>
          `<tr><td><code>${this._esc(t.raw)}</code></td><td>${new Date(t.createdAt).toLocaleString()}</td><td>${t.revokedAt ? new Date(t.revokedAt).toLocaleString() : '—'}</td></tr>`
        ).join('');
      }
    }

    const usedBody = this.usedTokensBody;
    if (usedFiltered.length === 0) {
      usedBody.innerHTML = '<tr class="empty-row"><td colspan="3">Nenhum token utilizado.</td></tr>';
    } else {
      usedBody.innerHTML = usedFiltered.map(t =>
        `<tr><td><code>${this._esc(t.raw)}</code></td><td>${this._esc(t.usedBy || '—')}</td><td>${t.usedAt ? new Date(t.usedAt).toLocaleString() : '—'}</td></tr>`
      ).join('');
    }
  }

  async revokeToken(id) {
    if (!confirm('Tem certeza que deseja revogar este token?')) return;
    try {
      const res = await fetch(`/api/tokens/${id}/revoke`, { method: 'POST' });
      const d = await res.json();
      if (d.ok) this.fetchTokens();
    } catch {}
  }

  /* ─── Update Panel ─── */
  async fetchUpdateState() {
    try {
      const res = await fetch('/api/update/state');
      const state = await res.json();
      this._renderUpdateState(state);
    } catch {}
  }

  _renderUpdateState(state) {
    document.getElementById('updateCurrentVer').textContent = 'v' + state.localVersion;
    document.getElementById('updateLatestVer').textContent = state.latestVersion !== state.localVersion ? 'v' + state.latestVersion : 'v' + state.localVersion + ' (atualizado)';
    document.getElementById('updateState').textContent = state.state;
    const checkBtn = document.getElementById('updateCheckBtn');
    const startBtn = document.getElementById('updateStartBtn');
    const pauseBtn = document.getElementById('updatePauseBtn');
    const resumeBtn = document.getElementById('updateResumeBtn');
    const abortBtn = document.getElementById('updateAbortBtn');
    const badge = document.getElementById('badge-update');

    if (state.state === 'idle') {
      checkBtn.disabled = false;
      startBtn.disabled = state.latestVersion === state.localVersion;
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      abortBtn.style.display = 'none';
      document.getElementById('updateProgressArea').style.display = 'none';
    } else if (state.state === 'checking') {
      checkBtn.disabled = true;
      startBtn.disabled = true;
    } else if (state.state === 'downloading') {
      checkBtn.disabled = true;
      startBtn.disabled = true;
      pauseBtn.style.display = '';
      resumeBtn.style.display = 'none';
      abortBtn.style.display = '';
      document.getElementById('updateProgressArea').style.display = '';
    } else if (state.state === 'paused') {
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = '';
      abortBtn.style.display = '';
      document.getElementById('updateProgressArea').style.display = '';
    }

    if (state.latestVersion !== state.localVersion && state.state === 'idle') {
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  async handleUpdateCheck() {
    const btn = document.getElementById('updateCheckBtn');
    btn.disabled = true;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg> Verificando...';
    try {
      const res = await fetch('/api/update/check');
      const data = await res.json();
      document.getElementById('updateLastCheck').textContent = new Date().toLocaleString();
      if (data.hasUpdate) {
        document.getElementById('updateLatestVer').textContent = 'v' + data.version;
        document.getElementById('updateStartBtn').disabled = false;
        document.getElementById('badge-update').style.display = '';
        this._toast(`Nova versão disponível: v${data.version}`);
      } else if (data.error) {
        this._toast('Erro ao verificar: ' + data.error);
      } else {
        document.getElementById('updateLatestVer').textContent = 'v' + data.version + ' (atualizado)';
      }
      if (data.body) {
        document.getElementById('updateChangelog').innerHTML = '<pre style="white-space:pre-wrap;font-size:13px;line-height:1.6">' + this._esc(data.body) + '</pre>';
      } else {
        document.getElementById('updateChangelog').innerHTML = '<div class="console-placeholder">Nenhum changelog disponível.</div>';
      }
    } catch (e) {
      this._toast('Erro: ' + e.message);
    }
    btn.disabled = false;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Verificar Atualizações';
  }

  async handleUpdateStart() {
    if (!confirm('Iniciar atualização? O bot será reiniciado após a conclusão.')) return;
    const btn = document.getElementById('updateStartBtn');
    btn.disabled = true;
    btn.textContent = 'Iniciando...';
    try {
      await fetch('/api/update/start', { method: 'POST' });
      this._toast('Atualização iniciada em segundo plano');
    } catch (e) {
      this._toast('Erro: ' + e.message);
      btn.disabled = false;
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Atualizar Agora';
    }
  }

  handleUpdatePause() {
    fetch('/api/update/pause', { method: 'POST' }).then(r => r.json()).then(d => {
      if (d.ok) this._toast('Download pausado');
    });
  }

  handleUpdateResume() {
    fetch('/api/update/resume', { method: 'POST' }).then(r => r.json()).then(d => {
      if (d.ok) this._toast('Download retomado');
    });
  }

  handleUpdateAbort() {
    if (!confirm('Cancelar atualização?')) return;
    fetch('/api/update/abort', { method: 'POST' }).then(r => r.json()).then(d => {
      if (d.ok) this._toast('Atualização cancelada');
    });
  }

  async handleUpdateRollback() {
    if (!confirm('Restaurar o backup mais recente? O bot será reiniciado.')) return;
    try {
      const res = await fetch('/api/update/rollback', { method: 'POST' });
      const data = await res.json();
      this._toast(`Backup ${data.backup} restaurado (${data.files} arquivos)`);
    } catch (e) {
      this._toast('Erro: ' + e.message);
    }
  }

  async fetchUpdateHistory() {
    try {
      const res = await fetch('/api/update/history');
      const history = await res.json();
      const tbody = document.querySelector('#updateHistoryTable tbody');
      if (!history.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhum registro.</td></tr>';
        return;
      }
      tbody.innerHTML = history.map(h => {
        const actionMap = { check: 'Verificação', start: 'Início', completed: 'Concluído', error: 'Erro', rollback: 'Rollback' };
        const action = actionMap[h.action] || h.action;
        const ver = h.to || h.version || '—';
        const detail = h.error ? `❌ ${h.error}` : h.files_success ? `${h.files_success} arquivos` : h.hasUpdate === false ? 'Atualizado' : '';
        return `<tr><td>${new Date(h.timestamp).toLocaleString()}</td><td>${action}</td><td>v${ver}</td><td>${detail}</td></tr>`;
      }).join('');
    } catch {}
  }

  async fetchUpdateBackups() {
    try {
      const res = await fetch('/api/update/backups');
      const backups = await res.json();
      const tbody = document.querySelector('#updateBackupsTable tbody');
      if (!backups.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Nenhum backup.</td></tr>';
        return;
      }
      tbody.innerHTML = backups.map(b => {
        const size = b.size > 1024 * 1024 ? (b.size / 1024 / 1024).toFixed(1) + ' MB' : (b.size / 1024).toFixed(1) + ' KB';
        return `<tr><td>${this._esc(b.name)}</td><td>${new Date(b.date).toLocaleString()}</td><td>${b.files}</td><td>${size}</td></tr>`;
      }).join('');
    } catch {}
  }

  /* ─── Utils ─── */
  _esc(s) {
    if (typeof s !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _toast(msg) {
    let t = document.querySelector('.toast-msg');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast-msg';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 2000);
  }
}

/* ─── Auth Check ─── */
async function checkAuth() {
  try {
    const configRes = await fetch('/api/auth/config');
    const config = await configRes.json();

    if (!config.configured) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      new Dashboard();
      return;
    }

    const sessionRes = await fetch('/api/auth/session');
    const session = await sessionRes.json();

    if (session.user) {
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      const u = document.getElementById('sidebarUser');
      u.style.display = 'flex';
      document.getElementById('githubUser').textContent = session.user.login;
      if (session.user.avatar_url) document.getElementById('githubAvatar').src = session.user.avatar_url;
      document.getElementById('logoutBtn').onclick = async () => {
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
        window.location.reload();
      };
      new Dashboard();
    } else {
      showLogin();
    }
  } catch { showLogin(); }
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('githubLoginBtn').onclick = () => { window.location.href = '/api/auth/github'; };
  document.getElementById('logoutBtn').onclick = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.reload();
  };
  fetch('/api/auth/config').then(r => r.json()).then(data => {
    if (!data.configured) {
      document.getElementById('loginError').textContent =
        'GitHub OAuth não configurado. Configure githubClientId e githubSecret no config.json.';
    }
  }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', checkAuth);
