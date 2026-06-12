const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const monitor = require('./botMonitor');
const logService = require('./services/logService');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', routes);

io.on('connection', (socket) => {
  socket.emit('status', monitor.getState());
  socket.emit('logs', monitor.logHistory);

  const onLog = (entry) => socket.emit('log', entry);
  const onStatus = (state) => socket.emit('status', state);
  const onClear = () => socket.emit('logsCleared');

  monitor.on('log', onLog);
  monitor.on('status', onStatus);
  monitor.on('logsCleared', onClear);

  socket.on('disconnect', () => {
    monitor.removeListener('log', onLog);
    monitor.removeListener('status', onStatus);
    monitor.removeListener('logsCleared', onClear);
  });
});

function start(port = 3000) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      logService.add('info', `Painel web: http://localhost:${port}`);
      resolve(server);
    });
  });
}

module.exports = { start, app, server, io, monitor, logService };
