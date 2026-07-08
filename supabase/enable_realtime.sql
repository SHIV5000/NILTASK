-- Enable Supabase Realtime so the app updates live (messages, unread badges,
-- bell, reactions) instead of only on refresh. Run in the SQL editor.
-- Idempotent: adding a table that's already in the publication is skipped
-- silently (the whole script no longer aborts on "already member").
do $$
declare t text;
begin
  foreach t in array array['messages','notifications','reactions','task_assignees']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      -- already in the publication — fine
      null;
    end;
  end loop;
end $$;

-- Durable reaction DELETE delivery: by default a DELETE realtime payload carries
-- only the primary-key column, so the client can't tell WHICH message lost a
-- reaction. REPLICA IDENTITY FULL makes the payload include the whole old row
-- (message_id, value, user_id) so the reaction-remove listener works. Cheap for a
-- small reactions table. (INSERTs are unaffected; broadcast also covers removes.)
alter table public.reactions replica identity full;

-- (Optional) confirm what's enabled:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
