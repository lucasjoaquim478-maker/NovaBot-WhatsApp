const { Router } = require('express');
const tokenService = require('../services/tokenService');
const logService = require('../services/logService');
const monitor = require('../botMonitor');

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
  setTimeout(() => process.exit(0), 1000);
});

router.use((err, req, res, next) => {
  logService.add('error', `API ${req.method} ${req.path}: ${err.message}`);
  res.status(500).json({ error: err.message });
});

module.exports = router;
