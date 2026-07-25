# AI.md — NILTASK Complete Frontend Mapping & Functionality Contract

> **Purpose:** This is the mandatory handoff document for any AI or developer replacing, redesigning, or refactoring the NILTASK frontend.
>
> **Primary rule:** The frontend may change visually, but **no existing flow, function, permission, lifecycle state, database write, notification, realtime update, mobile/native behaviour, button, or audit event may be removed or silently changed**.
>
> **Repository analysed:** `SHIV5000/NILTASK`
>
> **Authoritative baseline:** `main` at commit `4c375dd2a137c59bf402a079550acca57e9a4c27`.
>
> This file consolidates the current source code, `ARCHITECTURE.md`, `AI-HELPER.md`, `INDEX.md`, `NOTIFICATIONS.md`, SQL files, and the live web/mobile implementation. Where the repository does not contain an authoritative schema export, this document marks fields or policies as **VERIFY IN SUPABASE** instead of guessing.

---

# 1. Non-negotiable rules for a new frontend

1. **Do not create a second application state.** Never copy mock `state = { messages, tasks }` objects into production.
2. **Do not replace Supabase logic with simulated handlers.** Existing CRUD/RPC/storage calls remain authoritative.
3. **Do not rename or remove `window.*` functions without a compatibility adapter.** Existing inline `onclick`, mobile code, realtime handlers, notification deep links, and task cards depend on them.
4. **Do not merge web and mobile renderers casually.** Desktop and mobile are independent render paths using the same database.
5. **Do not trust visual hiding as security.** Every frontend capability gate must remain backed by RLS/RPC/server validation.
6. **Every query must remain tenant-scoped** by `tenant_id`, and user-owned data must also be scoped by `user_id`.
7. **Never hard-delete ordinary messages.** The intended model is soft deletion via `deleted_at`; confirm current desktop implementation before altering.
8. **Do not invent task status values.** Use the exact task and assignee states documented below.
9. **Do not count unread items locally as the sole truth.** The authoritative inputs are `room_reads`, `messages`, and `notifications`.
10. **Do not depend only on realtime.** Reconciliation/polling is required, especially on mobile.
11. **Do not merge a visual redesign until the parity checklist in this file is completed.**
12. **Never commit secrets.** The Supabase anon/publishable key is public by design; service-role, VAPID private key, webhook secret, and Firebase service-account JSON are secrets.

---

# 2. Product model

**Noted For Action** (`NILTASK`, older internal name `TaskFlow`) is a multi-tenant school communication and accountability SaaS.

Each school is a tenant. All school-owned records must be isolated by `tenant_id`.

Core capabilities:

- Department/group chat.
- One-to-one direct messages.
- Replies/threads.
- Emoji reactions and text tags.
- Mentions.
- Message forwarding.
- Bookmarks.
- Message reminders.
- Scheduled messages.
- File attachments.
- Multi-assignee tasks.
- Independent assignee acknowledgement, work, proof, submission, review, delegation and transfer.
- Task audit trail.
- Task reminders and deadline extensions.
- Activity feed.
- Notifications and unread badges.
- Personal dashboard/scorecard and PDF export.
- Group and profile administration.
- Staff/role administration.
- Web, PWA and Capacitor Android delivery.

Live site: `https://niltask.vercel.app/`.

---

# 3. Delivery surfaces

## 3.1 Desktop web

Entry: `index.html`.

Main controller: `js/main.js`.

Supporting modules:

- `js/shared.js`
- `js/auth.js`
- `js/rbac.js`
- `js/ui-core.js`
- `js/ui-panels.js`
- `js/ui-feed.js`
- `js/ui-settings.js`
- `js/messages.js`
- `js/tasks.js`
- `js/notifications.js`
- `js/activity-v208.js`

## 3.2 PWA

Same web code plus:

- `manifest.json`
- `sw.js`
- offline shell
- Web Push subscription
- app badge
- share target

The service worker uses network-first navigation and cached assets. Release changes require cache/version coordination.

## 3.3 Mobile web/native UI

Main renderer: `js/mobile.js`.

Task-specific mobile layer: `js/mobile-tasks.js`.

Mobile is selected by `window.isMobileView()` when:

- width is `<= 768px`, or
- coarse pointer tablet width is `<= 1366px`, or
- `window.IS_NATIVE` is true.

## 3.4 Capacitor Android

The APK is a thin remote-URL shell loading the live Vercel site. Web changes on `main` therefore update the installed app without rebuilding the APK.

`js/native.js` adds:

- status bar/splash integration;
- hardware back handling;
- FCM registration;
- device-token persistence;
- foreground push suppression;
- push deep-link handling.

APK rebuild is needed only for native assets/plugins/configuration.

---

# 4. Boot and global state

## 4.1 Load sequence

1. `index.html` loads shared/classic helpers.
2. `shared.js` creates and exposes Supabase client `sb` and `window.sb`.
3. `auth.js` restores or requests a session.
4. On login, auth sets global tenant/user/role/subscription state.
5. Desktop calls `renderMainApp()`; mobile calls `initMobileApp()`.
6. `startSubscriptions()` creates realtime channels.
7. `applyRBAC()` hides/disables unavailable controls and applies subscription limits.
8. Initial messages, chat list, tasks, badges and feeds load.

## 4.2 Global variables a replacement UI must preserve or adapt

- `window.sb`
- `window.currentUser`
- `window.currentUserId` where used by legacy code
- `window.currentTenantId`
- `window.currentRole`
- `window.currentRoleName`
- `window.currentSubscription`
- `window.currentRoom`
- `window.globalUsersCache`
- `window.pendingScrollId`
- `window.currentMessageId`
- `window.currentMessageTextRaw`
- `window.currentlyReplyingTo`
- `window.unreadCounts`
- `window._trialExpired`
- `window._activityFeedOpen`
- `window.quillEditor`
- `window.APP_VER`
- `window.IS_NATIVE`

A framework migration may wrap these values, but existing code must continue to resolve them until all legacy call sites are formally migrated and tested.

---

# 5. Repository responsibility map

