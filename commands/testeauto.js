async function handleTeste(sock, { jid }) {
  const msgs = [
    '🤖 *Auto-Update TESTE*\n\nSe voce esta vendo esta mensagem, o auto-update funcionou perfeitamente!',
    '✅ *Atualizacao verificada!*\n\nO sistema de auto-update do NovaBot esta funcionando corretamente.',
    '🚀 *Teste OK!*\n\nNova versao instalada com sucesso via auto-update!',
  ];
  await sock.sendMessage(jid, { text: msgs[Math.floor(Math.random() * msgs.length)] });
}

const testeCommands = ['testeauto', 'testarauto'];

module.exports = { handleTeste, testeCommands };
