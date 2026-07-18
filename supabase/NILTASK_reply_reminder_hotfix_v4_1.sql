begin;

-- ============================================================================
-- NILTASK v4.1 HOTFIX
-- 1. Fix task-update replies when tasks.original_message_id is text but
--    messages.id / parent_message_id are UUID.
-- 2. Guarantee one targeted reminder notification per click.
-- 3. Prevent the general task-trail broadcaster from duplicating REMINDER.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. General task-event notification broadcaster
--    REMINDER is intentionally excluded because send_task_reminder() owns it.
-- ---------------------------------------------------------------------------
create or replace function public.notify_task_concerned_users()
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

    select
        t.id,
        t.title,
        t.assigned_by,
        t.original_message_id,
        t.tenant_id
    into v_task
    from public.tasks t
    where t.id = new.task_id
      and t.tenant_id = new.tenant_id;

    if not found then
        return new;
    end if;

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
            when 'REWORK' then '🔄 Task returned for changes: '
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
        v_message := v_message || ' — ' || left(
            regexp_replace(new.comment, '<[^>]*>', '', 'g'),
            100
        );
    end if;

    -- Creator, unless creator performed the event.
    if v_task.assigned_by is not null
       and v_task.assigned_by <> new.user_id
       and not exists (
            select 1
            from public.notifications n
            where n.tenant_id = new.tenant_id
              and n.task_id = new.task_id
              and n.user_id = v_task.assigned_by
              and n.type = 'task'
              and n.message = left(v_message, 200)
              and n.created_at >= now() - interval '5 seconds'
       ) then
        insert into public.notifications (
            user_id, tenant_id, task_id, message_id,
            type, message, is_read
        ) values (
            v_task.assigned_by,
            new.tenant_id,
            new.task_id,
            null,
            'task',
            left(v_message, 200),
            false
        );
    end if;

    -- Active assignees except actor and creator.
    insert into public.notifications (
        user_id, tenant_id, task_id, message_id,
        type, message, is_read
    )
    select distinct
        ta.assignee_id,
        new.tenant_id,
        new.task_id,
        null,
        'task',
        left(v_message, 200),
        false
    from public.task_assignees ta
    where ta.task_id = new.task_id
      and ta.tenant_id = new.tenant_id
      and ta.assignee_id <> new.user_id
      and ta.assignee_id <> coalesce(
            v_task.assigned_by,
            '00000000-0000-0000-0000-000000000000'::uuid
          )
      and (
            ta.status not in ('transferred', 'cancelled')
            or upper(coalesce(new.action, '')) in ('TRANSFER', 'CANCEL')
          )
      and not exists (
            select 1
            from public.notifications n
            where n.tenant_id = new.tenant_id
              and n.task_id = new.task_id
              and n.user_id = ta.assignee_id
              and n.type = 'task'
              and n.message = left(v_message, 200)
              and n.created_at >= now() - interval '5 seconds'
          );

    return new;
end;
$$;

drop trigger if exists trg_notify_task_concerned_users
on public.task_trails;

create trigger trg_notify_task_concerned_users
after insert on public.task_trails
for each row
execute function public.notify_task_concerned_users();


-- ---------------------------------------------------------------------------
-- B. Targeted reminder RPC
--    Uses an advisory transaction lock plus a short duplicate guard.
-- ---------------------------------------------------------------------------
create or replace function public.send_task_reminder(
    p_task_id uuid,
    p_assignee_id uuid,
    p_tenant_id uuid,
    p_sender_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_task record;
    v_assignee_name text;
    v_message text;
begin
    -- Prevent simultaneous double-taps / duplicate RPC execution for this pair.
    perform pg_advisory_xact_lock(
        hashtext(p_task_id::text || ':' || p_assignee_id::text)
    );

    select
        t.id,
        t.title,
        t.assigned_by,
        t.original_message_id,
        t.tenant_id
    into v_task
    from public.tasks t
    where t.id = p_task_id
      and t.tenant_id = p_tenant_id;

    if not found then
        raise exception 'Task not found in tenant';
    end if;

    if v_task.assigned_by <> p_sender_id then
        raise exception 'Only the task creator may send this reminder';
    end if;

    if not exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = p_task_id
          and ta.tenant_id = p_tenant_id
          and ta.assignee_id = p_assignee_id
          and ta.status not in ('accepted', 'transferred', 'cancelled')
    ) then
        raise exception 'Assignee is not active on this task';
    end if;

    select coalesce(
        nullif(trim(p.full_name), ''),
        split_part(p.email, '@', 1),
        'assignee'
    )
    into v_assignee_name
    from public.profiles p
    where p.id = p_assignee_id
      and p.tenant_id = p_tenant_id
    limit 1;

    v_message := left(
        '🔔 Reminder from task creator: Action is pending on “'
        || coalesce(v_task.title, 'Task')
        || '”',
        200
    );

    -- Create only one identical reminder in a short window.
    if not exists (
        select 1
        from public.notifications n
        where n.user_id = p_assignee_id
          and n.tenant_id = p_tenant_id
          and n.task_id = p_task_id
          and n.type = 'task'
          and n.message = v_message
          and n.created_at >= now() - interval '30 seconds'
    ) then
        insert into public.notifications (
            user_id,
            tenant_id,
            task_id,
            message_id,
            type,
            message,
            is_read
        ) values (
            p_assignee_id,
            p_tenant_id,
            p_task_id,
            null,
            'task',
            v_message,
            false
        );

        insert into public.task_trails (
            task_id,
            user_id,
            tenant_id,
            action,
            comment
        ) values (
            p_task_id,
            p_sender_id,
            p_tenant_id,
            'REMINDER',
            'Reminder sent to ' || coalesce(v_assignee_name, 'assignee')
        );
    end if;
end;
$$;

revoke all on function public.send_task_reminder(
    uuid, uuid, uuid, uuid
) from public;

grant execute on function public.send_task_reminder(
    uuid, uuid, uuid, uuid
) to authenticated;


-- ---------------------------------------------------------------------------
-- C. Task update -> reply to original message
--    Explicit UUID variables/casts correct the reported type mismatch.
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

    -- Accept only a valid UUID; old or malformed task links are skipped safely.
    begin
        v_original_id := trim(v_original_raw)::uuid;
    exception
        when invalid_text_representation then
            return new;
    end;

    select m.room_id::text
    into v_room_id
    from public.messages m
    where m.id = v_original_id
      and m.tenant_id = new.tenant_id
    limit 1;

    if not found or v_room_id is null then
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
        '<div data-task-event="1" data-task-id="'
        || new.task_id::text
        || '"><p>📋 <strong>'
        || replace(replace(coalesce(v_title, 'Task'), '&', '&amp;'), '<', '&lt;')
        || '</strong></p><p><strong>'
        || replace(replace(v_label, '&', '&amp;'), '<', '&lt;')
        || '</strong>'
        || case
            when nullif(trim(coalesce(new.comment, '')), '') is not null
            then ' — '
                 || replace(
                        replace(
                            replace(new.comment, '&', '&amp;'),
                            '<', '&lt;'
                        ),
                        '>', '&gt;'
                    )
            else ''
           end
        || '</p></div>';

    insert into public.messages (
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

    return new;
end;
$$;

drop trigger if exists trg_post_task_update_reply
on public.task_trails;

create trigger trg_post_task_update_reply
after insert on public.task_trails
for each row
execute function public.post_task_update_reply();

commit;
