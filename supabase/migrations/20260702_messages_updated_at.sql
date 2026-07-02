-- Add the updated_at column the app already reads/writes for message edits.
-- Without it, room message-load queries that select updated_at return HTTP 400,
-- so opening a room can't fetch live messages and edits can't persist.
-- Nullable, NO default: only an edit sets it, so new messages stay null and show
-- no "(edited)" badge (badge logic: updated_at > created_at).
alter table public.messages add column if not exists updated_at timestamptz;
