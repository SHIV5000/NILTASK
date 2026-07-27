# NILTASK Runtime Ownership Inventory

> Read after `AI.md` and `PROFESSIONALIZATION_PLAN.md`.
>
> Purpose: maintain one explicit owner and one cleanup path for every timer, observer, listener, realtime channel and public compatibility function.

## Governing rules

1. One runtime resource has one owner.
2. Every interval, timeout, observer, listener and Supabase channel must have a cleanup path.
3. Compatibility `window.*` functions may delegate to a service but must not form wrapper cycles.
4. Desktop and mobile may render differently, but shared data rules must not diverge.
5. Mobile business/realtime flows stay untouched until a dedicated migration explicitly replaces them.
6. No document-wide MutationObserver may be introduced for a feature-specific problem.
7. All school-owned realtime and query paths must be tenant-isolated.

---

## Desktop Activity Feed

### Canonical owner

`js/ui-feed.js`

Owns:

- `window.openActivityFeed`
- `window.closeActivityFeed`
- `window._loadActivityFeed`
- `window.refreshActivityFeed`
- `window.prependFeedItem`
- Activity Type/Person filters
- clear-one / clear-all
- exact Task/message navigation
- final header/card/date-separator markup
- one 60-second fallback interval (`window._afPollTimer`)
- refresh debounce and overlapping-load coalescing
- atomic list replacement and scroll restoration
- stale user/tenant response rejection

Diagnostics marker:

```text
NILTASK_ACTIVITY_CONTROLLER_VERSION = v1
__nfaActivityController = true
```

### Retired layers

- `js/activity-v207.js`: historical implementation, not loaded.
- `js/activity-v208.js`: harmless compatibility entrypoint only.
- `js/activity-feed-stability.js`: not loaded.
- Activity logic in `js/compact-panel-filters.js`: removed.

### Active observer

None for Activity.

---

## Compact Task filters

### Owner

`js/compact-panel-filters.js`

Owns only the Task filter/sort presentation.

Resource:

- one MutationObserver scoped to `#rightSidebar`;
- bounded install timer;
- explicit `dispose()` on `niltask:session-cleaned`.

It does not observe `document.body` and does not manipulate Activity DOM.

---

## Realtime Manager

### Owner

`js/core/realtime-manager.js`

Owns:

- topic inspection;
- owner-to-channel registration;
- owner cleanup;
- topic duplicate removal;
- operation coalescing;
- runtime snapshots;
- full channel destruction during session cleanup.

### Desktop feature owners

`js/core/realtime-feature-owners.js`

Expected named owners and topics:

| Owner | Topic | Scope |
|---|---|---|
| `desktop-shared-broadcast` | `taskflow-bc-<tenant>` | tenant |
| `desktop-scheduled-messages` | `scheduled-changes` | sender + tenant guard |
| `desktop-notification-rows` | `notifications-changes` | current user + tenant guard |
| `desktop-tasks` | `tasks-changes` | tenant |
| `desktop-task-assignees` | `assignees-changes` | tenant |
| `desktop-task-trails` | `trails-changes` | tenant |

Acceptance target after desktop startup:

```text
taskflow-bc-<tenant>    count = 1
scheduled-changes       count = 1
notifications-changes   count = 1
tasks-changes           count = 1
assignees-changes       count = 1
trails-changes           count = 1
```

Task INSERT/UPDATE events use server-side `tenant_id` filters. DELETE events retain a client tenant guard because DELETE filtering depends on replica identity.

### Temporary migration bridge

`js/runtime-subscription-guard.js`

- coalesces repeated legacy desktop `startSubscriptions()` calls;
- lets mobile call the original startup directly;
- emits `niltask:subscriptions-started`;
- remains temporary until all desktop channels are constructed directly by permanent services.

---

## Desktop message/reaction realtime still legacy-owned

### `public:messages-<tenant>`

Current owner: module-scoped `messageSubscription` in `js/main.js`.

Carries:

- message INSERT;
- reaction INSERT/DELETE durability;
- mention/incoming-message presentation;
- provisional per-room unread increments;
- Activity refresh requests.

The variable is module-scoped and is unsubscribed before recreation, so it does not have the same leak as the old scheduled-message local variable. It should be migrated only after message callback parity tests exist.

### `mpgs-reactions-v1-<tenant>`

Current owner: `window._reactionsBroadcast` in `js/main.js`.

Carries web-only broadcast compatibility for reactions, group photos and typing. It is explicitly unsubscribed before recreation and cleared by session cleanup. It remains a future migration target.

