-- app_logs: centralized real-time log storage for NILTASK
-- Enable Supabase Realtime on this table in the dashboard after running this migration.

create table if not exists app_logs (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    level       text not null check (level in ('debug','info','warn','error')),
    category    text not null,
    message     text not null,
    data        jsonb,
    tenant_id   uuid references tenants(id) on delete cascade,
    user_id     uuid references auth.users(id) on delete set null,
    session_id  text,
    page_url    text
);

create index if not exists app_logs_tenant_time  on app_logs (tenant_id, created_at desc);
create index if not exists app_logs_level_tenant on app_logs (level, tenant_id);
create index if not exists app_logs_created_at   on app_logs (created_at desc);

-- RLS
alter table app_logs enable row level security;

-- Developers see everything
create policy "developer full access" on app_logs
    for all using (
        exists (select 1 from profiles where id = auth.uid() and role = 'developer')
    );

-- Regular users can insert their own tenant's logs
create policy "tenant insert" on app_logs
    for insert with check (
        user_id = auth.uid()
        and tenant_id = (select tenant_id from profiles where id = auth.uid())
    );

-- Auto-delete logs older than 30 days via pg_cron (enable pg_cron extension first)
-- Run once manually in Supabase SQL editor:
-- select cron.schedule('delete-old-app-logs', '0 2 * * *',
--   $$delete from app_logs where created_at < now() - interval '30 days';$$);
