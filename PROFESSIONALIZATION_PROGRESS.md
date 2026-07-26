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
- Before repeated desktop startup, it removes stale managed-topic copies.
- Simultaneous desktop startup requests are coalesced into one in-flight operation.
- Installation polling is bounded and stops after installation or timeout.
- Mobile calls bypass this migration path and invoke the original startup directly.

The guard remains a migration bridge. It must be deleted after every desktop channel is directly constructed through permanent services.

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
- `window.NILTASK_presentNotificationRow()` is exposed as the central row-presentation boundary.

This remains temporary until a final `NotificationService` directly owns normalization, event keys, toast/sound/push decisions and badge reconciliation.

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
- full cleanup support for logout and tenant changes.

### Managed desktop realtime feature owners

Created `js/core/realtime-feature-owners.js`.

After the legacy desktop startup finishes, it removes the legacy copies and recreates these topics under explicit `RealtimeManager` owners:

- `desktop-shared-broadcast` → `taskflow-bc-<tenant_id>`;
- `desktop-scheduled-messages` → `scheduled-changes`;
- `desktop-notification-rows` → `notifications-changes`.

Preserved shared-broadcast behaviour:

- profile updates;
- reaction add/remove;
- group-photo updates;
- profile-update broadcasts;
- typing indicators;
- existing `window._sharedBroadcast` send compatibility.

Preserved scheduled-message behaviour:

- sender-only sent-status handling;
- scheduled-message toast and sound;
- group-member notification dispatch;
- badge refresh;
- current-room message reload.

Additional controls:

- scheduled sent-status presentation uses a stable short-lived event key;
- notification rows now route directly through `NILTASK_presentNotificationRow()` when available;
- notification callbacks retain explicit current-user and tenant guards;
- repeated startup replaces named owners instead of accumulating channels;
- all three managed owners are destroyed by `SessionLifecycle` through `RealtimeManager`;
- the feature-owner module is desktop/PWA-only and stops immediately on mobile;
- the subscription guard performs no cleanup, topic inspection or coalescing on mobile.

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

- current browser Supabase channel topics and per-topic counts;
- RealtimeManager named owners and in-flight operations;
- managed desktop feature-owner identity and state;
- Activity panel/open state;
- loaded containment versions;
- wrapper markers on critical public functions;
- known Activity, presence and typing timers;
- current user, tenant and room identifiers;
- SessionLifecycle installation and cleanup state.

Acceptance target for desktop after startup:

```text
scheduled-changes       count = 1
notifications-changes   count = 1
taskflow-bc-<tenant>    count = 1
```

The owner table must contain the three named desktop owners above. Mobile must not contain those desktop owner records.

### Current branch and release state

- Branch: `agent/activity-feed-no-flicker`
- Draft PR: `#204`
- `main`: unchanged
- Production: unchanged

### Next work

1. Verify the three managed topics and owners using `NILTASK_printRuntimeSnapshot()` in the Vercel preview.
2. Verify scheduled-message and notification-row behaviour once each without repeated sound/toast.
3. Preserve database-backed unread reconciliation as authoritative.
4. Begin the single-owner Activity controller so both remaining body-wide presentation observers can be deleted.
5. Move remaining desktop channels into direct RealtimeManager ownership in controlled groups.