---

## Notification presentation

### Current boundary

`js/notification-presentation-service.js`

Owns:

- stable event-key deduplication;
- duplicate toast suppression;
- paired duplicate-sound suppression;
- one message alert sound path;
- `window.NILTASK_presentNotificationRow()`.

It remains a compatibility boundary until a final `NotificationService` owns normalization, presentation and read/badge decisions directly.

---

## Unread and badge authority

### Data engines

- `js/core/unread.js` → `NFA_computeRoomUnread()`
- `js/core/feed.js` → `NFA_unreadCount()`

Canonical formula:

```text
global unread = sum(per-room message unread) + non-message attention unread
```

Message, reply and mention notification rows are excluded from attention because their linked chat messages are already represented in room unread.

Durable room markers are read using both `user_id` and `tenant_id`. Last-known attention counts are cached per user, not globally.

### Desktop/PWA orchestrator

`js/core/unread-service.js`

Owns on desktop/PWA:

- coalesced DB reconciliation;
- `window.unreadCounts` compatibility publication;
- top-bar bell;
- room badges in `#chatsList`;
- PWA app-icon badge;
- optimistic room clearing + delayed reconcile;
- refresh on visibility/network/subscription recovery;
- reset on session cleanup.

Observer:

- one MutationObserver scoped only to `#chatsList`.

Compatibility functions:

- `_setBellBadge`
- `_incrementBellBadge`
- `_clearBellBadge`
- `refreshNotificationBadge`

### Mobile boundary

UnreadService is currently passive on mobile:

- no automatic query;
- no public-function override;
- no DOM observer;
- no app-badge write;
- no second polling cadence.

`js/mobile.js` remains the active mobile unread renderer until its dedicated migration.

See `UNREAD_AUTHORITY.md`.

---

## Session lifecycle

### Owner

`js/core/session-lifecycle.js`

Owns cleanup for logout, account change and tenant change:

- closes Activity and clears its timer;
- clears heartbeat, presence and typing timers;
- destroys Supabase channels through RealtimeManager;
- clears shared/reaction channel references;
- removes outgoing push identity;
- removes service-worker auth state;
- flushes/stops logger timer;
- clears user/tenant/role/permission/cache/unread/badge state;
- reloads after a genuine tenant change;
- bounds best-effort async cleanup so logout cannot hang.

---

## Desktop timers

| Resource | Owner | Cleanup |
|---|---|---|
| `_afPollTimer` | `ui-feed.js` | `closeActivityFeed()` / SessionLifecycle |
| Activity refresh timeout | `ui-feed.js` internal state | close/session cleanup |
| `_webHeartbeat` | `main.js` | SessionLifecycle |
| `_presenceTimer` | desktop presence path | SessionLifecycle |
| `_webTypingTimer` | desktop typing handler | SessionLifecycle |
| logger flush timer | `utils/logger.js` | SessionLifecycle |
| Task-filter install/decorate timers | `compact-panel-filters.js` | `dispose()` |
| unread refresh/render timers | `unread-service.js` | `dispose()` / session reset |

---

## Mobile resources still to inventory/migrate

Mobile currently owns its own:

- `mobile-rt-<tenant>` realtime channel;
- presence channel;
- adaptive fallback timer;
- notification fallback interval;
- Activity poll;
- reconnect timer/backoff;
- typing timers;
- unread/attention renderers;
- app-badge writer.

Do not modify these incrementally through unrelated desktop scripts. The mobile phase must preserve reconnect behaviour, battery cadence, open-chat catch-up and surgical row patching.

---

## Runtime diagnostics

Use:

```javascript
NILTASK_runtimeSnapshot()
NILTASK_printRuntimeSnapshot()
```

The snapshot must show:

- one copy of every managed desktop topic;
- named owners for all six managed desktop channels;
- no desktop owners on mobile;
- source-owned Activity markers;
- no document-wide Activity/filter observer;
- unread formula split and compatibility markers;
- current session identity and known timers.

---

## Next ownership migrations

1. Verify all six managed desktop topics in authenticated preview.
2. Migrate `public:messages-<tenant>` only after message/unread/presentation parity checks.
3. Decide whether `mpgs-reactions-v1-<tenant>` can be retired in favour of shared/durable paths.
4. Perform dedicated mobile unread handoff without introducing a second poll.
5. Inventory and clean mobile timers/reconnect/listeners as one controlled phase.
