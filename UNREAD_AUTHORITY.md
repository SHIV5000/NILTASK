# NILTASK Unread and Badge Authority

> Read with `AI.md`, `PROFESSIONALIZATION_PLAN.md`, `RUNTIME_OWNERSHIP_INVENTORY.md` and `PROFESSIONALIZATION_PROGRESS.md`.

## Purpose

This document defines the only valid unread-count model for NILTASK.

The app previously mixed:

- ephemeral realtime increments in `window.unreadCounts`;
- notification rows created for message-related attention;
- `room_reads.last_read_at` durable read markers;
- independent desktop, mobile and app-icon badge calculations.

That produced duplicated counts, counts that disappeared after reload, and counts that returned after they had been cleared.

## Canonical formula

```text
per-room message unread
    = messages after room_reads.last_read_at

attention unread
    = unread notification rows that are not already represented by message unread

attention types currently counted
    = reaction, task, reminder and other non-message attention events

message-related notification types excluded from attention
    = message, reply, mention

global unread
    = sum(per-room message unread) + attention unread
```

The exclusion of message, reply and mention notification rows is mandatory. Their linked chat messages are already counted through `room_reads + messages`; adding those rows again would count one event twice.

## Existing authoritative data functions

### `NFA_computeRoomUnread(sb, opts)`

Defined in `js/core/unread.js`.

It:

- reads `room_reads` for the current user and current tenant;
- reads recent tenant-scoped messages;
- ignores the current user's own messages;
- enforces DM participation checks;
- derives one count per room;
- survives reload and realtime reconnects.

Room identifiers are not globally unique across schools. The `room_reads` query must therefore remain scoped by both `user_id` and `tenant_id`; a same-named room in another tenant must never suppress this tenant's unread messages.

### `NFA_unreadCount(sb, uid)`

Defined in `js/core/feed.js`.

It:

- reads unread notification rows for the current user;
- excludes `message`, `reply` and `mention` types;
- keeps the last known value if a transient network failure occurs;
- keeps that fallback separately per user, preventing a previous account's count from appearing after account change.

## `UnreadService`

`js/core/unread-service.js` is the shared orchestration boundary.

On desktop/PWA it owns:

- coalesced refreshes of both authoritative queries;
- stale user/tenant response rejection;
- `window.unreadCounts` publication for compatibility;
- the desktop top-bar bell count;
- desktop per-room unread indicators;
- the PWA app-icon badge;
- optimistic room clearing when a desktop conversation is opened;
- delayed database reconciliation after optimistic clearing;
- refresh on visibility restore, network restore and subscription startup;
- reset on the central `niltask:session-cleaned` lifecycle event;
- runtime state inspection through `NILTASK_UnreadService.snapshot()`.

On mobile it now owns the **single authoritative query operation**, but not the cadence or renderer:

- captures the original room-unread and attention helpers;
- installs marked compatibility adapters under the existing helper names;
- coalesces the paired mobile calls through one `UnreadService.refresh()` operation;
- performs one room query plus one attention query per mobile refresh trigger;
- dispatches `niltask:unread-updated` and exposes a read-only diagnostic snapshot;
- rejects stale user/tenant responses through the shared refresh identity check;
- creates no second mobile timer, poll, DOM observer, renderer or OS-badge writer.

## Compatibility functions

On desktop/PWA, the following legacy public functions are delegated to `UnreadService`:

```javascript
window._setBellBadge
window._incrementBellBadge
window._clearBellBadge
window.refreshNotificationBadge
```

Important behaviour:

- legacy callers cannot directly impose an arbitrary global count;
- provisional incoming-message increments adopt the current per-room map and then reconcile with the database;
- clearing attention does not erase unread chat counts;
- the database-backed refresh remains authoritative.

These adapters may be removed only after all direct callers use `UnreadService` methods.

On mobile, the existing helper names remain callable by `mobile.js`:

```javascript
window.NFA_computeRoomUnread
window.NFA_unreadCount
```

They are compatibility adapters during the handoff. When the mobile fallback/realtime path calls both together, the second call joins the first in-flight shared refresh instead of issuing an independent query pair or scheduling another refresh.

## Rendering ownership

### Desktop/PWA

`UnreadService` currently owns:

- top-bar bell number;
- room badges in `#chatsList`;
- PWA app-icon badge.

Its MutationObserver is scoped only to `#chatsList` so room badges are reapplied after that list is rebuilt. It does not observe `document.body`.

### Mobile

`mobile.js` remains the sole owner of:

- the existing six-second foreground / sixty-second background fallback cadence;
- live provisional increments in `window.unreadCounts`;
- `_liveUnreadTs` replication-lag grace;
- database-result merging with the live floor;
- open-room zeroing;
- `_renderBellBadge()`;
- `_patchHomeUnread()` surgical row updates;
- `_updateAppBadge()` mobile/PWA icon writes;
- open-chat catch-up.

