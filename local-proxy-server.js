/**
 * Local HTTP proxy for older iPad/Safari that cannot handshake modern TLS to workers.dev.
 *
 * - Listens on http://0.0.0.0:8787
 * - Exposes:
 *   GET  /api/power?word=happy  -> fetches Datamuse over HTTPS
 *   POST /api/check            -> fetches LanguageTool over HTTPS
 *
 * Usage:
 *   node ./local-proxy-server.js
 *
 * Then on iPad (same Wi‑Fi), set in index.html:
 *   ONLINE_CONFIG.proxyBase = 'http://<your-mac-lan-ip>:8787'
 */

const http = require('http');
const { URL } = require('url');

const DATAMUSE = 'https://api.datamuse.com/words';
const LANGUAGETOOL = 'https://api.languagetool.org/v2/check';

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(
    res,
    status,
    {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
    JSON.stringify(obj)
  );
}

function bucketize(words) {
  const buckets = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  if (!words.length) return buckets;
  const chunk = Math.ceil(words.length / 5);
  for (let i = 0; i < words.length; i++) {
    const level = Math.min(5, Math.floor(i / chunk) + 1);
    buckets[level].push(words[i]);
  }
  return buckets;
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      send(res, 204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type',
        'cache-control': 'no-store',
      }, '');
      return;
    }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/' || url.pathname === '/health') {
      send(res, 200, {
        'content-type': 'text/plain; charset=utf-8',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
      }, 'ok');
      return;
    }

    if (url.pathname === '/api/power') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const word = (url.searchParams.get('word') || '').trim().toLowerCase();
      if (!word) return sendJson(res, 400, { error: 'Missing ?word=' });

      const target = `${DATAMUSE}?ml=${encodeURIComponent(word)}&max=30`;
      const r = await fetch(target);
      if (!r.ok) return sendJson(res, 502, { error: `Datamuse ${r.status}` });
      const data = await r.json();
      const items = Array.isArray(data) ? data : [];
      const words = items
        .filter((x) => x && typeof x.word === 'string')
        .map((x) => ({ w: x.word, s: Number(x.score) || 0 }))
        .filter((x) => x.w.toLowerCase() !== word)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.w);

      return sendJson(res, 200, { word, levels: bucketize(words), raw: items });
    }

    if (url.pathname === '/api/check') {
      if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
      const payload = (await readJson(req)) || {};
      const text = String(payload.text || '');
      const language = String(payload.language || 'en-US');
      if (!text.trim()) return sendJson(res, 200, { matches: [] });

      const body = new URLSearchParams();
      body.set('text', text);
      body.set('language', language);
      body.set('enabledOnly', 'false');

      const r = await fetch(LANGUAGETOOL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!r.ok) return sendJson(res, 502, { error: `LanguageTool ${r.status}` });
      const data = await r.json();
      return sendJson(res, 200, data);
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    return sendJson(res, 500, { error: e && e.message ? e.message : String(e) });
  }
});

const PORT = Number(process.env.PORT || 8787);
server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`WriteBoost local proxy listening on http://0.0.0.0:${PORT}`);
});

