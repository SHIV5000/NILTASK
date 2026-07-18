begin;

alter table public.notifications
    add column if not exists task_id uuid null;

create index if not exists notifications_task_user_idx
    on public.notifications (tenant_id, task_id, user_id, created_at desc)
    where task_id is not null;

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
    select id, title, assigned_by, original_message_id, tenant_id
      into v_task
      from public.tasks
     where id = new.task_id
       and tenant_id = new.tenant_id;

    if not found then
        return new;
    end if;

    v_message :=
        case upper(coalesce(new.action, 'UPDATE'))
            when 'CREATE' then '📋 New task activity: '
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
            when 'REMINDER' then '🔔 Task reminder: '
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

    if v_task.assigned_by is not null
       and v_task.assigned_by <> new.user_id then
        insert into public.notifications
            (user_id, tenant_id, task_id, message_id, type, message, is_read)
        values
            (v_task.assigned_by, new.tenant_id, new.task_id,
             v_task.original_message_id, 'task', left(v_message, 200), false);
    end if;

    insert into public.notifications
        (user_id, tenant_id, task_id, message_id, type, message, is_read)
    select distinct
        ta.assignee_id,
        new.tenant_id,
        new.task_id,
        v_task.original_message_id,
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
begin
    select id, title, assigned_by, original_message_id, tenant_id
      into v_task
      from public.tasks
     where id = p_task_id
       and tenant_id = p_tenant_id;

    if not found then
        raise exception 'Task not found in tenant';
    end if;

    if v_task.assigned_by <> p_sender_id then
        raise exception 'Only the task creator may send this reminder';
    end if;

    if not exists (
        select 1
          from public.task_assignees
         where task_id = p_task_id
           and tenant_id = p_tenant_id
           and assignee_id = p_assignee_id
           and status not in ('accepted', 'transferred', 'cancelled')
    ) then
        raise exception 'Assignee is not active on this task';
    end if;

    insert into public.notifications
        (user_id, tenant_id, task_id, message_id, type, message, is_read)
    values
        (p_assignee_id, p_tenant_id, p_task_id, v_task.original_message_id,
         'task',
         left('🔔 Reminder from task creator: Action is pending on “' ||
              coalesce(v_task.title, 'Task') || '”', 200),
         false);

    insert into public.task_trails
        (task_id, user_id, tenant_id, action, comment)
    values
        (p_task_id, p_sender_id, p_tenant_id,
         'REMINDER', 'Reminder sent to assignee');
end;
$$;

grant execute on function public.send_task_reminder(
    uuid, uuid, uuid, uuid
) to authenticated;

commit;