| File | Authoritative responsibility |
|---|---|
| `index.html` | Application entry, boot splash, asset load order, PWA registration, install banners and modal shell. |
| `js/shared.js` | Supabase client, common globals, version, mobile detection, shared date/text helpers. |
| `js/auth.js` | Login, logout, session restore, user/tenant/role/subscription/feature resolution. |
| `js/rbac.js` | Role sets, feature gates, capability functions, trial/subscription enforcement. |
| `js/main.js` | Desktop shell, group/DM list, room navigation, presence refresh, realtime startup and desktop boot. |
| `js/messages.js` | Desktop message load/render/send, replies, reactions, bookmarks, edit/delete, forward. |
| `js/tasks.js` | Desktop task creation, rendering, lifecycle, proof, reminders, extensions, audit and reports. |
| `js/ui-core.js` | Theme, sidebars, generic dropdowns/toasts, cross-room navigation, secure-file opening. |
| `js/ui-panels.js` | Top panels, bell, alerts, reminders, scheduled messages, bookmarks. |
| `js/ui-feed.js` | Web activity feed, personal dashboard, dashboard PDF. |
| `js/activity-v208.js` | Current enhanced organisation activity feed implementation. |
| `js/ui-settings.js` | Profile, group settings, link pills. |
| `js/notifications.js` | Web Push, sound/chime, DND/muting and system notifications. |
| `js/mobile.js` | Entire mobile application: screens, chat, realtime, badges, groups, notifications, settings. |
| `js/mobile-tasks.js` | Mobile task cards/details/actions. |
| `js/core/feed.js` | Shared activity construction and unread attention count. |
| `js/core/unread.js` | Durable room unread calculation. |
| `js/core/reactions.js` | Shared reaction fetch/group utilities. |
| `js/utils/text.js` | Canonical escaping, stripping and snippets. |
| `js/native.js` | Capacitor-only native bridge. |
| `admin.html`, `js/admin.js` | Staff, role, tenant administration, reports/scorecards and administrative controls. |
| `sw.js` | PWA cache, push handling, quick reply, app badge, offline/share target. |
| `supabase/functions/send-push/` | Web Push + FCM delivery after message inserts. |
| `supabase/functions/send-scheduled-messages/` | Sends due scheduled messages. |
| `supabase/*.sql`, `supabase/migrations/*.sql` | Schema, RLS, RPC, triggers, indexes and one-off repairs. |

---

# 6. Role and feature model

## 6.1 Roles

Current known roles, low to high/administrative privilege:

- `support_staff`
- `teacher`
- `admin_staff`
- `coordinator`
- `exam_controller`
- `hod`
- `vp_admin`
- `management`
- `principal`

The code contains two role sources:

- `profiles.role` (legacy/secondary), and
- `roles` + `user_roles` (newer structured model).

**VERIFY IN SUPABASE which is authoritative before changing role resolution.**

## 6.2 Role sets in `rbac.js`

- Group managers: `management`, `principal`, `vp_admin`, `exam_controller`, `coordinator`, `hod`.
- Task creators: `management`, `principal`, `vp_admin`, `hod`, `coordinator`, `exam_controller`.
- Schedulers: same as task creators.
- Cannot be assigned tasks: `principal`, `management`.
- Admin panel: `principal`, `vp_admin`, `management`.
- Message moderators: `principal`, `vp_admin`, `management`.

## 6.3 Capability functions that must remain callable

- `isTeacher()`
- `isAdmin()`
- `isHOD()`
- `isSeniorStaff()`
- `canCreateGroup()`
- `canSeeGroupGear()`
- `canManageGroups()`
- `guardManageGroups()`
- `canCreateTask()`
- `guardCreateTask()`
- `canSeeTaskHub()`
- `canBeAssigned()`
- `canSchedule()`
- `guardSchedule()`
- `canUpload()`
- `canEditMessage(senderId)`
- `canDeleteMessage(senderId)`
- `canForward()`
- `canAccessAdmin()`
- `applyRBAC()`
- `applyGroupGearRBAC()`
- `checkSubscription()`

## 6.4 Feature flags

Known flags:

- `tasks_enabled`
- `uploads_enabled`
- `reports_enabled`
- `scheduling_enabled`

All new controls must call the same feature checks. Do not merely display a disabled button while allowing the write path.

## 6.5 Subscription/trial behaviour

`checkSubscription()`:

- reads `window.currentSubscription`;
- calculates trial expiry;
- shows warning in the final seven days;
- blocks sending/editor/upload after expiry;
- sets `window._trialExpired`.

A new composer must preserve the blocked state.

---

# 7. Application modules and required controls

## 7.1 Authentication module

Required flows:

- sign in;
- sign up/tenant onboarding where enabled;
- session restore;
- tenant resolution;
- role/permission resolution;
- feature-flag resolution;
- subscription resolution;
- logout;
- orphaned tenant/setup error handling;
- password/reset workflows used by admin Edge Function.

Backend dependencies:

- Supabase Auth;
- `profiles`;
- `tenants`;
- `allowed_users`;
- `roles`;
- `user_roles`;
- `subscriptions`;
- `feature_flags`;
- signup RPC `complete_tenant_signup` (**not defined in repository; verify in Supabase**).

## 7.2 Conversation/sidebar module

Required visible groups:

- Departments/groups.
- Staff/direct messages.
- Active/current room.
- Unread count per room.
- Presence/last seen where available.
- Current user identity, designation and role.

Required controls:

- search/filter sidebar;
- open group;
- open DM;
- create group, role-gated;
- group settings gear, role-gated;
- archive/manage group where currently supported;
- profile/settings;
- collapse/resize desktop sidebar;
- mobile drawer open/close.

Important functions:

- `loadChatsList()`
- `filterSidebar(term)`
- `getDmRoomId(uid1, uid2)`
- `getRoomDisplayName(roomId)`
- `openRoomById()` / `openChatRoom()` depending call site
- `toggleLeftSidebar()`
- `initResizers()`
- `openNewGroupModal()`
- `saveNewGroup()`
- `openGroupSettings()`
- `saveGroupSettings()`
- `canManageThisGroup(groupId)`

Room ID rules:

- Group/department room: configured string such as `general`, `math`, or generated `grp_*`.
- DM room: `dm_<sorted-user-id-A>_<sorted-user-id-B>`.

Group metadata may come from `room_settings` and tenant-namespaced localStorage compatibility keys. Do not remove either source until a migration is completed.

## 7.3 Chat/message module

Required functions and behaviour:

- load messages for current room;
- chronological rendering and date separators;
- sender name/avatar/time;
- sent/delivered/read indicators where supported;
- rich HTML message content;
- secure escaping/sanitisation;
- attachments and secure-file links;
- link-pill rendering;
- @mentions;
- parent reply reference;
- inline replies/thread display;
- emoji reaction chips;
- text-tag chips;
- bookmarks;
- message search;
- scroll-to-bottom and scroll-to-message;
- highlighted deep-link target;
- optimistic or immediate UI where current code does so;
- unread reconciliation after room open.

