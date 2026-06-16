const { Router } = require('express');
const tokenService = require('../services/tokenService');
const logService = require('../services/logService');
const monitor = require('../botMonitor');
const updater = require('../../lib/updater');
const { safeRestart } = require('../../lib/restart');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const router = Router();

function loadCfg() {
  const p = path.join(__dirname, '..', '..', 'config.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return {}; }
}

function saveCfg(cfg) {
  const p = path.join(__dirname, '..', '..', 'config.json');
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
}

function getGithubConfig() {
  const cfg = loadCfg();
  return {
    clientId: process.env.GITHUB_CLIENT_ID || cfg.githubClientId || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || cfg.githubClientSecret || '',
    ownerUsername: process.env.GITHUB_OWNER_USERNAME || cfg.githubOwnerUsername || '',
    ownerId: process.env.GITHUB_OWNER_ID ? parseInt(process.env.GITHUB_OWNER_ID) : (cfg.githubOwnerId || null)
  };
}

function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/* ─── GitHub Auth Routes (public) ─── */

router.get('/auth/config', (req, res) => {
  const gh = getGithubConfig();
  res.json({ configured: !!(gh.clientId && gh.clientSecret), githubClientId: gh.clientId || null });
});

router.get('/auth/github', (req, res) => {
  const gh = getGithubConfig();
  if (!gh.clientId) return res.redirect('/?error=github_not_configured');
  const redirectUri = `${req.protocol}://${req.get('host')}/api/auth/github/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${gh.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user`;
  res.redirect(url);
});

router.get('/auth/github/callback', asyncWrap(async (req, res) => {
  const { code, error } = req.query;
  if (error === 'access_denied') return res.redirect('/');
  if (!code) return res.status(400).send('Código de autorização não fornecido');

  const gh = getGithubConfig();
  if (!gh.clientId || !gh.clientSecret) {
    return res.status(400).send('GitHub OAuth não configurado');
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: gh.clientId,
      client_secret: gh.clientSecret,
      code
    })
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return res.status(400).send('Falha na autenticação com GitHub');
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const user = await userRes.json();

  if (gh.ownerId && user.id !== gh.ownerId) {
    return res.send(htmlError(`Acesso negado. Usuário <strong>${user.login}</strong> não autorizado. Proprietário configurado: <strong>${gh.ownerUsername || gh.ownerId}</strong>`));
  }
  if (gh.ownerUsername && user.login !== gh.ownerUsername) {
    return res.send(htmlError(`Acesso negado. Usuário <strong>${user.login}</strong> não autorizado. Proprietário configurado: <strong>${gh.ownerUsername}</strong>`));
  }

  req.session.githubUser = {
    id: user.id,
    login: user.login,
    avatar_url: user.avatar_url,
    name: user.name || user.login
  };

  const cfg = loadCfg();
  if (!cfg.githubOwnerId && !cfg.githubOwnerUsername) {
    cfg.githubOwnerId = user.id;
    cfg.githubOwnerUsername = user.login;
    saveCfg(cfg);
    logService.add('info', `GitHub owner configurado: ${user.login} (ID: ${user.id})`);
  }

  logService.add('info', `GitHub login: ${user.login}`);
  res.redirect('/');
}));

router.get('/auth/session', (req, res) => {
  res.json({ user: req.session.githubUser || null });
});

router.post('/auth/logout', (req, res) => {
  if (req.session) req.session.destroy();
  res.json({ ok: true });
});

/* ─── Auth Middleware ─── */
router.use((req, res, next) => {
  const gh = getGithubConfig();
  if (!gh.clientId || !gh.clientSecret) return next();
  if (req.session && req.session.githubUser) return next();
  res.status(401).json({ error: 'Autenticação necessária. Faça login com GitHub.' });
});

function htmlError(msg) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Erro</title><style>body{font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}div{text-align:center;max-width:480px;padding:32px}h2{color:#f85149;margin-bottom:12px}p{color:#8b949e;line-height:1.6}a{color:#58a6ff}</style></head><body><div><h2>Acesso Negado</h2><p>${msg}</p><br><a href="/">Voltar</a></div></body></html>`;
}

router.get('/status', (req, res) => {
  res.json(monitor.getState());
});

router.get('/stats', (req, res) => {
  const state = monitor.getState();
  const uptime = state.connectedAt
    ? Math.floor((Date.now() - new Date(state.connectedAt).getTime()) / 1000)
    : 0;
  const phone = state.user
    ? (state.user.id || '').split(':')[0]?.replace('@s.whatsapp.net', '')
    : null;
  res.json({
    status: state.status,
    connectedAt: state.connectedAt,
    uptime,
    logCount: monitor.logHistory.length,
    phone,
    user: state.user ? { id: state.user.id?.split(':')[0] } : null,
    server: monitor.serverInfo
  });
});

