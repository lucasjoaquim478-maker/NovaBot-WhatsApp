const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const levels = { error: 0, warn: 1, info: 2, debug: 3 };

class Logger {
  static onLog = null;
  static _logBuffer = [];
  static setOnLog(fn) {
    Logger.onLog = fn;
    const buf = Logger._logBuffer;
    Logger._logBuffer = [];
    for (const [level, msg] of buf) fn(level, msg);
  }

  constructor(options = {}) {
    this.level = options.level || 'info';
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    this.stream = fs.createWriteStream(path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`), { flags: 'a' });
  }

  _format(level, msg) {
    const ts = new Date().toLocaleString('pt-BR');
    return `[${ts}] [${level.toUpperCase()}] ${msg}`;
  }

  _color(level, text) {
    const map = { error: chalk.red, warn: chalk.yellow, info: chalk.green, debug: chalk.cyan };
    return (map[level] || chalk.white)(text);
  }

  _write(level, msg) {
    if (levels[level] > levels[this.level]) return;
    const line = this._format(level, msg);
    console.log(this._color(level, line));
    this.stream.write(line + '\n');
    if (Logger.onLog) Logger.onLog(level, msg);
    else Logger._logBuffer.push([level, msg]);
  }

  error(msg) { this._write('error', msg); }
  warn(msg) { this._write('warn', msg); }
  info(msg) { this._write('info', msg); }
  debug(msg) { this._write('debug', msg); }
}

module.exports = Logger;
