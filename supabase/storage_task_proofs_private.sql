-- ═════════════════════════════════════════════════════════════════════════════
-- Storage: private "task-proofs" bucket with per-tenant isolation.
-- Fixes "Bucket not found" (404) on file open, and keeps files viewable ONLY by
-- users of the same school. Files are served via short-lived signed URLs; the
-- app already signs on open (openSecureFile / _openTaskFile / createSignedUrl).
--
-- Isolation is enforced via storage.objects.owner (the uploader's auth uid):
-- you may read a file only if its uploader shares your tenant. No path changes
-- required. Run in the Supabase SQL editor.
--
-- NOTE: if your Supabase version exposes the uploader as `owner_id` (text)
-- instead of `owner` (uuid), replace `owner` with `owner_id::uuid` below.
-- ═════════════════════════════════════════════════════════════════════════════

-- Private bucket (no public URLs).
insert into storage.buckets (id, name, public)
values ('task-proofs', 'task-proofs', false)
on conflict (id) do update set public = false;

-- Reset policies so this is idempotent.
drop policy if exists "tp_select" on storage.objects;
drop policy if exists "tp_insert" on storage.objects;
drop policy if exists "tp_update" on storage.objects;
drop policy if exists "tp_delete" on storage.objects;

-- READ: same-tenant only (uploader's tenant must equal the reader's tenant).
create policy "tp_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-proofs'
    and (select p1.tenant_id from public.profiles p1 where p1.id = owner)
      = (select p2.tenant_id from public.profiles p2 where p2.id = auth.uid())
  );

-- WRITE: any authenticated user; storage sets owner = auth.uid() automatically.
create policy "tp_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'task-proofs' and owner = auth.uid());

create policy "tp_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'task-proofs' and owner = auth.uid());

create policy "tp_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'task-proofs' and owner = auth.uid());
