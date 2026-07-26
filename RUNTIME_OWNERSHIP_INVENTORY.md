# NILTASK Runtime Ownership Inventory

> **Purpose:** Phase 0 inventory of runtime resources that can duplicate work or survive longer than their feature: timers, observers, event listeners, Supabase channels and replacements of public `window.*` functions.
>
> **Authority:** Read `AI.md` first, then `PROFESSIONALIZATION_PLAN.md`, then this inventory.
>
> **Branch inspected:** `agent/activity-feed-no-flicker`
>
> **Started:** 2026-07-26
>
> **Status:** IN PROGRESS — critical Activity, web realtime, mobile realtime, native bridge, logger and shared wrapper paths have been inspected. The inventory must be updated whenever ownership is changed.

---

# 1. Ownership rules

1. Every interval, timeout, observer, event listener and Supabase channel must have one named owner.
2. The owner must expose or document its cleanup path.
3. Reopening a screen or restarting subscriptions must not create a second active copy.
4. A compatibility adapter may delegate to a service, but must not wrap another wrapper recursively.
5. Body-wide MutationObservers are temporary compatibility measures, not the target architecture.
6. Realtime is the fast path; database reconciliation is the correctness path.
7. Desktop and mobile may have different views but must not independently invent unread, notification, task or Activity rules.

---

# 2. Activity Feed runtime map

## 2.1 Base owner — `js/ui-feed.js`

Owns:

- `window.openActivityFeed()`;
- `window.closeActivityFeed()`;
- `window._loadActivityFeed()`;
- `window.refreshActivityFeed()`;
- `window.prependFeedItem()`;
- Activity filter state;
- Activity Supabase queries through shared feed construction;
- the base fallback timer `window._afPollTimer`;
- mark-read behaviour when the panel opens.

Current cleanup:

- `closeActivityFeed()` clears `window._afPollTimer`;
- removes `#activityFeedPanel`;
- restores the Task panel controls.

Known issue:

- the base module still creates a 12-second fallback interval. The stability layer currently replaces that interval with 60 seconds after the initial load. The final single-owner Activity rebuild must move 60 seconds into `ui-feed.js` or its replacement service directly.

## 2.2 Presentation decorator — `js/activity-v207.js`

Owns temporarily:

- styles for Activity and notification cards;
- decoration of web/mobile Activity DOM;
- wrappers around `openActivityFeed()` and `_loadActivityFeed()`;
- one body-wide `MutationObserver`;
- a 300 ms installation retry interval, capped at 15 seconds;
- a short decoration debounce timeout.

Risks:

- replaces public Activity functions;
- observes the entire document body;
- decorates DOM after render instead of rendering the final DOM once;
- can conflict with later wrappers and presentation controllers.

Target:

- remove wrappers and body observer after the final Activity view owns its markup and styles.

## 2.3 Refresh stabilizer — `js/activity-feed-stability.js`

Owns temporarily:

- outer wrapper around `_loadActivityFeed()`;
- refresh coalescing;
- scroll preservation;
- snapshot protection during refresh;
- wrappers around `refreshActivityFeed()` and `prependFeedItem()`;
- a bounded installation retry interval;
- replacement of the base fallback timer with a 60-second interval.

Completed cleanup:

- does not wrap `openActivityFeed()`;
- no longer uses a body-wide MutationObserver to detect panel opening;
- schedules the timer replacement from the initial Activity load instead;
- preserves the `__nfa207` marker to avoid a wrapper cycle.

Remaining target:

- merge this behaviour into the final Activity controller and delete the wrapper layer.

## 2.4 Compact presentation controller — `js/compact-panel-filters.js`

Owns temporarily:

- moving the actual Activity filter row into the fixed header;
- compact Activity card classes;
- indigo Task Activity accents;
- compact Task Filter and Sort controls;
- hiding the Task filter bar while Activity is open;
- one body-wide `MutationObserver` with a zero-delay debounce.

Risks:

- observes every subtree mutation in `document.body`;
- repeatedly scans Activity and Task controls;
- presentation depends on moving freshly rendered nodes after each load.

Target:

- Activity header and filter controls must be rendered in their final location by the single Activity view;
- Task filters must be rendered directly as compact selects by the Task view;
- remove the observer entirely.

## 2.5 Current Activity wrapper chain

```text
ui-feed.js base functions
  → activity-v207.js presentation wrappers
  → activity-feed-stability.js refresh wrapper
```

`compact-panel-filters.js` does not wrap the functions but mutates the resulting DOM.

No additional Activity wrapper may be added.

---

# 3. Desktop web realtime and timers — `js/main.js`

## 3.1 Module-owned subscription references

Declared at module scope:

- `messageSubscription`;
- `taskSubscription`;
- `assigneeSubscription`;
- `trailSubscription`;
- `notificationSubscription`.

