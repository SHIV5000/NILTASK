# Notifications Overhaul — Plan (WhatsApp-standard)

## Accurate current state (verified against code + Supabase function logs)

The audit verdict was partly based on incomplete logs. Corrected assessment:

| Feature | Verdict claim | **Actual state in code** | Real gap? |
|---|---|---|---|
| Push (offline wake) | ❌ missing | ✅ **Working.** `send-push` edge function fires on every `messages` INSERT via DB webhook; logs show `send-push done {"sent":1,"failed":0}`. Handles DM + group, deep-links, cleans expired subs. | No — but harden. |
| New-message alert | ❌ only reactions | ⚠️ **Partial.** The *recipient* self-inserts a `type:'message'` notification row in `_onNewMessage` — but only when **online** to receive the realtime event. Offline (or during channel drop) → no feed/bell entry. | **Yes** — move to server. |
| Mention alerts | ❌ missing | ❌ **Not implemented.** No `@mention` parsing anywhere. | **Yes** — build. |
| Offline queue | ❌ WS drops lose it | ⚠️ Push is server-side (unaffected by client WS), but the **in-app feed/bell** relies on the flaky client self-insert. | **Yes** — server insert. |
| Read status | ❌ not synced | ⚠️ **Partial.** Mobile has ✓/✓✓/blue ticks + `room_read` broadcast + `last_read_*`. Not cross-device durable; doesn't clear notifications. | Improve (Phase 3). |

**Root problem:** notification *rows* (the bell + Activity feed source of truth) are created **client-side by whoever happens to be online**. That's why they're unreliable — exactly the "need to refresh / not real-time / only reactions" symptoms. The fix is to make notifications **server-authoritative**, created by the same edge function that already sends push (it runs reliably on every insert regardless of who's online).

---

## Phase 1 — Server-authoritative message notifications (the core fix)

**Goal:** every recipient gets a `notifications` row for every message/reaction/reply, created server-side, so the bell + Activity feed are always correct — online, offline, or mid-reconnect.

- **Edge function `send-push`:** after resolving `recipientIds`, bulk-insert `notifications` rows (service role → bypasses RLS, no per-user online requirement):
  `{ user_id: each recipient, type:'message'|'reply', message: '<name>: <snippet>' (DM 💬-prefixed), message_id, tenant_id, is_read:false }`.
  Dedup on `(user_id, message_id)` so retries don't double-insert (add a unique index).
- **Client:** stop the `_onNewMessage` self-insert of message notifications (mobile.js:3281-3289) and the web equivalent (main.js) — the server now owns it. Keep the *badge bump* (`_bumpBellBadge`, `_refreshNotifBadge`) which reads the DB. The realtime `notifications` INSERT sub already refreshes the bell live; on reconnect, v98's `_refreshNotifBadge()` catch-up covers gaps.
- **Reactions/replies notifications:** already work via the RLS policy (v99). Optionally move these to the server too for consistency (lower priority — they only fire when the actor is online, which is fine).

**Files:** `supabase/functions/send-push/index.ts` (insert notifications), `supabase/migrations/*_notifications_unique.sql` (unique index for dedup), `js/mobile.js` + `js/main.js` (drop client message-notif self-insert). User redeploys the function.

## Phase 2 — @mentions (WhatsApp group standard)

- **Compose:** typing `@` in the composer opens a member picker (group members / DM partner). Selecting inserts a styled `@Name` token carrying the user id (store as `@[Name](uid)` in the raw text, render as a highlighted chip).
- **Detect (server):** in `send-push`, parse the message for mentioned uids. For a mentioned recipient, send a **high-priority** push (title `📣 <name> mentioned you`, distinct tag) and a `type:'mention'` notification row (feed badge already maps `mention`→chats; add a dedicated icon).
- **Client render:** highlight `@Name` in bubbles; a mention to *you* styles the bubble/notification distinctly.

**Files:** `js/mobile.js` (composer picker + render), `js/messages.js` (web render), `supabase/functions/send-push/index.ts` (mention parse + priority), `js/ui-feed.js`/mobile feed (mention type styling).

## Phase 3 — Read receipts that clear notifications

- On opening a chat, write a durable `room_reads {user_id, room_id, tenant_id, last_read_at}` upsert (replaces localStorage-only `last_read`).
- `send-push` skips push to a recipient whose `last_read_at` for that room is newer than the message (they've seen it) — WhatsApp behavior.
- Mark that room's `notifications` read on open (already partly done); reflect across devices via the existing realtime sub.

**Files:** new `supabase/migrations/*_room_reads.sql`, `send-push` (skip-if-read), `js/mobile.js`/`js/main.js` (upsert on open).

---

## Execution order & risk
1. **Phase 1** first (biggest win, lowest risk) — makes notifications reliable for everyone. Client change is a deletion (safe); server change is additive.
2. **Phase 2** mentions (self-contained feature).
3. **Phase 3** read receipts (depends on Phase 1's server path).

## Deploy checklist (user)
- Redeploy edge function: `supabase functions deploy send-push --no-verify-jwt`.
- Run the new migrations (unique index; later room_reads).
- Merge the branch to `main`.

## Verification
1. Phone **offline**, receive 3 messages, come online → bell shows 3, Activity feed lists them (server-created, not dependent on being online). 
2. Message with `@You` in a group → high-priority "mentioned you" push + distinct feed entry.
3. Open the chat on device A → its notifications clear on device B too; no push arrives for already-read messages.
