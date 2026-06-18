const fetch = require('node-fetch');

async function handleAchar(sock, { jid, args }) {
  const termo = args.join(' ');
  if (!termo) {
    await sock.sendMessage(jid, { text: '❌ Digite o termo que deseja buscar. Ex: !achar Neymar' });
    return;
  }

  await sock.sendMessage(jid, { text: `🔎 Buscando por "${termo}"...` });

  try {
    const wikiRes = await fetch(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo)}`, {
      headers: { 'User-Agent': 'NovaBot/2.0' }
    });

    if (wikiRes.ok) {
      const data = await wikiRes.json();
      const type = data.type || 'unknown';
      const typeMap = {
        'standard': '📄 Artigo',
        'disambiguation': '📚 Desambiguação',
        'missing': '❌ Não encontrado'
      };

      let text = `🔎 *Resultado encontrado!*\n\n`;
      text += `📌 *${data.title || termo}*\n\n`;
      if (data.description) text += `🏷️ *${data.description}*\n\n`;
      text += `📝 ${data.extract ? data.extract.slice(0, 800) + '...' : 'Sem descrição disponível.'}\n\n`;

      if (data.thumbnail?.source) {
        text += `📷 ${data.thumbnail.source}\n\n`;
      }

      text += `📖 Tipo: ${typeMap[type] || type}\n`;
      if (data.pageid) text += `🔗 https://pt.wikipedia.org/wiki/${encodeURIComponent(data.title || termo)}\n`;
      text += `\n🤖 *Resumo gerado por IA — Wikipedia*`;

      await sock.sendMessage(jid, { text });
      return;
    }

    const duckRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(termo)}&format=json&skip_disambig=1`, {
      headers: { 'User-Agent': 'NovaBot/2.0' }
    });

    if (duckRes.ok) {
      const data = await duckRes.json();
      if (data.AbstractText) {
        let text = `🔎 *Resultado encontrado!*\n\n`;
        text += `📌 *${data.Heading || termo}*\n\n`;
        text += `📝 ${data.AbstractText.slice(0, 1000)}\n\n`;
        if (data.AbstractURL) text += `🔗 ${data.AbstractURL}\n`;
        if (data.Image) text += `📷 https://duckduckgo.com${data.Image}\n`;
        text += `\n🤖 *Resumo gerado por IA — DuckDuckGo*`;
        await sock.sendMessage(jid, { text });
        return;
      }

      if (data.Results?.length) {
        let text = `🔎 *Resultados para "${termo}"*\n\n`;
        const max = Math.min(data.Results.length, 5);
        for (let i = 0; i < max; i++) {
          text += `${i + 1}. *${data.Results[i].Text || 'Sem título'}*\n`;
          if (data.Results[i].FirstURL) text += `   ${data.Results[i].FirstURL}\n`;
          text += '\n';
        }
        text += `🤖 *Resultados da web — DuckDuckGo*`;
        await sock.sendMessage(jid, { text });
        return;
      }
    }

    await sock.sendMessage(jid, { text: `❌ Nada encontrado para "${termo}". Tente um termo diferente.` });

  } catch (err) {
    await sock.sendMessage(jid, { text: `❌ Erro ao buscar: ${err.message}` });
  }
}

const acharCommands = ['achar', 'buscar', 'pesquisar'];

module.exports = { handleAchar, acharCommands };
