-- Quick-reply tags shared across a tenant (all staff, all devices).
-- The principal edits these in the Admin panel; every staff member's web +
-- mobile reaction/insert menus read them. One row per tenant; tags is a JSON
-- array of { v: label, c: hex, bg: hex+alpha, border: hex+alpha }.
--
-- Run once in the Supabase SQL editor.

create table if not exists public.quick_tags (
  tenant_id  uuid        primary key references public.tenants(id) on delete cascade,
  tags       jsonb       not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.quick_tags enable row level security;

-- Any signed-in member of the tenant can READ their tenant's tags.
drop policy if exists "tenant read quick_tags" on public.quick_tags;
create policy "tenant read quick_tags"
  on public.quick_tags for select
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

-- Members of the tenant can WRITE (the Admin panel is the only UI that does;
-- it is already gated by the admin_panel permission client-side). Mirrors the
-- existing room_settings tenant-scoped write policy.
drop policy if exists "tenant write quick_tags" on public.quick_tags;
create policy "tenant write quick_tags"
  on public.quick_tags for all
  using       (tenant_id = (select tenant_id from public.profiles where id = auth.uid()))
  with check  (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));
