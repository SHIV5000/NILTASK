begin;

-- ============================================================================
-- NILTASK v4.2 — reply compilation, extension flow and notification ID alignment
-- ============================================================================

-- The message system uses text IDs, while notifications.message_id was UUID.
-- Reply notifications therefore failed when a reply row was inserted.
-- Convert without losing existing UUID values.

drop index if exists public.notifications_non_task_user_msg_type_uq;
drop index if exists public.notifications_user_msg_type_uq;

alter table public.notifications
    alter column message_id type text
    using message_id::text;

create unique index if not exists notifications_non_task_user_msg_type_uq
on public.notifications(user_id, message_id, type)
where type <> 'task' and message_id is not null;

create index if not exists notifications_message_lookup_idx
on public.notifications(message_id, user_id, created_at desc)
where message_id is not null;

-- Compile each task-trail event as a reply to the original message.
-- The function compares IDs as text, so it works whether messages.id is text or UUID.
-- Any unexpected reply-only error is logged as a WARNING and never rolls back the
-- underlying task action or deadline-extension request.
create or replace function public.post_task_update_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_title text;
    v_original_raw text;
    v_original_id text;
    v_room_id text;
    v_label text;
    v_text text;
begin
    select t.title, t.original_message_id::text
      into v_title, v_original_raw
      from public.tasks t
     where t.id = new.task_id
       and t.tenant_id = new.tenant_id;

    if not found or nullif(trim(v_original_raw), '') is null then
        return new;
    end if;

    select m.id::text, m.room_id::text
      into v_original_id, v_room_id
      from public.messages m
     where m.id::text = trim(v_original_raw)
       and m.tenant_id = new.tenant_id
     limit 1;

    if not found or v_room_id is null then
        raise warning 'NILTASK reply skipped: original message % not found for task %',
            v_original_raw, new.task_id;
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
        case when nullif(trim(coalesce(new.comment, '')), '') is not null
             then ' — ' || replace(replace(replace(new.comment, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
             else '' end ||
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
        raise warning 'NILTASK reply insert failed for task %: %', new.task_id, sqlerrm;
    end;

    return new;
end;
$$;

drop trigger if exists trg_post_task_update_reply on public.task_trails;
create trigger trg_post_task_update_reply
after insert on public.task_trails
for each row execute function public.post_task_update_reply();

-- Re-create extension request RPC so web and mobile use the same complete flow.
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
    if nullif(trim(p_reason), '') is null then raise exception 'Reason is required'; end if;
    if p_requested_deadline is null then raise exception 'Requested deadline is required'; end if;

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
        tenant_id, task_id, assignee_id, requested_deadline, reason
    ) values (
        p_tenant_id, p_task_id, v_user, p_requested_deadline, trim(p_reason)
    ) returning id into v_request_id;

    insert into public.task_trails(task_id, user_id, tenant_id, action, comment)
    values (
        p_task_id,
        v_user,
        p_tenant_id,
        'EXTENSION_REQUEST',
        'Requested deadline ' || to_char(p_requested_deadline, 'DD Mon YYYY') ||
        ' — ' || trim(p_reason)
    );

    return v_request_id;
end;
$$;

grant execute on function public.request_task_extension(uuid,date,text,uuid)
to authenticated;

commit;
