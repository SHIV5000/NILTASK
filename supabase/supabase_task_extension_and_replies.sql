begin;

-- Task extension requests: tenant-scoped workflow with creator approval.
create table if not exists public.task_extension_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    task_id uuid not null references public.tasks(id) on delete cascade,
    assignee_id uuid not null,
    requested_deadline date not null,
    reason text not null,
    status text not null default 'pending' check (status in ('pending','approved','rejected')),
    decided_by uuid null,
    decision_reason text null,
    created_at timestamptz not null default now(),
    decided_at timestamptz null
);

create index if not exists task_extension_requests_task_idx
on public.task_extension_requests(tenant_id, task_id, status, created_at desc);

alter table public.task_extension_requests enable row level security;

drop policy if exists task_extension_requests_select on public.task_extension_requests;
create policy task_extension_requests_select
on public.task_extension_requests for select
to authenticated
using (
    tenant_id in (select p.tenant_id from public.profiles p where p.id = auth.uid())
    and (
        assignee_id = auth.uid()
        or exists (
            select 1 from public.tasks t
            where t.id = task_id
              and t.tenant_id = tenant_id
              and t.assigned_by = auth.uid()
        )
    )
);

-- Request function.
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
    if v_user is null then raise exception 'Authentication required'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'Reason is required'; end if;

    if not exists (
        select 1 from public.task_assignees ta
        where ta.task_id = p_task_id
          and ta.tenant_id = p_tenant_id
          and ta.assignee_id = v_user
          and ta.status not in ('accepted','transferred','cancelled')
    ) then raise exception 'You are not an active assignee on this task'; end if;

    if exists (
        select 1 from public.task_extension_requests r
        where r.task_id=p_task_id and r.tenant_id=p_tenant_id
          and r.assignee_id=v_user and r.status='pending'
    ) then raise exception 'A deadline-extension request is already pending'; end if;

    insert into public.task_extension_requests(
        tenant_id,task_id,assignee_id,requested_deadline,reason
    ) values (
        p_tenant_id,p_task_id,v_user,p_requested_deadline,trim(p_reason)
    ) returning id into v_request_id;

    insert into public.task_trails(task_id,user_id,tenant_id,action,comment)
    values (
        p_task_id,v_user,p_tenant_id,'EXTENSION_REQUEST',
        'Requested deadline '||to_char(p_requested_deadline,'DD Mon YYYY')||' — '||trim(p_reason)
    );

    return v_request_id;
end;
$$;

grant execute on function public.request_task_extension(uuid,date,text,uuid) to authenticated;

-- Creator response function.
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
    select r.*, t.assigned_by, t.title
    into v_req
    from public.task_extension_requests r
    join public.tasks t on t.id=r.task_id and t.tenant_id=r.tenant_id
    where r.id=p_request_id and r.tenant_id=p_tenant_id and r.status='pending';

    if not found then raise exception 'Pending extension request not found'; end if;
    if v_req.assigned_by <> v_user then raise exception 'Only the task creator may decide this request'; end if;

    update public.task_extension_requests
    set status=case when p_approve then 'approved' else 'rejected' end,
        decided_by=v_user,
        decision_reason=nullif(trim(coalesce(p_decision_reason,'')),''),
        decided_at=now()
    where id=p_request_id and tenant_id=p_tenant_id;

    if p_approve then
        update public.tasks
        set deadline=v_req.requested_deadline
        where id=v_req.task_id and tenant_id=p_tenant_id;
    end if;

    insert into public.task_trails(task_id,user_id,tenant_id,action,comment)
    values (
        v_req.task_id,v_user,p_tenant_id,
        case when p_approve then 'EXTENSION_APPROVED' else 'EXTENSION_REJECTED' end,
        case when p_approve
             then 'Deadline extended to '||to_char(v_req.requested_deadline,'DD Mon YYYY')
             else 'Deadline extension declined'||case when nullif(trim(coalesce(p_decision_reason,'')),'') is not null then ' — '||trim(p_decision_reason) else '' end
        end
    );
end;
$$;

grant execute on function public.respond_task_extension(uuid,boolean,text,uuid) to authenticated;

-- Every task-trail event is also compiled as a reply to the original message.
-- created_at is stored as timestamptz; the app renders it in Asia/Kolkata (IST).
create or replace function public.post_task_update_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_task record;
    v_original record;
    v_label text;
    v_text text;
begin
    select id,title,original_message_id,tenant_id into v_task
    from public.tasks
    where id=new.task_id and tenant_id=new.tenant_id;

    if not found or v_task.original_message_id is null then return new; end if;

    select id,room_id into v_original
    from public.messages
    where id=v_task.original_message_id and tenant_id=new.tenant_id;

    if not found then return new; end if;

    v_label := case upper(coalesce(new.action,'UPDATE'))
        when 'ACKNOWLEDGE' then 'Acknowledged'
        when 'ACK' then 'Acknowledged'
        when 'START' then 'Work started'
        when 'UPDATE' then 'Progress update'
        when 'FILE' then 'File uploaded'
        when 'SUBMIT' then 'Submitted for review'
        when 'ACCEPT' then 'Completion accepted'
        when 'RETURN' then 'Returned for changes'
        when 'DELEGATE' then 'Delegated'
        when 'TRANSFER' then 'Transferred'
        when 'REMINDER' then 'Reminder sent'
        when 'DEADLINE' then 'Deadline changed'
        when 'EXTENSION_REQUEST' then 'Deadline extension requested'
        when 'EXTENSION_APPROVED' then 'Deadline extension approved'
        when 'EXTENSION_REJECTED' then 'Deadline extension declined'
        when 'CANCEL' then 'Task cancelled'
        else initcap(lower(coalesce(new.action,'Update')))
    end;

    v_text := '<p>📋 <strong>'||replace(v_task.title,'<','&lt;')||'</strong></p>'||
              '<p><strong>'||replace(v_label,'<','&lt;')||'</strong>'||
              case when nullif(trim(coalesce(new.comment,'')),'') is not null
                   then ' — '||replace(replace(new.comment,'<','&lt;'),'>','&gt;') else '' end||'</p>';

    insert into public.messages(room_id,parent_message_id,sender_id,tenant_id,text,created_at)
    values(v_original.room_id,v_original.id,new.user_id,new.tenant_id,v_text,now());

    return new;
end;
$$;

drop trigger if exists trg_post_task_update_reply on public.task_trails;
create trigger trg_post_task_update_reply
after insert on public.task_trails
for each row execute function public.post_task_update_reply();

commit;
