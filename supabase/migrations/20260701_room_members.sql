-- Add a shared members list to room_settings so group membership is consistent
-- across devices and users (previously members lived only in per-device localStorage).
alter table if exists public.room_settings
  add column if not exists members jsonb not null default '[]'::jsonb;
