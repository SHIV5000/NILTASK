# NILTASK Runtime Ownership Inventory

> **Purpose:** Current ownership map for timers, observers, listeners, Supabase channels and public runtime functions that can duplicate work or survive beyond their feature.
>
> **Authority:** Read `AI.md` → `PROFESSIONALIZATION_PLAN.md` → this inventory → `PROFESSIONALIZATION_PROGRESS.md`.
>
> **Branch:** `agent/activity-feed-no-flicker`
>
> **Updated:** 2026-07-26
>
> **Status:** IN PROGRESS — desktop Activity is now source-owned; realtime, notification, session and mobile ownership migration continues.

---

# 1. Ownership rules

1. Every interval, timeout, observer, event listener and Supabase channel must have one named owner.
2. Every owner must expose or document a cleanup path.
3. Reopening a screen or restarting subscriptions must not create a second active copy.
4. Compatibility adapters may delegate to services, but must not recursively wrap other wrappers.
5. Realtime is the fast path; database reconciliation is the correctness path.
6. Desktop and mobile may use different views but must share unread, notification and task rules.
7. A response fetched for an old user or tenant must never update the current UI.
8. Document-wide presentation observers are not permitted in the target architecture.

---

# 2. Activity Feed — current authoritative owner

## 2.1 Owner: `js/ui-feed.js`

`ui-feed.js` now directly owns all desktop Activity behaviour:

- `window.openActivityFeed()`;
- `window.closeActivityFeed()`;
- `window._loadActivityFeed()`;
- `window.refreshActivityFeed()`;
- `window.prependFeedItem()`;
- fixed compact header and filter markup;
- Activity Type and Person filter state;
- card/date-group rendering;
- clear-one and clear-all;
- Task/message navigation;
- mark-read behaviour on open;
- canonical unread-count refresh;
- one 60-second fallback interval in `window._afPollTimer`;
- overlapping-load coalescing;
- 250 ms realtime refresh debounce;
- atomic DOM replacement;
- scroll-position preservation;
- stale user/tenant response rejection;
- non-destructive refresh failures.

Runtime marker:

```text
NILTASK_ACTIVITY_CONTROLLER_VERSION = v1
```

The public functions carry:

```text
__nfaActivityController = true
```

## 2.2 Cleanup

`closeActivityFeed()`:

- clears `_afPollTimer`;
- clears the refresh debounce;
- removes the panel;
- restores Task controls.

`SessionLifecycle.cleanup()` also closes Activity and clears the same timer during logout or tenant change.

## 2.3 Retired Activity layers

### `js/activity-v208.js`

Current state:

- harmless compatibility entrypoint;
- no longer imports `activity-v207.js`;
- creates no wrapper;
- creates no observer.

### `js/activity-v207.js`

Current state:

- remains in the repository for historical reference;
- no longer loaded through `activity-v208.js`;
- its former `openActivityFeed()` and `_loadActivityFeed()` wrappers are inactive;
- its former `document.body` observer is inactive.

### `js/activity-feed-stability.js`

Current state:

- no longer dynamically loaded from `js/utils/text.js`;
- source-owned Activity now contains its useful coalescing, scroll and fallback logic;
- the file can be deleted after preview regression checks confirm no rollback need.

## 2.4 Activity acceptance checks

After a clean page load:

```text
activity.controllerVersion = v1
activity.legacyStabilityLoaded = false
openActivityFeed.activityController = true
_loadActivityFeed.activityController = true
observers.documentWideActivityObserver = false
```

Open and close Activity ten times. Exactly one `_afPollTimer` may exist while open and none after close.

---

# 3. Task filter presentation

## Owner: `js/compact-panel-filters.js`

The file is now Task-only.

It owns:

- compact Filter and Sort selects;
- concise option labels;
- moving the existing functional selects into labelled wrappers;
- hiding legacy pill rows;
- hiding Task controls while Activity is open.

Observer scope:

```text
#rightSidebar
```

It no longer:

- scans `document.body`;
- moves Activity filters;
- decorates Activity cards;
- changes Activity colours or header markup.

Cleanup:

- exposes `NILTASK_CompactTaskFilters.dispose()`;
- disconnects on `niltask:session-cleaned`.

---

# 4. RealtimeManager

## Owner: `js/core/realtime-manager.js`

Provides:

- canonical topic inspection;
- safe channel removal;
- named owner registration;
- owner cleanup;
- topic cleanup;
- operation coalescing;
- runtime snapshots;
- full channel destruction during session cleanup.

