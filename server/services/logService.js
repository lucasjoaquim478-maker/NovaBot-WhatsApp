const monitor = require('../botMonitor');

class LogService {
  constructor() {
    this.batch = [];
    this.flushTimer = null;
    this.FLUSH_INTERVAL = 150;
    this.lastFlush = 0;
  }

  push(entry) {
    this.batch.push(entry);
    this.scheduleFlush();
  }

  scheduleFlush() {
    if (this.flushTimer) return;
    const elapsed = Date.now() - this.lastFlush;
    const delay = Math.max(0, this.FLUSH_INTERVAL - elapsed);
    if (delay <= 0) {
      this.flush();
    } else {
      this.flushTimer = setTimeout(() => this.flush(), delay);
    }
  }

  flush() {
    this.flushTimer = null;
    if (this.batch.length === 0) return;
    const batch = this.batch;
    this.batch = [];
    this.lastFlush = Date.now();
    for (const entry of batch) {
      monitor.emit('log', entry);
    }
  }

  add(type, message, source) {
    const map = { error: 'ERROR', warn: 'WARNING', info: 'INFO', debug: 'INFO', success: 'SUCCESS' };
    if (!source) {
      const m = message.match(/^\[(\w+)\]/);
      source = m ? m[1].toLowerCase() : 'system';
    }
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: map[type] || 'INFO',
      message,
      source,
      timestamp: new Date().toISOString()
    };
    monitor.logHistory.push(entry);
    if (monitor.logHistory.length > 1000) {
      monitor.logHistory.splice(0, monitor.logHistory.length - 1000);
    }
    this.push(entry);
    return entry;
  }
}

const logService = new LogService();
module.exports = logService;
