const db = require('../database/index');
const { isOwner } = require('../lib/utils');
const config = require('../config.json');

async function handleZap(sock, { msg, jid, sender, args, chat }) {
  if (chat === 'group') {
    await sock.sendMessage(jid, { text: '❌ Use !zap no privado do bot com o link de convite.' });
    return;
  }

  if (!args[0]) {
    await sock.sendMessage(jid, { text: `❌ Use: !zap https://chat.whatsapp.com/CODIGO\n\nCole o link de convite do grupo.` });
    return;
  }

  const match = args[0].match(/chat\.whatsapp\.com\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    await sock.sendMessage(jid, { text: '❌ Link invalido. Use o link de convite do grupo.' });
    return;
  }

  const code = match[1];
  try {
    const group = await sock.groupAcceptInvite(code);
    const metadata = await sock.groupMetadata(group);
    const groupJid = group;
    const g = db.getGroup(groupJid);
    g.inviteCode = code;
    g.name = metadata.subject || '';
    db.save('groups');
    await sock.sendMessage(jid, { text: `✅ Entrei no grupo "${metadata.subject || 'grupo'}" com sucesso!` });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro ao entrar: ${e.message}` });
  }
}

module.exports = { handleZap };
