-- Native push tokens (Capacitor + FCM/APNs). One row per device token.
-- The send-push edge function (service role) reads these to deliver OS-level
-- push to the native Android/iOS apps, alongside the existing Web-Push path.
create table if not exists public.push_tokens (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  tenant_id  uuid,
  token      text        not null,
  platform   text,                       -- 'android' | 'ios'
  updated_at timestamptz default now(),
  primary key (token)
);

alter table public.push_tokens enable row level security;

-- A user manages only their own tokens; the edge function uses the service role
-- (bypasses RLS) to read recipients' tokens when sending. UPDATE can claim a
-- token into your own ownership (same device, new login) — WITH CHECK still
-- forces the row to be owned by the caller (mirrors push_subscriptions.sql).
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own" on public.push_tokens
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own" on public.push_tokens
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_claim" on public.push_tokens;
create policy "push_tokens_update_claim" on public.push_tokens
  for update to authenticated using (true) with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own" on public.push_tokens
  for delete to authenticated using (user_id = auth.uid());

create index if not exists push_tokens_user on public.push_tokens(user_id);
