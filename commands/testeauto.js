async function handleTeste(sock, { jid }) {
  const msgs = [
    '🤖 *Auto-Update TESTE*\n\nSe você está vendo esta mensagem, o auto-update funcionou perfeitamente!',
    '✅ *Atualização verificada!*\n\nO sistema de auto-update do NovaBot está funcionando corretamente.',
    '🚀 *Teste OK!*\n\nNova versão instalada com sucesso via auto-update!',
  ];
  await sock.sendMessage(jid, { text: msgs[Math.floor(Math.random() * msgs.length)] });
}

const testeCommands = ['testeauto', 'testarauto'];

module.exports = { handleTeste, testeCommands };
