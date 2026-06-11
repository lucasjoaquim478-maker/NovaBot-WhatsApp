const config = require('../config.json');

async function handleLink(sock, { jid, args, msg }) {
  try {
    const userId = config.linkvertiseId || '';
    const url = args.join('').trim();
    if (!url) {
      return await sock.sendMessage(jid, { text: '❌ Use: !link <url>\nExemplo: !link https://exemplo.com' }, { quoted: msg });
    }
    if (!/^https?:\/\//i.test(url)) {
      return await sock.sendMessage(jid, { text: '❌ URL inválida. Use http:// ou https://' }, { quoted: msg });
    }
    if (!userId) {
      return await sock.sendMessage(jid, { text: '❌ Linkvertise não configurado. Adicione "linkvertiseId" no config.json' }, { quoted: msg });
    }
    const encoded = Buffer.from(url).toString('base64');
    const link = `https://linkvertise.com/${userId}/?o=sharing&m=link&link=${encoded}`;
    await sock.sendMessage(jid, { text: `🔗 *Link encurtado:*\n${link}\n\n⏱️ *Origem:* ${url}` }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` }, { quoted: msg });
  }
}

const linkCommands = ['link'];

module.exports = { handleLink, linkCommands };
