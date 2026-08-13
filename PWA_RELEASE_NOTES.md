# Noted For Action PWA Release Notes — WEB v13 / PWA v216

## Current cache generation

```text
taskflow-v217
```

Defined in `sw.js`.

## Why v217 exists

`taskflow-v217` is the production app-shell cache generation for the WEB v13 correction pass. It advances the previous cache because the service-worker fetch contract and production stylesheet/app-shell asset list changed.

The v217 worker keeps the existing notification and quick-reply behavior, while making every `respondWith()` fetch path resolve to a real `Response`. Navigation now tries the network first, then the exact cached request, then `/index.html`, then `/offline.html`, and finally a controlled 503 response. This prevents the Chrome error `Failed to convert value to 'Response'` when both the network and cache miss.

## Protected runtime assets

The app shell continues to protect the shared runtime services, including:

- `js/core/chat-parity-service.js?v=2`
- `js/core/session-lifecycle.js?v=4`
- `js/core/mobile-runtime-diagnostics.js?v=3`
- `js/core/unread-service.js?v=4`
- `js/runtime-subscription-guard.js?v=7`
- `js/core/realtime-manager.js?v=1`
- `js/core/realtime-feature-owners.js?v=5`
- `js/notification-presentation-service.js?v=3`
- `js/compact-panel-filters.js?v=5`
- `js/shared.js?v=208`
- `js/activity-v208.js?v=213`
- `js/desktop-web-v13.js?v=1`

The production Tailwind build is generated during Vercel deployment and is part of the v217 app shell.

## Expected update behaviour

1. Browser detects the changed `/sw.js`.
2. The new worker installs and opens `taskflow-v217`.
3. Each app-shell asset is cached independently; one optional failure does not abort installation.
4. `skipWaiting()` activates the worker.
5. Older `taskflow-*` caches are deleted while `share-inbox` is preserved.
6. `controllerchange` reloads the page once so the new runtime is used.
7. Navigation and code assets remain network-first when online and cache-fallback when offline.
8. A network/cache miss always receives a valid fallback `Response`, never `undefined`.

## WEB v13 checks

- Web header shows `WEB v13`.
- Browser console has no Tailwind browser-CDN production warning.
- Opening `/?mode=chat` does not produce a service-worker `Failed to convert value to 'Response'` error.
- Deadline, Return, Cancel, Transfer and Extension forms open inline in the Task Reply composer without flashing the legacy action layer.
- Desktop Web does not load or log the retired mobile Tasks renderer.

## PWA checks

- Installed phone/tablet PWA continues to load the mobile workflow only on the mobile/native/coarse-pointer boundary.
- `share-inbox` survives service-worker activation.
- Existing push notification and notification quick-reply behavior remains unchanged.
- Mobile Tasks remains owned by the approved PWA v216 task owner.

## Rollback

If v217 introduces an app-shell or offline regression, revert the WEB v13 app-shell commits together and advance to a new corrective cache namespace rather than reusing a known-bad cache name.
