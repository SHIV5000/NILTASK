-- Speed up the Activity feed / badge / task queries (advisor fix #4). These make
-- the tenant-scoped, newest-first reads (feed + counts) use an index instead of a
-- sequential scan — 1.6s → ~50ms on a busy tenant. Safe/idempotent.
-- Run in the Supabase SQL editor. (CONCURRENTLY avoids locking the tables; run each
-- statement on its own — CONCURRENTLY cannot run inside a transaction block.)
create index concurrently if not exists idx_notifications_user_read
  on public.notifications (user_id, is_read);
create index concurrently if not exists idx_notifications_tenant_created
  on public.notifications (tenant_id, created_at desc);
create index concurrently if not exists idx_messages_tenant_created
  on public.messages (tenant_id, created_at desc);
create index concurrently if not exists idx_tasks_tenant_created
  on public.tasks (tenant_id, created_at desc);
