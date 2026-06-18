const https = require('https');
const http = require('http');
const fs = require('fs');

const CLIENTS = [
  { name: 'ANDROID', ver: '19.09.37', sdk: 30, key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w', ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 12)', cid: 3 },
  { name: 'ANDROID_CREATOR', ver: '23.02.100', sdk: 30, key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w', ua: 'com.google.android.apps.youtube.creator/23.02.100 (Linux; U; Android 12)', cid: 14 },
  { name: 'ANDROID_MUSIC', ver: '6.42.50', sdk: 30, key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w', ua: 'com.google.android.apps.youtube.music/6.42.50 (Linux; U; Android 12)', cid: 21 },
  { name: 'ANDROID_VR', ver: '1.61.21', sdk: 30, key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w', ua: 'com.google.android.apps.youtube.vr/1.61.21 (Linux; U; Android 12)', cid: 39 },
  { name: 'IOS', ver: '19.09.3', key: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc', ua: 'com.google.ios.youtube/19.09.3 (iPhone17,3; U; CPU iOS 18_1_0)', cid: 5 },
  { name: 'WEB', ver: '2.20250101.00.00', key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', cid: 1 },
  { name: 'TVHTML5', ver: '7.20250101', key: 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', ua: 'Mozilla/5.0 (ChromiumStylePlatform) AppleWebKit/537.36', cid: 2 },
];

function postInnertube(videoId, clientIdx) {
  const cl = CLIENTS[clientIdx % CLIENTS.length];
  const body = JSON.stringify({
    context: {
      client: {
        clientName: cl.name,
        clientVersion: cl.ver,
        hl: 'en',
        gl: 'US',
        ...(cl.sdk != null ? { androidSdkVersion: cl.sdk } : {}),
      },
    },
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  });

  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': cl.ua,
      'Accept': '*/*',
      'Origin': 'https://www.youtube.com',
      'Content-Length': Buffer.byteLength(body),
      'X-YouTube-Client-Name': String(cl.cid),
      'X-YouTube-Client-Version': cl.ver,
    };

    const req = https.request({
      hostname: 'www.youtube.com',
      path: `/youtubei/v1/player?key=${cl.key}`,
      method: 'POST',
      headers,
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
          reject(new Error('Falha ao parsear: ' + data.slice(0, 300)));
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
  const sd = json.streamingData;
  if (!sd) return null;
  const sources = [
    ...(sd.adaptiveFormats || []),
    ...(sd.formats || []),
  ];
  const filtered = sources.filter(f => {
    if (type === 'audio') return f.mimeType?.startsWith('audio/');
    return f.mimeType?.startsWith('video/');
  });
  if (!filtered.length) return null;
  filtered.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const best = filtered[0];
  const url = best.url || '';
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
  if (!fmt) {
    const sd = json.streamingData;
    const hint = sd ? `adaptiveFormats:${sd.adaptiveFormats?.length||0} formats:${sd.formats?.length||0}` : 'no streamingData';
    throw new Error('Nenhum formato de audio (' + hint + ')');
  }
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
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

function maxAttempts() { return CLIENTS.length; }

module.exports = { getBestAudio, getBestVideo, downloadUrl, maxAttempts, CLIENTS };
