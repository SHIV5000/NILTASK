begin;

-- ============================================================================
-- NILTASK v4.2 UUID-SAFE HOTFIX
-- Keeps notifications.message_id as UUID and fixes task replies safely.
-- ============================================================================

-- IMPORTANT:
-- Do not convert notifications.message_id to text.
-- messages.id and notifications.message_id are UUID in this database.

-- Preserve non-task duplicate protection without changing column types.
drop index if exists public.notifications_non_task_user_msg_type_uq;

create unique index if not exists notifications_non_task_user_msg_type_uq
on public.notifications(user_id, message_id, type)
where type <> 'task' and message_id is not null;

create index if not exists notifications_message_lookup_idx
on public.notifications(message_id, user_id, created_at desc)
where message_id is not null;

-- ---------------------------------------------------------------------------
-- Compile every task trail event as a reply to the original message.
-- tasks.original_message_id may be stored as text, but messages.id is UUID.
-- We validate the text before casting it to UUID.
-- Any reply-only problem is logged and cannot roll back the task action.
-- ---------------------------------------------------------------------------
create or replace function public.post_task_update_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_title text;
    v_original_raw text;
    v_original_id uuid;
    v_room_id text;
    v_label text;
    v_text text;
begin
    select
        t.title,
        t.original_message_id::text
    into
        v_title,
        v_original_raw
    from public.tasks t
    where t.id = new.task_id
      and t.tenant_id = new.tenant_id;

    if not found or nullif(trim(v_original_raw), '') is null then
        return new;
    end if;

    -- Validate UUID format before casting.
    if trim(v_original_raw) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise warning 'NILTASK reply skipped: original_message_id % is not a valid UUID for task %',
            v_original_raw, new.task_id;
        return new;
    end if;

    v_original_id := trim(v_original_raw)::uuid;

    select m.room_id::text
    into v_room_id
    from public.messages m
    where m.id = v_original_id
      and m.tenant_id = new.tenant_id
    limit 1;

    if not found or v_room_id is null then
        raise warning 'NILTASK reply skipped: original message % not found for task %',
            v_original_id, new.task_id;
        return new;
    end if;

    v_label := case upper(coalesce(new.action, 'UPDATE'))
        when 'CREATE' then 'Task created'
        when 'ACKNOWLEDGE' then 'Acknowledged'
        when 'ACK' then 'Acknowledged'
        when 'START' then 'Work started'
        when 'UPDATE' then 'Progress update'
        when 'FILE' then 'File uploaded'
        when 'SUBMIT' then 'Submitted for review'
        when 'ACCEPT' then 'Completion accepted'
        when 'RETURN' then 'Returned for changes'
        when 'REWORK' then 'Returned for changes'
        when 'DELEGATE' then 'Delegated'
        when 'TRANSFER' then 'Transferred'
        when 'REMINDER' then 'Reminder sent'
        when 'DEADLINE' then 'Deadline changed'
        when 'EXTENSION_REQUEST' then 'Deadline extension requested'
        when 'EXTENSION_APPROVED' then 'Deadline extension approved'
        when 'EXTENSION_REJECTED' then 'Deadline extension declined'
        when 'CANCEL' then 'Task cancelled'
        else initcap(lower(coalesce(new.action, 'Update')))
    end;

    v_text :=
        '<div data-task-event="1" data-task-id="' || new.task_id::text || '">' ||
        '<p>📋 <strong>' ||
        replace(replace(replace(coalesce(v_title, 'Task'), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
        '</strong></p><p><strong>' ||
        replace(replace(replace(v_label, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
        '</strong>' ||
        case
            when nullif(trim(coalesce(new.comment, '')), '') is not null then
                ' — ' || replace(replace(replace(new.comment, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
            else ''
        end ||
        '</p></div>';

    begin
        insert into public.messages(
            room_id,
            parent_message_id,
            sender_id,
            tenant_id,
            text,
            created_at
        ) values (
            v_room_id,
            v_original_id,
            new.user_id,
            new.tenant_id,
            v_text,
            now()
        );
    exception when others then
        raise warning 'NILTASK reply insert failed for task %: %',
            new.task_id, sqlerrm;
    end;

    return new;
end;
$$;

drop trigger if exists trg_post_task_update_reply
on public.task_trails;

create trigger trg_post_task_update_reply
after insert on public.task_trails
for each row
execute function public.post_task_update_reply();

-- ---------------------------------------------------------------------------
-- Shared deadline-extension request flow for web and mobile.
-- ---------------------------------------------------------------------------
create table if not exists public.task_extension_requests (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null,
    task_id uuid not null references public.tasks(id) on delete cascade,
    assignee_id uuid not null references public.profiles(id) on delete cascade,
    requested_deadline date not null,
    reason text not null,
    status text not null default 'pending',
    reviewed_by uuid null references public.profiles(id),
    review_comment text null,
    reviewed_at timestamptz null,
    created_at timestamptz not null default now(),
    constraint task_extension_status_check
        check (status in ('pending','approved','declined'))
);

create index if not exists task_extension_requests_task_idx
on public.task_extension_requests(tenant_id, task_id, created_at desc);

create unique index if not exists task_extension_one_pending_idx
on public.task_extension_requests(tenant_id, task_id, assignee_id)
where status = 'pending';

alter table public.task_extension_requests enable row level security;

drop policy if exists task_extension_select_tenant
on public.task_extension_requests;

create policy task_extension_select_tenant
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

    if nullif(trim(p_reason), '') is null then
        raise exception 'Reason is required';
    end if;

    if p_requested_deadline is null then
        raise exception 'Requested deadline is required';
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
        reason
    ) values (
        p_tenant_id,
        p_task_id,
        v_user,
        p_requested_deadline,
        trim(p_reason)
    )
    returning id into v_request_id;

    insert into public.task_trails(
        task_id,
        user_id,
        tenant_id,
        action,
        comment
    ) values (
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
