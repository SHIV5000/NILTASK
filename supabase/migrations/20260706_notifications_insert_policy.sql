-- Let tenant members create notifications FOR EACH OTHER.
--
-- Why: reaction- and reply-notifications are inserted by the ACTOR on behalf of
-- the target user (e.g. when you react to Amit's message, the app inserts a
-- notification row with user_id = Amit). The notifications table's RLS only
-- permitted user_id = auth.uid() inserts, so every cross-user notification
-- (reactions, quick-text tags, replies) was silently rejected — which is why
-- nothing showed in the bell / Activity feed for the affected user. Plain
-- message notifications worked only because there the RECIPIENT self-inserts.
--
-- This policy widens INSERT to any target user within the actor's OWN tenant
-- (RLS policies for the same command are OR-ed, so this adds to — does not
-- replace — any existing self-insert policy). SELECT stays as-is: a user still
-- only reads their own notifications.
alter table public.notifications enable row level security;

drop policy if exists "tenant members can notify each other" on public.notifications;
create policy "tenant members can notify each other"
  on public.notifications
  for insert
  to authenticated
  with check (
    tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid())
  );
