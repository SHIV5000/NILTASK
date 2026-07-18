# Task Workflow v2

## Scope

This change separates acknowledgement from starting work, preserves transfer history, records delegation relationships, and calculates multi-assignee progress without collapsing a mixed task into one misleading status.

## Per-assignee states

`pending_ack -> acknowledged -> in_progress -> submitted -> accepted`

Rework loop:

`submitted -> needs_review -> submitted`

Terminal history states:

`transferred`, `cancelled`

## Important rollout order

1. Review the migration.
2. Run `supabase/migrations/20260718_task_workflow_v2.sql` in a non-production Supabase project.
3. Apply `patches/task-workflow-v2.patch` to `js/tasks.js`.
4. Test with a creator plus at least two different assignee accounts.
5. Deploy to production only after the scenarios below pass.

## Required tests

- A acknowledges while B remains pending; creator sees separate counts.
- A starts work after acknowledgement; creator receives a new notification.
- B acknowledges later without changing A's state.
- A submits while B is still pending; the task displays Mixed Progress.
- Creator accepts A without affecting B.
- Creator returns A for changes with mandatory feedback.
- A delegates to C; A remains accountable and C receives a new pending assignment.
- Creator transfers B to D; B's assignment remains in history as transferred.
- Proof-required submission is blocked until the submitting user uploads proof.

## Manual intervention

The SQL migration must be run in Supabase before the JavaScript patch is enabled. Check existing RLS policies for `task_assignees` so authenticated tenant users can read the new columns and permitted users can update/insert delegation and transfer records.

## Rollback

Do not drop the new columns immediately after production use, because they may contain audit history. Roll back application behavior first. Columns may be removed later only after exporting delegation/transfer history.
