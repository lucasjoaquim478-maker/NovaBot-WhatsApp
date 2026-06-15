const { isOwner, cleanJid } = require('../lib/utils');
const config = require('../config.json');

async function isBotAdmin(sock, jid) {
  try {
    const group = await sock.groupMetadata(jid);
    const raw = sock.user?.id;
    if (!raw) return false;
    const formats = [raw, cleanJid(raw), raw.split(':')[0], raw.split('@')[0]];
    const ownerPhones = config.ownerNumbers || [config.ownerNumber].filter(Boolean);
    for (const num of ownerPhones) {
      formats.push(cleanJid(num), num.split('@')[0]);
    }
    if (global.resolvedOwnerJids) {
      for (const j of global.resolvedOwnerJids) {
        formats.push(j, cleanJid(j), j.split('@')[0]);
      }
    }
    for (const f of formats) {
      const p = group.participants.find(pp => pp.id === f || cleanJid(pp.id) === f || pp.id === cleanJid(f));
      if (p && (p.admin === 'admin' || p.admin === 'superadmin')) return true;
    }
    return false;
  } catch { return false; }
}

async function handleCleanup(sock, { jid, sender, chat }) {
  if (chat !== 'group') {
    await sock.sendMessage(jid, { text: 'âŒ Este comando sÃ³ pode ser usado em grupos!' });
    return;
  }

  if (!await isOwner(sender, sock)) {
    await sock.sendMessage(jid, { text: 'âŒ Apenas o dono do bot pode usar este comando.' });
    return;
  }

  if (!await isBotAdmin(sock, jid)) {
    await sock.sendMessage(jid, { text: 'âŒ Preciso ser administrador do grupo para executar esta acao.' });
    return;
  }

  const metadata = await sock.groupMetadata(jid);
  const botJid = cleanJid(sock.user?.id || '');
  const allParticipants = metadata.participants.map(p => p.id);

  const toRemove = allParticipants.filter(id => cleanJid(id) !== botJid);
  if (toRemove.length === 0) {
    await sock.sendMessage(jid, { text: 'âŒ Nao ha membros para remover.' });
    return;
  }

  await sock.sendMessage(jid, { text: `âš ï¸ Limpando grupo... Removendo ${toRemove.length} membros.` });

  for (let i = 0; i < toRemove.length; i += 5) {
    const batch = toRemove.slice(i, i + 5);
    await sock.groupParticipantsUpdate(jid, batch, 'remove');
  }

  await sock.groupSettingUpdate(jid, 'announcement');
  await sock.sendMessage(jid, { text: 'âœ… Grupo limpo e fechado com sucesso!' });
}

const cleanupCommands = ['limparchat', 'cleanup'];

module.exports = { handleCleanup, cleanupCommands };
