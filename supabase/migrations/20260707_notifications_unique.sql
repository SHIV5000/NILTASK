-- Dedup key for server-authoritative notifications.
--
-- The send-push edge function now upserts a notifications row per recipient on
-- every message (onConflict: user_id,message_id, ignoreDuplicates). That needs a
-- unique index on (user_id, message_id) or the upsert has nothing to conflict on.
--
-- First remove any existing duplicates (same user + same message) so the unique
-- index can be created, keeping the earliest row.
delete from public.notifications a
using public.notifications b
where a.ctid > b.ctid
  and a.user_id = b.user_id
  and a.message_id = b.message_id
  and a.message_id is not null;

create unique index if not exists notifications_user_msg_uq
  on public.notifications (user_id, message_id)
  where message_id is not null;
