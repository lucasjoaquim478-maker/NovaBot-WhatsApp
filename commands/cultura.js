const config = require('../config.json');

async function handleCultura(sock, { jid, msg }) {
  const texto = `🍽️ *CULTURA & COMIDA TÍPICA*\n\n` +
    `👤 Lucas é do Rio Grande do Norte, Nordeste do Brasil.\n\n` +
    `🍛 *Pratos típicos do RN:*\n` +
    `• 🥟 *Buchada* — estômago de bode recheado\n` +
    `• 🥩 *Carne de Sol* — carne salgada e seca ao sol\n` +
    `• 🫘 *Feijão Verde* — feijão fresco com legumes\n` +
    `• 🥘 *Paçoca de Pilão* — carne seca socada com farinha\n` +
    `• 🥟 *Galo* — buchada de galo/cabrito\n` +
    `• 🥟 *Arroz de Leite* — arroz doce salgado\n\n` +
    `🥤 *Bebidas:*\n` +
    `• 🥥 Água de Coco\n` +
    `• 🍹 Cajuína (suco de caju)\n` +
    `• 🥤 Garapa (caldo de cana)\n\n` +
    `🍰 *Doces:*\n` +
    `• 🍮 Cartola (banana frita com queijo e açúcar)\n` +
    `• 🥧 Bolo de Rolo\n` +
    `• 🍬 Rapadura\n\n` +
    `📍 *Rio Grande do Norte* — terra do sol, praias e cangaço.`;

  await sock.sendMessage(jid, { text: texto }, { quoted: msg });

  try {
    const fetch = require('node-fetch');
    const r = await fetch('https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Tapioca_com_queijo_coalho.jpg/800px-Tapioca_com_queijo_coalho.jpg', { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const buf = await r.buffer();
      await sock.sendMessage(jid, { image: buf, caption: '🥞 *Tapioca* — comida típica do RN' }, { quoted: msg });
    }
  } catch {}
}

const culturaCommands = ['cultura', 'comida'];

module.exports = { handleCultura, culturaCommands };
