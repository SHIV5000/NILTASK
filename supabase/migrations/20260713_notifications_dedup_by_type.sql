-- Fix: reaction/reply notifications silently dropped.
--
-- The old dedup index notifications_user_msg_uq was UNIQUE(user_id, message_id).
-- That collapses EVERY notification type for a single message into one row, so a
-- 'reaction' (or a second 'reply') on a message that already has a 'message'
-- notification hits a 23505 unique violation and is silently dropped — which is
-- why reactions never reached the recipient's bell / Activity feed.
--
-- Widen the dedup to (user_id, message_id, type) so a message notification, a
-- reply notification, and a reaction notification for the same message can
-- coexist (one per type). send-push's upsert onConflict is updated to match.
-- Idempotent — safe to re-run.

-- Remove rows that would violate the NEW (user_id, message_id, type) uniqueness,
-- keeping the earliest of each group.
delete from public.notifications a
using public.notifications b
where a.ctid > b.ctid
  and a.user_id = b.user_id
  and a.message_id = b.message_id
  and coalesce(a.type,'') = coalesce(b.type,'')
  and a.message_id is not null;

drop index if exists public.notifications_user_msg_uq;

create unique index if not exists notifications_user_msg_type_uq
  on public.notifications (user_id, message_id, type)
  where message_id is not null;
