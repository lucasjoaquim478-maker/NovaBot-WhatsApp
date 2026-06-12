const EventEmitter = require('events');

class BotMonitor extends EventEmitter {
  constructor() {
    super();
    this.state = { status: 'offline', connectedAt: null, user: null };
    this.logHistory = [];
    this.lastQR = null;
  }

  setOnline(user) {
    this.state.status = 'online';
    this.state.connectedAt = new Date().toISOString();
    this.state.user = user;
    this.lastQR = null;
    this.emit('qr', null);
    this.emit('status', this.state);
  }

  setOffline(reason) {
    this.state.status = 'offline';
    this.state.user = null;
    this.emit('status', this.state);
    this.addLog('INFO', `Bot offline: ${reason}`);
  }

  setQR(qr) {
    this.lastQR = qr;
    this.emit('qr', qr);
  }

  addLog(type, message) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      message,
      timestamp: new Date().toISOString()
    };
    this.logHistory.push(entry);
    if (this.logHistory.length > 1000) {
      this.logHistory.splice(0, this.logHistory.length - 1000);
    }
    this.emit('log', entry);
    return entry;
  }

  info(msg) { return this.addLog('INFO', msg); }
  warn(msg) { return this.addLog('WARNING', msg); }
  error(msg) { return this.addLog('ERROR', msg); }
  success(msg) { return this.addLog('SUCCESS', msg); }

  clearLogs() {
    this.logHistory = [];
    this.emit('logsCleared');
  }

  getLogs() { return this.logHistory; }
  getState() { return this.state; }
}

const monitor = new BotMonitor();
module.exports = monitor;
