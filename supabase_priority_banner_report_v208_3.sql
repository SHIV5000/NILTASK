begin;

-- NILTASK Priority Banner v208.3
-- Full recipient report with acknowledged and pending users plus timestamps.

create or replace function public.priority_banner_recipient_report(p_banner_id uuid)
returns table(
  user_id uuid,
  full_name text,
  email text,
  department text,
  role_name text,
  delivered_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz
)
language sql
security definer
set search_path=public
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.department,
    coalesce(r.display_name,r.name,'Staff') as role_name,
    pbr.delivered_at,
    pbr.viewed_at,
    pbr.acknowledged_at
  from public.priority_banner_recipients pbr
  join public.priority_banners b on b.id=pbr.banner_id
  join public.profiles p on p.id=pbr.user_id
  left join public.user_roles ur
    on ur.user_id=p.id
   and ur.tenant_id=b.tenant_id
  left join public.roles r on r.id=ur.role_id
  where pbr.banner_id=p_banner_id
    and b.tenant_id=pbr.tenant_id
    and p.tenant_id=b.tenant_id
    and public.is_priority_banner_admin(b.tenant_id)
  order by
    case when pbr.acknowledged_at is null then 1 else 0 end,
    pbr.acknowledged_at nulls last,
    p.full_name,
    p.email;
$$;

revoke all on function public.priority_banner_recipient_report(uuid) from public;
grant execute on function public.priority_banner_recipient_report(uuid) to authenticated;

commit;

select
  'v208.3' as niltask_version,
  to_regprocedure('public.priority_banner_recipient_report(uuid)') is not null
    as recipient_report_ready;
