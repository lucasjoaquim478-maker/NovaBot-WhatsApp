const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RESTART_SCRIPT = path.join(__dirname, '..', 'restarter.js');
const RESTART_FLAG = path.join(__dirname, '..', '.restarting');

function safeRestart() {
  fs.writeFileSync(RESTART_FLAG, String(process.pid));

  const child = spawn(process.argv[0], [RESTART_SCRIPT], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, BOT_RESTARTED: '1' },
  });

  child.unref();

  setTimeout(() => process.exit(0), 1000);
}

module.exports = { safeRestart };
