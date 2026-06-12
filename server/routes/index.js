const { Router } = require('express');
const tokenService = require('../services/tokenService');
const logService = require('../services/logService');
const monitor = require('../botMonitor');
const updater = require('../../lib/updater');
const shardcloud = require('../../lib/shardcloud');

const router = Router();

function asyncWrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
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
  res.json(tokenService.list());
});

router.post('/tokens', asyncWrap(async (req, res) => {
  const token = tokenService.generate({
    expiresAt: req.body.expiresAt || null,
    singleUse: req.body.singleUse || false
  });
  logService.add('info', `Token gerado: ${token.raw.substring(0, 10)}...`);
  res.json({ token: token.raw, id: token.id });
}));

router.post('/tokens/:id/revoke', asyncWrap(async (req, res) => {
  const ok = tokenService.revoke(req.params.id);
  if (ok) logService.add('warn', `Token ${req.params.id.substring(0, 8)} revogado`);
  res.json({ ok });
}));

router.post('/bot/restart', (req, res) => {
  logService.add('info', 'Reinício solicitado pelo painel');
  res.json({ ok: true });
  setTimeout(() => shardcloud.safeRestart(), 1000);
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
    setTimeout(() => shardcloud.safeRestart(), 3000);
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
  setTimeout(() => shardcloud.safeRestart(), 3000);
}));

router.get('/update/backups', (req, res) => {
  res.json(updater.listBackups());
});

router.use((err, req, res, next) => {
  logService.add('error', `API ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: err.message });
});

module.exports = router;
