# WriteBoost Online Features

This project can run fully offline, but some features work better online:

- **Power Words** for any input word (synonyms / related words)
- **Grammar / spelling / punctuation checks**

## Deploy the Cloudflare Worker (recommended)

1. Install `wrangler` (once):

```bash
npm i -g wrangler
```

2. Login:

```bash
wrangler login
```

3. Create a Worker project folder (or use any existing Worker):

```bash
mkdir -p writeboost-worker
cd writeboost-worker
wrangler init --no-git
```

4. Replace `src/index.js` (or `src/index.ts`) with the contents of `../cloudflare-worker.js`.

5. Deploy:

```bash
wrangler deploy
```

Wrangler will print a URL like:

`https://<your-worker-name>.<your-account>.workers.dev`

## Connect the webpage to your Worker

Open `index.html`, find `ONLINE_CONFIG.proxyBase`, and set it to your Worker URL:

Example:

```js
proxyBase: 'https://writeboost-proxy.yourname.workers.dev',
```

## API endpoints

- `GET /api/power?word=walk`
- `POST /api/check` with JSON `{ "text": "...", "language": "en-US" }`

## (New) Cloud Sync for essays (KV)

To auto-save and sync essay history across iPad + computer, the Worker stores your full app state in **Cloudflare KV** keyed by a short "sync code".

### 1) Create a KV namespace

In the Worker folder:

```bash
cd "/Users/zhaoyue/WorkBuddy/2026-05-07-task-1/writeboost-worker"
npx --yes wrangler@latest kv namespace create SYNC_KV
```

Copy the returned `id`.

### 2) Bind KV in `wrangler.toml`

Replace the placeholder:

```toml
kv_namespaces = [
  { binding = "SYNC_KV", id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID" }
]
```

### 3) Redeploy

```bash
npx --yes wrangler@latest deploy
```

### 4) Use the Sync Code in the webpage

Go to `History` page → **Sync code**.

Use the same code on iPad + computer to share the same cloud-synced history.