### Message composer buttons/actions

The new UI must retain all applicable controls:

- formatting toolbar;
- bold;
- italic;
- underline;
- lists;
- link pill;
- emoji picker;
- file attachment;
- schedule message, role/feature gated;
- reply banner/cancel reply;
- send;
- mention autocomplete;
- mobile quick composer and native keyboard behaviour.

### Message context menu

Retain every existing action and permission condition:

- Reply.
- React/add emoji.
- Add text tag where exposed.
- Convert/Create Task, role and feature gated.
- Set Reminder.
- Forward.
- Bookmark/unbookmark.
- Copy/open linked material where present.
- Edit own message.
- Delete own message.
- Moderator delete where current implementation permits.
- Open replies/thread.

### Required public functions

- `loadMessages()`
- `renderMessages()`
- `sendMessage()`
- `applyFilters()`
- `insertEmoji()`
- `toggleInputEmojiPicker()`
- `initiateReply()`
- `cancelReply()`
- `toggleReplies()`
- `applyReaction()`
- `applyReactionDOM()`
- `toggleBookmark()`
- `startEditMessage()`
- `saveEditMessage()`
- `cancelEditMessage()`
- `deleteMessage()`
- `openForwardModal()`
- `closeForwardModal()`
- `sendForwardedMessage()`
- `toggleDropdown()`
- `closeDropdowns()`
- `goToMessage()`
- `scrollToAndHighlight()`
- `openSecureFile()`

### Message write rules

- Always include `tenant_id`.
- Sender is `currentUser.id`.
- HTML text is stored in `messages.text`.
- Reply uses `parent_message_id`.
- Soft-delete fields must remain supported.
- Bare-URL behaviour currently redirects users toward link-pill insertion; do not remove accidentally.
- DM and reply notification creation must remain intact.

## 7.4 Reactions module

Expected model:

- one user can toggle a reaction/tag on a message;
- UI updates immediately;
- DB persistence uses idempotent/unique semantics;
- broadcast updates other clients;
- deletion removes reaction chip/tag;
- reaction notification trigger may add an attention item.

Tables/channels:

- `reactions`;
- Supabase Broadcast channel used by desktop;
- `postgres_changes`/shared reaction helpers on mobile;
- notification trigger migration for reaction notifications.

Fields used:

- `id`
- `message_id`
- `user_id`
- `value`
- `type`
- optional/legacy `count`
- `tenant_id`
- `created_at`

Uniqueness is expected on message/user/value. Verify deployed constraint.

## 7.5 Replies/threads module

Lifecycle:

1. User selects Reply.
2. `initiateReply()` stores the parent message context.
3. Composer shows reply banner.
4. Send inserts a message with `parent_message_id`.
5. Parent message displays reply count/thread entry.
6. `toggleReplies()` opens/closes inline replies.
7. Reply notifications navigate to the exact message/room.

Task lifecycle events may also be compiled as replies to the original message. Do not treat every reply as an ordinary user reply without checking `data-task-event`/task metadata.

## 7.6 Bookmarks module

Required actions:

- bookmark/unbookmark a message;
- display saved messages panel;
- navigate from bookmark to original message;
- remove bookmark.

Table: `bookmarks`.

Expected fields:

- `id` (implementation may use integer or generated key);
- `user_id`;
- `message_id`;
- `tenant_id`;
- `created_at` where deployed.

Functions:

- `toggleBookmark()`
- `openTopPanel('bookmarks')`
- `goToMessage()`

## 7.7 Message reminders module

Lifecycle:

1. User chooses Set Reminder from message menu.
2. `showReminderModal(messageId, preview)` opens modal.
3. User selects future datetime.
4. `saveReminder()` inserts a pending reminder.
5. Scheduler/cron processes due reminders.
6. A notification is inserted for the user.
7. Bell/activity/mobile badges update.
8. User can navigate to the message.
9. Upcoming reminder can be deleted before firing.
10. Fired reminder notification can be dismissed/cleared.

Functions:

- `showReminderModal()`
- `closeReminderModal()`
- `saveReminder()`
- `deleteReminder()`
- `dismissFired()`
- `clearFiredReminders()`

Table `reminders` fields used:

- `id`
- `user_id`
- `message_id`
- `reminder_time`
- `triggered`
- `tenant_id`
- `created_at`

Verify any additional `room_id`, text or trigger metadata in deployed schema.

## 7.8 Scheduled messages module

Lifecycle:

1. Authorized user writes message.
2. Opens Schedule.
3. Selects future datetime.
4. `saveScheduledMessage()` inserts status `pending`.
5. Cron calls `send-scheduled-messages` Edge Function.
6. Function inserts a normal `messages` row.
7. Scheduled row changes status.
8. Realtime `scheduled_messages` update refreshes UI and may create notification/toast.
9. User can cancel a pending scheduled item.

Functions:

- `showScheduleModal()`
- `closeScheduleModal()`
- `saveScheduledMessage()`
- `deleteScheduled()`
- `openTopPanel('scheduled')`

Table `scheduled_messages` fields:

- `id`
- `sender_id`
- `room_id`
- `message_text`
- `scheduled_time`
- `status`
- `tenant_id`
- `created_at`

## 7.9 Tasks module — core model

A task is one overall record plus one independent assignment row per assignee.

- `tasks` is the shared task definition.
- `task_assignees` is each person’s independent workflow state.
- `task_trails` is the append-only audit history.
- `task_extension_requests` stores deadline-extension requests.
- `notifications` alerts creators/assignees.
- task events can be posted back as replies under the original chat message.

**Never reduce multi-assignee state to one mutable task status.** Each assignee can be in a different state.

### Task creation fields from current code

`tasks` insert:

- `original_message_id`
- `title`
- `assigned_by`
- `tenant_id`
- `deadline`
- `priority`
- `require_proof`
- `status: 'pending'`

Each `task_assignees` insert:

- `task_id`
- `assignee_id`
- `tenant_id`
- `status: 'pending_ack'`
- `state: 'pending'`
- `acked: false`

Trail creation:

- `action: 'CREATE'`
- `comment: 'Task Created'`

### Task creation UI/buttons

- Create Task from message menu.
- Global/new task entry where exposed.
- Title field prefilled from selected message text.
- Assignee search.
- Multi-select assignees.
- Deadline.
- Priority.
- Require proof checkbox.
- Save/Create.
- Cancel/close.

