# NILTASK Mobile Runtime Ownership Inventory

> Binding read order: `AI.md` → `PROFESSIONALIZATION_PLAN.md` → `RUNTIME_OWNERSHIP_INVENTORY.md` → this file → `PROFESSIONALIZATION_PROGRESS.md`.
>
> Current inspected mobile implementation: `js/mobile.js`, `NILTASK_MOBILE_VERSION = v208`.

## Purpose

The mobile shell is functionally rich and has evolved around unreliable Android/mobile realtime. It must not be simplified by deleting fallback logic blindly. This document records every important long-lived mobile resource and defines the migration gates for professionalizing it without breaking message delivery, unread counts, presence, typing, PWA or Capacitor behaviour.

## Current architectural boundary

Desktop professionalization scripts must remain passive on mobile unless this document explicitly moves an owner.

Current deliberate boundaries:

- desktop RealtimeManager feature owners do not run on mobile;
- desktop UnreadService is passive on mobile;
- mobile keeps its existing realtime, unread, badge and reconnect behaviour;
- mobile changes must preserve equivalent business capability even when the layout differs.

## Primary mobile realtime channel

### Resource

```text
_rtChannel
```

### Topic

```text
mobile-rt-<tenant_id>
```

The code comments near the top still describe an earlier shared-topic design, but the current executable channel uses the mobile-only topic above. The executable code is authoritative.

### Postgres events

The channel currently receives:

- `messages` INSERT, tenant-filtered;
- `reactions` INSERT, tenant-filtered;
- `reactions` DELETE, client-guarded;
- `task_assignees` UPDATE, tenant-filtered;
- `notifications` INSERT, user-filtered;
- `profiles` UPDATE, tenant-filtered.

### Broadcast events

The same channel carries:

- `new_message` — group messages/replies only; DMs are never broadcast;
- `reaction`;
- `group_photo`;
- `typing`;
- `room_read`.

### Delivery protections

- `_seenMsgIds` deduplicates postgres and broadcast delivery by message ID.
- DM participation is checked before rendering, alerting or counting.
- current-user message echoes are ignored.
- reaction handlers ignore own broadcast echoes.
- database events remain the durable catch-up source.
- group-message broadcast is a fast-path fallback when postgres delivery silently stalls.

### Status and reconnect

On `SUBSCRIBED`:

- reconnect timer is cleared;
- outage-warning timer is cleared;
- exponential backoff resets to 3 seconds;
- after a prior error, the open screen, presence, attention badge and per-room unread are reconciled from the database.

On `CHANNEL_ERROR`, `CLOSED` or `TIMED_OUT`:

- intentional closes are ignored;
- `_scheduleRtReconnect()` starts exponential backoff with jitter;
- the current channel is removed before recreation;
- realtime auth is refreshed before subscribing again.

## Presence channel

### Resource

```text
_presenceChannel
```

### Topic

```text
presence-<tenant_id>
```

### Behaviour

- tracks the current user's presence key;
- handles `sync`, `join` and `leave`;
- maintains `_onlineSet`;
- repaints visible presence dots and open-DM status;
- uses periodic `profiles.last_seen` refresh as a fallback when presence/realtime is unreliable.

The channel is explicitly removed before recreation.

## Reconnect and outage timers

### `_rtReconnectTimer`

- one exponential-backoff reconnect timeout;
- cleared when the main channel subscribes successfully;
- skips teardown if the SDK recovered before the timeout fired.

### `_rtOutageTimer`

- approximately 8-second sustained-outage warning delay;
- avoids showing a reconnect toast for brief socket flaps;
- cleared on successful recovery.

### Backoff state

- starts at approximately 3 seconds;
- grows exponentially up to the configured maximum;
- includes jitter;
- resets after successful subscription.

## Database fallback reconciliation

### Resource

```text
_fallbackTimer
```

### Current cadence

```text
visible app:     6 seconds
background app: 60 seconds
```

### Purpose

The mobile socket has historically reported `joined` while silently dropping events. The fallback therefore reconciles database truth frequently even when the channel appears healthy.

It currently protects:

- missed messages;
- per-room unread counts;
- attention count;
- open-chat catch-up;
- badge/app-icon convergence.

### Professionalization constraint

Do not add a second mobile unread/message polling loop. The dedicated mobile unread handoff must reuse this cadence or replace it atomically.

The 6-second foreground cadence may be expensive, but it cannot be relaxed until authenticated long-session tests prove that the current mobile realtime channel reliably fills every gap.

## Mobile unread and badge ownership

Current mobile-local owners:

- `_refreshNotifBadge()` — non-message attention query;
- `_reconcileUnread()` — durable room unread query;
- `_bellCount` — attention state;
- `window.unreadCounts` — per-room message state;
- `_renderBellBadge()` — top bell and Activity-dot rendering;
- `_updateAppBadge()` — installed-app icon badge;
- `_patchHomeUnread()` — surgical home-row patching;
- `_liveUnreadTs` — grace period preventing a lagging DB read from erasing a just-received live increment.

Canonical formula is already aligned with `UNREAD_AUTHORITY.md`:

```text
mobile global unread = attention + sum(per-room message unread)
```

The dedicated handoff must preserve:

