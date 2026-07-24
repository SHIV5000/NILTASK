-- NILTASK commercial-launch inventory (READ-ONLY)
-- Run in Supabase SQL Editor and export the results.
-- This script does not DROP, ALTER, UPDATE or DELETE anything.

-- 1. User tables and approximate row counts/sizes
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    else c.relkind::text
  end as object_type,
  c.reltuples::bigint as estimated_rows,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname not in ('pg_catalog','information_schema','pg_toast')
  and c.relkind in ('r','p','v','m')
order by pg_total_relation_size(c.oid) desc, n.nspname, c.relname;

-- 2. Functions
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as result_type,
  l.lanname as language,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname not in ('pg_catalog','information_schema')
order by n.nspname, p.proname, arguments;

-- 3. Triggers and trigger functions
select
  event_object_schema as table_schema,
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
order by event_object_schema, event_object_table, trigger_name;

-- 4. RLS policies
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
order by schemaname, tablename, policyname;

-- 5. Extensions
select extname, extversion, n.nspname as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by extname;

-- 6. Foreign keys and dependencies
select
  conrelid::regclass as table_name,
  conname as constraint_name,
  confrelid::regclass as referenced_table,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
order by conrelid::regclass::text, conname;

-- 7. Scheduled cron jobs, when pg_cron is installed
select jobid, schedule, command, nodename, database, username, active
from cron.job
order by jobid;
