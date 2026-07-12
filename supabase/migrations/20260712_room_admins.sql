-- Per-department co-admins. A department (room_settings row) can name specific
-- staff as co-admins who may edit/manage that department (rename, photo, staff,
-- archive) even without the tenant-wide "manage groups" role.
-- Run in the Supabase SQL editor. Safe/idempotent.
alter table public.room_settings
  add column if not exists admins jsonb not null default '[]'::jsonb;
