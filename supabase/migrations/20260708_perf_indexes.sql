-- Phase 2.4 — performance indexes. All are additive, non-locking (created
-- CONCURRENTLY where possible), and idempotent. Run in the Supabase SQL editor.
-- These target the hot read paths that currently do sequential scans as row
-- counts grow (chat load, task panel, batch reaction fetch, unread badge).

-- Chat room load: WHERE room_id + tenant_id ORDER BY created_at DESC LIMIT n
create index if not exists msg_room_tenant_created
  on public.messages (room_id, tenant_id, created_at desc);

-- Task panel: WHERE tenant_id ORDER BY created_at DESC
create index if not exists tasks_tenant_created
  on public.tasks (tenant_id, created_at desc);

-- Batch reaction fetch: WHERE message_id IN (...)
create index if not exists reactions_message
  on public.reactions (message_id);

-- Unread badge + feed: WHERE user_id + is_read
create index if not exists notifications_user_read
  on public.notifications (user_id, is_read);

-- Feed / activity ordering by recency per user
create index if not exists notifications_user_created
  on public.notifications (user_id, created_at desc);
