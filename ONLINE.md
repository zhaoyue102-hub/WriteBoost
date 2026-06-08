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

### 2) Enable Anonymous Auth

In Firebase Console:

1. Go to **Build -> Authentication -> Sign-in method**.
2. Enable **Anonymous**.
3. Save.

WriteBoost uses anonymous Firebase users only for database rules. It does not ask students for email/password.

### 3) Publish secure Realtime Database rules

Go to **Build -> Realtime Database -> Rules**, replace the testing/open rules with:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "writeboostProfileMembers": {
      "$profileId": {
        "$uid": {
          ".read": "auth != null && auth.uid === $uid",
          ".write": "auth != null && auth.uid === $uid && newData.val() === true"
        }
      }
    },
    "writeboostProfiles": {
      "$profileId": {
        ".read": "auth != null && root.child('writeboostProfileMembers').child($profileId).child(auth.uid).val() === true",
        ".write": "auth != null && root.child('writeboostProfileMembers').child($profileId).child(auth.uid).val() === true",
        ".validate": "newData.hasChildren(['stats', 'essays', 'character'])"
      }
    }
  }
}
```

These rules deny root-level reads/writes. A device must first sign in anonymously and register its uid under the passcode-derived profile before it can read/write that profile.

### 4) Use the same passcode

Use **Passcode** in the header or the first-run gate. Enter the same passcode on each device to sync the same essay library.

Important: the passcode is still the sharing key for a writing library. Use a long, hard-to-guess passcode for each writer, not a simple 4-digit code.

### 5) Save behavior

Submitted essays are saved locally first, then queued for a best-effort Firebase sync. Manual sync still pulls remote data, merges it with local data, and uploads the merged result.