`startSubscriptions()` unsubscribes these before replacing them.

## 3.2 Channels created by `startSubscriptions()`

### `public:messages-<tenant>`

Carries:

- reaction INSERT/DELETE;
- message INSERT;
- message notification/UI handling;
- Activity refresh requests.

### `mpgs-reactions-v1-<tenant>`

Legacy web broadcast channel for:

- reaction;
- reaction removal;
- group photo;
- typing.

The old reference is unsubscribed before replacement.

### `taskflow-bc-<tenant>`

Desktop cross-platform broadcast/profile channel.

Verified risk:

- the existing `window._sharedBroadcast` is not explicitly unsubscribed before a new one is assigned when `startSubscriptions()` runs again.

Required fix:

- unsubscribe/remove the previous shared channel before recreation;
- null the reference during cleanup.

### `scheduled-changes`

Carries scheduled-message UPDATE events.

Verified subscription leak:

- `let scheduledSubscription = null` is declared inside `startSubscriptions()`;
- it is therefore reset to `null` on every call;
- the previous channel cannot be unsubscribed by the next call;
- repeated subscription startup can create duplicate scheduled-message handlers, sounds, notifications and reloads.

Required fix — HIGH PRIORITY:

- move `scheduledSubscription` to module scope beside the other subscription references;
- unsubscribe it before replacement;
- include it in the future central realtime manager.

### `tasks-changes`

Carries all Task changes and calls the debounced Task panel loader.

### `assignees-changes`

Carries all task-assignee changes and calls the debounced Task panel loader.

### `trails-changes`

Carries all task-trail changes, reloads Tasks and requests Activity refresh.

### `notifications-changes`

Filtered to the current user. It currently:

- prepends/refreshes Activity;
- displays toast;
- plays sound;
- refreshes badge;
- animates the bell.

This is one of several notification paths and must eventually delegate to `NotificationService`.

## 3.3 Desktop timers/listeners

### `_taskPanelTimer`

- 600 ms debounce;
- cleared before replacement;
- acceptable temporary owner.

### `_webTypingTimer`

- 3-second typing indicator timeout;
- cleared before replacement.

### `_webHeartbeat`

- 60-second presence update interval;
- guarded against duplicate creation;
- currently page-lifetime;
- future Session/Realtime manager must clear it on logout or tenant change.

### visibility listener

- installed once through `_webVisWired`;
- refreshes canonical bell count when the tab becomes visible.

### reaction notification delay

- 900 ms one-shot timeout after reaction insert;
- refreshes badge and Activity;
- must eventually be replaced by normalized notification reconciliation.

## 3.4 Desktop notification duplication risk

A single event may currently touch several paths:

- message realtime handler;
- notification INSERT handler;
- local bell increment;
- canonical unread recount;
- Activity refresh;
- sound helper;
- Web Push/native push outside this module.

The future `NotificationService` must own event keys, deduplication, sound, toast and badge reconciliation.

---

# 4. Mobile realtime and timers — `js/mobile.js`

## 4.1 Realtime ownership

Mobile has already moved toward a single primary channel:

- `_rtChannel` on `mobile-rt-<tenant>`;
- `_presenceChannel` on `presence-<tenant>`.

The primary channel carries:

- message INSERT;
- reaction INSERT/DELETE;
- task-assignee UPDATE;
- notification INSERT;
- profile UPDATE;
- mobile broadcast events.

Positive controls already present:

- `_rtChannel` creation guard;
- intentional-close flag;
- remove-channel during reconnect;
- exponential reconnect backoff;
- message ID deduplication;
- tenant and DM privacy guards;
- catch-up reconciliation after recovery.

## 4.2 Mobile timer/reference inventory

Declared runtime references include:

- `_tsInterval`;
- `_notifPoll`;
- `_rtReconnectTimer`;
- `_notifFallbackInterval`;
- `_fallbackTimer`;
- `_activityPoll`;
- `_typingTimers` map;
- realtime outage/backoff timers;
- keyboard requestAnimationFrame handle.

Required Phase 0 follow-up:

- trace every creation and clear path for the above references;
- verify screen navigation clears `_activityPoll`;
- verify app visibility/wake does not duplicate fallback timers;
- verify logout/tenant changes remove both Supabase channels;
- verify keyboard listeners are installed once.

## 4.3 Mobile notification authority

Mobile currently combines:

- `_onNewMessage()`;
- `_onNotifInsert()`;
- `_refreshNotifBadge()`;
- `_reconcileUnread()`;
- heads-up banner logic;
- app badge logic;
- realtime reconnect catch-up;
- optional fallback polling.

It contains useful deduplication, but the final calculation must be shared with desktop through `UnreadService` and `NotificationService`.

---

# 5. Shared/global wrapper inventory

