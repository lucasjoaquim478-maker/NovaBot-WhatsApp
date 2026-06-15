const { isOwner, cleanJid } = require('../lib/utils');

async function handleCleanup(sock, { jid, sender, chat }) {
  if (chat !== 'group') {
    await sock.sendMessage(jid, { text: 'âŒ Este comando sÃ³ pode ser usado em grupos!' });
    return;
  }

  if (!await isOwner(sender, sock)) {
    await sock.sendMessage(jid, { text: 'âŒ Apenas o dono do bot pode usar este comando.' });
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
