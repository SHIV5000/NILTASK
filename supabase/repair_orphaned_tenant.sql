-- ═════════════════════════════════════════════════════════════════════════════
-- ONE-TIME REPAIR — fixes "room_settings_tenant_id_fkey" on group creation.
--
-- Real cause (from the FK error DETAIL): room_settings.tenant_id is a FOREIGN KEY
-- to the "users" table, but the app (and every other tenant-scoped table:
-- profiles, feature_flags, app_logs, subscriptions) uses tenant_id = tenants.id.
-- So NO valid tenant_id can satisfy the constraint and every group create fails.
-- The fix repoints the constraint at tenants(id).
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── STEP A — inspect every tenant_id foreign key (find any others wired wrong) ─
-- Any row whose definition says REFERENCES users(...) is the bug; it should say
-- REFERENCES tenants(id). Share this output if tables other than room_settings
-- appear, so they can be fixed the same way.
select conrelid::regclass as table_name,
       conname            as constraint_name,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f' and conname like '%tenant_id_fkey%'
order by 1;

-- ── STEP B — ensure the tenants row(s) exist (needed once the FK is correct) ──
-- tenants requires school_name, principal_name, mobile (NOT NULL, no default).
-- Placeholders used; principal_name pulled from a profile/allowed_user if present.
insert into public.tenants (id, school_name, principal_name, mobile)
select p.tenant_id, 'School (repaired — rename me)', coalesce(max(p.full_name), 'Principal'), 'N/A'
from public.profiles p
left join public.tenants t on t.id = p.tenant_id
where p.tenant_id is not null and t.id is null
group by p.tenant_id
on conflict (id) do nothing;

insert into public.tenants (id, school_name, principal_name, mobile)
select a.tenant_id, 'School (repaired — rename me)', coalesce(max(a.full_name), 'Principal'), 'N/A'
from public.allowed_users a
left join public.tenants t on t.id = a.tenant_id
where a.tenant_id is not null and t.id is null
group by a.tenant_id
on conflict (id) do nothing;

-- ── STEP C — repoint the constraint from users(id) to tenants(id) ────────────
alter table public.room_settings drop constraint room_settings_tenant_id_fkey;
-- drop any legacy junk rows whose tenant_id is not a real tenant (normally none)
delete from public.room_settings rs
where not exists (select 1 from public.tenants t where t.id = rs.tenant_id);
alter table public.room_settings
  add constraint room_settings_tenant_id_fkey
  foreign key (tenant_id) references public.tenants(id) on delete cascade;

-- ── STEP D — seed groups (preserve history + guarantee a General group) ──────
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

-- ── STEP E — verify: the constraint now references tenants ───────────────────
select pg_get_constraintdef(oid) as room_settings_tenant_fk
from pg_constraint
where conname = 'room_settings_tenant_id_fkey' and conrelid = 'public.room_settings'::regclass;