- one-count-per-message semantics;
- open room at zero;
- DM privacy;
- live provisional increments;
- database convergence;
- surgical row updates without a full home-screen render;
- app-icon badge parity;
- the existing fallback cadence until reliability is demonstrated.

## Activity polling

### Resource

```text
_activityPoll
```

The current source describes it as a 12-second refresh while the mobile Activity screen is open, acting as a realtime safety net.

Migration target:

- one Activity screen owner;
- one explicit start/stop path;
- refresh coalescing;
- no overlap with the general fallback timer;
- retain exact Task/message navigation and filters.

Do not change its cadence until the open-screen Activity smoke test is recorded.

## Typing resources

### `_typingTimers`

- one timeout per remote user;
- clears the user's typing state after approximately 3 seconds;
- previous timeout is cleared before replacement.

### `_typingThrottle`

- throttles outgoing typing broadcasts.

Typing is cosmetic and must never block message send or reconnect.

## Other long-lived or delayed resources

### `_tsInterval`

Timestamp/relative-time refresh interval. Confirm exact start/stop owner before changing it.

### `_notifPoll` and `_notifFallbackInterval`

Declared legacy notification polling references. Determine whether either is still active before deletion; do not assume a declaration is an active timer.

### `_kbApplyRaf`

- one `requestAnimationFrame` guard for Visual Viewport keyboard handling;
- listeners are attached to `visualViewport.resize`, `visualViewport.scroll` and mobile-app `focusin`;
- keeps the composer above the iOS keyboard.

### `_headsUpTimer`

- one auto-dismiss timeout for the in-app heads-up banner;
- cleared before replacement;
- normal messages are suppressed when their room is open, while mentions may still show.

### Toast timer

Stored on the toast element as `element._timer`; cleared before replacement.

### Screen-local listeners

Scroll/file/input listeners are generally attached to newly rendered screen DOM. Their cleanup relies on that DOM being replaced. This is acceptable only when the old nodes are actually removed and no listener is attached repeatedly to a persistent shell node.

## Global/mobile listeners observed

- `window.online`;
- `window.offline`;
- `document.visibilitychange` through the fallback/recovery paths;
- `visualViewport.resize`;
- `visualViewport.scroll`;
- mobile-app `focusin`;
- service-worker/native deep-link and Android back-button paths elsewhere in the app.

Every persistent listener must eventually be registered through one mobile lifecycle owner or be proven to install exactly once per page.

## Current cleanup assumptions

Current mobile cleanup is distributed:

- reconnect logic removes `_rtChannel` before recreation;
- presence initialization removes `_presenceChannel` before recreation;
- typing and heads-up timers clear their previous instances;
- page reload/navigation destroys screen-local DOM listeners;
- central SessionLifecycle destroys Supabase channels on logout/tenant change;
- logout navigation/reload currently destroys remaining page-lifetime mobile timers/listeners.

Professional target:

```text
MobileRuntime.start(identity)
MobileRuntime.stop(reason)
MobileRuntime.snapshot()
```

`stop()` must explicitly clear/remove:

- `_rtChannel`;
- `_presenceChannel`;
- `_rtReconnectTimer`;
- `_rtOutageTimer`;
- `_fallbackTimer`;
- `_activityPoll`;
- active notification/timestamp intervals;
- every `_typingTimers` entry;
- `_headsUpTimer`;
- pending keyboard RAF;
- persistent mobile lifecycle listeners where removable.

## Runtime diagnostics target

Future diagnostics should include:

```text
mobile.mainTopic
mobile.mainChannelState
mobile.presenceTopic
mobile.presenceChannelState
mobile.reconnectTimerActive
mobile.reconnectBackoff
mobile.fallbackTimerActive
mobile.fallbackCadence
mobile.activityPollActive
mobile.typingTimerCount
mobile.unreadOwner
mobile.appBadgeOwner
```

Desktop named owners must remain absent from a mobile snapshot.

## Migration sequence

1. Add a read-only mobile runtime snapshot; change no behaviour.
2. Add one idempotent `MobileRuntime.stop()` that clears existing resources.
3. Invoke stop during central session cleanup and before same-page mobile reinitialization.
4. Move mobile unread queries/rendering to UnreadService without adding a second poll.
5. Keep the existing `_fallbackTimer` as cadence owner during the unread handoff.
6. Verify messages, DMs, replies, reactions, notifications, Task updates and presence after socket reconnect.
7. Evaluate whether the 6-second foreground fallback can be relaxed using observed delivery data.
8. Only then refactor the main mobile channel or presence channel.

## Mobile acceptance checks

- one main mobile realtime channel;
- one presence channel;
- reconnect never creates a second copy;
- no desktop feature owner appears on mobile;
- one off-room message increments the room/global total once;
- current-room message renders once and does not become unread;
- unrelated DM is ignored completely;
- postgres + broadcast delivery does not duplicate a bubble;
- reaction add/remove converges after reconnect;
- Task assignee updates appear once;
- notification INSERT updates attention once;
- app resumes from background and catches up;
- fallback does not visibly rerender/flash the whole home screen;
- typing states expire;
- keyboard remains usable on iOS/Android;
- logout/account change leaves no prior-session channel or timer effect.

## Current status

Inventory complete enough to begin read-only diagnostics and explicit stop ownership.

No mobile behaviour was changed while creating this document.
