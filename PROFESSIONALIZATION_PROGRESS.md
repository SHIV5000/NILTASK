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

These containment layers were later superseded by the source-owned Activity controller documented below.

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
- reloads after a genuine same-user tenant change so page-lifetime legacy resources cannot continue under the previous tenant;
- bounds every best-effort async cleanup step so logout cannot hang because of network, push, logging, realtime or IndexedDB work.

The original logout still owns tenant-prefixed localStorage deletion and navigation. Context reset is guaranteed in a final block even if the `SIGNED_OUT` callback overlaps cleanup.

### Single-owner desktop Activity controller

`js/ui-feed.js` is now the sole desktop Activity implementation and owns the feature directly rather than being decorated by later scripts.

It now owns:

- opening and closing the panel;
- final compact header markup;
- fixed Activity Type and Person filters in their final location;
- card and date-separator rendering;
- indigo Task activity accents;
- clear-one and clear-all behaviour;
- exact Task/message navigation strings;
- database-backed unread count refresh;
- mark-read behaviour on open;
- realtime-triggered refresh requests;
- one canonical 60-second fallback interval;
- overlapping-load coalescing;
- refresh debounce;
- atomic list replacement;
- scroll-position preservation;
- stale user/tenant response rejection;
- non-destructive refresh failure handling.

Removed from the desktop Activity runtime:

- the `activity-v207.js` wrappers around `openActivityFeed()` and `_loadActivityFeed()`;
- the Activity presentation `document.body` MutationObserver;
- the Activity stability wrapper and dynamically loaded stabilizer;
- the compact-filter script's Activity DOM movement and Activity card rescans.

`js/activity-v208.js` remains only as a harmless retired compatibility entrypoint and no longer imports the old decorator. `js/compact-panel-filters.js` is now Task-only and its MutationObserver is scoped to `#rightSidebar`, not `document.body`.

The canonical functions expose the `__nfaActivityController` marker and `NILTASK_ACTIVITY_CONTROLLER_VERSION = 'v1'` for diagnostics.

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
- source-owned Activity controller version;
- retired legacy Activity state;
- wrapper markers on critical public functions;
- known Activity, presence and typing timers;
- current user, tenant and room identifiers;
- SessionLifecycle installation and cleanup state;
- confirmation that document-wide Activity and compact-filter observers are absent.

Acceptance target for desktop after startup:

```text
scheduled-changes       count = 1
notifications-changes   count = 1
taskflow-bc-<tenant>    count = 1
```

The owner table must contain the three named desktop owners above. Mobile must not contain those desktop owner records.

Activity acceptance target:

```text
activity.controllerVersion       = v1
activity.legacyStabilityLoaded   = false
observers.documentWideActivityObserver = false
openActivityFeed.activityController    = true
_loadActivityFeed.activityController   = true
```

---

## 2026-07-26 — Unread authority and expanded Task realtime ownership

### Shared unread and badge authority

Created `js/core/unread-service.js` and `UNREAD_AUTHORITY.md`.

Canonical formula:

```text
global unread = sum(per-room message unread) + non-message attention unread
```

Implementation now:

- derives durable per-room message unread from `room_reads + messages`;
- counts attention notifications while excluding `message`, `reply` and `mention` rows to prevent double-counting;
- scopes `room_reads` by both current user and tenant;
- caches the last successful attention count separately per user;
- coalesces desktop/PWA refreshes and rejects stale user/tenant responses;
- publishes `window.unreadCounts` for compatibility;
- owns the desktop top-bar bell, room badges and PWA app badge;
- clears only the opened room optimistically, then reconciles with database truth;
- refreshes on visibility/network/subscription recovery;
- resets on the central session-cleanup event;
- delegates `_setBellBadge`, `_incrementBellBadge`, `_clearBellBadge` and `refreshNotificationBadge` on desktop/PWA;
- exposes the unread split in runtime diagnostics.

Initial mobile safety boundary:

- UnreadService was passive on mobile;
- it added no automatic mobile query, observer, badge override or app-badge write;
- it added no second polling cadence.

That initial boundary was superseded by the explicit shared-query handoff below.

### Expanded desktop Task realtime owners

`js/core/realtime-feature-owners.js` now also owns:

