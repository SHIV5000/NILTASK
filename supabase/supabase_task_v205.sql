begin;

-- ============================================================================
-- NILTASK v205 — Extension, timeline and task-notification consistency
-- Multi-tenant; UUID-safe; one notification path; one compiled reply path.
-- ============================================================================

-- 1. Extension request table: normalize columns and restore the profile FK
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

alter table public.task_extension_requests
    add column if not exists decided_by uuid null,
    add column if not exists decision_reason text null,
    add column if not exists decided_at timestamptz null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.task_extension_requests'::regclass
          and conname = 'task_extension_requests_assignee_id_fkey'
    ) then
        alter table public.task_extension_requests
        add constraint task_extension_requests_assignee_id_fkey
        foreign key (assignee_id) references public.profiles(id)
        on delete cascade;
    end if;
end $$;

create index if not exists task_extension_requests_task_idx
on public.task_extension_requests(tenant_id, task_id, status, created_at desc);

create unique index if not exists task_extension_one_pending_idx
on public.task_extension_requests(tenant_id, task_id, assignee_id)
where status = 'pending';

alter table public.task_extension_requests enable row level security;

drop policy if exists task_extension_requests_select on public.task_extension_requests;
create policy task_extension_requests_select
on public.task_extension_requests
for select to authenticated
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
            select 1 from public.tasks t
            where t.id = task_id
              and t.tenant_id = tenant_id
              and t.assigned_by = auth.uid()
        )
    )
);

-- 2. Remove stale user triggers from task_trails.
-- Internal PostgreSQL constraint triggers are preserved.
do $$
declare
    r record;
begin
    for r in
        select tgname
        from pg_trigger
        where tgrelid = 'public.task_trails'::regclass
          and not tgisinternal
    loop
        execute format('drop trigger if exists %I on public.task_trails', r.tgname);
    end loop;
end $$;

-- 3. Safe concerned-user task notification broadcaster.
-- Task notifications navigate by task_id; message_id is always NULL.
create or replace function public.notify_task_concerned_users_v205()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_task record;
    v_message text;
begin
    if upper(coalesce(new.action, '')) = 'REMINDER' then
        return new;
    end if;

    select t.id, t.title, t.assigned_by, t.tenant_id
    into v_task
    from public.tasks t
    where t.id = new.task_id
      and t.tenant_id = new.tenant_id;

    if not found then return new; end if;

    v_message :=
        case upper(coalesce(new.action, 'UPDATE'))
            when 'CREATE' then '📋 Task created: '
            when 'ACKNOWLEDGE' then '✅ Task acknowledged: '
            when 'ACK' then '✅ Task acknowledged: '
            when 'START' then '▶️ Work started: '
            when 'UPDATE' then '💬 Progress updated: '
            when 'FILE' then '📎 File uploaded: '
            when 'SUBMIT' then '📬 Submitted for review: '
            when 'ACCEPT' then '🎉 Task completion accepted: '
            when 'RETURN' then '🔄 Task returned for changes: '
            when 'DELEGATE' then '👤 Task delegated: '
            when 'TRANSFER' then '🔁 Task assignment transferred: '
            when 'DEADLINE' then '📅 Task deadline updated: '
            when 'EXTENSION_REQUEST' then '📅 Deadline extension requested: '
            when 'EXTENSION_APPROVED' then '✅ Deadline extension approved: '
            when 'EXTENSION_REJECTED' then '❌ Deadline extension declined: '
            when 'CANCEL' then '🚫 Task cancelled: '
            else '📋 Task updated: '
        end || coalesce(v_task.title, 'Task');

    if nullif(trim(coalesce(new.comment, '')), '') is not null
       and upper(coalesce(new.action, '')) <> 'FILE' then
        v_message := v_message || ' — ' ||
            left(regexp_replace(new.comment, '<[^>]*>', '', 'g'), 100);
    end if;

    insert into public.notifications(
        user_id, tenant_id, task_id, message_id,
        type, message, is_read
    )
    select x.user_id, new.tenant_id, new.task_id, null::uuid,
           'task', left(v_message, 200), false
    from (
        select v_task.assigned_by as user_id
        union
        select ta.assignee_id
        from public.task_assignees ta
        where ta.task_id = new.task_id
          and ta.tenant_id = new.tenant_id
          and (
              ta.status not in ('transferred','cancelled')
              or upper(coalesce(new.action,'')) in ('TRANSFER','CANCEL')
          )
    ) x
    where x.user_id is not null
      and x.user_id <> new.user_id
      and not exists (
          select 1
          from public.notifications n
          where n.tenant_id = new.tenant_id
            and n.task_id = new.task_id
            and n.user_id = x.user_id
            and n.type = 'task'
            and n.message = left(v_message, 200)
            and n.created_at >= now() - interval '5 seconds'
      );

    return new;
end;
$$;

create trigger trg_notify_task_concerned_users_v205
after insert on public.task_trails
for each row
execute function public.notify_task_concerned_users_v205();

-- 4. Compile every trail event below the original message.
create or replace function public.post_task_update_reply_v205()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_title text;
    v_original_text text;
    v_original_id uuid;
    v_room_id text;
    v_label text;
    v_body text;
