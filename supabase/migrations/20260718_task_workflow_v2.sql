-- Task Workflow v2
-- Run in Supabase SQL Editor before enabling the matching application patch.

begin;

alter table public.task_assignees
    add column if not exists assignment_role text not null default 'primary',
    add column if not exists delegated_by uuid null,
    add column if not exists delegated_from uuid null,
    add column if not exists assigned_at timestamptz not null default now();

-- Preserve historical ownership instead of deleting an assignment during transfer.
-- Existing rows remain primary assignments.

alter table public.task_assignees
    drop constraint if exists task_assignees_assignment_role_check;

alter table public.task_assignees
    add constraint task_assignees_assignment_role_check
    check (assignment_role in ('primary', 'delegate', 'transferred'));

create index if not exists task_assignees_delegated_from_idx
    on public.task_assignees (delegated_from)
    where delegated_from is not null;

create index if not exists task_assignees_delegated_by_idx
    on public.task_assignees (delegated_by)
    where delegated_by is not null;

comment on column public.task_assignees.assignment_role is
    'primary = original accountable assignee; delegate = delegated worker; transferred = replacement owner';
comment on column public.task_assignees.delegated_by is
    'User who initiated delegation or transfer';
comment on column public.task_assignees.delegated_from is
    'Previous accountable assignee in the delegation or transfer chain';

commit;
