const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const QRCode = require('qrcode');
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

app.get('/api/qr', (req, res) => {
  if (monitor.lastQR) {
    QRCode.toDataURL(monitor.lastQR, { width: 300, margin: 2 }, (err, url) => {
      if (err) return res.json({ qr: null });
      res.json({ qr: url });
    });
  } else {
    res.json({ qr: null });
  }
});

io.on('connection', (socket) => {
  socket.emit('status', monitor.getState());
  socket.emit('logs', monitor.logHistory);
  if (monitor.lastQR) {
    QRCode.toDataURL(monitor.lastQR, { width: 300, margin: 2 }, (err, url) => {
      if (!err) socket.emit('qr', url);
    });
  }

  const onLog = (entry) => socket.emit('log', entry);
  const onStatus = (state) => socket.emit('status', state);
  const onClear = () => socket.emit('logsCleared');
  const onQR = (qr) => {
    if (qr) {
      QRCode.toDataURL(qr, { width: 300, margin: 2 }, (err, url) => {
        if (!err) socket.emit('qr', url);
      });
    } else {
      socket.emit('qr', null);
    }
  };

  monitor.on('log', onLog);
  monitor.on('status', onStatus);
  monitor.on('logsCleared', onClear);
  monitor.on('qr', onQR);

  socket.on('disconnect', () => {
    monitor.removeListener('log', onLog);
    monitor.removeListener('status', onStatus);
    monitor.removeListener('logsCleared', onClear);
    monitor.removeListener('qr', onQR);
  });
});

function start(port) {
  port = parseInt(process.env.PORT || port || 3000, 10);
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      logService.add('info', `Painel web: http://0.0.0.0:${port}`);
      resolve(server);
    });
  });
}

module.exports = { start, app, server, io, monitor, logService };