Public service:

```text
window.NILTASK_RealtimeManager
```

---

# 5. Managed desktop realtime topics

## Owner: `js/core/realtime-feature-owners.js`

Desktop/PWA only. Mobile exits this migration path immediately.

Named owners:

| Owner | Topic | Responsibility |
|---|---|---|
| `desktop-shared-broadcast` | `taskflow-bc-<tenant>` | profile, reaction, group-photo and typing sync |
| `desktop-scheduled-messages` | `scheduled-changes` | scheduled-message sent status |
| `desktop-notification-rows` | `notifications-changes` | user notification INSERT events |

The service stops the previous owner and removes stale legacy copies before recreation.

Acceptance target:

```text
scheduled-changes       count = 1
notifications-changes   count = 1
taskflow-bc-<tenant>    count = 1
```

Mobile must not show these desktop owner records.

---

# 6. Legacy desktop realtime still awaiting migration

## Owner today: `js/main.js::startSubscriptions()`

Module-scoped references that clean before replacement:

- `messageSubscription`;
- `taskSubscription`;
- `assigneeSubscription`;
- `trailSubscription`;
- `notificationSubscription` legacy reference, although the active notification topic is recreated by feature owners.

Remaining topics:

### `public:messages-<tenant>`

Carries:

- message INSERT;
- reaction INSERT/DELETE backup;
- message UI refresh;
- message notification calls;
- Activity refresh requests.

### `mpgs-reactions-v1-<tenant>`

Carries legacy web broadcasts:

- reaction add/remove;
- group-photo updates;
- typing.

### `tasks-changes`

Calls the debounced Task panel loader.

### `assignees-changes`

Calls the debounced Task panel loader.

### `trails-changes`

Reloads Tasks and requests Activity refresh.

Migration order:

1. Task/assignee/trail channels as one Task owner group.
2. Message/reaction channels as one Message owner group.
3. Remove `runtime-subscription-guard.js` after all desktop topics are directly owned.

---

# 7. Notification presentation

## Temporary owner: `js/notification-presentation-service.js`

Owns the current presentation boundary for:

- stable message event keys;
- stable notification-row keys;
- duplicate toast suppression;
- immediately paired duplicate-sound suppression;
- one message sound authority;
- system notifications;
- vibration;
- bell animation and badge refresh calls;
- Activity refresh requests.

Public boundaries:

```text
NILTASK_shouldPresentEvent(key, ttl)
NILTASK_presentNotificationRow(notification)
```

Target replacement:

```text
NotificationService
```

The final service must own normalization, event keys, toast, sound, system push decisions and badge reconciliation without wrapping global functions.

---

# 8. Unread and badge authority

Current shared calculation:

- `js/core/unread.js` supplies canonical notification counting helpers;
- desktop still performs local optimistic room increments;
- mobile has independent catch-up and badge paths;
- notification rows and unread messages can represent the same event.

Target:

```text
UnreadService
```

Requirements:

- database-backed reconciliation is authoritative;
- message-related notification rows are deduplicated against room unread state;
- optimistic increments must be replaced by the next reconciliation result;
- desktop, mobile, PWA and Android badge values must converge.

---

# 9. Session lifecycle

## Owner: `js/core/session-lifecycle.js`

Handles:

- logout boundary;
- Supabase auth-state changes;
- account changes;
- tenant changes;
- Activity timer/panel cleanup;
- presence and typing timer cleanup;
- full realtime cleanup;
- push-token/subscription detachment;
- service-worker auth deletion;
- logger flush/stop;
- cache and app-badge reset;
- final in-memory session reset.

Every best-effort async step is time-bounded so logout cannot hang indefinitely.

---

# 10. Desktop timers and listeners

| Resource | Current owner | Cleanup/status |
|---|---|---|
| `_afPollTimer` | `ui-feed.js` | close Activity + SessionLifecycle |
| Activity refresh debounce | `ui-feed.js` private state | close Activity |
| `_taskPanelTimer` | `main.js` | cleared before replacement |
| `_webTypingTimer` | `main.js` | cleared before replacement + SessionLifecycle |
| `_webHeartbeat` | `main.js` | guarded; SessionLifecycle clears |
| visibility badge listener | `main.js` | installed once through `_webVisWired` |
| reaction badge delay | `main.js` | one-shot; future NotificationService reconciliation |

---

# 11. Mobile realtime and runtime resources

## Current primary owners: `js/mobile.js`

Channels:

