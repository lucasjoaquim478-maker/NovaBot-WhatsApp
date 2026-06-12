const fetch = require('node-fetch');
const config = require('../config.json');

const API_BASE = 'https://shardcloud.app/api';

function isConfigured() {
  return !!(config.shardcloudToken && config.shardcloudAppId);
}

async function restartApp() {
  if (!isConfigured()) {
    console.log('[SHARDCLOUD] Token/appId não configurados, usando exit(1)');
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/apps/${config.shardcloudAppId}/status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.shardcloudToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'restart' }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('[SHARDCLOUD] Restart solicitado com sucesso:', data.message);
      return true;
    } else {
      const err = await res.text();
      console.log('[SHARDCLOUD] Falha ao reiniciar:', res.status, err);
      return false;
    }
  } catch (err) {
    console.log('[SHARDCLOUD] Erro ao chamar API:', err.message);
    return false;
  }
}

async function safeRestart() {
  const ok = await restartApp();
  if (!ok) {
    console.log('[SHARDCLOUD] Fallback: exit(1)');
    process.exit(1);
  }
}

module.exports = { restartApp, safeRestart, isConfigured };
