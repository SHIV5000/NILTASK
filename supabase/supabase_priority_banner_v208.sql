begin;

-- ============================================================================
-- NILTASK v208 — PRIORITY BANNER
-- Tenant-safe meetings, emergency notices, announcements and acknowledgements.
-- ============================================================================

create table if not exists public.priority_banners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  category text not null check (category in ('emergency','urgent','meeting','announcement','information')),
  title text not null check (char_length(title) between 1 and 100),
  message text not null check (char_length(message) between 1 and 600),
  requires_ack boolean not null default true,
  recipient_mode text not null check (recipient_mode in ('all','users','roles','departments')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','expired','withdrawn')),
  withdrawn_at timestamptz,
  withdrawn_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint priority_banner_expiry_after_start check (expires_at > starts_at)
);

create table if not exists public.priority_banner_recipients (
  banner_id uuid not null references public.priority_banners(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  viewed_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (banner_id,user_id)
);

create index if not exists priority_banners_tenant_active_idx
on public.priority_banners(tenant_id,status,expires_at);

create index if not exists priority_banner_recipients_user_idx
on public.priority_banner_recipients(tenant_id,user_id,acknowledged_at);

alter table public.priority_banners enable row level security;
alter table public.priority_banner_recipients enable row level security;

create or replace function public.is_priority_banner_admin(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.user_roles ur
    join public.roles r on r.id=ur.role_id
    join public.profiles p on p.id=ur.user_id
    where ur.user_id=auth.uid()
      and ur.tenant_id=p_tenant_id
      and p.tenant_id=p_tenant_id
      and (
        coalesce((r.permissions->>'admin_panel')::boolean,false)=true
        or lower(r.name) in ('principal','vp_admin','admin','super_admin')
      )
  );
$$;

drop policy if exists priority_banners_recipient_select on public.priority_banners;
create policy priority_banners_recipient_select on public.priority_banners
for select to authenticated
using (
  tenant_id=(select tenant_id from public.profiles where id=auth.uid())
  and (
    public.is_priority_banner_admin(tenant_id)
    or exists(
      select 1 from public.priority_banner_recipients pbr
      where pbr.banner_id=id and pbr.user_id=auth.uid() and pbr.tenant_id=tenant_id
    )
  )
);

drop policy if exists priority_banner_recipients_self_select on public.priority_banner_recipients;
create policy priority_banner_recipients_self_select on public.priority_banner_recipients
for select to authenticated
using (
  tenant_id=(select tenant_id from public.profiles where id=auth.uid())
  and (user_id=auth.uid() or public.is_priority_banner_admin(tenant_id))
);

create or replace function public.publish_priority_banner(
 p_category text,
 p_title text,
 p_message text,
 p_requires_ack boolean,
 p_expires_at timestamptz,
 p_recipient_mode text,
 p_recipient_values text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
 v_uid uuid:=auth.uid();
 v_tenant uuid;
 v_banner uuid;
begin
 select tenant_id into v_tenant from public.profiles where id=v_uid;
 if v_tenant is null or not public.is_priority_banner_admin(v_tenant) then raise exception 'Admin permission required'; end if;
 if p_category not in ('emergency','urgent','meeting','announcement','information') then raise exception 'Invalid category'; end if;
 if p_recipient_mode not in ('all','users','roles','departments') then raise exception 'Invalid recipient mode'; end if;
 if nullif(trim(p_title),'') is null or char_length(trim(p_title))>100 then raise exception 'Title must be 1–100 characters'; end if;
 if nullif(trim(p_message),'') is null or char_length(trim(p_message))>600 then raise exception 'Message must be 1–600 characters'; end if;
 if p_expires_at<=now() then raise exception 'Expiry must be in the future'; end if;

 insert into public.priority_banners(tenant_id,created_by,category,title,message,requires_ack,recipient_mode,expires_at)
 values(v_tenant,v_uid,p_category,trim(p_title),trim(p_message),coalesce(p_requires_ack,true),p_recipient_mode,p_expires_at)
 returning id into v_banner;

 if p_recipient_mode='all' then
   insert into public.priority_banner_recipients(banner_id,tenant_id,user_id)
   select v_banner,v_tenant,p.id from public.profiles p where p.tenant_id=v_tenant;
 elsif p_recipient_mode='users' then
   insert into public.priority_banner_recipients(banner_id,tenant_id,user_id)
   select v_banner,v_tenant,p.id from public.profiles p
   where p.tenant_id=v_tenant and p.id::text=any(coalesce(p_recipient_values,'{}'));
 elsif p_recipient_mode='departments' then
   insert into public.priority_banner_recipients(banner_id,tenant_id,user_id)
   select v_banner,v_tenant,p.id from public.profiles p
   where p.tenant_id=v_tenant and p.department=any(coalesce(p_recipient_values,'{}'));
 else
   insert into public.priority_banner_recipients(banner_id,tenant_id,user_id)
   select distinct v_banner,v_tenant,ur.user_id
   from public.user_roles ur join public.roles r on r.id=ur.role_id
   where ur.tenant_id=v_tenant and (r.display_name=any(coalesce(p_recipient_values,'{}')) or r.name=any(coalesce(p_recipient_values,'{}')));
 end if;

 if not exists(select 1 from public.priority_banner_recipients where banner_id=v_banner) then
   delete from public.priority_banners where id=v_banner;
   raise exception 'No valid recipients selected';
 end if;

 return v_banner;
end;
$$;

create or replace function public.get_my_active_priority_banners()
returns table(
 banner_id uuid,category text,title text,message text,requires_ack boolean,
 created_at timestamptz,expires_at timestamptz,sender_name text
)
language sql
security definer
set search_path=public
as $$
 select b.id,b.category,b.title,b.message,b.requires_ack,b.created_at,b.expires_at,
        coalesce(p.full_name,p.email,'School Admin')
 from public.priority_banners b
 join public.priority_banner_recipients r on r.banner_id=b.id
 left join public.profiles p on p.id=b.created_by
 where r.user_id=auth.uid()
   and r.tenant_id=(select tenant_id from public.profiles where id=auth.uid())
   and b.tenant_id=r.tenant_id
   and b.status='active'
   and b.starts_at<=now()
   and b.expires_at>now()
   and r.acknowledged_at is null
 order by case b.category when 'emergency' then 1 when 'urgent' then 2 when 'meeting' then 3 when 'announcement' then 4 else 5 end,b.created_at desc;
$$;

create or replace function public.acknowledge_priority_banner(p_banner_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
 update public.priority_banner_recipients r
 set viewed_at=coalesce(viewed_at,now()),acknowledged_at=coalesce(acknowledged_at,now()),delivered_at=coalesce(delivered_at,now())
 from public.priority_banners b
 where r.banner_id=p_banner_id and r.banner_id=b.id and r.user_id=auth.uid()
   and r.tenant_id=(select tenant_id from public.profiles where id=auth.uid())
   and b.tenant_id=r.tenant_id;
 if not found then raise exception 'Banner not available for this user'; end if;
end;
$$;

create or replace function public.withdraw_priority_banner(p_banner_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v_tenant uuid;
begin
 select tenant_id into v_tenant from public.priority_banners where id=p_banner_id;
 if v_tenant is null or not public.is_priority_banner_admin(v_tenant) then raise exception 'Admin permission required'; end if;
 update public.priority_banners set status='withdrawn',withdrawn_at=now(),withdrawn_by=auth.uid(),updated_at=now()
 where id=p_banner_id and status='active';
end;
$$;

create or replace function public.admin_priority_banner_dashboard()
returns table(
 id uuid,category text,title text,message text,status text,created_at timestamptz,expires_at timestamptz,
 recipient_count bigint,ack_count bigint,pending_count bigint
)
language sql
security definer
set search_path=public
as $$
 select b.id,b.category,b.title,b.message,
        case when b.status='active' and b.expires_at<=now() then 'expired' else b.status end,
        b.created_at,b.expires_at,
        count(r.user_id),count(r.acknowledged_at),count(r.user_id)-count(r.acknowledged_at)
 from public.priority_banners b
 left join public.priority_banner_recipients r on r.banner_id=b.id
 where b.tenant_id=(select tenant_id from public.profiles where id=auth.uid())
   and public.is_priority_banner_admin(b.tenant_id)
 group by b.id
 order by b.created_at desc
 limit 30;
$$;

create or replace function public.priority_banner_pending_users(p_banner_id uuid)
returns table(user_id uuid,full_name text,email text,department text)
language sql
security definer
set search_path=public
as $$
 select p.id,p.full_name,p.email,p.department
 from public.priority_banner_recipients r
 join public.profiles p on p.id=r.user_id
 join public.priority_banners b on b.id=r.banner_id
 where r.banner_id=p_banner_id and r.acknowledged_at is null
   and public.is_priority_banner_admin(b.tenant_id)
   and b.tenant_id=r.tenant_id
 order by p.full_name,p.email;
$$;

revoke all on function public.publish_priority_banner(text,text,text,boolean,timestamptz,text,text[]) from public;
revoke all on function public.get_my_active_priority_banners() from public;
revoke all on function public.acknowledge_priority_banner(uuid) from public;
revoke all on function public.withdraw_priority_banner(uuid) from public;
revoke all on function public.admin_priority_banner_dashboard() from public;
revoke all on function public.priority_banner_pending_users(uuid) from public;

grant execute on function public.publish_priority_banner(text,text,text,boolean,timestamptz,text,text[]) to authenticated;
grant execute on function public.get_my_active_priority_banners() to authenticated;
grant execute on function public.acknowledge_priority_banner(uuid) to authenticated;
grant execute on function public.withdraw_priority_banner(uuid) to authenticated;
grant execute on function public.admin_priority_banner_dashboard() to authenticated;
grant execute on function public.priority_banner_pending_users(uuid) to authenticated;

do $$
begin
 alter publication supabase_realtime add table public.priority_banners;
exception when duplicate_object then null;
end $$;
do $$
begin
 alter publication supabase_realtime add table public.priority_banner_recipients;
exception when duplicate_object then null;
end $$;

commit;

select 'v208' as niltask_version,
       to_regclass('public.priority_banners') is not null as banners_ready,
       to_regclass('public.priority_banner_recipients') is not null as recipients_ready;
