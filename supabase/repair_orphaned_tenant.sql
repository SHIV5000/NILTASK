-- ═════════════════════════════════════════════════════════════════════════════
-- ONE-TIME REPAIR — fixes "room_settings_tenant_id_fkey" on group creation.
--
-- Cause: the logged-in school's profiles.tenant_id has no matching row in
-- public.tenants, so any insert into a tenant-scoped table (room_settings) fails
-- the foreign key. The tenants row is normally created by complete_tenant_signup
-- at signup; it failed/partially ran for this school. Run this in the Supabase
-- SQL editor. Idempotent — safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── STEP 0 — DIAGNOSE (run first, read the output) ──────────────────────────
-- (a) Which schools are orphaned? Expect >=1 row before repair, 0 rows after.
select p.tenant_id, count(*) as profiles
from public.profiles p
left join public.tenants t on t.id = p.tenant_id
where p.tenant_id is not null and t.id is null
group by p.tenant_id;

-- (b) Mandatory columns of tenants — if STEP 1 errors "null value in column X
--     violates not-null", add X (and a value) to the insert below.
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'tenants'
order by ordinal_position;


-- ── STEP 1 — REPAIR (creates the missing tenants rows) ──────────────────────
-- tenants requires school_name, principal_name, mobile (all NOT NULL, no default).
-- school_name/mobile are placeholders; principal_name is taken from an existing
-- profile/allowed_user for that tenant when available. Rename later, e.g.:
--   update public.tenants set school_name='...', mobile='...' where id='...';
insert into public.tenants (id, school_name, principal_name, mobile)
select p.tenant_id,
       'School (repaired — rename me)',
       coalesce(max(p.full_name), 'Principal'),
       'N/A'
from public.profiles p
left join public.tenants t on t.id = p.tenant_id
where p.tenant_id is not null and t.id is null
group by p.tenant_id
on conflict (id) do nothing;

insert into public.tenants (id, school_name, principal_name, mobile)
select a.tenant_id,
       'School (repaired — rename me)',
       coalesce(max(a.full_name), 'Principal'),
       'N/A'
from public.allowed_users a
left join public.tenants t on t.id = a.tenant_id
where a.tenant_id is not null and t.id is null
group by a.tenant_id
on conflict (id) do nothing;


-- ── STEP 2 — GROUPS (preserve history + guarantee a General group) ──────────
insert into public.room_settings (room_id, tenant_id, name, archived, updated_at)
select distinct m.room_id, m.tenant_id, initcap(replace(m.room_id, '_', ' ')), false, now()
from public.messages m
left join public.room_settings rs on rs.room_id = m.room_id and rs.tenant_id = m.tenant_id
where rs.room_id is null and m.tenant_id is not null
  and m.room_id is not null and m.room_id not like 'dm\_%'
on conflict (room_id, tenant_id) do nothing;

insert into public.room_settings (room_id, tenant_id, name, archived, updated_at)
select 'general', t.id, 'General', false, now()
from public.tenants t
left join public.room_settings rs on rs.room_id = 'general' and rs.tenant_id = t.id
where rs.room_id is null
on conflict (room_id, tenant_id) do nothing;


-- ── STEP 3 — VERIFY (should return 0 rows) ──────────────────────────────────
select p.tenant_id
from public.profiles p
left join public.tenants t on t.id = p.tenant_id
where p.tenant_id is not null and t.id is null;