`UnreadService` does not write `window.unreadCounts` on mobile. Its returned durable `perRoom` state flows back through the compatibility adapter, after which the existing mobile reconcile path applies `Math.max(database, live)` and forces the open room to zero. This preserves realtime immediacy while making the shared query result authoritative.

The mobile ownership formula remains:

```text
mobile global unread
    = UnreadService attention
    + sum(mobile reconciled per-room unread)
```

## Mobile handoff acceptance

The dedicated query handoff is complete only when all of the following remain true:

1. existing mobile realtime, reconnect and fallback scheduling are unchanged;
2. paired room/attention calls execute one shared query pair;
3. coalescing does not set a deferred desktop-style pending refresh;
4. `niltask:unread-updated` is consumed and observable in diagnostics;
5. no shared mobile poll exists;
6. no shared mobile DOM renderer exists;
7. no shared mobile app-badge writer exists;
8. live provisional counts are not overwritten before database replication catches up;
9. the open room remains zero;
10. DM participation and tenant scoping remain enforced;
11. surgical home-row patching remains free of full-screen rerenders;
12. installed-PWA badge parity remains unchanged.

## Runtime diagnostics

Use:

```javascript
NILTASK_printRuntimeSnapshot()
NILTASK_printMobileRuntimeSnapshot()
```

Desktop/PWA must satisfy:

```text
unread.passiveMobile = false
unread.total = unread.roomTotal + unread.attention
unread.total = unread.renderedBellCount
unread.perRoom matches unread.windowPerRoom
```

The critical desktop public functions must show:

```text
_setBellBadge.unreadService = true
_incrementBellBadge.unreadService = true
_clearBellBadge.unreadService = true
refreshNotificationBadge.unreadService = true
```

The managed desktop realtime table must show exactly one healthy row for each topic:

```text
public:messages-<tenant>
taskflow-bc-<tenant>
scheduled-changes
notifications-changes
tasks-changes
assignees-changes
trails-changes
```

The corresponding owner table must include `desktop-message-reactions` and the six other named desktop owners.

Mobile must satisfy:

```text
acceptance.sharedUnreadHandoffInstalled = true
acceptance.sharedUnreadUsesOneRefresh = true
acceptance.sharedUnreadBypassesIndependentQueries = true
acceptance.sharedUnreadHasNoOwnPoll = true
acceptance.sharedUnreadHasNoOwnRenderer = true
acceptance.sharedUnreadHasNoOwnAppBadge = true
no #chatsList unread observer
no desktop RealtimeManager feature owners
mobile.js remains the active mobile unread renderer
```

After at least one paired mobile refresh, `refreshCount` should advance once and `coalescedCalls` should advance for the second compatibility call.

## Desktop smoke checks

1. Reload with unread chats: room badges and global bell return from database state.
2. Receive one message in another room: that room increases by one and the global bell increases by one—not two.
3. Receive a reply or mention: the linked message contributes once; its notification row is not added again.
4. Receive a reaction, task or reminder: attention increases even when no chat message is unread.
5. Open one unread room: that room clears immediately; unrelated rooms and attention remain.
6. Open Activity: attention can clear, but unread chat counts remain on the global bell.
7. Dismiss one notification: attention reconciles from the database.
8. Disconnect and reconnect realtime: counts converge to database truth without accumulating.
9. Logout and sign in as another user: no previous user's room or attention count remains.
10. Switch tenant or school context: same-named rooms cannot share read markers.
11. PWA icon badge equals the same global total.
12. Task/assignee/trail changes do not create duplicate unread refreshes or duplicate Activity updates.
13. Repeated subscription startup leaves exactly one `public:messages-<tenant>` channel.

## Mobile smoke checks

1. Start with unread groups and DMs; durable counts return after reload.
2. Receive one message in a closed room; its row and global total increase exactly once.
3. Keep a live provisional count above a temporarily lagging database result; the count must not decrease.
4. Open that room; only that room clears while unrelated room and attention counts remain.
5. Receive reaction/task/reminder attention; the global total changes once.
6. Trigger fallback/reconnect and verify one room request plus one attention request, not two pairs.
7. Background and resume repeatedly; no second unread timer appears.
8. Sign out/sign in or change tenant; no prior identity count or callback survives.
9. Confirm the OS badge equals the same mobile total.
10. Run the mobile diagnostic and verify all shared-query/no-own-render acceptance fields.

## Release condition

Unread professionalization is not production-complete until authenticated desktop and mobile smoke tests prove the shared query state, live mobile floor, renderer parity and installed-PWA badge behaviour on the exact preview head. The PR must remain draft and unmerged until those checks and a fresh Vercel preview succeed.
