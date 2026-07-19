begin;

-- NILTASK v206
-- Exactly one deadline-extension request per tenant/task/assignee.

-- If older deployments allowed duplicates, retain the newest row.
with ranked as (
    select
        id,
        row_number() over (
            partition by tenant_id, task_id, assignee_id
            order by created_at desc, id desc
        ) as duplicate_number
    from public.task_extension_requests
)
delete from public.task_extension_requests r
using ranked x
where r.id = x.id
  and x.duplicate_number > 1;

drop index if exists public.task_extension_one_pending_idx;
drop index if exists public.task_extension_one_per_user_task_idx;

create unique index task_extension_one_per_user_task_idx
on public.task_extension_requests(
    tenant_id,
    task_id,
    assignee_id
);

create or replace function public.request_task_extension(
    p_task_id uuid,
    p_requested_deadline date,
    p_reason text,
    p_tenant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid := auth.uid();
    v_request_id uuid;
begin
    if v_user is null then
        raise exception 'Authentication required';
    end if;

    if p_requested_deadline is null then
        raise exception 'Requested deadline is required';
    end if;

    if nullif(trim(p_reason), '') is null then
        raise exception 'Reason is required';
    end if;

    if not exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = p_task_id
          and ta.tenant_id = p_tenant_id
          and ta.assignee_id = v_user
          and ta.status not in ('accepted','transferred','cancelled')
    ) then
        raise exception 'You are not an active assignee on this task';
    end if;

    if exists (
        select 1
        from public.task_extension_requests r
        where r.tenant_id = p_tenant_id
          and r.task_id = p_task_id
          and r.assignee_id = v_user
    ) then
        raise exception 'Only one extension request is allowed for this task';
    end if;

    insert into public.task_extension_requests(
        tenant_id,
        task_id,
        assignee_id,
        requested_deadline,
        reason,
        status
    )
    values (
        p_tenant_id,
        p_task_id,
        v_user,
        p_requested_deadline,
        trim(p_reason),
        'pending'
    )
    returning id into v_request_id;

    insert into public.task_trails(
        task_id,
        user_id,
        tenant_id,
        action,
        comment
    )
    values (
        p_task_id,
        v_user,
        p_tenant_id,
        'EXTENSION_REQUEST',
        'Requested deadline ' ||
        to_char(p_requested_deadline, 'DD Mon YYYY') ||
        ' — ' || trim(p_reason)
    );

    return v_request_id;
end;
$$;

revoke all on function public.request_task_extension(uuid,date,text,uuid)
from public;

grant execute on function public.request_task_extension(uuid,date,text,uuid)
to authenticated;

commit;

select
    'v206' as niltask_version,
    exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and indexname = 'task_extension_one_per_user_task_idx'
    ) as one_request_per_task_enabled;
