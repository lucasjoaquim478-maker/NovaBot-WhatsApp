async function handleTestUpdate(sock, { jid, text }) {
  const msgs = [
    '🚀 *NovaBot atualizou com sucesso!*\n\nEste comando prova que o auto-update está funcionando perfeitamente!',
    '🤖 *Auto-Update operacional!*\n\nSistema de atualização automática funcionando sem erros.',
    '✅ *Teste de atualização concluído!*\n\nO sistema de auto-update do NovaBot esta 100% funcional.',
  ];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  await sock.sendMessage(jid, { text: msg });
}

const testUpdateCommands = ['testupdate', 'testarupdate'];

module.exports = { handleTestUpdate, testUpdateCommands };
