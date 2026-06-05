const db = require('../database/index');
const config = require('../config.json');
const { extractJid, cleanJid, isOwner } = require('../lib/utils');

async function isGroupAdmin(sock, jid, sender) {
  try {
    const group = await sock.groupMetadata(jid);
    const cleaned = cleanJid(sender);
    const participant = group.participants.find(p => cleanJid(p.id) === cleaned);
    return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
  } catch { return false; }
}

async function isBotAdmin(sock, jid) {
  try {
    await sock.groupInviteCode(jid);
    return true;
  } catch {
    try {
      const group = await sock.groupMetadata(jid);
      const raw = sock.user?.id;
      if (!raw) return false;
      const formats = [raw, cleanJid(raw), raw.split(':')[0], raw.split('@')[0]];
      for (const f of formats) {
        const p = group.participants.find(pp => pp.id === f || cleanJid(pp.id) === f || pp.id === cleanJid(f));
        if (p && (p.admin === 'admin' || p.admin === 'superadmin')) return true;
      }
      if (global.resolvedOwnerJids) {
        for (const j of global.resolvedOwnerJids) {
          const jc = cleanJid(j);
          const p = group.participants.find(pp => pp.id === j || cleanJid(pp.id) === jc || pp.id === jc);
          if (p && (p.admin === 'admin' || p.admin === 'superadmin')) return true;
        }
      }
      return false;
    } catch { return false; }
  }
}

function extractMention(msg) {
  if (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length) {
    return msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
  }
  if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
    return msg.message.extendedTextMessage.contextInfo.participant;
  }
  return null;
}

async function handleAdmin(sock, { msg, jid, sender, args, commandName, chat }) {
  if (chat !== 'group') {
    await sock.sendMessage(jid, { text: '❌ Este comando so pode ser usado em grupos!' });
    return;
  }

  const userIsAdmin = await isOwner(sender, sock) || await isGroupAdmin(sock, jid, sender);
  if (!userIsAdmin) {
    await sock.sendMessage(jid, { text: '❌ Apenas administradores podem usar este comando.' });
    return;
  }

  const botIsAdmin = await isBotAdmin(sock, jid);
  const adminCommands = ['kick', 'ban', 'add', 'promover', 'rebaixar', 'abrirgrupo', 'fechargrupo', 'hidetag'];
  if (adminCommands.includes(commandName) && !botIsAdmin) {
    await sock.sendMessage(jid, { text: '❌ Preciso ser administrador para executar esta acao.' });
    return;
  }

  switch (commandName) {
    case 'kick': {
      const target = extractMention(msg) || args[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque quem deseja remover.' });
      const jidTarget = target.includes('@s.whatsapp.net') ? target : target + '@s.whatsapp.net';
      if (await isOwner(jidTarget, sock)) return await sock.sendMessage(jid, { text: '❌ Nao posso remover o dono do bot.' });
      await sock.groupParticipantsUpdate(jid, [jidTarget], 'remove');
      break;
    }
    case 'add': {
      if (!args[0]) return await sock.sendMessage(jid, { text: '❌ Informe o numero. Ex: !add 5511999999999' });
      const num = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
      await sock.groupParticipantsUpdate(jid, [num], 'add');
      break;
    }
    case 'promover': {
      const target = extractMention(msg) || args[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque quem deseja promover.' });
      const jidTarget = target.includes('@s.whatsapp.net') ? target : target + '@s.whatsapp.net';
      await sock.groupParticipantsUpdate(jid, [jidTarget], 'promote');
      break;
    }
    case 'rebaixar': {
      const target = extractMention(msg) || args[0];
      if (!target) return await sock.sendMessage(jid, { text: '❌ Marque quem deseja rebaixar.' });
      const jidTarget = target.includes('@s.whatsapp.net') ? target : target + '@s.whatsapp.net';
      await sock.groupParticipantsUpdate(jid, [jidTarget], 'demote');
      break;
    }
    case 'abrirgrupo': {
      await sock.groupSettingUpdate(jid, 'not_announcement');
      await sock.sendMessage(jid, { text: '✅ Grupo aberto para todos enviarem mensagens!' });
      break;
    }
    case 'fechargrupo': {
      await sock.groupSettingUpdate(jid, 'announcement');
      await sock.sendMessage(jid, { text: '✅ Grupo fechado! Apenas admins podem enviar mensagens.' });
      break;
    }
    case 'hidetag': {
      const text = args.join(' ') || ' ';
      const group = await sock.groupMetadata(jid);
      const mentions = group.participants.map(p => p.id);
      await sock.sendMessage(jid, { text, mentions });
      break;
    }
    case 'antilink': {
      const group = db.getGroup(jid);
      const action = args[0]?.toLowerCase();
      if (action === 'on') { group.antilink = true; db.save('groups'); await sock.sendMessage(jid, { text: '✅ Antilink ativado!' }); }
      else if (action === 'off') { group.antilink = false; db.save('groups'); await sock.sendMessage(jid, { text: '✅ Antilink desativado!' }); }
      else await sock.sendMessage(jid, { text: '❌ Use: !antilink on ou !antilink off' });
      break;
    }
    case 'bemvindo': {
      const group = db.getGroup(jid);
      const action = args[0]?.toLowerCase();
      if (action === 'on') { group.welcome = true; db.save('groups'); await sock.sendMessage(jid, { text: '✅ Mensagem de boas-vindas ativada!' }); }
      else if (action === 'off') { group.welcome = false; db.save('groups'); await sock.sendMessage(jid, { text: '✅ Mensagem de boas-vindas desativada!' }); }
      else await sock.sendMessage(jid, { text: '❌ Use: !bemvindo on ou !bemvindo off' });
      break;
    }
  }
}

const adminCommands = ['kick', 'add', 'promover', 'rebaixar', 'abrirgrupo', 'fechargrupo', 'hidetag', 'antilink', 'bemvindo'];

module.exports = { handleAdmin, adminCommands };
