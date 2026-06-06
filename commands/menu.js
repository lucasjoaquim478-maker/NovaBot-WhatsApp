const config = require('../config.json');
const { formatUptime } = require('../lib/utils');
const db = require('../database/index');

const menu = {
  ia: { emoji: '🤖', title: 'IA & IMAGENS', header: true, cmds: [
    ['ia [pergunta]', 'Inteligência Artificial'],
    ['imagem [descrição]', 'Gerar imagens por IA']
  ]},
  downloads: { emoji: '🎵', title: 'MÚSICA & VÍDEO', header: true, cmds: [
    ['play [música]', 'Baixar MP3 por nome'],
    ['video [nome]', 'Baixar vídeo MP4'],
    ['tiktok [nome]', 'Buscar e baixar TikTok'],
    ['tiktokmp3 [nome]', 'Baixar audio do TikTok'],
    ['instagram [url/@user]', 'Download Instagram'],
    ['facebook [url]', 'Download Facebook']
  ]},
  pesquisa: { emoji: '🔎', title: 'PESQUISAS', header: true, cmds: [
    ['achar [termo]', 'Buscar informações na web'],
    ['google [pesquisa]', null],
    ['wiki [termo]', null],
    ['notícias [categoria]', null],
    ['clima [cidade]', null]
  ]},
  ferramentas: { emoji: '🛠️', title: 'FERRAMENTAS', header: true, cmds: [
    ['sticker', null],
    ['toimg', null],
    ['ocr', null],
    ['tts [texto]', null],
    ['traduzir [texto]', null],
    ['qr [texto]', null]
  ]},
  diversao: { emoji: '🎮', title: 'DIVERSÃO', header: true, cmds: [
    ['meme', null],
    ['piada', null],
    ['dado', null],
    ['moeda', null],
    ['roleta', null],
    ['perfil', null]
  ]},
  economia: { emoji: '💰', title: 'ECONOMIA', header: true, cmds: [
    ['saldo', null],
    ['daily', null],
    ['trabalhar', null],
    ['depositar [valor]', null],
    ['sacar [valor]', null],
    ['ranking', null]
  ]},
  niveis: { emoji: '⭐', title: 'NÍVEIS', header: true, cmds: [
    ['nivel', 'Ver XP e nível']
  ]},
  admin: { emoji: '👥', title: 'ADMINISTRADORES', header: true, cmds: [
    ['kick @user', null],
    ['add [número]', null],
    ['promover @user', null],
    ['rebaixar @user', null],
    ['abrirgrupo', null],
    ['fechargrupo', null],
    ['hidetag [texto]', null],
    ['antilink [on/off]', null],
    ['bemvindo [on/off]', null]
  ]},
  owner: { emoji: '👑', title: 'DONO DO BOT', header: true, cmds: [
    ['reiniciar', null],
    ['shutdown', null],
    ['backup', null],
    ['broadcast [msg]', null],
    ['blacklist @user', null],
    ['unblacklist @user', null],
    ['eval [código]', null],
    ['adddono [número]', 'Adicionar-se como dono'],
    ['update', 'Verificar atualizações'],
    ['update force', 'Forçar atualização'],
    ['versao', 'Versão do bot'],
    ['rollback', 'Restaurar backup']
  ]},
  info: { emoji: '📊', title: 'INFORMAÇÕES', header: true, cmds: [
    ['ping', null],
    ['uptime', null],
    ['status', null],
    ['grupoinfo', null]
  ]},
  roblox: { emoji: '🎮', title: 'ROBLOX', header: true, cmds: [
    ['roblox [nome/URL]', 'Analisar jogo com IA'],
    ['robloxtrend', 'Jogos populares do momento'],
    ['robloxtop', 'Top jogos recomendados'],
    ['robloxlancar', 'Jogos recém-lançados'],
    ['robloxsimilar [jogo]', 'Jogos parecidos'],
    ['robloxreview [jogo]', 'Review detalhada com IA'],
    ['robloxcriador [nome]', 'Jogos de um criador']
  ]},
  vozes: { emoji: '🎙️', title: 'VOZES & ÁUDIO', header: true, cmds: [
    ['voz [personagem] [texto]', 'Áudio com voz do personagem'],
    ['vozes', 'Listar todas as vozes'],
    ['vozaleatoria [texto]', 'Voz aleatória surpresa'],
    ['narrador [texto]', 'Narrador épico'],
    ['robo [texto]', 'Voz robótica'],
    ['locutor [texto]', 'Locutor de rádio'],
    ['vilao [texto]', 'Voz dramática de vilão'],
    ['heroi [texto]', 'Voz heroica']
  ]},
  ajuda: { emoji: '📖', title: 'CENTRAL DE AJUDA', header: true, cmds: [
    ['help', null],
    ['help admin', null],
    ['help economia', null],
    ['help downloads', null],
    ['help ia', null],
    ['help roblox', null],
    ['help ferramentas', null],
    ['help vozes', null]
  ]}
};