Functions:

- `openTaskModal(messageId, messageText)`
- `filterAssignees()`
- `closeTaskModal()`
- `saveTaskMultiAssignee()`

## 7.10 Task assignee lifecycle

### Effective statuses

Do not add new values without DB migration and full renderer updates.

| Effective status | Stored representation / meaning |
|---|---|
| `pending_ack` | Awaiting acknowledgement. Usually `status=pending_ack`, `state=pending`, `acked=false`. |
| `acknowledged` | Compatibility-derived: `status=pending_ack` plus `state=acknowledged` or `acked=true`. |
| `in_progress` | Work started. |
| `submitted` | Submitted and waiting for creator review. |
| `needs_review` | Returned/changes required. Assignee must update/rework and resubmit. |
| `accepted` | Creator accepted that assignee’s completion. |
| `transferred` | Original assignment closed because responsibility moved to another person. |
| `cancelled` | Assignment closed by task cancellation. |
| `mixed` | UI aggregate only: active assignees have different statuses. |
| `empty` | UI aggregate only: no active assignees. |

Closed assignment statuses used by current UI:

- `transferred`
- `cancelled`

`accepted` is completed but remains part of completion statistics.

### Main lifecycle

```text
pending_ack
  -> acknowledged
  -> in_progress
  -> submitted
  -> accepted
```

Return loop:

```text
submitted
  -> needs_review
  -> progress/update/file/start as permitted
  -> submitted
  -> accepted
```

Transfer:

```text
current assignee -> transferred/closed
replacement -> pending_ack/pending/acked=false
```

Delegation:

```text
original assignee remains accountable
new delegate receives a separate pending_ack assignment
```

Cancellation:

```text
task.status -> cancelled
all non-accepted/non-transferred/non-cancelled assignments -> cancelled/closed
history retained
```

### Assignee actions/buttons

Buttons must be shown only in valid role/ownership/status conditions, as in current renderer:

- Acknowledge.
- Start Work.
- Post Progress Update.
- Upload Proof/File.
- Submit for Review.
- Delegate.
- Request Deadline Extension.
- Open Original Message.
- View timeline/audit.
- Download report where allowed.

### Creator/reviewer actions/buttons

- Accept one assignee’s completion.
- Return one assignee for changes with required feedback.
- Transfer one assignee to a replacement with required reason.
- Remind one assignee.
- Remind all pending assignees.
- Approve/decline deadline extension.
- Change task deadline with reason.
- Cancel task with reason.
- Open original message.
- View full timeline.
- Download PDF report.

### Core task action function

`taskAction(taskId, assigneeId, action, requireProof)` supports at least:

- `ack`
- `start`
- `submit`
- `accept`

Additional actions are implemented through dedicated action dialogs/functions.

### Dedicated task functions that the new UI must call or adapt

- `loadTasksForPanel()`
- `toggleTaskDetails(taskId)`
- `taskAction()`
- `openTaskUpdateAction()`
- `openTaskUploadAction()`
- `openTaskDelegateAction()`
- `openTaskReturnAction()`
- `openTaskTransferAction()`
- `sendTaskReminder()`
- `remindAllTaskPending()`
- `openTaskExtensionRequest()`
- `respondTaskExtension()`
- `openTaskDeadlineAction()`
- `openTaskCancelAction()`
- `openTaskOriginalMessage()`
- `downloadTaskPDF()`
- `closeTaskActionLayer()`
- `notifyUser()`
- `notifyGroupMembers()`

### Proof upload

Storage bucket: `task-proofs`.

Task proof path:

```text
tasks/<tenant_id>/<task_id>/<timestamp>_<safe_filename>
```

Trail entry:

- `action='FILE'`
- comment format: `<original filename>|<storage path>`

Submission must be blocked when `require_proof=true` and no `FILE` trail by the current user exists.

### Task audit actions

Known trail action values:

- `CREATE`
- `ACKNOWLEDGE`
- `ACK` (legacy compatibility)
- `START`
- `UPDATE`
- `FILE`
- `SUBMIT`
- `ACCEPT`
- `RETURN`
- `REWORK` (legacy compatibility)
- `DELEGATE`
- `TRANSFER`
- `REMINDER`
- `DEADLINE`
- `EXTENSION_REQUEST`
- `EXTENSION_APPROVED`
- `EXTENSION_REJECTED`
- `CANCEL`

The UI must render unknown future trail actions generically instead of dropping them.

### Task-to-chat compilation

Task lifecycle events may insert a reply into the original message’s room with:

- `parent_message_id = original message id`;
- task event HTML containing `data-task-event="1"` and `data-task-id`;
- human-readable lifecycle label/comment.

The database may also have a trail trigger that compiles these events. Avoid duplicating posts.

## 7.11 Task reminder RPC

RPC: `send_task_reminder`.

Arguments:

- `p_task_id`
- `p_assignee_id`
- `p_tenant_id`
- `p_sender_id`

After success the frontend also posts a task reply to the original message and reloads tasks.

## 7.12 Deadline-extension lifecycle

Request RPC: `request_task_extension`.

Arguments:

- `p_task_id`
- `p_requested_deadline`
- `p_reason`
- `p_tenant_id`

Response RPC: `respond_task_extension`.

Arguments:

- `p_request_id`
- `p_approve`
- `p_decision_reason`
- `p_tenant_id`

Table `task_extension_requests` fields directly used:

- `id`
- `task_id`
- `requested_deadline`
- `reason`
- `tenant_id`

**VERIFY IN SUPABASE** additional requester, decision, timestamps and status fields.

## 7.13 Task filters and sorts

Current task hub supports filters such as:

- all;
- today;
- pending;
- done/completed;
- created by me;
- assigned to me;
- delegated;
- transferred;
- date range.

Sorts include:

- deadline ascending;
- deadline descending;
- newest;
- oldest.

Functions:

- `setTaskFilter()`
- `setTaskSort()`
- `toggleDateFilter()`
- `debouncedLoadTasks()`

Do not remove hidden selects if legacy functions still read them; either retain them or update every call site.

## 7.14 Task reporting/dashboard

Required outputs:

- task PDF containing audit trail/status summary;
- personal dashboard for today/week/month/all;
- engagement/completion score;
- dashboard PDF;
- administrative scorecard/reports where available.

Functions:

- `downloadTaskPDF()`
- `openDashboard()`
- `loadDashboard()`
- `downloadDashboardPDF()`
- `closeDashboard()`

