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

### Current branch and release state

- Branch: `agent/activity-feed-no-flicker`
- Draft PR: `#204`
- `main`: unchanged
- Production: unchanged

### Next work

1. Verify the notification-row toast/sound boundary in the Vercel preview.
2. Add a development-only runtime diagnostics view using `NILTASK_RealtimeManager.snapshot()`.
3. Map and centralize logout/tenant-change cleanup for channels, timers and observers.
4. Move the scheduled-message and shared-broadcast channel construction directly into RealtimeManager ownership.
5. Preserve database-backed unread reconciliation as authoritative.
6. Continue toward a single NotificationService and single-owner Activity controller.