const fs = require('fs');
const path = require('path');
const config = require('../config.json');

const COOKIE_PATH = path.join(__dirname, '..', 'cookies.txt');

async function handleCookieSetup(sock, { msg, jid, sender, args, commandName, text, prefix }) {
  if (commandName === 'addcookie') {
    if (!args.length) {
      return await sock.sendMessage(jid, {
        text: `📋 *Configurar cookies do YouTube*\n\n1. Instale a extensao "Get cookies.txt LOCALLY" no Chrome\n2. Acesse youtube.com e faca login\n3. Clique na extensao > Exportar\n4. Copie TODO o conteudo do arquivo\n5. Envie:\n\n*!addcookie* + o conteudo dos cookies\n\nOu se preferir, envie o arquivo .txt como documento`
      });
    }

    const cookieContent = text.slice(prefix.length + 'addcookie'.length).trim();
    if (!cookieContent || cookieContent.length < 50) {
      return await sock.sendMessage(jid, { text: '❌ Conteudo de cookie invalido ou muito curto. Certifique-se de copiar TODO o conteudo do arquivo exportado.' });
    }

    try {
      fs.writeFileSync(COOKIE_PATH, cookieContent, 'utf-8');
      const cfgPath = path.join(__dirname, '..', 'config.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      cfg.cookiesPath = COOKIE_PATH;
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      await sock.sendMessage(jid, { text: `✅ Cookies salvos em ${COOKIE_PATH}\n\nconfig.json atualizado com cookiesPath\n\nReinicie o bot com !reiniciar para aplicar` });
    } catch (e) {
      await sock.sendMessage(jid, { text: `❌ Erro ao salvar cookies: ${e.message}` });
    }
    return;
  }

  if (commandName === 'delcookie') {
    try {
      if (fs.existsSync(COOKIE_PATH)) fs.unlinkSync(COOKIE_PATH);
      const cfgPath = path.join(__dirname, '..', 'config.json');
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      delete cfg.cookiesPath;
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
      await sock.sendMessage(jid, { text: '✅ Cookies removidos' });
    } catch (e) {
      await sock.sendMessage(jid, { text: `❌ Erro: ${e.message}` });
    }
    return;
  }
}

const cookieCommands = ['addcookie', 'delcookie'];

module.exports = { handleCookieSetup, cookieCommands };
