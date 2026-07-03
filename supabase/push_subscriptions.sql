-- Stores each device's Web Push subscription so the send-push edge function can
-- reach users when the app is closed. Run in the Supabase SQL editor.
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  tenant_id    uuid,
  endpoint     text not null unique,
  subscription jsonb not null,
  created_at   timestamptz default now()
);

alter table public.push_subscriptions enable row level security;

-- A user manages only their own subscriptions. The edge function uses the
-- service role (bypasses RLS) to read recipients' subscriptions when sending.
drop policy if exists "own_push_subs" on public.push_subscriptions;
create policy "own_push_subs" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists push_subs_user on public.push_subscriptions(user_id);
