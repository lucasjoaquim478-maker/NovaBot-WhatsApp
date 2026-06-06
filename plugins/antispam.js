const userCache = new Map();

function checkSpam(jid, maxPerMinute = 20) {
  const now = Date.now();
  const window = 60000;

  if (!userCache.has(jid)) {
    userCache.set(jid, { count: 1, first: now, warned: false });
    return { blocked: false, warned: false };
  }

  const entry = userCache.get(jid);

  if (now - entry.first > window) {
    userCache.set(jid, { count: 1, first: now, warned: false });
    return { blocked: false, warned: false };
  }

  entry.count++;

  if (entry.count > maxPerMinute + 10) {
    return { blocked: true, warned: entry.warned };
  }

  if (entry.count > maxPerMinute && !entry.warned) {
    entry.warned = true;
    return { blocked: false, warned: true };
  }

  return { blocked: false, warned: false };
}

function reset(jid) {
  userCache.delete(jid);
}

module.exports = { checkSpam, reset };
