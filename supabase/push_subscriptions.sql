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

-- The edge function uses the service role (bypasses RLS) to read recipients'
-- subscriptions when sending. Authenticated users manage their OWN rows.
--
-- IMPORTANT: a push endpoint is tied to the browser's service-worker
-- registration, NOT to the user. When a second account signs in on the SAME
-- device/browser, the client re-subscribes and gets the SAME endpoint that the
-- previous user already saved. The upsert then does an UPDATE on that existing
-- row — which the old single "own_push_subs" policy blocked with 403 because the
-- row still belonged to the previous user. These split policies let the new user
-- CLAIM (re-own) the endpoint, while WITH CHECK guarantees you can only ever
-- write a row owned by yourself — you can never assign a subscription to anyone
-- else. Safe, and it clears the 403 on shared devices.
drop policy if exists "own_push_subs"     on public.push_subscriptions;
drop policy if exists "push_select_own"   on public.push_subscriptions;
drop policy if exists "push_insert_own"   on public.push_subscriptions;
drop policy if exists "push_update_claim" on public.push_subscriptions;
drop policy if exists "push_delete_own"   on public.push_subscriptions;

create policy "push_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

create policy "push_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

-- Claim/refresh any endpoint, but only INTO your own ownership.
create policy "push_update_claim" on public.push_subscriptions
  for update to authenticated using (true) with check (user_id = auth.uid());

create policy "push_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

create index if not exists push_subs_user on public.push_subscriptions(user_id);
