# NILTASK Professionalization Progress Ledger

> **Purpose:** Append-only engineering record of work completed under `PROFESSIONALIZATION_PLAN.md`.
>
> Read order for future sessions: `AI.md` → `PROFESSIONALIZATION_PLAN.md` → `RUNTIME_OWNERSHIP_INVENTORY.md` → this ledger.
>
> **Merge rule:** No merge into `main` without explicit owner approval and relevant smoke checks.

---

## 2026-07-26 — Phase 0 started

### Documentation established

- Created `PROFESSIONALIZATION_PLAN.md` as the permanent execution and release plan.
- Created `RUNTIME_OWNERSHIP_INVENTORY.md` to map timers, observers, listeners, realtime channels and public-function replacement.
- Created `SMOKE_TEST_CHECKLIST.md` as the repeatable manual acceptance baseline.
- Preserved `AI.md` as the binding product and functionality contract.

### Diagnostics and production-noise cleanup

- Routine logger flush changed to 60 seconds.
- Routine batch threshold increased to 30 rows.
- Repeated warning/error bursts deduplicated for 30 seconds.
- Healthy realtime status logs sampled while failure states remain immediate.
- Removed browser-side `api.ipify.org` lookup and associated CORS noise.

### Activity Feed containment

- Added refresh snapshot protection and scroll preservation.
- Coalesced overlapping refresh requests.
- Changed fallback polling to 60 seconds while realtime remains immediate.
- Removed the `openActivityFeed()` wrapper that previously caused a recursive wrapper cycle.
- Removed the body-wide observer that existed only to replace the Activity poll timer.
- Kept current filters and compact header presentation functioning in the preview.

### Desktop subscription containment

Verified defects in the legacy `startSubscriptions()` path:

1. `scheduledSubscription` is declared locally, so repeated startup cannot unsubscribe the previous scheduled-message channel.
2. `window._sharedBroadcast` can be replaced without explicitly disposing the previous shared channel.

Temporary Phase 0 containment added:

- `js/runtime-subscription-guard.js` installs one marked compatibility adapter around `startSubscriptions()`.
- Before each repeated startup, it removes existing `scheduled-changes` channels.
- On desktop, it also removes the existing tenant `taskflow-bc-<tenant_id>` channel and clears the stale global reference.
- Simultaneous startup requests are coalesced into one in-flight operation.
- Installation polling is bounded and stops after installation or timeout.

This is not the final architecture. During the Realtime Manager phase, channel ownership will move into a direct service and this compatibility guard will be deleted.

### Notification presentation containment

Verified duplication sources:

- desktop message realtime may call `playSound('message')`;
- `triggerMessageNotification()` separately generated another Web Audio chime;
- reconnect or duplicate delivery could invoke presentation more than once for the same message;
- duplicate notification-row callbacks could repeat the same toast and its immediately paired sound.

Temporary Phase 0 containment added:

- `js/notification-presentation-service.js` installs marked message, toast and sound presentation boundaries;
- stable message keys use `message:<message_id>` where possible;
- stable notification-row support uses `notification:<notification_id>` where possible;
- duplicate notification toast signatures are suppressed for a short in-memory window;
- when a duplicate notification toast is rejected, exactly its immediately paired sound call is suppressed;
- distinct later notifications of the same category are not globally muted;
- message alert sound uses the existing debounced `playSound('message')` authority;
- vibration, system-notification and room-level notification grouping remain available;
- `window.NILTASK_presentNotificationRow()` is exposed for the future direct NotificationService callback migration.

This is temporary. The final NotificationService must directly own normalization, event keys, toast/sound/push decisions and badge reconciliation without compatibility replacement.

### Realtime Manager foundation

Created `js/core/realtime-manager.js` as the first shared runtime ownership service.

It currently provides:

- canonical channel topic inspection;
- safe channel removal;
- owner-to-channel registration;
- owner cleanup;
- topic-based duplicate cleanup;
- named operation coalescing;
- a diagnostic snapshot of browser channels, owners and in-flight starts;
- full cleanup support for future logout/tenant-change handling.

The subscription guard now delegates duplicate-topic cleanup and startup coalescing to this manager when available. Existing feature queries and callbacks remain unchanged in this phase.

### Central session lifecycle

Created `js/core/session-lifecycle.js` as the authoritative cleanup boundary for logout, account changes and tenant-context changes.

It now:

- wraps the existing `logout()` function once with a marked compatibility adapter;
- listens for Supabase `SIGNED_OUT`, `SIGNED_IN`, `INITIAL_SESSION` and token-refresh events;
- detects an actual tenant change after `loadTenantContext()`;
- closes Activity and clears its fallback timer and refresh snapshots;
- clears desktop heartbeat, presence and typing timers;
- destroys active Supabase realtime channels through `RealtimeManager` with a direct-client fallback;
- clears stale shared/reaction channel references;
- detaches the current browser Web Push subscription or native device token from the outgoing user before sign-out;
- removes service-worker authentication data while preserving other IndexedDB preferences;
- flushes and stops the session logger timer;
- clears user, tenant, role, permission, cache, unread and app-badge state after sign-out;
- reloads after a genuine same-user tenant change so page-lifetime legacy observers cannot continue under the previous tenant;
- bounds every best-effort async cleanup step so logout cannot hang because of network, push, logging, realtime or IndexedDB work.

The original logout still owns tenant-prefixed localStorage deletion and navigation. Context reset is guaranteed in a final block even if the `SIGNED_OUT` callback overlaps cleanup.

Temporary Activity presentation observers are still page-lifetime compatibility layers. Logout or tenant-change reload destroys them with the page; they will be removed directly when the single-owner Activity renderer replaces both decorators.

### On-demand runtime diagnostics

Created `js/core/runtime-diagnostics.js`.

It does not log or poll automatically. In a preview console, developers may call:

```javascript
NILTASK_runtimeSnapshot()
NILTASK_printRuntimeSnapshot()
```

The snapshot records:

- current browser Supabase channel topics;
- RealtimeManager owners and in-flight operations;
- Activity panel/open state;
- loaded containment versions;
- wrapper markers on critical public functions;
- known Activity, presence and typing timers;
- current user, tenant and room identifiers;
- SessionLifecycle installation and cleanup state.

This gives repeatable evidence for duplicate channels and wrapper ownership without adding visible UI.

### Current branch and release state

- Branch: `agent/activity-feed-no-flicker`
- Draft PR: `#204`
- `main`: unchanged
- Production: unchanged

### Next work

1. Verify logout with `NILTASK_printRuntimeSnapshot()` before and after cleanup in the Vercel preview.
2. Move scheduled-message and shared-broadcast channel construction directly into RealtimeManager ownership.
3. Route the legacy notification-row realtime callback directly through `NILTASK_presentNotificationRow()`.
4. Preserve database-backed unread reconciliation as authoritative.
5. Begin the single-owner Activity controller so both remaining body-wide presentation observers can be deleted.