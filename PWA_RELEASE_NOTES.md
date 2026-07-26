# NILTASK PWA Release Notes — Professionalization Preview

## Current preview cache generation

```text
taskflow-v210
```

Defined in `sw.js`.

## Purpose of this cache generation

The professionalization branch loads runtime services through query-versioned URLs. Cache matching is query-sensitive, so an offline cache containing only an unversioned path cannot satisfy the exact bootstrap request.

The v210 app shell coordinates the explicit mobile lifecycle and shared unread-query handoff through:

```text
/js/core/session-lifecycle.js?v=4
/js/core/mobile-runtime-diagnostics.js?v=3
/js/core/unread-service.js?v=4
```

Session lifecycle v4 stops the explicit mobile runtime before general realtime teardown and reloads after tenant/account changes or a later sign-in on a stopped page.

Unread service v4 captures the authoritative room and attention helpers before installing two mobile compatibility adapters:

```text
NFA_computeRoomUnread
NFA_unreadCount
```

The existing mobile fallback/realtime paths still call those two names at their existing cadence. The adapters coalesce overlapping calls through one `UnreadService.refresh()` operation, which executes one room query and one attention query. It does **not** create another timer, fallback poll, DOM renderer or OS-badge writer. `mobile.js` remains the sole owner of cadence, live provisional increments, open-room zeroing, surgical row rendering and the mobile app badge.

Mobile diagnostics v3 reports shared-refresh ownership, adapter/coalescing counts, unread-event consumption, render passivity and the no-own-poll/no-own-badge invariants.

The existing reaction safeguard remains protected offline through:

```text
/js/runtime-subscription-guard.js?v=7
```

Guard v7 removes the duplicate desktop `mpgs-reactions-v1-<tenant>` channel only after both managed replacements have joined.

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
- `js/shared.js?v=208`
- `js/mobile-tasks.js?v=207`
- `js/activity-v208.js?v=207`

## Expected update behaviour

1. Browser detects changed `/sw.js`.
2. New worker installs and opens `taskflow-v210`.
3. Each app-shell asset is cached independently; one optional failure does not abort installation.
4. `skipWaiting()` activates the worker.
5. Old `taskflow-*` caches are deleted, while `share-inbox` is preserved.
6. `controllerchange` reloads the page once so the new HTML/JS runtime is used.
7. JS/CSS requests remain network-first when online and cache-fallback when offline.
8. Mobile unread cadence remains the existing mobile realtime/fallback cadence only.
9. The paired mobile compatibility calls coalesce through one shared query operation.
10. The shared service dispatches `niltask:unread-updated` but does not replace the live mobile count floor or mobile renderer.
11. MobileRuntime stops before shared channel teardown during logout/account/tenant cleanup.
12. A later sign-in reloads rather than resurrecting stale module-local channels.
13. On desktop, guard v7 retires the legacy reaction channel after both replacements join.

## Smoke checks

- Hard refresh preview once.
- Confirm Cache Storage contains `taskflow-v210` and removes `taskflow-v209` and older app-shell caches after activation.
- Confirm the exact v4/v3/v7 query-versioned runtime files exist in the cache.
- Run `NILTASK_printMobileRuntimeSnapshot()` on mobile.
- Confirm `acceptance.sharedUnreadHandoffInstalled` is `true`.
- Confirm `acceptance.sharedUnreadUsesOneRefresh` is `true`.
- Confirm `acceptance.sharedUnreadBypassesIndependentQueries` is `true`.
- Confirm `acceptance.sharedUnreadHasNoOwnPoll` is `true`.
- Confirm `acceptance.sharedUnreadHasNoOwnRenderer` is `true`.
- Confirm `acceptance.sharedUnreadHasNoOwnAppBadge` is `true`.
- Trigger the existing mobile unread fallback/realtime path and confirm adapter calls advance while `refreshCount` advances once for a paired call and `coalescedCalls` advances.
- Confirm visible room badges, bell and OS badge remain correct and change only once.
- Confirm no extra unread requests appear beyond one room query plus one attention query for each existing mobile refresh trigger.
- Sign out and sign in again; confirm one controlled reload and no prior-user unread callback.
- Reload while offline after one successful online load.
- Confirm `share-inbox` survives activation and no controller-change reload loop occurs.

## Rollback

If v210 causes unread, mobile cleanup, identity recovery, reaction or PWA-update regression:

1. Revert the coordinated unread v4, diagnostics v3, loader and `taskflow-v210` commits together.
2. Restore unread service v3 and diagnostics v2 with a new corrective cache generation; do not reuse a broken cache namespace.
3. Keep session lifecycle v4 unless the regression is specifically in cleanup/identity recovery.
4. Keep the PR draft and do not merge.
5. Clear preview service-worker/cache state manually only when normal update convergence cannot be tested.

Production remains unchanged until the owner explicitly approves the draft PR.
