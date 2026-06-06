const cooldowns = new Map();

function checkCooldown(userId, commandName, cooldownTime = 3000) {
  const key = `${userId}:${commandName}`;
  const now = Date.now();

  if (cooldowns.has(key)) {
    const remaining = cooldowns.get(key) - now;
    if (remaining > 0) return { onCooldown: true, remaining };
  }

  cooldowns.set(key, now + cooldownTime);
  setTimeout(() => cooldowns.delete(key), cooldownTime);
  return { onCooldown: false, remaining: 0 };
}

module.exports = { checkCooldown };
