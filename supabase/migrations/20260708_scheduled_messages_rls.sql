-- Owner-scoped RLS for public.scheduled_messages.
--
-- Why: the client cancels a scheduled message with `.delete().eq('id', id)`
-- (ui-panels.js deleteScheduled) with no sender/tenant guard. Without a strict
-- owner policy, one user could cancel another user's scheduled message. These
-- policies scope every command to the row's own sender within their tenant. The
-- send-push / scheduler edge function uses the service role and bypasses RLS.
--
-- Idempotent — safe to re-run.
alter table public.scheduled_messages enable row level security;

drop policy if exists "own_scheduled_select" on public.scheduled_messages;
create policy "own_scheduled_select"
  on public.scheduled_messages
  for select
  to authenticated
  using (sender_id = auth.uid());

drop policy if exists "own_scheduled_insert" on public.scheduled_messages;
create policy "own_scheduled_insert"
  on public.scheduled_messages
  for insert
  to authenticated
  with check (sender_id = auth.uid());

drop policy if exists "own_scheduled_update" on public.scheduled_messages;
create policy "own_scheduled_update"
  on public.scheduled_messages
  for update
  to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

drop policy if exists "own_scheduled_delete" on public.scheduled_messages;
create policy "own_scheduled_delete"
  on public.scheduled_messages
  for delete
  to authenticated
  using (sender_id = auth.uid());