- `desktop-tasks` → `tasks-changes`;
- `desktop-task-assignees` → `assignees-changes`;
- `desktop-task-trails` → `trails-changes`.

Task INSERT/UPDATE events are server-filtered by `tenant_id`. DELETE events retain a client tenant guard so deletion refresh remains reliable even when replica identity omits non-key columns.

The three channels preserve:

- debounced Task Hub refresh;
- Activity refresh for trail events;
- replacement rather than accumulation on repeated subscription startup;
- central logout/tenant cleanup through RealtimeManager.

New desktop acceptance target:

```text
taskflow-bc-<tenant>    count = 1
scheduled-changes       count = 1
notifications-changes   count = 1
tasks-changes           count = 1
assignees-changes       count = 1
trails-changes           count = 1
```

### Current branch and release state

- Branch: `agent/activity-feed-no-flicker`
- Draft PR: `#204`
- `main`: unchanged
- Production: unchanged

---

## 2026-07-26 — Explicit mobile lifecycle and shared unread-query handoff

### Mobile lifecycle boundary

- Added `NILTASK_MobileRuntime` before `mobile.js` evaluation.
- Tracks mobile-originated timers, intervals, animation frames, persistent listeners, observers and `mobile-rt-*` / `presence-*` channels.
- `stop()` clears owned resources, removes mobile channels and blocks reconnect work on the stopped page.
- Restart is reload-only so stale module-local channel references cannot be resurrected.
- SessionLifecycle v4 stops mobile runtime before general realtime teardown.
- Tenant change, account change and sign-in after prior cleanup schedule one controlled reload.
- VM behavioral testing proves cleanup, reconnect suppression, desktop-resource preservation and reload-only restart.

### Shared mobile unread query ownership

UnreadService v4 now owns the mobile database query pair without adding another cadence:

- captures the original `NFA_computeRoomUnread` and `NFA_unreadCount` helpers;
- installs marked compatibility adapters under the same names;
- coalesces the paired calls from existing mobile fallback/reconnect paths through one in-flight `UnreadService.refresh()`;
- performs one room query and one attention query per existing mobile refresh trigger;
- does not schedule a deferred second refresh when the paired call joins in flight;
- dispatches and consumes `niltask:unread-updated` for shared state diagnostics;
- does not write mobile `window.unreadCounts`, preserving the live provisional floor;
- creates no mobile timer, poll, DOM renderer or app-badge writer;
- restores original helpers on disposal.

`mobile.js` remains authoritative for:

- six-second foreground / sixty-second background cadence;
- realtime live increments and replication-lag grace;
- database/live-floor merge;
- open-room zeroing;
- surgical row patching;
- bell and mobile OS badge rendering;
- open-chat catch-up.

### Diagnostics and automated proof

- Mobile diagnostics v3 reports shared-refresh ownership, adapter calls, refresh/coalesced counts and unread-event consumption.
- Acceptance explicitly rejects independent helper-query ownership and any shared mobile poll, renderer or app-badge writer.
- `npm run test:mobile-unread` executes the real service in a VM and proves:
  - paired calls produce one room query and one attention query;
  - no hidden second refresh runs;
  - mobile live counts are not overwritten;
  - the shared service writes no mobile app badge;
  - disposal restores original helpers.
- Professionalization validation statically locks the same ownership contract.
- GitHub Actions passed runtime contracts, mobile lifecycle, mobile unread, PWA assets and Tailwind verification on the exact head.
- Vercel preview deployment succeeded for the exact tested head.

### PWA coordination

- Cache generation: `taskflow-v210`.
- Exact offline assets include unread service v4, mobile diagnostics v3 and session lifecycle v4.
- Old app-shell caches are removed while `share-inbox` is preserved.

### Remaining pre-merge acceptance

1. Authenticate on a real mobile device and verify one `mobile-rt-*` plus one `presence-*` channel.
2. Verify paired unread requests occur once per existing trigger and counts change exactly once.
3. Verify live provisional counts survive database replication lag.
4. Verify open-room zeroing, DMs, attention, row badges, bell and OS badge parity.
5. Background/resume repeatedly and keep the app open for at least 30 minutes.
6. Sign out/sign in and switch tenant/account where available; verify one reload and no prior-user callback.
7. Verify installed-PWA update convergence and offline reload.
8. Keep PR #204 draft and do not merge until explicit owner approval.