HTML-to-PDF is lazy-loaded. New UI must preserve loading/error feedback.

## 7.15 Activity feed module

Activity combines communication and work events.

Sources include:

- messages;
- task trails;
- notification/attention data in enhanced feed;
- reactions/replies/tasks/reminders as applicable.

Required actions:

- open activity feed;
- filter by type/person where current enhanced feed supports it;
- clear/dismiss activity items where supported;
- click message activity -> exact room/message;
- click task activity -> exact task;
- refresh from realtime;
- preserve organisation/tenant scope;
- use India Standard Time presentation.

Functions:

- `openActivityFeed()`
- `closeActivityFeed()`
- `refreshActivityFeed()`
- `renderActivityFeedItems()`
- shared `NFA_buildActivity()`
- shared `NFA_unreadCount()`

## 7.16 Notifications/attention module

Notification types currently documented or used:

- `message`
- `mention`
- `reply`
- `reaction`
- `task`
- `reminder`

Required notification actions:

- open panel;
- show unread count;
- mark read;
- dismiss one;
- clear all;
- clear fired reminders;
- navigate to message;
- navigate to task;
- sound/chime;
- in-app toast/banner;
- OS Web Push/native FCM;
- app icon badge.

Functions:

- `refreshNotificationBadge()`
- `animateBell()`
- `openTopPanel('alerts')`
- `markNotifRead()`
- `dismissNotif()`
- `deleteNotification()`
- `clearAllNotifications()`
- `goToMessage()`
- `goToTask()`
- notification audio/system helper functions in `notifications.js`

### Authoritative unread model

Per-room unread:

- messages newer than `room_reads.last_read_at`.

Bell/activity/app badge total:

- every unread message;
- plus unread attention notifications not already represented by those unread messages;
- de-duplicated by message IDs.

Do not add `sum(room unread) + notification count` without deduplication.

Mobile authority:

- `_recomputeBadges()` re-derives counts from DB;
- `_scheduleReconcile()` debounces reconciliation;
- fallback polling continues even when realtime claims to be healthy;
- provisional realtime increments are temporary only.

## 7.17 Push notifications

### Web Push table

`push_subscriptions`:

- `endpoint` primary key;
- `subscription` JSONB;
- `user_id`;
- tenant/metadata fields where deployed.

### Native push table

`push_tokens`:

- `token` primary key;
- `user_id`;
- `tenant_id`;
- `platform`;
- `updated_at`.

### `send-push` Edge Function

Triggered by a database webhook on `messages` INSERT.

Responsibilities:

- determine recipients;
- respect room membership/DM privacy;
- avoid notifying sender;
- honour room read state;
- detect mentions;
- honour `profiles.notify_muted`;
- send Web Push via VAPID;
- send native FCM via HTTP v1;
- use alert or silent Android channel;
- create attention `notifications` rows for mentions where designed.

Required external configuration:

- `VAPID_PUBLIC`
- `VAPID_PRIVATE`
- `VAPID_SUBJECT`
- `PUSH_HOOK_SECRET`
- `FCM_SERVICE_ACCOUNT`
- DB webhook with `x-hook-secret`
- Firebase `google-services.json` for APK

## 7.18 Profile settings

Required fields/actions:

- display name;
- email display;
- designation/department display;
- profile avatar preview and save;
- current role display;
- theme/settings access;
- DND/mute where exposed;
- logout.

Functions:

- `openSettings()`
- `closeSettings()`
- `previewSettingsPhoto()`
- `saveSettings()`

Compatibility storage:

- avatar can be stored as base64 under `mpgs_avatar_<uid>`;
- auth user metadata and `profiles` are also updated.

## 7.19 Group settings and creation

Group creation must retain:

- group name;
- colour;
- photo;
- member multi-select;
- creator/current user included;
- DB `room_settings` persistence;
- group-creation system message;
- storage upload for group photo where attempted;
- tenant namespace;
- role guard.

Group settings must retain:

- display name;
- colour;
- members;
- group administrators/co-admins;
- photo;
- archive state where supported;
- per-department management permission.

Compatibility localStorage keys:

- `<tenant>_dept_name_<groupId>`
- `<tenant>_dept_color_<groupId>`
- `<tenant>_dept_members_<groupId>`
- `<tenant>_dept_admins_<groupId>`
- `<tenant>_dept_photo_<groupId>`
- related photo timestamps/negative cache keys.

## 7.20 Admin module

Entry: `admin.html`, `js/admin.js`.

Current known responsibilities that a new frontend must preserve:

- administrator access check;
- staff/user list;
- create school user through service-role Edge Function;
- reset password;
- activate/deactivate or manage staff where implemented;
- assign/change roles;
- department/designation management;
- allowed-user approvals/allow-list;
- quick tags;
- task/staff scorecard;
- priority banner/reporting extensions;
- CSV export/import where currently available;
- PDF/report export;
- tenant-scoped administrative queries;
- audit logging.

Admin access is limited to:

- `principal`
- `vp_admin`
- `management`

Edge Function `create-school-user` is service-role only. Never move its privileged operations into browser Supabase calls.

Because the repository contains evolving admin add-on files and SQL, a redesign AI must inspect `admin.html`, `js/admin.js`, `js/admin-priority-banner.js`, `js/admin-sections-scorecard-v208_4.js`, and corresponding SQL before altering admin navigation.

## 7.21 Theme module

Existing theme engine supports multiple stored theme values, including:

- light/default indigo;
- dark/GitHub dark;
- sober dark;
- soft slate;
- sky breeze;
- warm neutral;
- retired/neutralised ocean teal compatibility;
- midnight.

Functions:

- `applyTheme()`
- `toggleTheme()`

A new two-theme frontend may present only Light/Dark, but it must safely handle older stored values and mobile theme ownership without first-paint colour flashes.

## 7.22 Offline/PWA/share/native module

Retain:

- service worker registration/update;
- one-time controller-change reload;
- install prompt capture;
- install/dismiss actions;
- iOS install hint;
- appinstalled cleanup;
- offline fallback;
- Web Share Target;
- push quick reply;
- app badge;
- cache-version bump on release;
- native back behaviour;
- native push token lifecycle;
- notification deep links.

---

# 8. Supabase schema contract

> The following is repository-grounded. It is not a substitute for a `pg_dump` or Supabase schema export. Before a full frontend rewrite, export the deployed schema, RLS policies, triggers, functions and publication configuration and append them to this file.

