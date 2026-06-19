# MPGS TaskFlow — Architecture Reference

## Stack
- Frontend: vanilla HTML/JS ES modules, Tailwind CDN, Quill
- Backend: Supabase (Postgres, Auth, Storage, Realtime, Edge Functions)
- Hosting: Vercel
- Scheduling: external cron (cron-job.org) → Edge Function
- PWA: manifest.json + sw.js

## Flow
1. `index.html` loads → auth.js checks session
2. Login → auth.js sets `window.currentUser`, `currentTenantId`, `currentRole`, `currentSubscription`, `hasFeature()`
3. `main.js` → `renderMainApp()` (desktop) or hands off to `mobile.js` (`initMobileApp()`) if width ≤ 768px
4. `main.js` → `startSubscriptions()` opens Realtime channels (messages, reactions, task_assignees, task_trails, notifications, scheduled_messages)
5. `rbac.js` → `applyRBAC()` runs regardless of mobile/desktop — gates UI by role + feature flags
6. User actions → Supabase CRUD → Realtime broadcast → both desktop and mobile UIs update independently (separate render paths, same DB)
7. Cron (1 min) → Edge Function `taskflow-scheduler` → checks `reminders` + `scheduled_messages` tables → inserts notifications / sends messages

## Files

| File | Responsibility |
|---|---|
| `shared.js` | Supabase client (`sb`), shared helpers — loads first |
| `auth.js` | signIn/signUp/logout, loads tenant/role/subscription into `window.*` |
| `ui-core.js` | theme, toast, nav, sidebar, `goToMessage`/`goToTask` |
| `ui-panels.js` | bell panel, notifications, bookmarks, reminders/scheduled panels, `refreshNotificationBadge` |
| `ui-feed.js` | activity feed, dashboard |
| `ui-settings.js` | profile settings, group settings, link-pill insert |
| `messages.js` | chat send/edit/forward, reactions |
| `tasks.js` | task lifecycle, trail, proof upload, PDF export, `notifyUser` |
| `rbac.js` | all permission gates (below) |
| `main.js` | app shell render, all Realtime subscriptions, `playSound` |
| `notifications.js` | chime (Web Audio), shared audio unlock, system notifications |
| `mobile.js` | full separate mobile UI — own screens, composer, RBAC mirror, notification center |
| `admin.html`/`admin.js` | staff management UI |
| `sw.js` | service worker (PWA offline shell) |

## Edge Functions

| Function | Trigger | Does |
|---|---|---|
| `create-school-user` | called from admin.js | create staff / reset password (service-role only) |
| `taskflow-scheduler` | cron, every 1 min | processes due `reminders` → notification; due `scheduled_messages` → inserts into `messages` |

Auth header required: `Authorization: Bearer <anon key>` (new format: `sb_publishable_...`)

## Database Tables

| Table | Key columns |
|---|---|
| `profiles` | id, email, full_name, role, tenant_id, designation, department, avatar_url, last_login |
| `messages` | id, room_id, sender_id, text, parent_message_id, tenant_id, is_task, task_data |
| `tasks` | id, original_message_id, title, deadline(date), priority, require_proof, status, tenant_id |
| `task_assignees` | task_id+assignee_id (PK), acked, state, status, tenant_id |
| `task_trails` | id, task_id, user_id, action, comment, file_url |
| `reminders` | id, user_id, message_id, reminder_time, triggered, tenant_id |
| `scheduled_messages` | id, sender_id, room_id, message_text, scheduled_time, status, tenant_id |
| `notifications` | id, user_id, type, message, message_id, task_id, is_read, tenant_id |
| `reactions` | id, message_id, user_id, value, type, count, tenant_id |
| `bookmarks` | id(int), user_id, message_id, tenant_id |
| `tenants` | id, school_name, principal_name, subdomain |
| `subscriptions` | tenant_id, plan, status, max_users, trial_ends |
| `feature_flags` | tenant_id (PK), tasks_enabled, uploads_enabled, reports_enabled, scheduling_enabled |
| `roles` | id, name, permissions(jsonb), display_name |
| `user_roles` | user_id, tenant_id, role_id, department_id |
| `allowed_users` | pre-approved signup list per tenant |
| `audit_logs` | actor_id, action, table_name, old_data, new_data |
| `developers` | email (PK) — platform-level access |

room_id convention: department name (`general`, `math`, etc.) or `dm_<uid1>_<uid2>` (sorted).

## Roles
`teacher`, `support_staff`, `admin_staff`, `coordinator`, `hod`, `exam_controller`, `vp_admin`, `management`, `principal` — stored via `user_roles` → `roles`. `profiles.role` also exists as a column (legacy/secondary — not confirmed which is authoritative).

## RBAC Gates (`rbac.js`, enforced on both desktop and mobile)

| Function | Rule |
|---|---|
| `isTeacher()` | role === 'teacher' |
| `canSchedule()` | NOT teacher AND `scheduling_enabled` |
| `canUpload()` | `uploads_enabled` |
| `canCreateTask()` | `tasks_enabled` AND NOT teacher |
| `canCreateGroup()` | NOT teacher |
| `canSeeGroupGear()` | NOT teacher |
| `canSeeTaskHub()` | `tasks_enabled` |
| `checkSubscription()` | sets `window._trialExpired`, blocks sending if expired trial |

## Policies (RLS)
Not fully documented here — known requirement: `reactions` needs an INSERT policy (`auth.uid() = user_id`). Full RLS policy set should be exported from Supabase (Authentication → Policies) and added here.

## Known Architectural Notes
- Mobile and desktop are two independent UIs reading/writing the same tables — no shared render code, RBAC manually mirrored in both
- 30-min edit/delete window: mobile-only currently, not enforced on desktop or via RLS
- Edge Function auth: uses Supabase's auto-injected `SUPABASE_*` env vars, not custom secrets
