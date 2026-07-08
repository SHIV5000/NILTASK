-- Phase 8 follow-up index. The activity feed (js/core/feed.js) and the unread
-- engine (js/core/unread.js NFA_computeRoomUnread) both scan messages by
-- tenant_id ordered by created_at DESC (tenant-wide, no room filter). The
-- existing msg_room_tenant_created index leads with room_id, so it can't serve
-- that tenant-wide scan — hence the ~1.6s messages.select seen in the logs.
-- This index makes the feed/unread queries index-only-ish. Additive, idempotent.
create index if not exists msg_tenant_created
  on public.messages (tenant_id, created_at desc);