## 5.1 `js/shared.js`

### Supabase client

- correctly reuses `window.sb` to avoid multiple GoTrue clients.

### sendMessage render fallback

- a 100 ms installer interval searches for `window.sendMessage` for up to 300 attempts;
- replaces `window.sendMessage` with a wrapper;
- preserves `__originalSendMessage` and a marker.

Risk:

- another function wrapper in a codebase already affected by wrapper collisions;
- must be converted to an explicit post-send hook inside `MessageService`.

## 5.2 `js/activity-v207.js`

Replaces:

- `window.openActivityFeed`;
- `window._loadActivityFeed`.

## 5.3 `js/activity-feed-stability.js`

Replaces:

- `window._loadActivityFeed`;
- `window.refreshActivityFeed`;
- `window.prependFeedItem`.

No other module may replace these while this layer exists.

---

# 6. Native bridge — `js/native.js`

Runtime resources:

- one 800 ms splash-hide timeout;
- native back-button listener;
- Push Notification listeners;
- one 3-second page-lifetime interval that retries token ownership/save after login.

Risks/follow-up:

- the token poll is not stored or cleared;
- native script no-ops on web/PWA, so impact is native-only;
- future native lifecycle owner should clear/restart it on logout/account switch and avoid duplicate plugin listeners if the page is reinitialized.

---

# 7. Logger — `js/utils/logger.js`

Owns:

- one 60-second flush interval;
- pagehide and visibility listeners;
- auth-state listener;
- global error/unhandled-rejection capture;
- console warn/error mirroring;
- critical log deduplication;
- healthy realtime status sampling.

Completed improvements:

- routine batch threshold 30;
- routine flush 60 seconds;
- repeated warn/error suppression 30 seconds;
- no browser-side IP lookup;
- realtime failures remain immediate.

Required future cleanup:

- expose `destroy()` for tests/logout if the app ever supports same-page full reinitialization;
- ensure console interception is installed once.

---

# 8. MutationObserver inventory

Verified body-wide observers:

1. `js/activity-v207.js` — Activity/mobile decoration.
2. `js/compact-panel-filters.js` — Activity header/card and Task filter presentation.

Removed in this phase:

- `js/activity-feed-stability.js` panel-open observer.

Search also identifies observer usage in:

- `js/mobile.js`;
- `js/mobile-tasks.js`.

These mobile observers require exact ownership and cleanup tracing before Phase 3 is marked complete.

Target:

- no body-wide presentation observers in the final architecture;
- feature observers, when unavoidable, must be scoped to the feature root and disconnected on `destroy()`.

---

# 9. Highest-priority fixes from this inventory

## P0 — correctness/duplication

- [ ] Move desktop `scheduledSubscription` to module scope and clean it before recreation.
- [ ] Clean `window._sharedBroadcast` before recreation.
- [ ] Verify web `startSubscriptions()` is not redundantly creating web channels on mobile.
- [ ] Verify logout/tenant switching clears all web and mobile channels/timers.
- [ ] Consolidate notification event deduplication.

## P1 — Activity stability/architecture

- [x] Remove the Activity fallback body observer.
- [ ] Put the 60-second fallback directly in the final Activity owner.
- [ ] Remove Activity function wrappers.
- [ ] Remove Activity presentation body observers.
- [ ] Render filters directly in the final header.

## P2 — lifecycle hygiene

- [ ] Trace every mobile timer creation/clear path.
- [ ] Scope or remove mobile MutationObservers.
- [ ] Add central cleanup registry for intervals, listeners and channels.
- [ ] Add automated duplicate-channel assertions in development mode.

---

# 10. Runtime acceptance checks

Before a phase is accepted:

1. Open and close Activity ten times; exactly one fallback interval may exist.
2. Call subscription startup repeatedly; exactly one channel per intended topic may exist.
3. Background and foreground the tab; badge reconciliation must not install duplicate listeners.
4. Simulate realtime disconnect/reconnect; one catch-up refresh must occur.
5. Trigger one message, reaction, task and reminder; each produces at most one sound and one visible alert per recipient.
6. Log out and log in as another user without a full browser restart; no previous-user timer/channel may remain.
7. Run desktop and mobile for at least 30 minutes; no increasing duplicate callbacks or repeating console errors.

---

# 11. Progress ledger

## 2026-07-26

- Created the runtime ownership inventory.
- Verified the multi-layer Activity ownership chain.
- Verified two remaining body-wide Activity presentation observers.
- Removed the Activity stabilizer's body-wide panel observer.
- Verified the desktop scheduled-message subscription leak.
- Verified missing cleanup before desktop shared-broadcast recreation.
- Recorded the main mobile realtime/timer ownership surface.
- Recorded shared `sendMessage` wrapper and native token poll for later consolidation.
