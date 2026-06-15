const db = require('../database/index');

const piadas = [
  'Por que o programador foi preso? Porque ele usou um codigo malicioso!',
  'O que o HTML falou para o CSS? VocÃª me deixa estiloso!',
  'Por que o Java developer usa oculos? Porque ele nÃ£o consegue C#!',
  'Qual o animal favorito do programador? O panda (panda = "from pandas import *")',
  'O que o zero disse para o oito? Belo cinto!',
  'Por que o livro de matematica estava triste? Porque tinha muitos problemas!',
  'O que o pato falou para a pata? Vem qua!',
  'Por que o esqueleto nÃ£o lutou boxe? Porque ele nÃ£o tem estomago pra isso!',
  'Qual o cafe mais perigoso do mundo? O ex-pres-sionista!',
  'O que o peixe falou quando caiu na agua? Nada!'
];

const memes = [
  'https://i.imgur.com/LPLxYxL.jpg',
  'https://i.imgur.com/6VBx3Mv.jpg',
  'https://i.imgur.com/3A7qYQk.jpg',
  'https://i.imgur.com/Xq3cT0D.jpg',
  'https://i.imgur.com/1mVN6F3.jpg'
];

let memeIndex = 0;

async function handleDiversao(sock, { msg, jid, sender, args, commandName }) {
  switch (commandName) {
    case 'meme': {
      const url = memes[memeIndex % memes.length];
      memeIndex++;
      await sock.sendMessage(jid, { image: { url }, caption: 'ðŸ˜‚ Meme para vocÃª!' }, { quoted: msg });
      break;
    }
    case 'piada': {
      const piada = piadas[Math.floor(Math.random() * piadas.length)];
      await sock.sendMessage(jid, { text: `ðŸ˜‚ *Piada:*\n\n${piada}` });
      break;
    }
    case 'dado': {
      const result = Math.floor(Math.random() * 6) + 1;
      await sock.sendMessage(jid, { text: `ðŸŽ² *Dado:* Caiu no nÃºmero *${result}*!` });
      break;
    }
    case 'moeda': {
      const result = Math.random() < 0.5 ? 'Cara' : 'Coroa';
      await sock.sendMessage(jid, { text: `ðŸª™ *Moeda:* ${result}!` });
      break;
    }
    case 'roleta': {
      const boom = Math.random() < 0.3;
      if (boom) {
        await sock.sendMessage(jid, { text: `ðŸ’¥ *ROLETA RUSSA* ðŸ’¥\n\nðŸ”« VocÃª morreu! Tente novamente.` });
      } else {
        await sock.sendMessage(jid, { text: `ðŸ€ *ROLETA RUSSA* ðŸ€\n\nðŸ”« VocÃª sobreviveu!` });
      }
      break;
    }
    case 'perfil': {
      const user = db.getUser(sender);
      const name = user.name || sender.split('@')[0];
      await sock.sendMessage(jid, {
        text: `ðŸ‘¤ *Perfil de ${name}*\n\nðŸ“Š *NÃ­vel:* ${user.level || 1}\nâ­ *XP:* ${user.xp || 0}\nðŸ’° *Coins:* ${user.coins || 0}\nðŸ¦ *Banco:* ${user.bank || 0}\nðŸ’¬ *Mensagens:* ${user.messages || 0}\nâš¡ *Comandos:* ${user.commands || 0}`
      });
      break;
    }
  }
}

const diversaoCommands = ['meme', 'piada', 'dado', 'moeda', 'roleta', 'perfil'];

module.exports = { handleDiversao, diversaoCommands };
