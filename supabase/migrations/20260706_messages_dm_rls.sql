-- CRITICAL PRIVACY FIX — DM messages leak to non-participants over Realtime.
--
-- Evidence (server logs, 2026-07-06): 20% of DM messages had their realtime
-- INSERT event delivered to tenant members who are NOT one of the two DM
-- participants. Supabase Realtime applies the table's RLS SELECT policy to
-- postgres_changes, so outsiders receiving DM rows means the current SELECT
-- policy lets ANY tenant member read DM rows. The app hides them in the UI, but
-- the plaintext reaches every member's browser over the websocket (readable via
-- dev tools) — a real confidentiality breach.
--
-- Fix: a SELECT policy that allows reading a message only when it is a NON-DM
-- room in the user's tenant, OR a DM (room_id 'dm_<uidA>_<uidB>') in which the
-- caller is one of the two participants. This plugs both the realtime leak and
-- direct REST reads.
--
-- ── STEP 1 (run first, inspect output) ──────────────────────────────────────
-- List existing SELECT policies on messages so you know which permissive one to
-- drop (a new policy is OR-ed with existing ones, so the old broad policy must
-- be removed or the leak persists):
--
--   select policyname, cmd, qual
--   from pg_policies
--   where schemaname='public' and tablename='messages' and cmd='SELECT';
--
-- Drop the over-permissive SELECT policy it reveals, e.g.:
--   drop policy "<name from step 1>" on public.messages;
--
-- ── STEP 2 (the correct policy) ─────────────────────────────────────────────
alter table public.messages enable row level security;

drop policy if exists "read tenant msgs; DMs participant-only" on public.messages;
create policy "read tenant msgs; DMs participant-only"
  on public.messages
  for select
  to authenticated
  using (
    tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid())
    and (
      room_id not like 'dm\_%' escape '\'                    -- group/channel: any tenant member
      or auth.uid()::text = split_part(room_id, '_', 2)      -- DM participant A
      or auth.uid()::text = split_part(room_id, '_', 3)      -- DM participant B
    )
  );

-- ── STEP 3 (verify) ─────────────────────────────────────────────────────────
-- As a user NOT in a given DM, `select * from messages where room_id='dm_x_y'`
-- must return 0 rows; the two participants still see their history; group rooms
-- are unaffected. Re-run the app: a DM from A→B no longer reaches uninvolved C's
-- realtime channel (confirm C's console shows no msg:INSERT for that room).
