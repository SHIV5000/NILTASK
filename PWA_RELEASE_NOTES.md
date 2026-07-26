# NILTASK PWA Release Notes — Professionalization Preview

## Current preview cache generation

```text
taskflow-v207
```

Defined in `sw.js`.

## Purpose of this cache generation

The professionalization branch loads runtime services through query-versioned URLs. Cache matching is query-sensitive, so an offline cache containing only an unversioned path cannot satisfy the exact bootstrap request.

The v207 app shell updates the subscription guard to:

```text
/js/runtime-subscription-guard.js?v=7
```

Guard v7 removes the duplicate desktop `mpgs-reactions-v1-<tenant>` channel only after both managed replacements have joined:

```text
public:messages-<tenant>
taskflow-bc-<tenant>
```

This prevents duplicate reaction add/remove delivery while preserving durable postgres reaction events plus cross-platform typing, group-photo and reaction broadcasts.

## Protected offline runtime files

- `js/compact-panel-filters.js?v=5`
- `js/core/realtime-manager.js?v=1`
- `js/core/realtime-feature-owners.js?v=5`
- `js/core/session-lifecycle.js?v=2`
- `js/core/runtime-diagnostics.js?v=7`
- `js/core/mobile-runtime-diagnostics.js?v=1`
- `js/runtime-subscription-guard.js?v=7`
- `js/notification-presentation-service.js?v=3`
- `js/core/unread-service.js?v=3`
- `js/shared.js?v=208`
- `js/mobile-tasks.js?v=207`
- `js/activity-v208.js?v=207`

## Expected update behaviour

1. Browser detects changed `/sw.js`.
2. New worker installs and opens `taskflow-v207`.
3. Each app-shell asset is cached independently; one optional failure does not abort installation.
4. `skipWaiting()` activates the worker.
5. Old `taskflow-*` caches are deleted, while `share-inbox` is preserved.
6. `controllerchange` reloads the page once so the new HTML/JS runtime is used.
7. JS/CSS requests remain network-first when online and cache-fallback when offline.
8. On desktop subscription startup, guard v7 waits for both replacement channels to reach `joined`, then removes the legacy reaction broadcast.

## Smoke checks

- Hard refresh preview once.
- In DevTools → Application → Service Workers, confirm the active worker uses the latest `sw.js`.
- In Cache Storage, confirm `taskflow-v207` exists.
- Confirm `taskflow-v206` and older app-shell caches are removed after activation.
- Confirm `/js/runtime-subscription-guard.js?v=7` exists in the cache.
- Run `NILTASK_SubscriptionGuard.snapshot()` after desktop login.
- Confirm `legacyReaction.state` reaches `retired`.
- Confirm `legacyReaction.channelPresent` is `false`.
- Confirm the runtime channel list contains one `public:messages-<tenant>` and one `taskflow-bc-<tenant>`, with no `mpgs-reactions-v1-<tenant>`.
- Add and remove one emoji from a second desktop session; the visible count must change by exactly one.
- Confirm typing and group-photo updates still arrive between desktop and mobile sessions.
- Reload while offline after one successful online load.
- Confirm login/restored shell loads without a blank screen.
- Confirm Activity, realtime diagnostics, mobile runtime diagnostics and unread service scripts do not fail to load offline.
- Confirm `share-inbox` is not deleted.
- Confirm no repeated controller-change reload loop.

## Rollback

If v207 causes reaction, typing, group-photo or PWA-update regression:

1. Revert the coordinated commits:

```text
98d4104c0f313b831f2e996852f35ee35b65a2ba
7ea95a8a773885df96d0a4fe7c52e02abc66369d
43bfe5039c168f9fc86dea53a7f03b3d89b6c6b9
```

2. Restore guard v6 behaviour, the prior loader URL and the prior app-shell generation together.
3. For a corrective PWA release, use a new cache generation rather than reusing a broken cache name.
4. Deploy the revert/correction.
5. Keep the PR draft and do not merge.
6. Clear the preview site's service worker/cache manually during diagnosis only when normal update convergence cannot be tested.

Production remains unchanged until the owner explicitly approves the draft PR.
