const { backup } = require('../database/backup');
const db = require('../database/index');
const config = require('../config.json');
const { isOwner } = require('../lib/utils');
const { safeRestart } = require('../lib/restart');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const OWNERS_FILE = path.join(__dirname, '..', 'database', 'owners.json');

function loadPersistedOwners() {
  try {
    if (fs.existsSync(OWNERS_FILE)) return JSON.parse(fs.readFileSync(OWNERS_FILE, 'utf-8'));
  } catch {}
  return [];
}

function savePersistedOwner(jid) {
  const owners = loadPersistedOwners();
  if (!owners.includes(jid)) {
    owners.push(jid);
    fs.writeFileSync(OWNERS_FILE, JSON.stringify(owners, null, 2));
  }
  // Also save to config.json for extra persistence
  try {
    const cfgPath = path.join(ROOT, 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const phone = jid.split('@')[0];
      if (!cfg.ownerNumbers.some(n => n.startsWith(phone))) {
        cfg.ownerNumbers.push(phone + '@s.whatsapp.net');
        fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      }
    }
  } catch {}
}

async function handleOwner(sock, { msg, jid, sender, args, commandName }) {
  if (!await isOwner(sender, sock)) {
    await sock.sendMessage(jid, { text: '❌ Apenas o dono do bot pode usar este comando.' });
    return;
  }

  switch (commandName) {
    case 'reiniciar': {
      await sock.sendMessage(jid, { text: '🔄 Reiniciando bot...' });
      await safeRestart();
      break;
    }
    case 'shutdown': {
      await sock.sendMessage(jid, { text: '🛑 Desligando bot...' });
      process.exit(0);
      break;
    }
    case 'broadcast': {
      if (!args.length) return await sock.sendMessage(jid, { text: '❌ Informe a mensagem.' });
      const text = args.join(' ');
      const users = Object.keys(db.data.users);
      let sent = 0;
      for (const u of users) {
        try {
          await sock.sendMessage(u, { text: `📢 *BROADCAST*\n\n${text}` });
          sent++;
        } catch {}
      }
      await sock.sendMessage(jid, { text: `✅ Mensagem enviada para ${sent} usuários.` });
      break;
    }
    case 'blacklist': {
      const target = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque ou responda ao usuário.' });
      const user = db.getUser(target);
      user.banned = true;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Usuário @${target.split('@')[0]} banido.`, mentions: [target] });
      break;
    }
    case 'unblacklist': {
      const target = msg.message?.extendedTextMessage?.contextInfo?.participant || msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque ou responda ao usuário.' });
      const user = db.getUser(target);
      user.banned = false;
      db.save('users');
      await sock.sendMessage(jid, { text: `✅ Usuário @${target.split('@')[0]} desbanido.`, mentions: [target] });
      break;
    }
    case 'eval': {
      try {
        const code = args.join(' ');
        let result = eval(code);
        if (typeof result !== 'string') result = JSON.stringify(result, null, 2);
        await sock.sendMessage(jid, { text: `📝 *Resultado:*\n\`\`\`\n${result.slice(0, 3000)}\n\`\`\`` });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ *Erro:*\n\`\`\`\n${e.message.slice(0, 3000)}\n\`\`\`` });
      }
      break;
    }

    // Cache Cleanup
    case 'limparcache': {
      let removed = 0;
      let totalSize = 0;
      const dirs = [
        path.join(ROOT, 'temp'),
        path.join(ROOT, 'voz_cache'),
        path.join(ROOT, 'downloads')
      ];
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir);
        for (const f of files) {
          const full = path.join(dir, f);
          try {
            const stat = fs.statSync(full);
            if (stat.isFile()) {
              totalSize += stat.size;
              fs.unlinkSync(full);
              removed++;
            }
          } catch {}
        }
      }
      // Also remove old backups (>10 oldest in database/backups)
      const backupDir = path.join(ROOT, 'database', 'backups');
      if (fs.existsSync(backupDir)) {
        const backups = fs.readdirSync(backupDir).filter(f => f.startsWith('backup-')).sort();
        while (backups.length > 10) {
          const oldest = backups.shift();
          const full = path.join(backupDir, oldest);
          try {
            const stat = fs.statSync(full);
            totalSize += stat.size;
            fs.unlinkSync(full);
            removed++;
          } catch {}
        }
      }
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      await sock.sendMessage(jid, { text: `🧹 *Cache limpo com sucesso!*\n\n📄 Arquivos removidos: ${removed}\n💾 Espaço liberado: ${sizeMB} MB` });
      break;
    }

    // Maintenance Mode
    case 'manutencao': {
      const action = args[0]?.toLowerCase();
      if (action === 'on') {
        db.data.config.maintenance = true;
        db.saveSync('config');
        await sock.sendMessage(jid, { text: '🛠️ *Modo manutenção ativado!*\n\nApenas donos podem usar comandos.' });
      } else if (action === 'off') {
        db.data.config.maintenance = false;
        db.saveSync('config');
        await sock.sendMessage(jid, { text: '✅ *Sistema reativado!*\n\nComandos liberados para todos.' });
      } else {
        await sock.sendMessage(jid, { text: '❌ Use: !manutencao on ou !manutencao off' });
      }
      break;
    }
    case 'statusmanutencao': {
      const status = db.data.config.maintenance;
      await sock.sendMessage(jid, { text: status ? '🛠️ *Manutenção:* ATIVA' : '✅ *Sistema operacional.*' });
      break;
    }
  }
}

async function handleAddDono(sock, { jid, sender, args, chat }) {
  if (chat === 'group') {
    await sock.sendMessage(jid, { text: '❌ Envie este comando no privado do bot.' });
    return;
  }

  const number = args[0]?.replace(/[^0-9]/g, '');
  if (!number) {
    await sock.sendMessage(jid, { text: `❌ Use: !adddono SEUNUMERO\n\nSeu JID: ${sender}\nEnvie !adddono seguido do seu número (so números, com código do país).` });
    return;
  }

  const ownerPhones = config.ownerNumbers.map(n => n.split('@')[0].replace(/[^0-9]/g, ''));
  const match = ownerPhones.some(p => number.endsWith(p.slice(-10)) || p.endsWith(number.slice(-10)));
  if (!match) {
    await sock.sendMessage(jid, { text: `❌ Número ${number} não autorizado como dono.` });
    return;
  }

  if (!global.resolvedOwnerJids) global.resolvedOwnerJids = new Set();
  global.resolvedOwnerJids.add(sender);
  global.resolvedOwnerJids.add(sender.split('@')[0]);
  savePersistedOwner(sender);
  savePersistedOwner(sender.split('@')[0]);
  await sock.sendMessage(jid, { text: `✅ Dono salvo permanentemente! Agora você pode usar comandos restritos.` });
}

const ownerCommands = [
  'reiniciar', 'shutdown', 'broadcast', 'blacklist', 'unblacklist', 'eval',
  'limparcache',
  'manutencao', 'statusmanutencao'
];

module.exports = { handleOwner, handleAddDono, ownerCommands };
