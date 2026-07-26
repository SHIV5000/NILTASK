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
- It then delegates once to the original subscription function.
- Installation polling is bounded and stops after installation or timeout.

This is not the final architecture. During the Realtime Manager phase, channel ownership will move into a direct service and this compatibility guard will be deleted.

### Notification presentation containment

Verified duplication source:

- desktop message realtime may call `playSound('message')`;
- `triggerMessageNotification()` separately generated another Web Audio chime;
- reconnect or duplicate delivery could invoke presentation more than once for the same message.

Temporary Phase 0 containment added:

- `js/notification-presentation-service.js` installs one marked message-presentation boundary;
- stable keys use `message:<message_id>` where possible;
- the same message event is suppressed for a short in-memory window;
- message alert sound now uses the existing debounced `playSound('message')` authority;
- vibration and system-notification behaviour remain available;
- the original notification function is retained only as a compatibility reference and is not called by the replacement.

This is also temporary. The final NotificationService must directly own normalization, event keys, toast/sound/push decisions and badge reconciliation without compatibility replacement.

### Current branch and release state

- Branch: `agent/activity-feed-no-flicker`
- Draft PR: `#204`
- `main`: unchanged
- Production: unchanged

### Next work

1. Verify the subscription and notification guards in the Vercel preview.
2. Map notification-row INSERT handling against message realtime and mobile heads-up behaviour.
3. Route notification rows through stable event keys instead of presenting directly inside realtime callbacks.
4. Preserve database-backed unread reconciliation as authoritative.
5. Continue toward a single NotificationService and RealtimeManager.