begin
    select t.title, t.original_message_id::text
    into v_title, v_original_text
    from public.tasks t
    where t.id = new.task_id
      and t.tenant_id = new.tenant_id;

    if not found or nullif(trim(v_original_text), '') is null then
        return new;
    end if;

    begin
        v_original_id := trim(v_original_text)::uuid;
    exception when invalid_text_representation then
        raise warning 'NILTASK v205: invalid original_message_id % for task %',
            v_original_text, new.task_id;
        return new;
    end;

    select m.room_id::text
    into v_room_id
    from public.messages m
    where m.id = v_original_id
      and m.tenant_id = new.tenant_id
    limit 1;

    if not found then return new; end if;

    if exists (
        select 1
        from public.messages m
        where m.tenant_id = new.tenant_id
          and m.parent_message_id = v_original_id
          and m.text like '%data-task-trail-id="' || new.id::text || '"%'
    ) then
        return new;
    end if;

    v_label := case upper(coalesce(new.action,'UPDATE'))
        when 'CREATE' then 'Task created'
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

    v_body :=
        '<div data-task-event="1" data-task-id="' || new.task_id::text ||
        '" data-task-trail-id="' || new.id::text || '">' ||
        '<p>📋 <strong>' ||
        replace(replace(replace(coalesce(v_title,'Task'),'&','&amp;'),'<','&lt;'),'>','&gt;') ||
        '</strong></p><p><strong>' ||
        replace(replace(replace(v_label,'&','&amp;'),'<','&lt;'),'>','&gt;') ||
        '</strong>' ||
        case when nullif(trim(coalesce(new.comment,'')),'') is not null
             then ' — ' || replace(replace(replace(new.comment,'&','&amp;'),'<','&lt;'),'>','&gt;')
             else '' end ||
        '</p></div>';

    begin
        insert into public.messages(
            room_id, parent_message_id, sender_id,
            tenant_id, text, created_at
        ) values (
            v_room_id, v_original_id, new.user_id,
            new.tenant_id, v_body, now()
        );
    exception when others then
        raise warning 'NILTASK v205 reply skipped for task %: %',
            new.task_id, sqlerrm;
    end;

    return new;
end;
$$;

create trigger trg_post_task_update_reply_v205
after insert on public.task_trails
for each row
execute function public.post_task_update_reply_v205();

-- 5. Extension request RPC. No text value is ever written to notifications.message_id.
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
    if p_requested_deadline is null then raise exception 'Requested deadline is required'; end if;
    if nullif(trim(p_reason),'') is null then raise exception 'Reason is required'; end if;

    if not exists (
        select 1 from public.task_assignees ta
        where ta.task_id = p_task_id
          and ta.tenant_id = p_tenant_id
          and ta.assignee_id = v_user
          and ta.status not in ('accepted','transferred','cancelled')
    ) then
        raise exception 'You are not an active assignee on this task';
    end if;

    if exists (
        select 1 from public.task_extension_requests r
        where r.task_id = p_task_id
          and r.tenant_id = p_tenant_id
          and r.assignee_id = v_user
          and r.status = 'pending'
    ) then
        raise exception 'A deadline-extension request is already pending';
    end if;

    insert into public.task_extension_requests(
        tenant_id, task_id, assignee_id,
        requested_deadline, reason, status
    ) values (
        p_tenant_id, p_task_id, v_user,
        p_requested_deadline, trim(p_reason), 'pending'
    ) returning id into v_request_id;

    insert into public.task_trails(
        task_id, user_id, tenant_id, action, comment
    ) values (
        p_task_id, v_user, p_tenant_id, 'EXTENSION_REQUEST',
        'Requested deadline ' || to_char(p_requested_deadline,'DD Mon YYYY') ||
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
    select r.*, t.assigned_by
    into v_req
    from public.task_extension_requests r
    join public.tasks t
      on t.id = r.task_id and t.tenant_id = r.tenant_id
    where r.id = p_request_id
      and r.tenant_id = p_tenant_id
      and r.status = 'pending';

    if not found then raise exception 'Pending extension request not found'; end if;
    if v_req.assigned_by <> v_user then
        raise exception 'Only the task creator may decide this request';
    end if;

    update public.task_extension_requests
    set status = case when p_approve then 'approved' else 'declined' end,
        decided_by = v_user,
        decision_reason = nullif(trim(coalesce(p_decision_reason,'')),''),
        decided_at = now()
    where id = p_request_id and tenant_id = p_tenant_id;

    if p_approve then
        update public.tasks
        set deadline = v_req.requested_deadline
        where id = v_req.task_id and tenant_id = p_tenant_id;
    end if;

    insert into public.task_trails(
        task_id, user_id, tenant_id, action, comment
    ) values (
        v_req.task_id, v_user, p_tenant_id,
        case when p_approve then 'EXTENSION_APPROVED' else 'EXTENSION_REJECTED' end,
        case when p_approve
             then 'Deadline extended to ' || to_char(v_req.requested_deadline,'DD Mon YYYY')
             else 'Deadline extension declined' ||
                  case when nullif(trim(coalesce(p_decision_reason,'')),'') is not null
                       then ' — ' || trim(p_decision_reason) else '' end
        end
    );
end;
$$;

revoke all on function public.request_task_extension(uuid,date,text,uuid) from public;
revoke all on function public.respond_task_extension(uuid,boolean,text,uuid) from public;
grant execute on function public.request_task_extension(uuid,date,text,uuid) to authenticated;
grant execute on function public.respond_task_extension(uuid,boolean,text,uuid) to authenticated;

commit;

-- Verification output
select
    'v205' as niltask_version,
    (select count(*) from pg_trigger
      where tgrelid='public.task_trails'::regclass and not tgisinternal) as task_trail_user_triggers,
    exists (
        select 1 from pg_constraint
        where conrelid='public.task_extension_requests'::regclass
          and conname='task_extension_requests_assignee_id_fkey'
    ) as extension_profile_fk_present;