function buildMenu(sock, userJid, args) {
  const prefix = config.prefix || '!';
  const botName = config.botName || 'NovaBot';
  const categoryFilter = args?.[0]?.toLowerCase();

  if (!categoryFilter) {
    return buildCompleteMenu(prefix, botName);
  }

  const cat = menu[categoryFilter];
  if (!cat) {
    return `❌ Categoria "${categoryFilter}" não encontrada.\n\nUse ${prefix}help para ver as categorias.`;
  }

  return buildCategoryMenu(prefix, cat);
}

function buildCompleteMenu(prefix, botName) {
  const total = Object.values(menu).reduce((a, c) => a + c.cmds.length, 0);
  const startTime = global.startTime || Date.now();
  const uptime = formatUptime(Date.now() - startTime);
  const userCount = db.getUserCount();
  const border = '═'.repeat(36);

  let text = `╔${border}╗\n`;
  text += `║           🚀 ${botName} 🚀           ║\n`;
  text += `║      Sistema Multi-Funções        ║\n`;
  text += `╚${border}╝\n\n`;
  text += `👤 Usuários: ${userCount}\n`;
  text += `📊 Comandos: ${total}\n`;
  text += `⚡ Uptime: ${uptime}\n`;
  text += `🔰 Prefixo: ${prefix}\n\n`;

  for (const [, cat] of Object.entries(menu)) {
    text += `╭━━━ ${cat.emoji} ${cat.title} ━━━╮\n`;
    for (let i = 0; i < cat.cmds.length; i++) {
      const [cmd, desc] = cat.cmds[i];
      text += `┃ !${cmd}\n`;
      if (desc) {
        text += `┃ ➜ ${desc}\n`;
        if (i < cat.cmds.length - 1) text += `┃\n`;
      }
    }
    text += `╰${'━'.repeat(33)}╯\n\n`;
  }

  text += `╔${border}╗\n`;
  text += `║      ✨ ${botName} Premium v1.0      ║\n`;
  text += `║      ⚙️ Powered by Node.js        ║\n`;
  text += `║      🔥 Rápido • Seguro • IA      ║\n`;
  text += `╚${border}╝`;

  return text;
}

function buildCategoryMenu(prefix, cat) {
  let text = `╭━━━ ${cat.emoji} ${cat.title} ━━━╮\n`;
  for (let i = 0; i < cat.cmds.length; i++) {
    const [cmd, desc] = cat.cmds[i];
    text += `┃ ${prefix}${cmd}\n`;
    if (desc) {
      text += `┃ ➜ ${desc}\n`;
      if (i < cat.cmds.length - 1) text += `┃\n`;
    }
  }
  text += `╰${'━'.repeat(33)}╯\n\n`;
  text += `📌 ${cat.cmds.length} comandos`;
  return text;
}

module.exports = { menu, buildMenu };