## 8.1 `tenants`

Purpose: one school/organisation.

Known fields:

- `id`
- `school_name`
- `principal_name`
- `subdomain`

Potential additional billing/contact/setup fields: **VERIFY IN SUPABASE**.

## 8.2 `profiles`

Purpose: application user profile tied to `auth.users.id`.

Known fields:

- `id`
- `email`
- `full_name`
- `role`
- `tenant_id`
- `designation`
- `department`
- `avatar_url`
- `last_login`
- `last_seen`
- `notify_muted`

## 8.3 `allowed_users`

Purpose: pre-approved signup allow-list per tenant.

Known/expected fields:

- tenant reference;
- email;
- role/designation/department metadata;
- approval/status metadata.

**VERIFY exact deployed fields.**

## 8.4 `roles`

Known fields:

- `id`
- `name`
- `permissions` JSONB
- `display_name`

## 8.5 `user_roles`

Known fields:

- `user_id`
- `tenant_id`
- `role_id`
- `department_id`

## 8.6 `messages`

Known fields:

- `id`
- `room_id`
- `sender_id`
- `text` HTML
- `parent_message_id`
- `tenant_id`
- `created_at`
- `updated_at`
- `deleted_at`
- legacy/task-related `is_task`
- legacy/task-related `task_data`

Indexes and RLS must support tenant+room chronological reads and DM privacy.

## 8.7 `room_settings`

Known fields:

- `room_id`
- `tenant_id`
- `name`
- `color`
- `members` JSONB
- `archived`
- photo/image field or storage-derived photo metadata
- `updated_at`

## 8.8 `room_reads`

Durable unread source of truth.

Known fields/key:

- `user_id`
- `room_id`
- `last_read_at`
- tenant field where deployed/required

Expected unique key: user + room, tenant-aware.

## 8.9 `reactions`

Known fields:

- `id`
- `message_id`
- `user_id`
- `value`
- `type`
- optional `count`
- `tenant_id`
- `created_at`

## 8.10 `bookmarks`

Known fields:

- `id`
- `user_id`
- `message_id`
- `tenant_id`
- optional `created_at`

## 8.11 `tasks`

Known fields:

- `id`
- `original_message_id`
- `title`
- `assigned_by`
- `deadline` date
- `priority`
- `require_proof`
- `status`
- `tenant_id`
- `created_at`

Verify description, updated timestamps and archival fields if present.

## 8.12 `task_assignees`

Composite identity: task + assignee, tenant-scoped.

Known fields:

- `task_id`
- `assignee_id`
- `status`
- `state`
- `acked`
- `tenant_id`

The code notes there is no dependable `created_at` column for dashboard date filtering. Do not assume it exists.

## 8.13 `task_trails`

Known fields:

- `id`
- `task_id`
- `user_id`
- `action`
- `comment`
- `file_url` in older schema/docs
- `tenant_id`
- `created_at`

Current proof code stores filename/storage path in `comment`, so support both `file_url` and encoded comment patterns.

## 8.14 `task_extension_requests`

Directly used fields:

- `id`
- `task_id`
- `requested_deadline`
- `reason`
- `tenant_id`

Verify:

- requester/assignee ID;
- decision status;
- decision reason;
- decided by;
- created/decided timestamps.

## 8.15 `reminders`

Known fields:

- `id`
- `user_id`
- `message_id`
- `reminder_time`
- `triggered`
- `tenant_id`
- `created_at`

## 8.16 `scheduled_messages`

Known fields:

- `id`
- `sender_id`
- `room_id`
- `message_text`
- `scheduled_time`
- `status`
- `tenant_id`
- `created_at`

## 8.17 `notifications`

Known fields:

- `id`
- `user_id`
- `type`
- `message`
- `message_id`
- `task_id`
- `is_read`
- `tenant_id`
- `created_at`

Current code tolerates unique-conflict code `23505`. Deployed dedup indexes have evolved. Verify current unique definition, including notification type.

## 8.18 `quick_tags`

Purpose: tenant quick replies/text tags.

Verify exact fields from `supabase/quick_tags.sql` and admin UI before rewriting.

## 8.19 `push_subscriptions`

Web Push endpoints and subscription JSON.

Known fields:

- `endpoint` primary key
- `subscription` JSONB
- `user_id`
- tenant/timestamps where deployed

## 8.20 `push_tokens`

Known fields:

- `token` primary key
- `user_id`
- `tenant_id`
- `platform`
- `updated_at`

## 8.21 `feature_flags`

Known fields:

- `tenant_id` primary/unique key
- `tasks_enabled`
- `uploads_enabled`
- `reports_enabled`
- `scheduling_enabled`

## 8.22 `subscriptions`

Known fields:

- `tenant_id`
- `plan`
- `status`
- `max_users`
- `trial_ends` or legacy `trial_ends` naming; older docs mention `trial_ends`

Verify exact trial column name before modifying auth/RBAC.

## 8.23 `audit_logs`

Known fields:

- `actor_id`
- `action`
- `table_name`
- `old_data`
- `new_data`
- tenant/timestamp fields where deployed

## 8.24 `developers`

Known field:

- `email` primary key

Purpose: platform/developer-level access.

## 8.25 Logging/priority/report tables

Repository migrations also define operational tables such as application logs and priority/reporting data. A complete admin rewrite must inspect:

- `supabase/migrations/20260627_app_logs.sql`
- `supabase/supabase_priority_banner_v208.sql`
- `supabase_priority_banner_report_v208_3.sql`
- corresponding admin JavaScript.

---

# 9. RPC and Edge Function inventory

## 9.1 RPCs referenced by frontend

- `send_task_reminder(p_task_id, p_assignee_id, p_tenant_id, p_sender_id)`
- `request_task_extension(p_task_id, p_requested_deadline, p_reason, p_tenant_id)`
- `respond_task_extension(p_request_id, p_approve, p_decision_reason, p_tenant_id)`
- `complete_tenant_signup(...)` — referenced by signup, definition not in repo.
- current-tenant helper/RPC from `20260706_set_current_tenant_id.sql` — inspect before changing auth/RLS.
- priority/report RPCs used by priority-banner/admin scorecard modules — inspect those files before redesign.

## 9.2 Edge Functions

### `create-school-user`

Called by admin interface for privileged Auth user creation/password administration. Requires service role.

### `send-push`

Webhook-driven Web Push + FCM engine.

### `send-scheduled-messages`

Cron-driven scheduled-message sender.

