const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'tokens.json');

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {}
  return { tokens: [], used: [] };
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function generate(opts = {}) {
  const raw = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const data = load();
  const token = {
    id: crypto.randomUUID(),
    raw: raw.substring(0, 8) + '****' + raw.substring(raw.length - 4),
    hash,
    createdAt: new Date().toISOString(),
    expiresAt: opts.expiresAt || null,
    singleUse: opts.singleUse || false,
    revoked: false,
    used: false,
    usedBy: null,
    usedAt: null
  };
  data.tokens.push(token);
  save(data);
  return { ...token, raw };
}

function validate(input) {
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const data = load();
  const idx = data.tokens.findIndex(t => t.hash === hash && !t.revoked);
  if (idx === -1) return null;
  const token = data.tokens[idx];
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return { error: 'Token expirado' };
  if (token.singleUse && token.used) return { error: 'Token já utilizado' };
  if (token.singleUse) {
    data.tokens[idx].used = true;
    data.tokens[idx].usedAt = new Date().toISOString();
    save(data);
  }
  return { id: token.id, createdAt: token.createdAt, singleUse: token.singleUse };
}

function use(input, usedBy) {
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const data = load();
  const idx = data.tokens.findIndex(t => t.hash === hash);
  if (idx === -1) return false;
  const token = data.tokens.splice(idx, 1)[0];
  token.used = true;
  token.usedBy = usedBy || null;
  token.usedAt = new Date().toISOString();
  data.used.push(token);
  save(data);
  return true;
}

function revoke(id) {
  const data = load();
  const idx = data.tokens.findIndex(t => t.id === id);
  if (idx === -1) return false;
  data.tokens[idx].revoked = true;
  save(data);
  return true;
}

function list() {
  const data = load();
  return {
    active: data.tokens.filter(t => !t.revoked && !t.used).map(t => ({
      id: t.id, raw: t.raw, createdAt: t.createdAt,
      expiresAt: t.expiresAt, singleUse: t.singleUse
    })),
    used: data.used.slice(-50).reverse(),
    revoked: data.tokens.filter(t => t.revoked).map(t => ({
      id: t.id, raw: t.raw, createdAt: t.createdAt, revokedAt: t.usedAt
    }))
  };
}

module.exports = { generate, validate, use, revoke, list };
