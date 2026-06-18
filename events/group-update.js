const db = require('../database/index');

async function handleGroupUpdate(sock, updates) {
  for (const update of updates) {
    try {
      const jid = update.id;

      if (update.participants) {
        const group = db.getGroup(jid);

        for (const p of update.participants) {
          const botJid = sock.user?.id;
          const isBot = botJid && (p === botJid || p.split('@')[0] === botJid.split('@')[0]);

          if (update.action === 'add' && group.welcome) {
            try {
              const metadata = await sock.groupMetadata(jid);
              const subject = metadata.subject || 'grupo';
              await sock.sendMessage(jid, {
                text: `🎉 Bem-vindo(a) @${p.split('@')[0]} ao grupo ${subject}!`,
                mentions: [p]
              });
            } catch {}
          }

          if (isBot && update.action === 'add') {
            try {
              const code = await sock.groupInviteCode(jid);
              group.inviteCode = code;
              db.save('groups');
            } catch {}
          }

          if (update.action === 'remove' && group.goodbye) {
            try {
              await sock.sendMessage(jid, {
                text: `👋 @${p.split('@')[0]} saiu do grupo.`,
                mentions: [p]
              });
            } catch {}
          }
        }
      }

      if (update.subject) {
        const group = db.getGroup(jid);
        group.name = update.subject;
        db.save('groups');
      }

    } catch (err) {
      console.error(`[ERRO] groupUpdate: ${err.message}`);
    }
  }
}

module.exports = { handleGroupUpdate };
