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
