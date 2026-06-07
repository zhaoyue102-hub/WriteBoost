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

## Cloud Sync for essays (Firebase Realtime Database)

The current app stores each writer library in **Firebase Realtime Database** under a passcode-derived bucket:

```text
writeboostProfiles/<passcodeBucketId>
```

The raw passcode is not written to the Firebase path. The same passcode on iPad + computer opens the same cloud-synced essay library.

### 1) Confirm Firebase RTDB exists

In Firebase Console:

1. Open project `writeboost-a1e09`.
2. Go to **Build -> Realtime Database**.
3. Confirm the database URL matches `index.html`:

```text
https://writeboost-a1e09-default-rtdb.firebaseio.com
```

If Firebase shows a regional URL instead, update `FIREBASE_CONFIG.databaseURL` in `index.html`.

### 2) Confirm temporary rules for testing

For local/private testing, Realtime Database rules must allow reads and writes to the profile path. If writes fail, the app will still save locally and show a cloud sync failure toast.

### 3) Use the same passcode

Use **Passcode** in the header or the first-run gate. Enter the same passcode on each device to sync the same essay library.

### 4) Save behavior

Submitted essays are saved locally first, then queued for a best-effort Firebase sync. Manual sync still pulls remote data, merges it with local data, and uploads the merged result.
