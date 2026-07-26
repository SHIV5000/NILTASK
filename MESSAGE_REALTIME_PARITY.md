# NILTASK Desktop Message Realtime Parity Contract

> Read before migrating `public:messages-<tenant>` or retiring `mpgs-reactions-v1-<tenant>`.
>
> Governing files: `AI.md`, `PROFESSIONALIZATION_PLAN.md`, `RUNTIME_OWNERSHIP_INVENTORY.md`, `UNREAD_AUTHORITY.md`.

## Current owner

The current desktop message/reaction subscription is created inside `window.startSubscriptions()` in `js/main.js` and stored in the module-scoped `messageSubscription` variable.

Topic:

```text
public:messages-<tenant_id>
```

The variable is unsubscribed before recreation, so it does not have the local-variable leak that previously affected scheduled messages. Migration is still needed for explicit RealtimeManager ownership, diagnostics and cleanup consistency.

## Events carried by the channel

### Reaction INSERT

Server filter:

```text
table = reactions
tenant_id = current tenant
```

Required effects:

1. Log durable reaction receipt.
2. Call `_onBcReactionAdd(newRow)`.
3. Ignore own-user DOM echo in the shared handler.
4. After a short delay, reconcile attention unread from the database when another user reacted.
5. Refresh Activity when open.
6. Do not create a duplicate reaction chip if the same event was already received by broadcast.

### Reaction DELETE

Required effects:

1. Log durable removal receipt.
2. Call `_onBcReactionRemove(oldRow)`.
3. Remove/decrement the correct emoji/tag chip.
4. Keep `reactionsCache` in sync.
5. Ignore own-user echo.

DELETE is intentionally unfiltered at the server because old-row tenant columns depend on replica identity. The callback must retain a client tenant guard through `_onBcReactionRemove()`.

### Message INSERT

Server filter:

```text
table = messages
tenant_id = current tenant
```

The callback must preserve every rule below.

#### Tenant and privacy guards

- Reject a row whose `tenant_id` differs from the current tenant.
- Never alert or count a DM unless the current user is one of its exact participants.
- Never count the current user's own message as unread.
- Mobile must not run the desktop notification/unread path.

#### Mention behaviour

When the incoming HTML contains the current user's `data-uid`:

- resolve the sender name;
- show one mention toast;
- play at most one incoming sound;
- do not allow later notification-row presentation to create a duplicate mention alert.

#### Message in the currently open room

For another user's message:

- reload/render the current room;
- respect per-room mute;
- play at most one sound;
- call `triggerMessageNotification()` once where currently designed;
- do not increment the room's unread count.

For the current user's own message:

- do not reload solely for realtime echo because optimistic rendering already displayed it;
- do not notify the sender.

#### Message in another room

For another user's valid group/DM message on desktop/PWA:

- increment that room's provisional `window.unreadCounts` by one;
- pass through `UnreadService` compatibility so database reconciliation remains authoritative;
- call `triggerMessageNotification()` at most once when the room is not muted;
- increment the global badge by exactly one overall, not once for room unread and again for a message notification row;
- refresh the conversation list;
- preserve the existing DM incoming sound behaviour without creating a second sound;
- refresh Activity when open.

#### Activity

Every accepted message event requests an Activity refresh when Activity is open. The source-owned Activity controller must coalesce bursts and preserve scroll.

## Existing deduplication dependencies

The callback currently relies on these shared boundaries:

- `playSound()` two-second category debounce;
- `notification-presentation-service.js` stable message keys;
- `UnreadService` database reconciliation and compatibility functions;
- DM participation helper `isDmParticipant()`;
- per-room mute helper `isRoomMuted()`;
- Activity refresh debounce/coalescing;
- reaction handlers that ignore own-user echoes.

These dependencies must remain available or be replaced explicitly in the same migration.

## Legacy reaction broadcast audit

Topic:

```text
mpgs-reactions-v1-<tenant_id>
```

Current receive events:

- `reaction`;
- `reaction_remove`;
- `group_photo`;
- `typing`.

Current reaction send path sends the same logical change through:

1. the legacy web broadcast;
2. the tenant-shared `taskflow-bc-<tenant>` channel;
3. the durable `reactions` table.

Current group-photo/settings paths also send through both legacy and tenant-shared channels, while room settings/storage remain durable sources.

Therefore the legacy channel appears redundant for the observed reaction and group-photo paths. It must not be retired yet until these checks pass:

- all web reaction sends reach another web client through `taskflow-bc`;
- reaction deletes reach another web client using normalized `isDelete:true` payloads;
- database reaction INSERT/DELETE catch up after a socket drop;
- group-photo/name updates reach web and mobile through the shared channel and durable storage/settings;
- no active desktop typing sender depends exclusively on the legacy topic;
- removing the legacy topic does not change mobile behaviour.

## Target owner

Planned named owner:

```text
desktop-message-reactions
```

Planned topic:

```text
public:messages-<tenant_id>
```

The final owner should live in a permanent realtime service, register through `RealtimeManager`, stop on logout/tenant change and be recreated idempotently after subscription startup.

## Migration sequence

1. Keep current callback behaviour unchanged.
2. Create one named owner with the same three postgres event handlers.
3. Remove any legacy copy of `public:messages-<tenant>` after the old startup completes.
4. Register the replacement through `RealtimeManager`.
5. Verify one topic and one callback path in diagnostics.
6. Test current-room group, off-room group, current-room DM, off-room DM, mention, own send, reaction add and reaction delete.
7. Test disconnect/reconnect and database catch-up.
8. Only after message parity passes, separately test retirement of `mpgs-reactions-v1-<tenant>`.

## Acceptance matrix

| Scenario | Bubble/list | Room unread | Global unread | Toast | Sound | Activity |
|---|---:|---:|---:|---:|---:|---:|
| Own message | optimistic once | +0 | +0 | 0 | outgoing only | refresh once |
| Other user, open group | render once | +0 | +0 | current behaviour once | ≤1 | refresh once |
| Other user, closed group | list refresh | +1 | +1 total | ≤1 | ≤1 | refresh once |
| Other user, open DM | render once | +0 | +0 | current behaviour once | ≤1 | refresh once |
| Other user, closed DM for me | list refresh | +1 | +1 total | ≤1 | ≤1 | refresh once |
| DM not involving me | none | +0 | +0 | 0 | 0 | 0 |
| Mention | normal message rules | according to room | counted once | 1 mention presentation | ≤1 | refresh once |
| Reaction add | chip once | +0 | attention according to DB | according to notification row | ≤1 | refresh once |
| Reaction delete | remove once | +0 | reconcile | 0 | 0 | optional refresh |

## Runtime verification

After migration, `NILTASK_printRuntimeSnapshot()` must show:

```text
public:messages-<tenant> count = 1
owner = desktop-message-reactions
```

Repeated `startSubscriptions()` and reconnects must not increase that count.
