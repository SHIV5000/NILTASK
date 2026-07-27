# NILTASK PWA Release Notes — Professionalization Preview

## Current preview cache generation

```text
taskflow-v211
```

Defined in `sw.js`.

## Purpose of this cache generation

The professionalization branch loads runtime services through query-versioned URLs. Cache matching is query-sensitive, so an offline cache containing only an unversioned path cannot satisfy the exact bootstrap request.

The v211 app shell adds the cross-device chat parity service:

```text
/js/core/chat-parity-service.js?v=2
```

ChatParity v2 addresses the real-phone acceptance defects reported on PR #204:

- one tenant-scoped typing transport shared by desktop, browser/PWA mobile and the Capacitor preview app;
- canonical reaction reconciliation so desktop text tags render on mobile;
- stable IDs and reaction footers for nested desktop reply rows;
- reaction synchronization for reply messages across devices;
- identity-scoped rendered-message fallback for offline group, DM and thread screens;
- idempotent reply decoration, preventing observer-driven rewrite loops.

The existing mobile data cache remains authoritative. The rendered HTML cache is a final safety net for cases where the local message mirror does not paint, especially thread screens.

The v211 app shell also retains:

```text
/js/core/session-lifecycle.js?v=4
/js/core/mobile-runtime-diagnostics.js?v=3
/js/core/unread-service.js?v=4
/js/runtime-subscription-guard.js?v=7
```

## Protected offline runtime files

- `js/compact-panel-filters.js?v=5`
- `js/core/realtime-manager.js?v=1`
- `js/core/realtime-feature-owners.js?v=5`
- `js/core/session-lifecycle.js?v=4`
- `js/core/runtime-diagnostics.js?v=7`
- `js/core/mobile-runtime-diagnostics.js?v=3`
- `js/runtime-subscription-guard.js?v=7`
- `js/notification-presentation-service.js?v=3`
- `js/core/unread-service.js?v=4`
- `js/core/chat-parity-service.js?v=2`
- `js/shared.js?v=208`
- `js/mobile-tasks.js?v=207`
- `js/activity-v208.js?v=207`

## Expected update behaviour

1. Browser detects changed `/sw.js`.
2. New worker installs and opens `taskflow-v211`.
3. Each app-shell asset is cached independently; one optional failure does not abort installation.
4. `skipWaiting()` activates the worker.
5. Old `taskflow-*` caches are deleted, while `share-inbox` is preserved.
6. `controllerchange` reloads the page once so the new runtime is used.
7. JS/CSS requests remain network-first when online and cache-fallback when offline.
8. ChatParity creates one `niltask-chat-parity-<tenant>` channel per authenticated page.
9. Typing expires automatically and is never persisted.
10. Reactions reconcile from the database instead of incrementing from duplicate transports.
11. Offline rendered-message fallback is isolated by user, tenant, screen type and room/thread ID.
12. Session cleanup removes the named parity channel through RealtimeManager.

## Smoke checks

- Hard refresh the preview once.
- Confirm Cache Storage contains `taskflow-v211` and removes `taskflow-v210` and older app-shell caches after activation.
- Confirm `/js/core/chat-parity-service.js?v=2` exists in the cache.
- On each device, run `NILTASK_ChatParity.printSnapshot()`.
- Confirm one `niltask-chat-parity-<tenant>` topic is joined.
- Type desktop→desktop, desktop→mobile, mobile→desktop and mobile→mobile; the other device must show one indicator and it must clear after typing stops.
- Add a desktop text tag such as **Noted**; it must appear on the mobile bubble.
- Add/remove reactions on a reply from both desktop and mobile; all visible reply rows must converge.
- Open a group, DM and thread online, then go offline and reopen each; cached/local message rows must paint instead of an empty chat.
- Confirm Activity remains stable and no observer/rewrite loop occurs.
- Confirm `share-inbox` survives activation and no controller-change reload loop occurs.

## Rollback

If v211 causes typing, reaction, reply rendering, offline cache or PWA-update regression:

1. Revert ChatParity v2, its runtime loader and `taskflow-v211` together.
2. Restore the prior app-shell generation using a new corrective cache namespace; do not reuse a broken cache name.
3. Keep unread v4, diagnostics v3 and session lifecycle v4 unless the regression is proven to involve them.
4. Keep PR #204 draft and do not merge.
5. Clear preview service-worker/cache state manually only when normal update convergence cannot be tested.

Production remains unchanged until the owner explicitly approves the draft PR.
