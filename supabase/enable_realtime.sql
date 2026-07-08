-- Enable Supabase Realtime so the app updates live (messages, unread badges,
-- bell, reactions) instead of only on refresh. Run in the SQL editor.
-- If a table is already in the publication, that line errors harmlessly —
-- just run the remaining lines.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.task_assignees;

-- Durable reaction DELETE delivery: by default a DELETE realtime payload carries
-- only the primary-key column, so the client can't tell WHICH message lost a
-- reaction. REPLICA IDENTITY FULL makes the payload include the whole old row
-- (message_id, value, user_id) so the reaction-remove listener works. Cheap for a
-- small reactions table. (INSERTs are unaffected; broadcast also covers removes.)
alter table public.reactions replica identity full;

-- (Optional) confirm what's enabled:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
