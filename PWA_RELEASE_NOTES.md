# NILTASK PWA Release Notes — Professionalization Preview

## Current preview cache generation

```text
taskflow-v205
```

Defined in `sw.js`.

## Purpose of this cache bump

The professionalization branch introduced runtime services that are dynamically loaded with query-versioned URLs. Cache matching is query-sensitive, so an offline cache containing only the unversioned file path would not satisfy requests such as:

```text
/js/core/realtime-feature-owners.js?v=5
/js/core/runtime-diagnostics.js?v=7
/js/core/unread-service.js?v=3
```

The v205 app shell now precaches the exact URLs used by the current HTML/bootstrap path.

## Newly protected offline runtime files

- `js/compact-panel-filters.js?v=5`
- `js/core/realtime-manager.js?v=1`
- `js/core/realtime-feature-owners.js?v=5`
- `js/core/session-lifecycle.js?v=2`
- `js/core/runtime-diagnostics.js?v=7`
- `js/runtime-subscription-guard.js?v=4`
- `js/notification-presentation-service.js?v=3`
- `js/core/unread-service.js?v=3`
- `js/shared.js?v=208`
- `js/mobile-tasks.js?v=207`
- `js/activity-v208.js?v=207`

## Expected update behaviour

1. Browser detects changed `/sw.js`.
2. New worker installs and opens `taskflow-v205`.
3. Each app-shell asset is cached independently; one optional failure does not abort installation.
4. `skipWaiting()` activates the worker.
5. Old `taskflow-*` caches are deleted, while `share-inbox` is preserved.
6. `controllerchange` reloads the page once so the new HTML/JS runtime is used.
7. JS/CSS requests remain network-first when online and cache-fallback when offline.

## Smoke checks

- Hard refresh preview once.
- In DevTools → Application → Service Workers, confirm the active worker uses the latest `sw.js`.
- In Cache Storage, confirm `taskflow-v205` exists.
- Confirm old `taskflow-v204` is removed after activation.
- Confirm the query-versioned runtime service URLs exist in the cache.
- Reload while offline after one successful online load.
- Confirm login/restored shell loads without a blank screen.
- Confirm Activity, realtime diagnostics and unread service scripts do not fail to load offline.
- Confirm `share-inbox` is not deleted.
- Confirm no repeated controller-change reload loop.

## Rollback

If the v205 preview introduces a PWA update problem:

1. Revert commit:

```text
1ec2dcf026e314e93ccfb313980592845baf89b5
```

2. Restore the prior `sw.js` content/cache generation.
3. Deploy the revert.
4. Keep the PR draft and do not merge.
5. Clear the preview site's service worker/cache manually during diagnosis if required.

Production remains unchanged until the owner explicitly approves the draft PR.
