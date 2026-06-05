const fetch = require('node-fetch');
const config = require('../config.json');

async function handlePesquisa(sock, { msg, jid, sender, args, commandName }) {
  const query = args.join(' ');

  switch (commandName) {
    case 'google': {
      if (!query) return await sock.sendMessage(jid, { text: '❌ Digite o que deseja pesquisar. Ex: !google RTX 5090' });
      await sock.sendPresenceUpdate('composing', jid);
      try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        await sock.sendMessage(jid, { text: `🔍 *Google: ${query}*\n\n${url}\n\nℹ️ Clique no link para ver resultados.` });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
    case 'wiki': {
      if (!query) return await sock.sendMessage(jid, { text: '❌ Digite o termo. Ex: !wiki Albert Einstein' });
      await sock.sendPresenceUpdate('composing', jid);
      try {
        const lang = 'pt';
        const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
        if (res.status === 404) return await sock.sendMessage(jid, { text: '❌ Pagina nao encontrada.' });
        if (!res.ok) throw new Error('API indisponivel');
        const data = await res.json();
        const text = data.extract?.slice(0, 2000) || 'Sem descricao.';
        await sock.sendMessage(jid, {
          text: `📚 *${data.title}*\n\n${text}\n\n🔗 ${data.content_urls?.desktop?.page || ''}`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
    case 'noticias': {
      await sock.sendPresenceUpdate('composing', jid);
      try {
        const apiKey = config.newsApiKey || 'demo';
        const params = new URLSearchParams({ apiKey, pageSize: '5', language: 'pt' });

        if (query) {
          params.set('q', query);
        } else {
          params.set('country', 'br');
        }

        const res = await fetch(`https://newsapi.org/v2/top-headlines?${params}`);
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`API: ${errText.slice(0, 100)}`);
        }
        const data = await res.json();

        if (!data.articles?.length) {
          return await sock.sendMessage(jid, {
            text: query
              ? `📰 Nenhuma noticia encontrada para "${query}".`
              : '📰 Nenhuma noticia no momento.'
          });
        }

        let msgText = `📰 *Noticias${query ? ': ' + query : ' do Brasil'}*\n\n`;
        data.articles.slice(0, 5).forEach((a, i) => {
          msgText += `*${i + 1}. ${a.title}*\n${a.source?.name || ''}\n${a.url}\n\n`;
        });
        await sock.sendMessage(jid, { text: msgText.trim() });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro ao carregar noticias: ${e.message}` });
      }
      break;
    }
    case 'clima': {
      if (!query) return await sock.sendMessage(jid, { text: '❌ Digite a cidade. Ex: !clima Sao Paulo' });
      await sock.sendPresenceUpdate('composing', jid);
      try {
        const res = await fetch(`https://wttr.in/${encodeURIComponent(query)}?format=%C|%t|%h|%w|%p&lang=pt`);
        const text = await res.text();
        const parts = text.split('|');
        if (parts.length < 5 || text.includes('Unknown')) {
          return await sock.sendMessage(jid, { text: '❌ Cidade nao encontrada.' });
        }
        await sock.sendMessage(jid, {
          text: `🌤 *Clima: ${query}*\n\n🌡 Temperatura: ${parts[1]}\n☁️ Condicao: ${parts[0]}\n💧 Umidade: ${parts[2]}\n💨 Vento: ${parts[3]}\n🌧 Precipitacao: ${parts[4]}`
        });
      } catch (e) {
        await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
      }
      break;
    }
  }
}

const pesquisaCommands = ['google', 'wiki', 'noticias', 'clima'];

module.exports = { handlePesquisa, pesquisaCommands };
