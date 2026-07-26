# NILTASK PWA Release Notes — Professionalization Preview

## Current preview cache generation

```text
taskflow-v209
```

Defined in `sw.js`.

## Purpose of this cache generation

The professionalization branch loads runtime services through query-versioned URLs. Cache matching is query-sensitive, so an offline cache containing only an unversioned path cannot satisfy the exact bootstrap request.

The v209 app shell coordinates the explicit mobile lifecycle through:

```text
/js/core/session-lifecycle.js?v=4
/js/core/mobile-runtime-diagnostics.js?v=2
```

Session lifecycle v4:

- stops the explicit mobile runtime before general realtime teardown;
- prevents channel `CLOSED` callbacks from recreating reconnect/fallback work during cleanup;
- reloads after tenant or account changes;
- reloads when a user signs in after a previous same-page cleanup left the mobile runtime stopped.

Mobile diagnostics v2 reports the lifecycle tracker’s actual timeout, interval, animation-frame, persistent-listener, observer and channel counts, together with stop reason, last cleanup and page-reload restart mode.

The existing reaction safeguard remains protected offline through:

```text
/js/runtime-subscription-guard.js?v=7
```

Guard v7 removes the duplicate desktop `mpgs-reactions-v1-<tenant>` channel only after both managed replacements have joined:

```text
public:messages-<tenant>
taskflow-bc-<tenant>
```

## Protected offline runtime files

- `js/compact-panel-filters.js?v=5`
- `js/core/realtime-manager.js?v=1`
- `js/core/realtime-feature-owners.js?v=5`
- `js/core/session-lifecycle.js?v=4`
- `js/core/runtime-diagnostics.js?v=7`
- `js/core/mobile-runtime-diagnostics.js?v=2`
- `js/runtime-subscription-guard.js?v=7`
- `js/notification-presentation-service.js?v=3`
- `js/core/unread-service.js?v=3`
- `js/shared.js?v=208`
- `js/mobile-tasks.js?v=207`
- `js/activity-v208.js?v=207`

## Expected update behaviour

1. Browser detects changed `/sw.js`.
2. New worker installs and opens `taskflow-v209`.
3. Each app-shell asset is cached independently; one optional failure does not abort installation.
4. `skipWaiting()` activates the worker.
5. Old `taskflow-*` caches are deleted, while `share-inbox` is preserved.
6. `controllerchange` reloads the page once so the new HTML/JS runtime is used.
7. JS/CSS requests remain network-first when online and cache-fallback when offline.
8. On mobile logout/account/tenant cleanup, MobileRuntime stops before the shared channel teardown.
9. A later same-page sign-in reloads rather than attempting to resurrect stale module-local channels.
10. On desktop subscription startup, guard v7 waits for both replacement channels to reach `joined`, then removes the legacy reaction broadcast.

## Smoke checks

- Hard refresh preview once.
- In DevTools → Application → Service Workers, confirm the active worker uses the latest `sw.js`.
- In Cache Storage, confirm `taskflow-v209` exists.
- Confirm `taskflow-v208` and older app-shell caches are removed after activation.
- Confirm the exact v4/v2/v7 query-versioned runtime files exist in the cache.
- On mobile, run `NILTASK_printMobileRuntimeSnapshot()` before logout and confirm one `mobile-rt-*` plus one `presence-*` channel.
- Invoke session cleanup only in a controlled test/logout path; after stop, tracked resource counts and mobile channel counts must be zero.
- Confirm restart mode is `page-reload`, not an unsafe same-page resurrection of stale module-local channel references.
- Sign out and sign in again on the same page; confirm one controlled reload and one fresh mobile/presence channel pair.
- Switch account or tenant; confirm no old identity callback survives and the new context starts after reload.
- Run `NILTASK_SubscriptionGuard.snapshot()` after desktop login.
- Confirm `legacyReaction.state` reaches `retired` and `channelPresent` is `false`.
- Confirm the runtime channel list contains one `public:messages-<tenant>` and one `taskflow-bc-<tenant>`, with no `mpgs-reactions-v1-<tenant>`.
- Add and remove one emoji from a second desktop session; the visible count must change by exactly one.
- Confirm typing and group-photo updates still arrive between desktop and mobile sessions.
- Reload while offline after one successful online load.
- Confirm login/restored shell loads without a blank screen.
- Confirm Activity, realtime diagnostics, mobile runtime diagnostics and unread service scripts do not fail to load offline.
- Confirm `share-inbox` is not deleted.
- Confirm no repeated controller-change reload loop.

## Rollback

If v209 causes mobile cleanup, identity recovery, reaction, typing, group-photo or PWA-update regression:

1. Revert the coordinated mobile lifecycle commits, including session lifecycle v4, its loader and app-shell generation.
2. Restore session lifecycle v2, mobile diagnostics v1 and the prior stable app-shell generation together, or apply a corrective forward cache generation.
3. If the reaction safeguard also regresses, revert its coordinated v7 guard/loader/cache commits separately.
4. For a corrective PWA release, use a new cache generation rather than reusing a broken cache name.
5. Deploy the revert/correction.
6. Keep the PR draft and do not merge.
7. Clear the preview site's service worker/cache manually during diagnosis only when normal update convergence cannot be tested.

Production remains unchanged until the owner explicitly approves the draft PR.
