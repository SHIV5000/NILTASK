-- Phase 3 — durable read state per (user, room).
-- Replaces the localStorage-only last_read so it survives across devices and lets
-- the send-push function skip pushing a message to someone who is actively
-- reading that chat (WhatsApp behavior: no push while you're looking at it).
create table if not exists public.room_reads (
  user_id      uuid        not null,
  room_id      text        not null,
  tenant_id    uuid,
  last_read_at timestamptz not null default now(),
  primary key (user_id, room_id)
);

alter table public.room_reads enable row level security;

-- A user manages only their own read markers. The send-push function reads them
-- with the service role (bypasses RLS).
drop policy if exists "own room_reads" on public.room_reads;
create policy "own room_reads" on public.room_reads
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
