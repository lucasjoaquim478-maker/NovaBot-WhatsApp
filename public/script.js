const socket = io();
let allLogs = [];
let currentFilter = 'all';
let liveLogs = [];

socket.on('status', (state) => {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('statusText');
  const card = document.getElementById('cardStatus');
  const connected = document.getElementById('cardConnected');
  if (state.status === 'online') {
    dot.className = 'status-dot online';
    text.textContent = 'Online';
    if (card) card.textContent = 'Online';
    if (connected) connected.textContent = state.connectedAt ? new Date(state.connectedAt).toLocaleString() : '—';
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Offline';
    if (card) card.textContent = 'Offline';
    if (connected) connected.textContent = '—';
  }
});

socket.on('logs', (logs) => {
  allLogs = logs;
  liveLogs = logs.slice();
  renderLiveConsole();
  renderLogsConsole();
  document.getElementById('cardLogs').textContent = logs.length;
});

socket.on('log', (entry) => {
  liveLogs.push(entry);
  if (liveLogs.length > 500) liveLogs.splice(0, liveLogs.length - 500);
  allLogs.push(entry);
  if (allLogs.length > 500) allLogs.splice(0, allLogs.length - 500);
  appendLiveLog(entry);
  if (currentFilter === 'all' || entry.type === currentFilter) appendLogEntry(entry);
  document.getElementById('cardLogs').textContent = allLogs.length;
});

socket.on('logsCleared', () => {
  liveLogs = [];
  allLogs = [];
  document.getElementById('console').innerHTML = '<div class="console-placeholder">Aguardando logs...</div>';
  document.getElementById('logsConsole').innerHTML = '<div class="console-placeholder">Nenhum log registrado.</div>';
  document.getElementById('cardLogs').textContent = '0';
});

socket.on('tokens', (data) => {
  renderTokens(data);
});

function renderLiveConsole() {
  const el = document.getElementById('console');
  if (!liveLogs.length) { el.innerHTML = '<div class="console-placeholder">Aguardando logs...</div>'; return; }
  el.innerHTML = liveLogs.map(log => formatLogEntry(log)).join('');
  el.scrollTop = el.scrollHeight;
}

function appendLiveLog(entry) {
  const el = document.getElementById('console');
  const placeholder = el.querySelector('.console-placeholder');
  if (placeholder) placeholder.remove();
  el.insertAdjacentHTML('beforeend', formatLogEntry(entry));
  el.scrollTop = el.scrollHeight;
}

function renderLogsConsole() {
  const el = document.getElementById('logsConsole');
  const filtered = currentFilter === 'all' ? allLogs : allLogs.filter(l => l.type === currentFilter);
  if (!filtered.length) { el.innerHTML = '<div class="console-placeholder">Nenhum log registrado.</div>'; return; }
  el.innerHTML = filtered.map(log => formatLogEntry(log)).join('');
  el.scrollTop = el.scrollHeight;
}

function appendLogEntry(entry) {
  const el = document.getElementById('logsConsole');
  const placeholder = el.querySelector('.console-placeholder');
  if (placeholder) placeholder.remove();
  el.insertAdjacentHTML('beforeend', formatLogEntry(entry));
  el.scrollTop = el.scrollHeight;
}

function formatLogEntry(log) {
  const time = new Date(log.timestamp).toLocaleTimeString();
  return `<div class="log-entry"><span class="log-time">[${time}]</span><span class="log-type ${log.type}">[${log.type}]</span><span class="log-msg">${escapeHtml(log.message)}</span></div>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function renderTokens(data) {
  const activeBody = document.querySelector('#activeTokensTable tbody');
  const usedBody = document.querySelector('#usedTokensTable tbody');
  if (!activeBody || !usedBody) return;

  if (data.active.length === 0) {
    activeBody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);text-align:center;">Nenhum token ativo.</td></tr>';
  } else {
    activeBody.innerHTML = data.active.map(t => `<tr><td><code>${escapeHtml(t.raw)}</code></td><td>${new Date(t.createdAt).toLocaleString()}</td><td>${t.expiresAt ? new Date(t.expiresAt).toLocaleString() : '—'}</td><td>${t.singleUse ? '✅' : '❌'}</td><td><button class="revoke-btn" data-id="${t.id}">Revogar</button></td></tr>`).join('');
    activeBody.querySelectorAll('.revoke-btn').forEach(btn => {
      btn.addEventListener('click', () => revokeToken(btn.dataset.id));
    });
  }

  if (data.used.length === 0) {
    usedBody.innerHTML = '<tr><td colspan="3" style="color:var(--text2);text-align:center;">Nenhum token utilizado.</td></tr>';
  } else {
    usedBody.innerHTML = data.used.map(t => `<tr><td><code>${escapeHtml(t.raw)}</code></td><td>${t.usedBy || '—'}</td><td>${t.usedAt ? new Date(t.usedAt).toLocaleString() : '—'}</td></tr>`).join('');
  }

  document.getElementById('cardTokens').textContent = data.active.length;
}

async function revokeToken(id) {
  if (!confirm('Tem certeza que deseja revogar este token?')) return;
  try {
    const res = await fetch(`/api/tokens/${id}/revoke`, { method: 'POST' });
    const data = await res.json();
    if (data.ok) fetchTokens();
  } catch {}
}

async function fetchTokens() {
  try {
    const res = await fetch('/api/tokens');
    const data = await res.json();
    renderTokens(data);
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = document.getElementById('tab-' + btn.dataset.tab);
      if (tab) tab.classList.add('active');
    });
  });

  document.getElementById('clearLogsBtn').addEventListener('click', async () => {
    try { await fetch('/api/logs', { method: 'DELETE' }); } catch {}
  });

  document.getElementById('restartBtn').addEventListener('click', async () => {
    if (!confirm('Tem certeza que deseja reiniciar o bot?')) return;
    try { await fetch('/api/bot/restart', { method: 'POST' }); } catch {}
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderLogsConsole();
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
      fetchTokens();
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
});
