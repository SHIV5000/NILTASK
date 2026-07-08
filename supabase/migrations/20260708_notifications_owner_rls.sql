-- Owner-scoped SELECT / UPDATE / DELETE policies for public.notifications.
--
-- Why: the repo only defined an INSERT policy (self-insert + the "tenant members
-- can notify each other" widening). SELECT/UPDATE/DELETE were relying on
-- policies applied by hand in the dashboard — undocumented and unverifiable. The
-- client code deletes notifications with `.eq('id', id)` alone (ui-panels.js),
-- so without a strict owner DELETE policy either (a) any authenticated user could
-- delete anyone's notification by id, or (b) deletes silently fail and the row
-- reappears on the next poll. These policies make the intent explicit and safe:
-- a user may only ever read, mark-read, or delete their OWN notification rows.
--
-- Idempotent — safe to re-run. INSERT policies are left untouched (see
-- 20260706_notifications_insert_policy.sql); same-command policies are OR-ed.
alter table public.notifications enable row level security;

drop policy if exists "own_notifications_select" on public.notifications;
create policy "own_notifications_select"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "own_notifications_update" on public.notifications;
create policy "own_notifications_update"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own_notifications_delete" on public.notifications;
create policy "own_notifications_delete"
  on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());
