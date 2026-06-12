const socket = io();

class Dashboard {
  constructor() {
    this.allLogs = [];
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.autoScroll = true;
    this.uptimeInterval = null;

    this.console = document.getElementById('liveConsole');
    this.logsConsole = document.getElementById('logsConsole');
    this.activeTokensBody = document.querySelector('#activeTokensTable tbody');
    this.usedTokensBody = document.querySelector('#usedTokensTable tbody');

    this.bindEvents();
    this.initUI();
  }

  bindEvents() {
    socket.on('status', (state) => this.onStatus(state));
    socket.on('logs', (logs) => { this.allLogs = logs; this.renderLive(); this.renderLogs(); this.updateCounts(); });
    socket.on('log', (entry) => { this.allLogs.push(entry); if (this.allLogs.length > 1000) this.allLogs.splice(0, this.allLogs.length - 1000); this.appendLive(entry); if (this.shouldShowLog(entry)) this.appendLogEntry(entry); this.updateCounts(); });
    socket.on('logsCleared', () => { this.allLogs = []; this.console.innerHTML = '<div class="console-placeholder">Aguardando logs...</div>'; this.logsConsole.innerHTML = '<div class="console-placeholder">Nenhum log registrado.</div>'; this.updateCounts(); });
    socket.on('tokens', (data) => this.renderTokens(data));
    socket.on('qr', (qrUrl) => this.onQR(qrUrl));
  }

  initUI() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = document.getElementById('tab-' + btn.dataset.tab);
        if (tab) tab.classList.add('active');
      });
    });

    document.getElementById('restartBtn').addEventListener('click', async () => {
      if (!confirm('Tem certeza que deseja reiniciar o bot?')) return;
      try { await fetch('/api/bot/restart', { method: 'POST' }); } catch {}
    });

    document.getElementById('clearLogsBtn').addEventListener('click', async () => {
      try { await fetch('/api/logs', { method: 'DELETE' }); } catch {}
    });

    document.getElementById('logSearch').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.renderLogs();
    });

    document.getElementById('autoScroll').addEventListener('change', (e) => {
      this.autoScroll = e.target.checked;
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderLogs();
      });
    });

    document.getElementById('createTokenBtn').addEventListener('click', async () => {
      const singleUse = document.getElementById('singleUse').checked;
      const expiresOpt = document.getElementById('expiresOpt').value;
      const expiresAt = expiresOpt ? new Date(Date.now() + parseInt(expiresOpt)).toISOString() : null;
      try {
        const res = await fetch('/api/tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ singleUse, expiresAt })
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
    });

    document.getElementById('closeTokenModal').addEventListener('click', () => {
      document.getElementById('tokenModal').classList.remove('show');
    });
    document.getElementById('tokenModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) document.getElementById('tokenModal').classList.remove('show');
    });
  }

  onStatus(state) {
    const dot = document.querySelector('.status-dot');
    const statusText = document.getElementById('statusText');
    const cardStatus = document.getElementById('cardStatus');
    const uptimeEl = document.getElementById('cardUptime');
    const uptimeSub = document.getElementById('statusUptime');

    if (state.status === 'online') {
      dot.className = 'status-dot online';
      statusText.textContent = 'Online';
      if (cardStatus) cardStatus.textContent = 'Online';
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
      if (uptimeEl) uptimeEl.textContent = '—';
      if (uptimeSub) uptimeSub.textContent = '';
      if (this.uptimeInterval) { clearInterval(this.uptimeInterval); this.uptimeInterval = null; }
    }
  }

  shouldShowLog(entry) {
    if (this.searchQuery && !entry.message.toLowerCase().includes(this.searchQuery)) return false;
    if (this.currentFilter !== 'all' && entry.type !== this.currentFilter) return false;
    return true;
  }

  renderLive() {
    if (!this.allLogs.length) { this.console.innerHTML = '<div class="console-placeholder">Aguardando logs...</div>'; return; }
    this.console.innerHTML = this.allLogs.map(e => this.formatEntry(e)).join('');
    if (this.autoScroll) this.console.scrollTop = this.console.scrollHeight;
  }

  appendLive(entry) {
    const ph = this.console.querySelector('.console-placeholder');
    if (ph) ph.remove();
    this.console.insertAdjacentHTML('beforeend', this.formatEntry(entry));
    if (this.autoScroll) this.console.scrollTop = this.console.scrollHeight;
  }

  renderLogs() {
    const filtered = this.allLogs.filter(e => this.shouldShowLog(e));
    if (!filtered.length) { this.logsConsole.innerHTML = '<div class="console-placeholder">Nenhum log corresponde aos filtros.</div>'; return; }
    this.logsConsole.innerHTML = filtered.map(e => this.formatEntry(e)).join('');
    if (this.autoScroll) this.logsConsole.scrollTop = this.logsConsole.scrollHeight;
  }

  appendLogEntry(entry) {
    const ph = this.logsConsole.querySelector('.console-placeholder');
    if (ph) ph.remove();
    this.logsConsole.insertAdjacentHTML('beforeend', this.formatEntry(entry));
    if (this.autoScroll) this.logsConsole.scrollTop = this.logsConsole.scrollHeight;
  }

  formatEntry(log) {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const msg = this.escapeHtml(log.message);
    return `<div class="log-entry"><span class="log-time">[${time}]</span><span class="log-type ${log.type}">[${log.type}]</span><span class="log-msg">${msg}</span></div>`;
  }

  escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

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

  updateCounts() {
    document.getElementById('cardLogs').textContent = this.allLogs.length;
  }

  async fetchTokens() {
    try {
      const res = await fetch('/api/tokens');
      this.renderTokens(await res.json());
    } catch {}
  }

  renderTokens(data) {
    if (data.active.length === 0) {
      this.activeTokensBody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum token ativo.</td></tr>';
    } else {
      this.activeTokensBody.innerHTML = data.active.map(t => {
        const expires = t.expiresAt ? new Date(t.expiresAt).toLocaleString() : '—';
        return `<tr><td><code>${this.escapeHtml(t.raw)}</code></td><td>${new Date(t.createdAt).toLocaleString()}</td><td>${expires}</td><td>${t.singleUse ? 'Sim' : 'Não'}</td><td><button class="revoke-btn" data-id="${t.id}">Revogar</button></td></tr>`;
      }).join('');
      this.activeTokensBody.querySelectorAll('.revoke-btn').forEach(btn => {
        btn.addEventListener('click', () => this.revokeToken(btn.dataset.id));
      });
    }
    if (data.used.length === 0) {
      this.usedTokensBody.innerHTML = '<tr class="empty-row"><td colspan="3">Nenhum token utilizado.</td></tr>';
    } else {
      this.usedTokensBody.innerHTML = data.used.map(t =>
        `<tr><td><code>${this.escapeHtml(t.raw)}</code></td><td>${this.escapeHtml(t.usedBy || '—')}</td><td>${t.usedAt ? new Date(t.usedAt).toLocaleString() : '—'}</td></tr>`
      ).join('');
    }
    document.getElementById('cardTokens').textContent = data.active.length;
  }

  async revokeToken(id) {
    if (!confirm('Tem certeza que deseja revogar este token?')) return;
    try {
      const res = await fetch(`/api/tokens/${id}/revoke`, { method: 'POST' });
      const d = await res.json();
      if (d.ok) this.fetchTokens();
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', () => { new Dashboard(); });
