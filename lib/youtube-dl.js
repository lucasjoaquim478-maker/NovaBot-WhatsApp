const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const BASE = 'www.youtube.com';

const CLIENTS = [
  { name: 'ANDROID', version: '19.09.37', sdk: 30 },
  { name: 'ANDROID_CREATOR', version: '23.02.100', sdk: 30 },
  { name: 'ANDROID_MUSIC', version: '6.42.50', sdk: 30 },
  { name: 'ANDROID_VR', version: '1.61.21', sdk: 30 },
  { name: 'IOS', version: '19.09.3', device: 'iPhone17,3', os: '18_1_0' },
  { name: 'TVHTML5_SIMPLY_EMBEDDED', version: '2.0', sdk: 30 },
];

function postInnertube(videoId, clientIdx) {
  const cl = CLIENTS[clientIdx % CLIENTS.length];
  const body = JSON.stringify({
    context: {
      client: {
        clientName: cl.name,
        clientVersion: cl.version,
        hl: 'en',
        gl: 'BR',
        ...(cl.sdk != null ? { androidSdkVersion: cl.sdk } : {}),
        ...(cl.device ? { deviceModel: cl.device, osVersion: cl.os } : {}),
      },
    },
    videoId,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: BASE,
      path: `/youtubei/v1/player?key=${API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 12) gzip',
        'Accept': '*/*',
        'Origin': 'https://www.youtube.com',
        'Connection': 'keep-alive',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c.toString());
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || 'API error'));
          resolve(json);
        } catch {
          reject(new Error('Falha ao parsear resposta: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

function extractFormat(json, type) {
  const formats = json.streamingData?.[type === 'audio' ? 'adaptiveFormats' : 'formats'] || [];
  const filtered = formats.filter(f => {
    if (type === 'audio') return f.mimeType?.startsWith('audio/');
    return f.mimeType?.startsWith('video/');
  });
  if (!filtered.length) return null;
  filtered.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const best = filtered[0];
  const url = best.url || best.signatureCipher || '';
  if (!url) return null;
  return {
    url,
    mime: best.mimeType?.split(';')[0] || '',
    bitrate: best.bitrate || 0,
    size: best.contentLength ? parseInt(best.contentLength) : 0,
  };
}

async function getBestAudio(videoId, clientIdx = 0) {
  const json = await postInnertube(videoId, clientIdx);
  const fmt = extractFormat(json, 'audio');
  if (!fmt) throw new Error('Nenhum formato de audio encontrado');
  return fmt;
}

async function getBestVideo(videoId, clientIdx = 0) {
  const json = await postInnertube(videoId, clientIdx);
  const videoFmt = extractFormat(json, 'video');
  const audioFmt = extractFormat(json, 'audio');
  return { video: videoFmt, audio: audioFmt, title: json.videoDetails?.title, duration: json.videoDetails?.lengthSeconds };
}

function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    proto.get(url, { timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadUrl(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    }).on('error', reject);
  });
}

function maxAttempts() {
  return CLIENTS.length;
}

module.exports = { getBestAudio, getBestVideo, downloadUrl, maxAttempts, CLIENTS };
