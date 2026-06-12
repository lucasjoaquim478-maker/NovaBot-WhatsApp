const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const DELAY = parseInt(process.env.BOT_RESTART_DELAY, 10) || 3000;
const PID_FILE = path.join(__dirname, '.restarting');
const MAIN_SCRIPT = path.join(__dirname, 'index.js');

setTimeout(() => {
  const child = spawn(process.argv[0], [MAIN_SCRIPT], {
    cwd: __dirname,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, BOT_RESTARTED: '1' },
  });
  child.unref();
  setTimeout(() => {
    try { fs.unlinkSync(PID_FILE); } catch {}
    process.exit(0);
  }, 2000);
}, DELAY);
