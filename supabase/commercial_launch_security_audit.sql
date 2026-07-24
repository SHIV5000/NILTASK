-- NILTASK commercial-launch security audit
-- READ-ONLY: creates no persistent objects and changes no data.

-- 1. Public tables and RLS status
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls,
  case
    when not c.relrowsecurity then 'CRITICAL: RLS disabled'
    when not exists (
      select 1 from pg_policies p
      where p.schemaname = n.nspname and p.tablename = c.relname
    ) then 'HIGH: RLS enabled but no policies'
    else 'REVIEW'
  end as audit_status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = 'public'
order by audit_status, table_name;

-- 2. RLS policies
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  case
    when qual is null and cmd in ('SELECT','UPDATE','DELETE','ALL') then 'REVIEW: unrestricted USING'
    when with_check is null and cmd in ('INSERT','UPDATE','ALL') then 'REVIEW: unrestricted WITH CHECK'
    when coalesce(qual,'') in ('true','(true)') or coalesce(with_check,'') in ('true','(true)') then 'HIGH: unconditional policy'
    else 'REVIEW'
  end as audit_status
from pg_policies
where schemaname in ('public','storage')
order by schemaname, tablename, policyname;

-- 3. Table privileges granted to browser-facing roles
select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema in ('public','storage')
  and grantee in ('anon','authenticated','public')
group by table_schema, table_name, grantee
order by table_schema, table_name, grantee;

-- 4. Functions exposed to anon/authenticated/public
select
  routine_schema,
  routine_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_routine_grants
where routine_schema = 'public'
  and grantee in ('anon','authenticated','public')
group by routine_schema, routine_name, grantee
order by routine_name, grantee;

-- 5. SECURITY DEFINER functions and search_path safety
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  case
    when p.prosecdef and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting
      where setting like 'search_path=%'
    ) then 'HIGH: SECURITY DEFINER without fixed search_path'
    when p.prosecdef then 'REVIEW'
    else 'STANDARD'
  end as audit_status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by audit_status, function_name, arguments;

-- 6. Function source checks for dynamic SQL and risky constructs
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  case
    when pg_get_functiondef(p.oid) ~* '\mexecute\M' then 'REVIEW: dynamic SQL'
    when pg_get_functiondef(p.oid) ~* 'service_role|authorization|bearer ' then 'CRITICAL: possible embedded secret/auth header'
    when pg_get_functiondef(p.oid) ~* 'http_post|http_get|net\.' then 'REVIEW: outbound network call'
    else 'NO FLAG'
  end as audit_status
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by audit_status, function_name;

-- 7. Public tables without primary keys
select
  t.table_schema,
  t.table_name,
  'REVIEW: no primary key' as audit_status
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_type = 'BASE TABLE'
  and not exists (
    select 1
    from information_schema.table_constraints tc
    where tc.table_schema = t.table_schema
      and tc.table_name = t.table_name
      and tc.constraint_type = 'PRIMARY KEY'
  )
order by t.table_name;

-- 8. Storage buckets and restrictions
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  case
    when public then 'HIGH: public bucket; verify necessity'
    when file_size_limit is null then 'REVIEW: no bucket size limit'
    when allowed_mime_types is null then 'REVIEW: no MIME allowlist'
    else 'CONFIGURED'
  end as audit_status
from storage.buckets
order by audit_status, name;

-- 9. Active cron jobs
select
  jobid,
  schedule,
  command,
  active,
  case
    when command ~* 'YOUR_|<project|service_role|anon_key' then 'CRITICAL: placeholder or secret-like value'
    else 'REVIEW'
  end as audit_status
from cron.job
order by audit_status, jobid;

-- 10. Extensions requiring explicit launch review
select
  e.extname,
  e.extversion,
  n.nspname as schema_name,
  case
    when e.extname in ('http','pg_net','pg_cron','vault') then 'REVIEW: privileged/integration extension'
    else 'STANDARD'
  end as audit_status
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by audit_status, e.extname;

-- 11. Summary counts for launch gate
with public_tables as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname = 'public'
), definer_functions as (
  select p.oid, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
)
select
  (select count(*) from public_tables) as public_table_count,
  (select count(*) from public_tables where not relrowsecurity) as tables_without_rls,
  (select count(*) from public_tables t where t.relrowsecurity and not exists (
    select 1 from pg_policies p where p.schemaname='public' and p.tablename=t.relname
  )) as rls_tables_without_policies,
  (select count(*) from definer_functions) as security_definer_functions,
  (select count(*) from definer_functions f where not exists (
    select 1 from unnest(coalesce(f.proconfig, array[]::text[])) setting
    where setting like 'search_path=%'
  )) as unsafe_definer_search_paths,
  (select count(*) from storage.buckets where public) as public_storage_buckets,
  (select count(*) from cron.job where active) as active_cron_jobs;
