# Native App (Capacitor + FCM/APNs) — Plan & Guide

Goal: WhatsApp-grade notifications (guaranteed OS-level push even when the app is
fully closed) **without giving up** the current web app or the PWA install button.

## The model: "remote-URL" wrapper (this is the key idea)
The native app is a thin shell that loads the **live production website**
(`https://<your-vercel-domain>`) inside a native WebView. It does NOT bundle a
frozen copy of the code.

Result — you get ALL THREE from one codebase, one deploy:

| Surface | How it's distributed | Push mechanism |
|---------|----------------------|----------------|
| **Web** (browser) | your Vercel URL | in-app (realtime) |
| **PWA** (installed from browser) | the existing **install button** — UNCHANGED | Web Push |
| **Android app** | Play Store `.aab` | **FCM** (native, guaranteed) |
| **iOS app** | App Store | **APNs** (native, guaranteed) |

A `git push` to `main` still updates everything at once — same daily-release pace
you have now. No web code is frozen into the app.

## Why this fixes notifications
Native apps register with the OS push services (FCM on Android, APNs on iOS). The
OS delivers those notifications reliably even when the app is killed, bypassing
the PWA/Doze/background-throttle limits that make Web Push flaky today. This is
exactly what WhatsApp/Instagram do.

---

## Phases

### Phase A — Scaffold the Capacitor project (no web changes)
Runs on your machine (or CI). New files only; the web app is untouched.
1. `npm init -y` (if no package.json), then install:
   `@capacitor/core @capacitor/cli @capacitor/android @capacitor/app
    @capacitor/push-notifications @capacitor/status-bar @capacitor/splash-screen
    @capacitor/badge`
2. `npx cap init "Noted For Action" "in.notedforaction.app" --web-dir=www`
   - Create a tiny placeholder `www/index.html` (real code always comes from the URL).
   - In `capacitor.config.ts` set:
     `server.url = 'https://<your-vercel-domain>'` and `server.androidScheme = 'https'`.
3. `npx cap add android`  (and later `npx cap add ios` on a Mac).
4. Icons/splash from `icons/icon-512.png` via `npx capacitor-assets generate`.
5. `.gitignore` `node_modules/`; commit `android/` (needed for store builds).

### Phase B — Native bridge (one new web file + small guards)
New `js/native.js`, loaded by `index.html` BEFORE `main.js`. It **no-ops entirely
when `window.Capacitor` is absent**, so the web/PWA behaviour is unchanged.
1. Detect native: `window.IS_NATIVE = Capacitor.isNativePlatform()`.
2. **Native push:** on login, `PushNotifications.register()` → save the FCM/APNs
   token to a new `push_tokens` table (`user_id, tenant_id, token unique, platform`).
   Skip the Web-Push subscribe when native (guard in `js/notifications.js`).
   `pushNotificationActionPerformed` → open the chat (reuse `_openRoomByRoom`).
3. Status bar / splash colour to match the app; hide splash after home renders
   (kills any startup flash natively).
4. App-icon badge via the native Badge plugin when native.
5. Hardware back button → existing `window._back()`.
6. Skip service-worker registration when native (the remote-URL model doesn't need it).

### Phase C — Backend: extend push to FCM/APNs
1. SQL (you run): `create table push_tokens (...)` + owner-only RLS.
2. Extend `supabase/functions/send-push/index.ts`: after the existing Web-Push
   sends, ALSO send FCM (Android) / APNs (iOS) messages to `push_tokens`.
   - Android: Firebase HTTP v1 API with a service-account JSON stored as the
     `FCM_SERVICE_ACCOUNT` Supabase secret.
   - iOS: APNs (via Firebase too, so one path covers both).
3. Payload carries `room` for deep-linking (same shape used today).

### Phase D — Build & distribute
1. **Android debug (test on your own phones today):**
   `npx cap sync android && cd android && ./gradlew assembleDebug` → shareable APK.
2. **Play Store:** signing keystore → `./gradlew bundleRelease` → `.aab` →
   Play Console (one-time **$25**). Fill the data-safety form (chat via Supabase).
3. **iOS (needs a Mac + Apple Developer account $99/yr):** `npx cap add ios`,
   open in Xcode, add the APNs capability, archive → App Store Connect.

---

## What you need (cost / prerequisites)
| Item | Cost | For |
|------|------|-----|
| Firebase project (FCM) | **Free** | Android + iOS push |
| Google Play Console | **$25 one-time** | Android store listing |
| Apple Developer Program | **$99/year** | iOS store + APNs |
| A Mac (or a Mac CI like Codemagic) | — | iOS build only |
| Android: nothing special | — | can build on any machine |

**Recommendation: do Android first.** It's cheaper ($25 one-time), needs no Mac,
and is where your users are. iOS can follow using the same `js/native.js`.

---

## Play Store note (remote-URL apps)
Google can reject "just a website" wrappers. This app is fine because it registers
real native plugins (push, badge, status bar, back button) and is a first-party
app for a real service — document that in the listing. (Capgo live-updates is a
fallback if Play ever objects to the remote URL.)

## Timeline (rough)
- Phase A+B (scaffold + bridge): ~1–2 focused sessions.
- Phase C (FCM in send-push): ~1 session + your Firebase setup.
- Phase D Android build + Play submission: ~1 session + Google review (a few days).
- iOS: separate, after Android works.

## Files
New: `package.json`, `capacitor.config.ts`, `www/index.html`, `js/native.js`,
`android/` (generated), `supabase/migrations/*_push_tokens.sql`,
`send-push` FCM branch. Touched (guards only): `index.html` (one script tag),
`js/notifications.js` (skip Web-Push when native), `js/mobile.js` (IS_NATIVE in
badge). **The web + PWA keep working exactly as now.**
