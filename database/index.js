const fs = require('fs');
const path = require('path');

class Database {
  constructor(dir = path.join(process.cwd(), 'database')) {
    this.dir = dir;
    this.data = { users: {}, groups: {}, vip: [], config: { maintenance: false } };
    this._saveTimers = {};
    this._pendingSaves = {};
    this._userCount = 0;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.load();
    this._recalcCounts();
    this._saveInterval = setInterval(() => {
      this.flushAll();
      if (global._antilinkCacheCleanup) global._antilinkCacheCleanup();
    }, 15000);
  }

  load() {
    for (const key of Object.keys(this.data)) {
      const file = path.join(this.dir, `${key}.json`);
      if (fs.existsSync(file)) {
        try { this.data[key] = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.data[key] = {}; }
      }
    }
  }

  _debouncedSave(key) {
    this._pendingSaves[key] = true;
    if (this._saveTimers[key]) clearTimeout(this._saveTimers[key]);
    this._saveTimers[key] = setTimeout(() => {
      this._writeFile(key);
      delete this._saveTimers[key];
      delete this._pendingSaves[key];
    }, 5000);
  }

  _writeFile(key) {
    const file = path.join(this.dir, `${key}.json`);
    try { fs.writeFileSync(file, JSON.stringify(this.data[key])); } catch {}
  }

  flushAll() {
    for (const key of Object.keys(this._pendingSaves)) {
      this._writeFile(key);
      delete this._pendingSaves[key];
    }
  }

  save(key) {
    this._debouncedSave(key);
  }

  saveSync(key) {
    if (this._saveTimers[key]) clearTimeout(this._saveTimers[key]);
    this._writeFile(key);
    delete this._pendingSaves[key];
  }

  saveAll() {
    for (const key of Object.keys(this.data)) this.saveSync(key);
  }

  _recalcCounts() {
    let count = 0;
    let cmdCount = 0;
    for (const u of Object.values(this.data.users)) {
      if (!u.banned) count++;
      cmdCount += u.commands || 0;
    }
    this._userCount = count;
    this._cmdCount = cmdCount;
  }

  getUser(jid) {
    if (!this.data.users[jid]) {
      this.data.users[jid] = {
        jid, name: '', registered: Date.now(), lastSeen: Date.now(),
        banned: false, xp: 0, level: 1, coins: 0, bank: 0,
        daily: 0, workCooldown: 0, messages: 0, commands: 0, iaHistory: []
      };
      this._userCount++;
    }
    return this.data.users[jid];
  }

  addCommand(user) {
    user.commands = (user.commands || 0) + 1;
    this._cmdCount++;
  }

  getGroup(jid) {
    if (!this.data.groups[jid]) {
      this.data.groups[jid] = {
        jid, name: '', welcome: true, goodbye: true,
        antilink: false, antifake: false, members: {}, createdAt: Date.now(), inviteCode: ''
      };
    }
    return this.data.groups[jid];
  }

  addXp(jid, amount, user) {
    if (!user) user = this.getUser(jid);
    user.xp = (user.xp || 0) + amount;
    const needed = Math.floor(100 * Math.pow(1.5, user.level - 1));
    if (user.xp >= needed) {
      user.xp -= needed;
      user.level = (user.level || 1) + 1;
      return { leveledUp: true, level: user.level };
    }
    return { leveledUp: false, level: user.level };
  }

  getTopUsers(key = 'coins', limit = 10) {
    const all = Object.values(this.data.users).filter(u => !u.banned && u[key]);
    all.sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return all.slice(0, limit);
  }

  getCommandCount() {
    return this._cmdCount;
  }

  getUserCount() {
    return this._userCount;
  }

  getGroupCount() {
    return Object.keys(this.data.groups).length;
  }
}

module.exports = new Database();
