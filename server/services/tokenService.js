const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'tokens.json');
const TOKEN_BYTES = 32;
const TOKEN_HASH_ALGO = 'sha256';

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (!Array.isArray(data.tokens)) data.tokens = [];
      if (!Array.isArray(data.used)) data.used = [];
      if (!Array.isArray(data.logs)) data.logs = [];
      return data;
    }
  } catch {}
  return { tokens: [], used: [], logs: [] };
}

function save(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function generate(opts = {}) {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const hash = crypto.createHash(TOKEN_HASH_ALGO).update(raw).digest('hex');
  const data = load();
  const token = {
    id: crypto.randomUUID(),
    raw: raw.substring(0, 10) + '••••' + raw.substring(raw.length - 6),
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
  data.logs.push({
    action: 'created', tokenId: token.id, rawPreview: token.raw,
    timestamp: token.createdAt, metadata: opts.metadata || null
  });
  save(data);
  return { ...token, raw };
}

function validate(input) {
  const hash = crypto.createHash(TOKEN_HASH_ALGO).update(input).digest('hex');
  const data = load();
  const idx = data.tokens.findIndex(t => t.hash === hash && !t.revoked);
  if (idx === -1) return null;
  const token = data.tokens[idx];
  if (token.expiresAt && new Date(token.expiresAt) < new Date()) return { error: 'Token expirado.' };
  if (token.singleUse && token.used) return { error: 'Token já utilizado.' };
  if (token.singleUse) {
    data.tokens[idx].used = true;
    data.tokens[idx].usedAt = new Date().toISOString();
    save(data);
  }
  return { id: token.id, createdAt: token.createdAt, singleUse: token.singleUse, expiresAt: token.expiresAt };
}

function use(input, usedBy) {
  const hash = crypto.createHash(TOKEN_HASH_ALGO).update(input).digest('hex');
  const data = load();
  const idx = data.tokens.findIndex(t => t.hash === hash);
  if (idx === -1) return false;
  const token = data.tokens.splice(idx, 1)[0];
  token.used = true;
  token.usedBy = usedBy || null;
  token.usedAt = new Date().toISOString();
  data.used.push(token);
  data.logs.push({
    action: 'used', tokenId: token.id, rawPreview: token.raw,
    usedBy, timestamp: token.usedAt
  });
  save(data);
  return true;
}

function revoke(id) {
  const data = load();
  const idx = data.tokens.findIndex(t => t.id === id);
  if (idx === -1) return false;
  data.tokens[idx].revoked = true;
  data.logs.push({
    action: 'revoked', tokenId: id, rawPreview: data.tokens[idx].raw,
    timestamp: new Date().toISOString()
  });
  save(data);
  return true;
}

function list() {
  const data = load();
  const now = new Date();
  const active = data.tokens.filter(t => {
    if (t.revoked || t.used) return false;
    if (t.expiresAt && new Date(t.expiresAt) < now) return false;
    return true;
  }).map(t => ({
    id: t.id, raw: t.raw, createdAt: t.createdAt,
    expiresAt: t.expiresAt, singleUse: t.singleUse
  }));
  const used = data.used.slice(-100).reverse().map(t => ({
    raw: t.raw, usedBy: t.usedBy, usedAt: t.usedAt
  }));
  const revoked = data.tokens.filter(t => t.revoked).map(t => ({
    id: t.id, raw: t.raw, createdAt: t.createdAt, revokedAt: t.usedAt || new Date().toISOString()
  }));
  return { active, used, revoked, logs: data.logs.slice(-200) };
}

module.exports = { generate, validate, use, revoke, list };