- `_rtChannel` on `mobile-rt-<tenant>`;
- `_presenceChannel` on `presence-<tenant>`.

Positive controls already present:

- channel creation guards;
- intentional-close flag;
- remove-channel during reconnect;
- exponential reconnect backoff;
- message-ID deduplication;
- tenant and DM privacy guards;
- catch-up reconciliation after recovery.

Runtime references requiring exact lifecycle verification:

- `_tsInterval`;
- `_notifPoll`;
- `_rtReconnectTimer`;
- `_notifFallbackInterval`;
- `_fallbackTimer`;
- `_activityPoll`;
- `_typingTimers` map;
- outage/backoff timers;
- keyboard requestAnimationFrame handle;
- mobile MutationObservers in `mobile.js` and `mobile-tasks.js`.

Required work:

1. map every creation and clear path;
2. verify screen navigation clears `_activityPoll`;
3. verify wake/visibility does not duplicate fallback timers;
4. verify logout removes both mobile channels;
5. scope or remove mobile observers;
6. share unread/notification rules with desktop.

---

# 12. Native bridge

## Owner: `js/native.js`

Runtime resources:

- splash-hide timeout;
- native back-button listener;
- push notification listeners;
- 3-second token ownership/save retry interval.

Known issue:

- token polling reference is not centrally stored and cleared.

Target:

- native lifecycle owner with explicit install, restart and destroy methods.

---

# 13. Logger

## Owner: `js/utils/logger.js`

Owns:

- 60-second routine flush interval;
- pagehide and visibility listeners;
- auth-state listener;
- global error and rejection capture;
- console warning/error mirroring;
- critical-log deduplication;
- healthy realtime lifecycle sampling.

Completed:

- batch threshold 30;
- routine flush 60 seconds;
- repeated critical suppression 30 seconds;
- no browser-side IP lookup;
- realtime failures remain immediate.

SessionLifecycle flushes and stops its timer on logout.

---

# 14. MutationObserver inventory

## Active and feature-scoped

- `compact-panel-filters.js` → `#rightSidebar` only.

## Retired/inactive

- Activity decorator `document.body` observer;
- Activity fallback panel-open observer;
- compact filter `document.body` observer.

## Still requiring review

- observer(s) in `mobile.js`;
- observer(s) in `mobile-tasks.js`.

Target:

- observers only when direct event/controller ownership is impossible;
- observe the smallest feature root;
- disconnect on feature or session destroy.

---

# 15. Priority checklist

## P0 — correctness and duplication

- [x] Contain scheduled-message subscription leak.
- [x] Clean/re-own desktop shared broadcast before recreation.
- [x] Route notification rows through one presentation boundary.
- [x] Add central logout and tenant cleanup.
- [x] Remove desktop Activity wrapper chain.
- [x] Remove document-wide desktop Activity observers.
- [ ] Establish shared `UnreadService` authority.
- [ ] Migrate remaining desktop channels to named owners.
- [ ] Verify all mobile timer/channel cleanup paths.

## P1 — Activity stability

- [x] Put 60-second fallback directly in `ui-feed.js`.
- [x] Render filters directly in the final header.
- [x] Preserve scroll during refresh.
- [x] Coalesce overlapping loads.
- [x] Reject stale tenant/user responses.
- [ ] Complete repeated preview smoke checks.

## P2 — lifecycle hygiene

- [x] Add shared realtime cleanup registry.
- [x] Add on-demand duplicate-channel diagnostics.
- [ ] Trace every mobile timer creation/clear path.
- [ ] Scope or remove mobile observers.
- [ ] Add automated browser regression checks.

---

# 16. Runtime acceptance checks

Before a phase is accepted:

1. Open and close Activity ten times; exactly one fallback interval exists only while open.
2. Keep Activity open past 60 seconds; no blank frame, jump or scroll reset occurs.
3. Change Activity Type and Person filters repeatedly; controls remain fixed in the header.
4. Call subscription startup repeatedly; exactly one channel per intended topic exists.
5. Background and foreground the tab; badge reconciliation does not install duplicate listeners.
6. Simulate realtime disconnect/reconnect; exactly one catch-up refresh occurs.
7. Trigger one message, reaction, Task and reminder; each produces at most one sound and one visible alert per recipient.
8. Log out and log in as another user; no previous-user timer, channel or cached identity remains.
9. Run desktop and mobile for at least 30 minutes; callback counts and console errors do not grow over time.
10. Run `NILTASK_printRuntimeSnapshot()` and retain the result with the smoke-test record.
