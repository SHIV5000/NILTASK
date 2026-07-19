begin;

-- ============================================================================
-- NILTASK v4.3
-- Stable deadline-extension flow + client-compiled original-message replies.
--
-- The previous database reply trigger is removed because differences between
-- production message-column types caused task actions to fail. Web and mobile
-- now insert replies through the same Supabase client payload used by normal
-- messages, while task_trails remains the audit source of truth.
-- ============================================================================

drop trigger if exists trg_post_task_update_reply on public.task_trails;
drop function if exists public.post_task_update_reply();

create table if not exists public.task_extension_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    task_id uuid not null references public.tasks(id) on delete cascade,
    assignee_id uuid not null,
    requested_deadline date not null,
    reason text not null,
    status text not null default 'pending',
    decided_by uuid null,
    decision_reason text null,
    created_at timestamptz not null default now(),
    decided_at timestamptz null
);

create index if not exists task_extension_requests_task_idx
on public.task_extension_requests(tenant_id, task_id, status, created_at desc);

create unique index if not exists task_extension_one_pending_idx
on public.task_extension_requests(tenant_id, task_id, assignee_id)
where status = 'pending';

alter table public.task_extension_requests enable row level security;

drop policy if exists task_extension_requests_select
on public.task_extension_requests;

create policy task_extension_requests_select
on public.task_extension_requests
for select
to authenticated
using (
    tenant_id = (
        select p.tenant_id
        from public.profiles p
        where p.id = auth.uid()
        limit 1
    )
    and (
        assignee_id = auth.uid()
        or exists (
            select 1
            from public.tasks t
            where t.id = task_id
              and t.tenant_id = tenant_id
              and t.assigned_by = auth.uid()
        )
    )
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
          and ta.status not in ('accepted', 'transferred', 'cancelled')
    ) then
        raise exception 'You are not an active assignee on this task';
    end if;

    if exists (
        select 1
        from public.task_extension_requests r
        where r.task_id = p_task_id
          and r.tenant_id = p_tenant_id
          and r.assignee_id = v_user
          and r.status = 'pending'
    ) then
        raise exception 'A deadline-extension request is already pending';
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

create or replace function public.respond_task_extension(
    p_request_id uuid,
    p_approve boolean,
    p_decision_reason text,
    p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user uuid := auth.uid();
    v_req record;
begin
    if v_user is null then
        raise exception 'Authentication required';
    end if;

    select
        r.id,
        r.task_id,
        r.assignee_id,
        r.requested_deadline,
        r.reason,
        r.status,
        t.assigned_by
    into v_req
    from public.task_extension_requests r
    join public.tasks t
      on t.id = r.task_id
     and t.tenant_id = r.tenant_id
    where r.id = p_request_id
      and r.tenant_id = p_tenant_id
      and r.status = 'pending';

    if not found then
        raise exception 'Pending extension request not found';
    end if;

    if v_req.assigned_by <> v_user then
        raise exception 'Only the task creator may decide this request';
    end if;

    update public.task_extension_requests
    set
        status = case when p_approve then 'approved' else 'rejected' end,
        decided_by = v_user,
        decision_reason = nullif(trim(coalesce(p_decision_reason, '')), ''),
        decided_at = now()
    where id = p_request_id
      and tenant_id = p_tenant_id;

    if p_approve then
        update public.tasks
        set deadline = v_req.requested_deadline
        where id = v_req.task_id
          and tenant_id = p_tenant_id;
    end if;

    insert into public.task_trails(
        task_id,
        user_id,
        tenant_id,
        action,
        comment
    )
    values (
        v_req.task_id,
        v_user,
        p_tenant_id,
        case
            when p_approve then 'EXTENSION_APPROVED'
            else 'EXTENSION_REJECTED'
        end,
        case
            when p_approve then
                'Deadline extended to ' ||
                to_char(v_req.requested_deadline, 'DD Mon YYYY')
            else
                'Deadline extension declined' ||
                case
                    when nullif(trim(coalesce(p_decision_reason, '')), '') is not null
                    then ' — ' || trim(p_decision_reason)
                    else ''
                end
        end
    );
end;
$$;

revoke all on function public.request_task_extension(uuid,date,text,uuid) from public;
revoke all on function public.respond_task_extension(uuid,boolean,text,uuid) from public;

grant execute on function public.request_task_extension(uuid,date,text,uuid)
to authenticated;

grant execute on function public.respond_task_extension(uuid,boolean,text,uuid)
to authenticated;

commit;