### Scheduler naming note

Older architecture documentation refers to `taskflow-scheduler`, while the repository currently includes `send-scheduled-messages` and reminder SQL/function flows. Verify the actually deployed scheduled functions and cron endpoints in Supabase before changing scheduler UI.

---

# 10. Storage contract

Bucket: `task-proofs`.

Known uses:

- chat file upload paths such as `chat/<timestamp>_<safe_name>`;
- task proof paths `tasks/<tenant>/<task>/<timestamp>_<safe_name>`;
- group photos under `group-photos/<tenant>/<room>.jpg`.

Secure opening:

- `openSecureFile()` generates a signed URL, currently documented as 24 hours.

A replacement frontend must not assume the bucket is public.

---

# 11. Realtime contract

Known subscriptions/events:

- `messages` INSERT;
- `notifications` INSERT filtered to current user;
- `reactions` changes/broadcast;
- `task_assignees` ALL;
- `task_trails` ALL;
- `scheduled_messages` UPDATE;
- `room_settings` changes;
- `profiles` changes/presence refresh;
- mobile/task-specific subscriptions.

Expected reactions:

- reload or surgically insert current-room message;
- provisional unread bump for other rooms;
- sound/toast/banner;
- task panel debounce reload;
- activity refresh;
- notification/bell reconciliation;
- scheduled-send confirmation;
- app badge refresh.

The table must be included in `supabase_realtime` publication. See `supabase/enable_realtime.sql`.

Cross-platform broadcast channel:

- tenant-scoped `taskflow-bc-<tenant>` for group-related realtime/broadcast features;
- DMs must not be broadcast tenant-wide.

---

# 12. RLS/security contract

The frontend is not the security boundary.

Mandatory principles:

- tenant isolation on all school data;
- owner-only notification/reminder/bookmark/read operations;
- sender-only message edits, plus approved moderator deletion logic;
- DM access restricted to the two DM users;
- task creator/assignee access restricted appropriately;
- group membership restrictions;
- storage object access restricted by tenant/task/path;
- push token/subscription ownership;
- service-role operations only in Edge Functions;
- no secrets in frontend.

Known migrations/policy files to inspect:

- `supabase/migrations/20260706_messages_dm_rls.sql`
- `supabase/migrations/20260708_scheduled_messages_rls.sql`
- `supabase/migrations/20260708_notifications_owner_rls.sql`
- `supabase/migrations/20260706_notifications_insert_policy.sql`
- `supabase/migrations/README_v36_hardening.sql`
- task consistency/stability/UUID hotfix SQL files
- commercial security audit SQL

Before replacing the frontend, obtain an exported list of deployed policies because repository SQL may include historical/one-off versions.

---

# 13. Local persistence keys

Known keys/patterns:

- `theme`
- `mob_theme`
- `mpgs_current_room`
- `mpgs_left_sidebar_state`
- `mpgs_right_sidebar_state`
- `mpgs_avatar_<uid>`
- tenant-prefixed `dept_name_<groupId>`
- tenant-prefixed `dept_color_<groupId>`
- tenant-prefixed `dept_members_<groupId>`
- tenant-prefixed `dept_admins_<groupId>`
- tenant-prefixed group photo keys/timestamps/negative cache
- console log persistence key `nfa_console_log`
- PWA dismiss/session keys

Do not wipe or rename these without migration logic.

---

# 14. Navigation/deep-link contract

A new frontend must support exact navigation from:

- notification -> message;
- notification -> task;
- activity item -> message;
- activity item -> task;
- bookmark -> message;
- task -> original message;
- push tap -> room;
- scheduled/reminder item -> target;
- reply notification -> exact parent/reply context.

Important functions:

- `goToMessage()`
- `goToTask()`
- `openTaskOriginalMessage()`
- `scrollToAndHighlight()`
- `openRoomById()`
- native `_openRoomByRoom()` deep-link bridge

Expected UX:

1. Resolve room/task from DB if not already loaded.
2. Switch room/module.
3. Load enough data.
4. Scroll to target.
5. Highlight target temporarily.
6. Mark related notification/read state.
7. If target is outside loaded history, show a clear recovery message rather than failing silently.

---

# 15. Button-to-handler mapping checklist

Any new frontend button must map to an existing function or a documented adapter.

## Header/sidebar

- Search messages -> message search/apply filter.
- Search sidebar -> `filterSidebar()`.
- Bell -> `openTopPanel('alerts')` or current enhanced notification centre.
- Scheduled -> `openTopPanel('scheduled')`.
- Reminders -> `openTopPanel('reminders')`.
- Bookmarks -> `openTopPanel('bookmarks')`.
- Activity -> `openActivityFeed()`.
- Dashboard -> `openDashboard()`.
- Task hub toggle -> `toggleRightSidebar()`.
- Sidebar toggle -> `toggleLeftSidebar()`.
- Group gear -> `openGroupSettings()`.
- New group -> `openNewGroupModal()`.
- Settings -> `openSettings()`.
- Admin -> protected admin route/panel.
- Theme -> `toggleTheme()` or compatibility theme setter.
- Logout -> existing auth logout function.

## Composer

- Emoji -> `toggleInputEmojiPicker()` / `insertEmoji()`.
- Attachment -> existing file input and upload listener.
- Link -> `openLinkModal()` / `insertLinkPill()`.
- Schedule -> `showScheduleModal()`.
- Send -> `sendMessage()`.
- Cancel reply -> `cancelReply()`.

## Message

- Reply -> `initiateReply()`.
- Replies count -> `toggleReplies()`.
- Reaction -> `applyReaction()`.
- Bookmark -> `toggleBookmark()`.
- Task -> `openTaskModal()`.
- Reminder -> `showReminderModal()`.
- Forward -> `openForwardModal()` then `sendForwardedMessage()`.
- Edit -> `startEditMessage()` then `saveEditMessage()`/`cancelEditMessage()`.
- Delete -> `deleteMessage()`.
- Open attachment -> `openSecureFile()`.

## Task assignee

- Acknowledge -> `taskAction(..., 'ack')`.
- Start -> `taskAction(..., 'start')`.
- Update -> `openTaskUpdateAction()`.
- Upload -> `openTaskUploadAction()`.
- Submit -> `taskAction(..., 'submit', requireProof)`.
- Delegate -> `openTaskDelegateAction()`.
- Extension -> `openTaskExtensionRequest()`.

## Task creator

