-- The web reaction handler upserts with on_conflict=(message_id,user_id,value)
-- (js/messages.js:824). PostgREST requires a unique index on those exact columns
-- for on_conflict to work; without it the upsert returns HTTP 400. Add it.
-- (Gap-report item G3 — also prevents duplicate reactions.)

-- Remove any exact duplicates first, else the unique index can't be created.
delete from public.reactions r using public.reactions d
where r.ctid < d.ctid
  and r.message_id = d.message_id and r.user_id = d.user_id and r.value = d.value;

create unique index if not exists reactions_msg_user_value_uq
  on public.reactions (message_id, user_id, value);
