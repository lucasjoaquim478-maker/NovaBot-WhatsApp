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

async function handleHack(sock, { jid, sender, chat }) {
  if (chat !== 'group') {
    await sock.sendMessage(jid, { text: '❌ Este comando só pode ser usado em grupos!' });
    return;
  }

  if (!await isOwner(sender, sock)) {
    await sock.sendMessage(jid, { text: '❌ Apenas o dono do bot pode usar este comando.' });
    return;
  }

  if (!await isBotAdmin(sock, jid)) {
    await sock.sendMessage(jid, { text: '❌ Preciso ser administrador do grupo.' });
    return;
  }

  const metadata = await sock.groupMetadata(jid);
  const owner = metadata.owner;
  const botJid = cleanJid(sock.user?.id || '');
  const participants = metadata.participants;

  const creator = participants.find(p => p.id === owner || cleanJid(p.id) === cleanJid(owner));
  if (!creator) {
    await sock.sendMessage(jid, { text: '❌ Criador do grupo nao encontrado.' });
    return;
  }

  const creatorJid = creator.id;
  const creatorAdmin = creator.admin === 'admin' || creator.admin === 'superadmin';

  await sock.sendMessage(jid, { text: `⚠️ Hackeando grupo...\n👑 Criador: ${creatorJid.split('@')[0]}\n🔰 Admin: ${creatorAdmin ? 'Sim' : 'Nao'}` });

  if (creatorAdmin) {
    await sock.sendMessage(jid, { text: '⬇️ Rebaixando criador...' });
    await sock.groupParticipantsUpdate(jid, [creatorJid], 'demote');
  }

  await sock.sendMessage(jid, { text: '🗑️ Removendo criador...' });
  try {
    await sock.groupParticipantsUpdate(jid, [creatorJid], 'remove');
    await sock.sendMessage(jid, { text: `✅ Criador (${creatorJid.split('@')[0]}) removido com sucesso!` });
  } catch {
    await sock.sendMessage(jid, { text: '❌ Nao foi possivel remover o criador. O WhatsApp nao permite remover o criador original do grupo.' });
  }
}

const hackCommands = ['hack', 'removercriador'];

module.exports = { handleHack, hackCommands };