- Accept -> `taskAction(..., 'accept')`.
- Return -> `openTaskReturnAction()`.
- Transfer -> `openTaskTransferAction()`.
- Remind -> `sendTaskReminder()`.
- Remind all -> `remindAllTaskPending()`.
- Approve/decline extension -> `respondTaskExtension()`.
- Change deadline -> `openTaskDeadlineAction()`.
- Cancel -> `openTaskCancelAction()`.
- Original message -> `openTaskOriginalMessage()`.
- PDF -> `downloadTaskPDF()`.

---

# 16. Functional parity test matrix

A redesign is not complete until all of these are tested with real authenticated users and Supabase data.

## 16.1 Authentication/tenant

- Valid login.
- Invalid login.
- Logout.
- Session refresh.
- Tenant isolation between two schools.
- Missing/orphaned tenant behaviour.
- Expiring trial warning.
- Expired trial send block.

## 16.2 Groups and DMs

- Open each department.
- Open DM.
- Create group as allowed role.
- Creation blocked for disallowed role.
- Edit group name/colour/photo/members/admins.
- Non-admin cannot see/use group controls.
- DM content never appears in another user/tenant feed.

## 16.3 Messages

- Send plain text.
- Send formatted text.
- Emoji.
- Mention.
- Reply.
- Open/close replies.
- React/add/remove reaction.
- Text tag.
- Bookmark/unbookmark.
- Forward to group.
- Forward to DM.
- Edit own message.
- Cancel edit.
- Delete own message.
- Moderator delete.
- Unauthorized edit/delete blocked.
- File upload/open signed link.
- Link pill.
- Search/filter.
- Deep link/highlight.
- Read receipt/unread reset.

## 16.4 Reminders/schedule

- Create reminder.
- Delete upcoming reminder.
- Reminder fires through scheduler.
- Fired reminder notification opens exact message.
- Clear fired reminder.
- Schedule future message.
- Cancel scheduled message.
- Scheduled message sends once.
- Scheduled status/realtime confirmation.
- Unauthorized scheduler blocked.

## 16.5 Tasks

Test with at least three assignees in different states.

- Create from message.
- Create standalone if supported.
- Multi-select assignees.
- Principal/management excluded from assignment.
- Assignee A acknowledges.
- Assignee B remains pending.
- Assignee A starts.
- Assignee A posts update.
- Assignee A uploads proof.
- Proof-required submit blocked before upload.
- Submit succeeds after proof.
- Creator accepts only A; B remains independent.
- Creator returns A with feedback.
- A resubmits.
- Delegate adds separate assignment and original remains accountable.
- Transfer closes old assignment and creates replacement.
- Single reminder.
- Remind all pending.
- Deadline change.
- Extension request.
- Extension approve.
- Extension decline.
- Cancel task with history preserved.
- Original-message navigation.
- Trail ordering and user labels.
- Task reply compilation occurs once.
- Task PDF.
- Filters/sorts/date range.
- Realtime updates on another device.

## 16.6 Notifications/activity/unread

- New group message.
- New DM.
- Mention.
- Reply.
- Reaction.
- Task assignment.
- Task update/submission/review.
- Reminder.
- Bell count has no duplicates.
- Per-room count exact.
- Mark read.
- Dismiss one.
- Clear all.
- Activity navigation.
- Socket drop then polling reconciliation.
- Foreground app: one in-app alert, no duplicate native alert.
- Background/closed: OS push.
- Push tap deep-links to exact room.
- App icon badge matches authoritative total.

## 16.7 Mobile/native/PWA

- Mobile login not hidden by desktop/mobile CSS.
- All bottom-nav screens.
- Mobile drawer.
- Chat composer and keyboard.
- Long message/attachment.
- Mobile task list/details/actions.
- Back button stack.
- Native double-back exit at root.
- Install banner.
- Offline fallback.
- Service-worker update.
- Web Push subscribe.
- Native FCM token saved/reassigned after login change.

## 16.8 Admin

- Admin access roles only.
- Staff list.
- Create user.
- Password reset.
- Role change.
- Allowed-user flow.
- Reports/scorecards.
- CSV/PDF actions.
- Priority/admin extensions.
- Cross-tenant access blocked.

---

# 17. Frontend migration method recommended

1. Freeze `main` as the behavioural reference.
2. Create a dedicated redesign branch.
3. Export deployed Supabase schema, RLS, functions, triggers, indexes and realtime publication.
4. Build a machine-readable action registry mapping every existing button to handler and capability.
5. Keep existing `window.*` API through an adapter layer.
6. Migrate one module at a time behind a feature flag.
7. Run the parity matrix after every module.
8. Compare DB writes and realtime events between old and new UI.
9. Test both web and mobile independently.
10. Keep the old renderer available until the corresponding module passes parity.
11. Merge only after the owner approves visuals and every checklist item is signed off.

---

# 18. Known ambiguities and mandatory Supabase export

The repository contains historical SQL/hotfix files and evolving documentation. Therefore another AI must not claim 100% schema certainty until it obtains:

- all tables and columns from `information_schema`;
- all PK/FK/unique/check constraints;
- all RLS policies;
- all Postgres functions/RPC signatures and bodies;
- all triggers;
- all indexes;
- `supabase_realtime` publication tables;
- all storage buckets and storage policies;
- deployed Edge Function names/versions/secrets list;
- DB webhook definitions;
- cron jobs/schedules.

Append that export to this file or create `SUPABASE-SCHEMA.md`, then reference it here.

---

# 19. Release/version contract

Existing release guidance requires coordinated version bumps:

- `js/shared.js` -> `window.APP_VER`
- `js/mobile.js` -> `_MOB_VER`
- `sw.js` -> cache version
- `version.json` -> matching version

Merging to `main` deploys Vercel and updates the remote-URL native app on next open.

SQL migrations and Edge Functions are not deployed by Vercel. The maintainer must run/deploy them separately.

---

# 20. Definition of done for another AI

A new frontend is acceptable only when:

- every module in this file exists;
- every applicable button is mapped;
- every role/feature gate is preserved;
- all task states and independent assignee flows work;
- all Supabase writes use the correct tenant/user scope;
- realtime and fallback reconciliation work;
- notification counts are de-duplicated;
- desktop, mobile, PWA and native deep links work;
- no mock state or simulated alert remains;
- the complete parity matrix passes;
- no production merge occurs before owner approval.

**Visual similarity is not functional parity. The database writes, audit trail, permissions, navigation and realtime outcomes are the acceptance criteria.**
