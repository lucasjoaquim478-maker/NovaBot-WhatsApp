const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const tokenManager = require('./tokenManager');
const monitor = require('./botMonitor');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/status', (req, res) => res.json(monitor.getState()));

app.get('/api/logs', (req, res) => res.json(monitor.getLogs()));

app.delete('/api/logs', (req, res) => { monitor.clearLogs(); res.json({ ok: true }); });

app.get('/api/tokens', (req, res) => res.json(tokenManager.list()));

app.post('/api/tokens', (req, res) => {
  const token = tokenManager.generate({ expiresAt: req.body.expiresAt || null, singleUse: req.body.singleUse || false });
  monitor.info(`Token gerado: ${token.raw.substring(0, 8)}...`);
  res.json({ token: token.raw, id: token.id });
});

app.post('/api/tokens/:id/revoke', (req, res) => {
  const ok = tokenManager.revoke(req.params.id);
  if (ok) monitor.warn(`Token ${req.params.id} revogado`);
  res.json({ ok });
});

app.post('/api/bot/restart', (req, res) => {
  monitor.info('Reinício solicitado pelo painel');
  res.json({ ok: true });
  setTimeout(() => process.exit(0), 1000);
});

io.on('connection', (socket) => {
  socket.emit('status', monitor.getState());
  socket.emit('logs', monitor.getLogs());
  socket.emit('tokens', tokenManager.list());

  const onLog = (entry) => socket.emit('log', entry);
  const onStatus = (state) => socket.emit('status', state);
  const onLogsCleared = () => socket.emit('logsCleared');

  monitor.on('log', onLog);
  monitor.on('status', onStatus);
  monitor.on('logsCleared', onLogsCleared);

  socket.on('disconnect', () => {
    monitor.removeListener('log', onLog);
    monitor.removeListener('status', onStatus);
    monitor.removeListener('logsCleared', onLogsCleared);
  });
});

function start(port = 3000) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      monitor.info(`Painel web: http://localhost:${port}`);
      resolve(server);
    });
  });
}

module.exports = { start, app, server, io, monitor };
