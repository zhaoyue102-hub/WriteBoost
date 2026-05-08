/**
 * WriteBoost Worker proxy (entrypoint).
 * Copied from ../cloudflare-worker.js
 */

const DATAMUSE = 'https://api.datamuse.com/words';
const LANGUAGETOOL = 'https://api.languagetool.org/v2/check';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

function ok(text, status = 200) {
  return new Response(text, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'cache-control': 'no-store',
    },
  });
}

function withTimeout(promise, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return Promise.race([promise(controller.signal).finally(() => clearTimeout(id))]);
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

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type',
          'cache-control': 'no-store',
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return ok('ok');
    }

    if (url.pathname === '/api/power') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const word = (url.searchParams.get('word') || '').trim().toLowerCase();
      if (!word) return json({ error: 'Missing ?word=' }, 400);

      const target = `${DATAMUSE}?ml=${encodeURIComponent(word)}&max=30`;
      const data = await withTimeout(async (signal) => {
        const res = await fetch(target, { method: 'GET', signal });
        if (!res.ok) throw new Error(`Datamuse ${res.status}`);
        return res.json();
      });

      const items = Array.isArray(data) ? data : [];
      const words = items
        .filter((x) => x && typeof x.word === 'string')
        .map((x) => ({ w: x.word, s: Number(x.score) || 0 }))
        .filter((x) => x.w.toLowerCase() !== word)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.w);

      return json({
        word,
        levels: bucketize(words),
        raw: items,
      });
    }

    if (url.pathname === '/api/check') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ error: 'Invalid JSON body' }, 400);
      }

      const text = (payload?.text || '').toString();
      const language = (payload?.language || 'en-US').toString();
      if (!text.trim()) return json({ matches: [] });

      const body = new URLSearchParams();
      body.set('text', text);
      body.set('language', language);
      body.set('enabledOnly', 'false');

      const data = await withTimeout(async (signal) => {
        const res = await fetch(LANGUAGETOOL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
          signal,
        });
        if (!res.ok) throw new Error(`LanguageTool ${res.status}`);
        return res.json();
      });

      return json(data);
    }

    // Cloud sync: store full state blob under a short code.
    if (url.pathname === '/api/state') {
      const code = (url.searchParams.get('code') || '').trim();
      if (!code) return json({ error: 'Missing ?code=' }, 400);
      if (typeof SYNC_KV === 'undefined') {
        return json({ error: 'SYNC_KV not configured on Worker' }, 501);
      }
      const key = `writeboost:state:${code}`;

      if (request.method === 'GET') {
        const raw = await SYNC_KV.get(key);
        if (!raw) return json({});
        try {
          return json(JSON.parse(raw));
        } catch {
          return json({});
        }
      }

      if (request.method === 'POST') {
        let payload;
        try {
          payload = await request.json();
        } catch {
          return json({ error: 'Invalid JSON body' }, 400);
        }
        await SYNC_KV.put(key, JSON.stringify(payload || {}));
        return json({ ok: true });
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    return json({ error: 'Not found' }, 404);
  },
};

