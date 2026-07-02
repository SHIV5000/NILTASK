-- ─────────────────────────────────────────────────────────────────────────────
-- v36 — Tenant repair + group seeding (NILTASK)
--
-- WHY: Creating a group failed with
--   "insert or update on table room_settings violates foreign key constraint
--    room_settings_tenant_id_fkey"
-- because some profiles / allowed_users carry a tenant_id that has NO matching
-- row in public.tenants (orphaned during signup). Any write to a tenant-scoped
-- table (room_settings, …) then fails the FK check.
--
-- This migration is idempotent and safe to re-run. Review before applying.
--
-- Section 1 — backfill missing tenants rows (fixes the FK error at the source).
-- Section 2 — preserve history: seed room_settings for rooms that already have
--             messages but no settings row (so old default-room chats stay
--             visible as named groups after we stop hard-coding departments).
-- Section 3 — ensure every tenant has a single "General" starter group so the
--             app is never empty and the default room ('general') resolves.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Section 1: repair orphaned tenants ──────────────────────────────────────
-- NOTE: tenants requires school_name, principal_name, mobile (all NOT NULL, no
-- default). school_name/mobile are placeholders (the original values are not
-- recoverable here); principal_name is pulled from an existing profile/allowed_user
-- when available. Rename afterwards via UPDATE.
insert into public.tenants (id, school_name, principal_name, mobile)
select p.tenant_id, 'School (auto-repaired)', coalesce(max(p.full_name), 'Principal'), 'N/A'
from public.profiles p
left join public.tenants t on t.id = p.tenant_id
where p.tenant_id is not null
  and t.id is null
group by p.tenant_id
on conflict (id) do nothing;

insert into public.tenants (id, school_name, principal_name, mobile)
select a.tenant_id, 'School (auto-repaired)', coalesce(max(a.full_name), 'Principal'), 'N/A'
from public.allowed_users a
left join public.tenants t on t.id = a.tenant_id
where a.tenant_id is not null
  and t.id is null
group by a.tenant_id
on conflict (id) do nothing;

-- ── Section 2: preserve existing room history as named groups ────────────────
-- Any (tenant_id, room_id) that has messages but no room_settings row becomes a
-- group. Direct-message rooms (dm_*) are excluded — they are not groups.
insert into public.room_settings (room_id, tenant_id, name, archived, updated_at)
select distinct
       m.room_id,
       m.tenant_id,
       initcap(replace(m.room_id, '_', ' ')),
       false,
       now()
from public.messages m
left join public.room_settings rs
       on rs.room_id = m.room_id
      and rs.tenant_id = m.tenant_id
where rs.room_id is null
  and m.tenant_id is not null
  and m.room_id is not null
  and m.room_id not like 'dm\_%'
on conflict (room_id, tenant_id) do nothing;

-- ── Section 3: ensure a "General" starter group per tenant ───────────────────
insert into public.room_settings (room_id, tenant_id, name, archived, updated_at)
select 'general', t.id, 'General', false, now()
from public.tenants t
left join public.room_settings rs
       on rs.room_id = 'general'
      and rs.tenant_id = t.id
where rs.room_id is null
on conflict (room_id, tenant_id) do nothing;
