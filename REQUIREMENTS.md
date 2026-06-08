# WriteBoost requirements

## 2026-06-07 Firebase article sync fix

### Problem

After the May passcode/Firebase update, a submitted essay is saved to the current browser's local profile bucket, but the submit flow does not immediately upload that new essay to Firebase Realtime Database. Cloud sync only runs during app startup or from a few manual/secondary actions, so essays can remain local-only if the user writes after startup, closes the page, or has intermittent network.

### Expected behavior

- Every submitted essay is saved locally first, then queued for a best-effort Firebase sync under the current passcode profile.
- If the device has no confirmed passcode, the essay remains local-only and the app should tell the user to set a passcode to enable cloud backup.
- Cloud sync must merge remote and local data before upload, so a device with stale local data does not overwrite essays from another device.
- The existing manual sync behavior remains available and visible to the user.
- Favorite and delete changes in essay history should also be queued for cloud sync because they change the essay library.
- Sync failures must not block local writing or erase local data.

### Non-goals

- Do not migrate away from Firebase Realtime Database.
- Do not change the passcode bucket scheme or expose raw passcodes in Firebase paths.
- Do not require user login/authentication for this fix.

## 2026-06-08 Firebase security rules fix

### Problem

Firebase warned that `writeboost-a1e09-default-rtdb` has insecure Realtime Database rules because any unauthenticated visitor can read and write the entire database. The current frontend-only passcode bucket hides the raw passcode from paths, but it does not authenticate requests, so open RTDB rules still expose all data.

### Expected behavior

- The app signs in to Firebase Authentication anonymously before cloud sync.
- Each anonymous Firebase user registers itself as a member of the current passcode-derived profile bucket.
- Realtime Database rules deny root-level reads and writes.
- Realtime Database rules allow reads/writes only for authenticated users whose uid is registered under the specific profile bucket they are accessing.
- Existing passcode-based cross-device sync remains available: each device using the same passcode can join the same profile bucket after anonymous sign-in.
- If Firebase Auth is not enabled or rules reject access, local writing must continue and the app should surface cloud sync failure instead of losing data.

### Operational requirement

Enable Firebase Authentication -> Sign-in method -> Anonymous in the Firebase Console, then publish the matching Realtime Database rules documented in `ONLINE.md`.
