const fs = require('fs');
const path = require('path');
const db = require('./index');

function backup() {
  const backupDir = path.join(process.cwd(), 'database', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupDir, `backup-${ts}.json`);

  const data = {};
  for (const key of Object.keys(db.data)) data[key] = db.data[key];

  fs.writeFileSync(file, JSON.stringify(data, null, 2));

  const backups = fs.readdirSync(backupDir).filter(f => f.startsWith('backup-')).sort();
  while (backups.length > 10) {
    const oldest = backups.shift();
    fs.unlinkSync(path.join(backupDir, oldest));
  }

  return file;
}

function scheduleBackup(interval = 86400000) {
  setInterval(() => {
    try {
      const file = backup();
      console.log(`[BACKUP] Backup salvo: ${file}`);
    } catch (e) {
      console.error(`[BACKUP] Erro: ${e.message}`);
    }
  }, interval);
}

module.exports = { backup, scheduleBackup };