router.get('/logs', (req, res) => {
  let logs = monitor.logHistory;
  const { type, search, limit } = req.query;
  if (type && type !== 'all') logs = logs.filter(l => l.type === type.toUpperCase());
  if (search) {
    const s = search.toLowerCase();
    logs = logs.filter(l => l.message.toLowerCase().includes(s));
  }
  if (limit) logs = logs.slice(-parseInt(limit));
  res.json(logs);
});

router.delete('/logs', (req, res) => {
  monitor.clearLogs();
  res.json({ ok: true });
});

router.get('/tokens', (req, res) => {
  const data = tokenService.list();
  const cfg = loadCfg();
  const cfgTokens = (cfg.tokens || []).map(t => ({
    id: t.label,
    raw: t.token.slice(0, 8) + '...' + t.token.slice(-4),
    label: t.label,
    createdBy: t.createdBy,
    createdAt: t.createdAt,
    revocable: true
  }));
  res.json({
    active: [...(data.active || []), ...cfgTokens],
    used: data.used || [],
    revoked: data.revoked || [],
    logs: data.logs || [],
    masterTokenSet: !!process.env.MASTER_OWNER_TOKEN
  });
});

router.post('/tokens', asyncWrap(async (req, res) => {
  const label = req.body.label || 'token-' + Date.now().toString(36);
  const raw = crypto.randomBytes(24).toString('hex');
  const cfg = loadCfg();
  if (!cfg.tokens) cfg.tokens = [];
  cfg.tokens.push({ label, token: raw, createdBy: 'painel', createdAt: new Date().toISOString() });
  saveCfg(cfg);
  logService.add('info', `Token "${label}" gerado pelo painel`);
  res.json({ token: raw, id: label, label });
}));

router.post('/tokens/:id/revoke', asyncWrap(async (req, res) => {
  const label = req.params.id;
  const cfg = loadCfg();
  if (cfg.tokens) {
    const idx = cfg.tokens.findIndex(t => t.label === label);
    if (idx !== -1) {
      cfg.tokens.splice(idx, 1);
      saveCfg(cfg);
      logService.add('warn', `Token "${label}" revogado pelo painel`);
      return res.json({ ok: true });
    }
  }
  // Fallback: revoke via tokenService
  const ok = tokenService.revoke(req.params.id);
  if (ok) logService.add('warn', `Token ${req.params.id.substring(0, 8)} revogado pelo painel`);
  res.json({ ok });
}));

router.post('/bot/restart', (req, res) => {
  logService.add('info', 'Reinício solicitado pelo painel');
  res.json({ ok: true });
  setTimeout(() => safeRestart(), 1000);
});

/* ─── Update ─── */

router.get('/update/state', (req, res) => {
  res.json(updater.getState());
});

router.get('/update/check', asyncWrap(async (req, res) => {
  const result = await updater.checkForUpdates();
  res.json(result);
}));

router.post('/update/start', asyncWrap(async (req, res) => {
  if (updater.state === 'downloading' || updater.state === 'installing') {
    return res.status(409).json({ error: 'Já existe uma atualização em andamento' });
  }
  updater.performUpdate().then(result => {
    logService.add('info', `Atualização concluída: ${updater.getCurrentVersion()} -> ${result.targetVer}`);
    setTimeout(() => safeRestart(), 3000);
  }).catch(err => {
    logService.add('error', `Falha na atualização: ${err.message}`);
  });
  res.json({ ok: true, message: 'Atualização iniciada em segundo plano' });
}));

router.post('/update/pause', (req, res) => {
  const ok = updater.pause();
  res.json({ ok });
});

router.post('/update/resume', (req, res) => {
  const ok = updater.resume();
  res.json({ ok });
});

router.post('/update/abort', (req, res) => {
  const ok = updater.abort();
  res.json({ ok });
});

router.get('/update/changelog', asyncWrap(async (req, res) => {
  const changelog = await updater.getChangelog();
  res.json({ changelog });
}));

router.get('/update/history', (req, res) => {
  res.json(updater.getHistory());
});

router.post('/update/rollback', asyncWrap(async (req, res) => {
  const result = await updater.rollback();
  logService.add('warn', `Rollback realizado: ${result.backup} (${result.files} arquivos)`);
  res.json(result);
  setTimeout(() => safeRestart(), 3000);
}));

router.get('/update/backups', (req, res) => {
  res.json(updater.listBackups());
});

router.use((err, req, res, next) => {
  logService.add('error', `API ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: err.message });
});

module.exports = router;
