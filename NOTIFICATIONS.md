# Notifications & Unread — the model (v122)

A full rebuild of the notification/badge system onto the international-standard
(WhatsApp + Slack) model, replacing the three disagreeing unread systems that made
the badge "sometimes work, mostly misbehave."

## The problem (before)
Three overlapping, conflicting sources of "unread":
1. `window.unreadCounts` — in-memory, incremented only by realtime. **Empty after
   reload, wrong whenever realtime flapped.** Yet it drove the chat-list badges.
2. `notifications` table — but `send-push` wrote a row for **every message**, so
   the bell ≈ total messages (conflating messages with activity).
3. `room_reads` — the CORRECT durable per-(user,room) read marker, written on
   every chat open… but **never read back** to compute unread.

`_bellCount = max(notifUnread, localMessageUnread)` fused (1) and (2), so the badge
was only correct when the two happened to agree.

## The model (now)
Two independent, DB-derived streams:

### 1. Message unread → per-chat badges + app icon
- **Source of truth: `room_reads`.** Per-room unread = messages in that room with
  `created_at > room_reads.last_read_at`, excluding your own.
- Computed by the shared engine `window.NFA_computeRoomUnread` (`js/core/unread.js`)
  — same code on web + mobile.
- Reconciled from the DB on: **startup, 60s poll, realtime message, reconnect
  catch-up, foreground**. Realtime still increments optimistically for instant
  feel, but the DB is the reconciler → survives reload / flap / reconnect.
- Opening a chat writes `room_reads.last_read_at = now` → that room's unread → 0.

### 2. Activity unread → the bell + Activity-tab badge
- **Source of truth: `notifications.is_read = false`** (`window.NFA_unreadCount`).
- The notifications table now holds the **attention stream ONLY**: @mentions
  (server, `send-push`), reactions-to-you + replies-to-you (client), task events
  (`tasks.js`), reminders. **Plain messages and DMs no longer create a
  notification row** — they're per-chat unread instead.
- The bell is no longer `max()`-ed with message unread — it is purely the activity
  count, so it goes up and down independently and correctly.
- Reading the Activity feed marks all notifications read → bell → 0. Opening a chat
  marks that room's notifications read.

### App icon (installed PWA)
Grand total needing attention = message unread (Σ per-chat) + activity unread
(bell). The two streams are disjoint, so they sum cleanly.

## Files
- `js/core/unread.js` — `NFA_computeRoomUnread` (shared engine). NEW.
- `js/core/feed.js` — `NFA_unreadCount` (activity count, already shared).
- `js/mobile.js` — `_reconcileUnread()`, bell decoupled in `_refreshNotifBadge`,
  `_updateAppBadge` = messages + bell, `_onNewMessage` no longer bumps the bell,
  reconcile wired into startup/poll/realtime/reconnect/foreground.
- `supabase/functions/send-push/index.ts` — notification rows for @mentions only.
- `js/ui-feed.js` / `js/main.js` — web bell already uses `NFA_unreadCount`
  (Phase 7.4); web chat-list message unread reconcile is the follow-up (v123).

## 🔒 Deploy actions
1. **Redeploy the `send-push` edge function** (so plain messages stop creating
   notification rows). Existing surplus message-notifications age out / get marked
   read on chat open; optionally one-time:
   `update notifications set is_read=true where type='message';`
2. Merge branch → `main` for v122.
3. No new tables — `room_reads` already exists (20260707_room_reads.sql).

## Verify
- Reload the app with unread chats → the chat-list badges are correct immediately
  (DB-derived), not blank-until-a-message-arrives.
- Kill realtime (airplane toggle) → counts still reconcile within 60s.
- Someone messages a group you're in → that group's row shows unread; the BELL does
  NOT change. Open it → the row clears and stays clear.
- Someone @mentions you / reacts to you → the BELL increments. Open the chat or the
  Activity feed → the bell clears.
