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

- reads `room_reads` for the current user;
- reads recent tenant-scoped messages;
- ignores the current user's own messages;
- enforces DM participation checks;
- derives one count per room;
- survives reload and realtime reconnects.

### `NFA_unreadCount(sb, uid)`

Defined in `js/core/feed.js`.

It:

- reads unread notification rows for the current user;
- excludes `message`, `reply` and `mention` types;
- keeps the last known value if a transient network failure occurs.

## `UnreadService`

`js/core/unread-service.js` is the shared orchestration boundary.

It owns:

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

## Compatibility functions

The following legacy public functions are currently delegated to `UnreadService`:

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

## Rendering ownership

### Desktop/PWA

`UnreadService` currently owns:

- top-bar bell number;
- room badges in `#chatsList`;
- PWA app-icon badge.

Its MutationObserver is scoped only to `#chatsList` so room badges are reapplied after that list is rebuilt. It does not observe `document.body`.

### Mobile

The mobile shell already uses the same two formulas, but still contains local functions:

- `_refreshNotifBadge()`;
- `_reconcileUnread()`;
- `_renderBellBadge()`;
- `_updateAppBadge()`;
- its adaptive fallback schedule.

Do not add a second mobile poll in `UnreadService`.

The dedicated mobile migration must:

1. keep the existing mobile realtime and reconnect behaviour;
2. replace the two local count queries with one call to `UnreadService.refresh()`;
3. consume the `niltask:unread-updated` event for mobile rendering;
4. retain surgical home-row patching without full-screen rerender;
5. keep the open room at zero;
6. remove duplicated mobile app-badge calculations only after parity testing;
7. preserve battery-aware background cadence and open-chat catch-up.

## Runtime diagnostics

Use:

```javascript
NILTASK_printRuntimeSnapshot()
```

The unread section must satisfy:

```text
unread.total = unread.roomTotal + unread.attention
unread.total = unread.renderedBellCount
unread.perRoom matches unread.windowPerRoom
```

The critical public functions must show:

```text
_setBellBadge.unreadService = true
_incrementBellBadge.unreadService = true
_clearBellBadge.unreadService = true
refreshNotificationBadge.unreadService = true
```

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
10. PWA icon badge equals the same global total.

## Release condition

Unread professionalization is not complete until desktop and mobile both consume the same `UnreadService` state and the legacy independent mobile count queries have been removed without changing mobile message delivery or reconnect behaviour.
