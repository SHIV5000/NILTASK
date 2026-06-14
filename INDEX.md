# MPGS TaskFlow — Complete File & Function Index

**Version:** VER 1.61.0
**Date:** 14 June 2026
**Repo:** https://github.com/SHIV5000/NILTASK
**Live:** https://niltask.vercel.app/

---

## File Load Order (index.html)

```html
<script type="module" src="js/shared.js"></script>
<script type="module" src="js/ui-core.js"></script>
<script type="module" src="js/ui-panels.js"></script>
<script type="module" src="js/ui-feed.js"></script>
<script type="module" src="js/ui-settings.js"></script>
<script type="module" src="js/messages.js"></script>
<script type="module" src="js/tasks.js"></script>
<script type="module" src="js/main.js"></script>
```

---

## File Summary

| File | Lines | Functions | Responsibility |
|---|---|---|---|
| `shared.js` | ~50 | 4 | Supabase client, escapeHtml, toSentenceCase, getISTTime |
| `ui-core.js` | ~281 | 16 | CSS, theme, toast, navigation, sidebar, utilities |
| `ui-panels.js` | ~320 | 17 | Bell/badge, 4 top panels, notifications, reminders, schedule |
| `ui-feed.js` | ~356 | 8 | Activity feed, dashboard, PDF export |
| `ui-settings.js` | ~277 | 15 | Profile, group settings, link pill, task modal |
| `main.js` | ~841 | 12 | App shell, HTML template, subscriptions, boot |
| `messages.js` | ~659 | 21 | Chat, reactions, edit, forward, replies, bookmarks |
| `tasks.js` | ~499 | 10 | Task CRUD, trail, proof upload, PDF, notifications |
| **Total** | **~3283** | **103** | |

---

## Dependency Map

```
shared.js  (sb, helpers)
   |
   +-- ui-core.js        CSS + theme + toast + goToMessage + goToTask + sidebar
   |      |
   +-- ui-panels.js      Bell + openTopPanel + reminders + schedule modal
   |      |
   +-- ui-feed.js        Activity feed + dashboard
   |      |
   +-- ui-settings.js    Profile + group settings + link pill + task modal
   |      |
   +-- messages.js       Chat + reactions + edit + forward + replies
   +-- tasks.js          Task lifecycle + trail + PDF
   +-- main.js           renderMainApp + loadChatsList + startSubscriptions + boot
```

---

---

## `ui-core.js`

**Purpose:** CSS style injection (all app styles live here), theme management, toast notifications, cross-room navigation, sidebar toggle/resize, and basic DOM helpers. Loaded first among ui-* files.

**Functions: 16**

### Layout

**`window.initResizers()`**  
Attaches drag listeners to left and right resize handles so the user can resize both sidebars.

**`window.toggleLeftSidebar()`**  
Shows or hides the left Conversations sidebar, persists state to localStorage.

**`window.toggleRightSidebar()`**  
Shows or hides the right Task Hub sidebar, persists state to localStorage.

### Navigation

**`window.goToMessage()`**  
Cross-room scroll: fetches room_id from DB if unknown, switches room if needed, calls loadMessages(), then scrolls via pendingScrollId. Marks notification read.

**`window.goToTask()`**  
Opens Task Hub, resets filter to all, reloads tasks, scrolls to and highlights the matching task card. Marks linked notification as read.

**`window.scrollToAndHighlight()`**  
Scrolls to a DOM element by ID and applies a temporary accent glow highlight.

### Storage

**`window.openSecureFile()`**  
Creates a 24-hour signed URL for task-proofs bucket and opens the file in a new tab.

### Tasks

**`window.toggleDateFilter()`**  
Shows/hides date-range inputs based on the current filter selection, then reloads tasks.

**`window.toggleTaskTrail()`**  
Toggles visibility of a task audit-trail section inside a task card.

**`window.toggleTrail()`**  
Alias for toggleTaskTrail, kept for backward compatibility.

### Theme

**`window.applyTheme()`**  
Applies light / dark / sober-dark theme to document root via data-theme and updates the toggle icon.

**`window.toggleTheme()`**  
Cycles through three theme modes (light, dark, sober-dark), saves to localStorage, calls applyTheme().

### UI

**`window.closeDropdowns()`**  
Removes the open class from every .bubble-dropdown, collapsing all menus.

**`window.showCenterToast()`**  
Shows a temporary centred toast with icon, colour and message. Auto-removes after 4 seconds.

**`window.toggleDropdown()`**  
Opens or closes a message bubble dropdown, closing all others first.

### Utility

**`window.stripHtml()`**  
Strips all HTML tags, returns plain text. Used before inserting content in toasts, DB records or comparisons.

---

## `ui-panels.js`

**Purpose:** Bell icon badge, notification management, and the four top-bar dropdown panels (Scheduled / Reminders / Bookmarks / Alerts). Also owns the Reminder modal and Schedule Message modal.

**Functions: 17**

### Notifications

**`window.animateBell()`**  
Starts the bell-ring CSS animation on the bell icon. Stops when user clicks it.

**`window.clearAllNotifications()`**  
Deletes ALL notifications for current user from DB, closes panel, refreshes badge. Shows RLS error toast if blocked.

**`window.clearFiredReminders()`**  
Deletes all type=reminder notifications for current user, closes panel, refreshes badge.

**`window.deleteNotification()`**  
Alias for dismissNotif.

**`window.dismissFired()`**  
Dismisses a fired reminder notification from the reminders panel and DB.

**`window.dismissNotif()`**  
Deletes a single notification from DB, removes its DOM card, refreshes bell badge.

**`window.markNotifRead()`**  
Sets is_read=true for a notification in DB and refreshes the badge.

**`window.refreshNotificationBadge()`**  
Fetches unread notification count and updates the red badge on the bell icon. Creates the badge element if absent.

### Panels

**`window.openTopPanel()`**  
Opens one of four top-bar panels: scheduled (pending messages), reminders (upcoming + fired), bookmarks (saved messages), alerts (notifications enriched with sender + room via batch DB fetch).

### Reminders

**`window.closeReminderModal()`**  
Closes the reminder modal.

**`window.deleteReminder()`**  
Cancels an upcoming reminder (before firing) by deleting from reminders table.

**`window.saveReminder()`**  
Inserts a row into reminders table with the chosen datetime. Edge Function cron will fire and insert a notification when the time arrives.

**`window.showReminderModal()`**  
Opens the Set Reminder modal for a specific message with a preview of the message text.

### Schedule

**`window.closeScheduleModal()`**  
Closes the schedule modal.

**`window.deleteScheduled()`**  
Cancels a pending scheduled message by deleting from scheduled_messages table.

**`window.saveScheduledMessage()`**  
Inserts a pending row into scheduled_messages. Edge Function cron (send-scheduled-messages) will send it and insert a bell notification.

**`window.showScheduleModal()`**  
Validates Quill has content, then opens the Schedule modal for the user to pick a future send datetime.

---

## `ui-feed.js`

**Purpose:** Activity Feed panel (real-time list of messages and task events in the right sidebar) and Personal Dashboard with period tabs, stat cards, score ring, and PDF export.

**Functions: 8**

### Activity

**`window.closeActivityFeed()`**  
Removes the feed panel, restores Task Hub and filter bar, sets _activityFeedOpen=false.

**`window.openActivityFeed()`**  
Opens the Activity Feed panel in the right sidebar. Fetches last 40 messages + 20 task trails, renders them sorted newest-first. Sets window._activityFeedOpen=true so real-time subscriptions can call refreshActivityFeed().

**`window.refreshActivityFeed()`**  
Called by realtime subscriptions when new messages or trails arrive. Re-fetches and re-renders the feed list without rebuilding the panel chrome.

**`window.renderActivityFeedItems()`**  
Renders a sorted array of activity items into the feed list. Message items navigate to the message; trail items navigate to the task card.

### Dashboard

**`window.closeDashboard()`**  
Hides the Dashboard modal.

**`window.downloadDashboardPDF()`**  
Exports the dashboard as a branded MPGS PDF progress card using html2pdf.js with the user name and IST timestamp in the header.

**`window.loadDashboard()`**  
Fetches stats for today/week/month/all via sequential safe queries (each wrapped in try-catch). Calculates score (60% task completion + 40% engagement). Renders stat cards and score ring. Note: task_assignees has no created_at column so it is never date-filtered.

**`window.openDashboard()`**  
Shows the Dashboard modal and loads Today stats by default.

---

## `ui-settings.js`

**Purpose:** Profile Settings (display name + base64 photo), Group/Department Settings (name + colour + members + admins), Link Pill insert modal, and the Task Creation modal.

**Functions: 12**

### Groups

**`window.closeGroupSettings()`**  
Closes the Group Settings modal.

**`window.openGroupSettings()`**  
Async. Opens Group Settings modal for a department. Reads values from localStorage, highlights active colour swatch, and renders the members + admin checkbox list (fetches profiles from DB if cache is empty).

**`window.previewGroupPhoto()`**  
Reads a group photo file as base64 and shows it in the group photo preview element.

**`window.saveGroupSettings()`**  
Saves group display name, accent colour, member IDs, and admin IDs to localStorage under keys dept_name_, dept_color_, dept_members_, dept_admins_ + groupId. Updates room title if user is currently in that group.

**`window.selectGroupColor()`**  
Highlights the clicked colour swatch and stores choice in window._selectedGroupColor for use by saveGroupSettings.

### Links

**`window.closeLinkModal()`**  
Closes the Insert Link modal.

**`window.insertLinkPill()`**  
Reads name + URL from modal, inserts a Quill native link using a special https://link-pill.local/ prefix. renderMessages() transforms this prefix into a styled gradient button visible to all users.

**`window.openLinkModal()`**  
Opens the Insert Link modal, stores target editor ID for insertLinkPill.

### Profile

**`window.closeSettings()`**  
Closes the Profile Settings modal.

**`window.openSettings()`**  
Opens Profile Settings modal. Fetches current profile from DB, loads avatar from localStorage fallback (mpgs_avatar_<uid>) so photo displays without needing a public storage bucket.

**`window.previewSettingsPhoto()`**  
FileReader preview: reads the selected photo file as base64 and shows it in the preview img element immediately.

**`window.saveSettings()`**  
Saves display name and profile photo. Photo stored as base64 in localStorage (mpgs_avatar_<uid>) - no bucket permissions needed. Updates auth user_metadata, profiles table, refreshes window.currentUser via sb.auth.getUser(), updates sidebar avatar and name DOM in place.

---

## `main.js`

**Purpose:** Application entry point. Renders the entire HTML skeleton via renderMainApp(), manages the left sidebar conversations list, establishes all Supabase Realtime subscriptions, and runs the auth boot sequence.

**Functions: 11**

### App Shell

**`window.renderMainApp()`**  
Renders the entire application HTML into #root: left sidebar (conversations), main chat area (Quill editor, top bar icons, message list), right sidebar (filter pills + task hub), and all modals. Called once after successful login.

### Audio

**`window.playSound()`**  
Plays one of three notification sounds (message / task / reminder). Debounced per type: same sound cannot replay within 2 seconds.

### DM

**`window.getDmRoomId()`**  
Generates a canonical deterministic DM room ID: dm_<sorted_uid1>_<sorted_uid2>.

### Navigation

**`window.getRoomDisplayName()`**  
Converts a raw room_id to a display name: DM rooms show the other users full name, group rooms show the capitalized room name.

### Realtime

**`window.startSubscriptions()`**  
Establishes all Supabase Realtime subscriptions: messages INSERT, task_assignees ALL, task_trails ALL, notifications INSERT (user filter), scheduled_messages UPDATE, reactions broadcast channel (ADD + REMOVE events).

### Sidebar

**`window.filterSidebar()`**  
Filters department and staff items in left sidebar by search term.

**`window.loadChatsList()`**  
Fetches all profiles from DB, applies department localStorage settings, renders the left sidebar Departments + Staff Members sections. Also updates room title and sidebar avatar after settings changes.

### Tasks

**`window.debouncedLoadTasks()`**  
Calls loadTasksForPanel() with a 600ms debounce to prevent rapid re-renders when multiple task_assignees rows update at once.

**`window.setTaskFilter()`**  
Sets the hidden taskFilter select value, highlights the active pill, shows/hides date-range inputs, reloads task panel.

**`window.setTaskSort()`**  
Sets the hidden taskSort select value, highlights the active sort pill, reloads task panel.

### UI

**`window.initScrollArrows()`**  
Adds two circular scroll buttons (up and down) to messagesContainer. Buttons appear when user is more than 120px from the respective edge.

---

## `messages.js`

**Purpose:** All chat functionality: send/load/render messages, reactions toggle (Supabase Broadcast), message edit/delete/forward, reply threads, bookmarks, message search filter, and file attachment cards.

**Functions: 21**

### Bookmarks

**`window.toggleBookmark()`**  
Toggles a message bookmark: inserts or deletes from bookmarks table, updates button icon.

### Chat

**`window.applyFilters()`**  
Filters visible message rows by the text in #messageSearchBar.

**`window.insertEmoji()`**  
Inserts an emoji character at the current Quill cursor position.

**`window.loadMessages()`**  
Fetches all messages for current room with profile join, fetches bookmarks, fetches reactions for all message IDs into reactionsCache. Calls renderMessages(), handles pendingScrollId scroll after 100ms.

**`window.renderMessages()`**  
Renders all messages into messagesContainer via buildMsgHTML. Groups by date, applies search filter, handles scroll-to-bottom or pendingScrollId with glow highlight.

**`window.sendMessage()`**  
Validates and sends a Quill editor message. Blocks bare URLs (redirects to Link button). Handles reply threading, file attachment links, DM notifications and reply notifications. Inserts into messages table.

**`window.toggleInputEmojiPicker()`**  
Shows or hides the emoji picker in the input area.

### Files

**`window.cancelFileRename()`**  
Legacy function: closes the file rename modal (modal is bypassed - direct upload is used).

**`window.confirmFileRename()`**  
Legacy function: confirms a file rename (modal is bypassed - direct upload is used).

### Messages

**`window.cancelEditMessage()`**  
Restores original message HTML from _editCache and clears the edit UI.

**`window.closeForwardModal()`**  
Closes the forward modal.

**`window.deleteMessage()`**  
Deletes a message from DB (sender_id must match current user). Reloads messages.

**`window.openForwardModal()`**  
Opens the Forward modal, pre-fills message preview, populates room/DM selector from globalUsersCache.

**`window.saveEditMessage()`**  
Saves edited text to DB via UPDATE on messages table. Requires RLS policy. Shows guidance toast if RLS blocks the update.

**`window.sendForwardedMessage()`**  
Fetches original message HTML, prepends a "Forwarded from Name" attribution header, inserts into the selected target room.

**`window.startEditMessage()`**  
Replaces .b-text with a textarea + Save/Cancel buttons. Stores original HTML in window._editCache[msgId] for Cancel.

### Reactions

**`window.applyReaction()`**  
Toggle: if users reaction exists in DOM (data-emoji or data-tag), removes it, broadcasts reaction_remove, deletes from DB. Otherwise adds via applyReactionDOM, broadcasts reaction, inserts to DB.

**`window.applyReactionDOM()`**  
Adds an emoji chip (with count and data-emoji attribute) or a text tag to the message footer DOM without any DB call. Called by applyReaction and by the reactions broadcast listener for other users.

### Replies

**`window.cancelReply()`**  
Clears reply context and hides the reply banner.

**`window.initiateReply()`**  
Sets reply context: stores currentlyReplyingTo, shows reply banner above the editor.

**`window.toggleReplies()`**  
Shows or hides the inline replies thread below a message.

---

## `tasks.js`

**Purpose:** Complete task lifecycle: create, load/render with filter+sort, all actions (acknowledge/update/upload/submit/accept/review/delegate/transfer), audit trail, PDF export, and notification dispatch.

**Functions: 10**

### Notifications

**`window.notifyUser()`**  
Inserts a notification row into notifications table for a target user with type, message, and optional message_id. Used by all task actions.

### Tasks

**`window.closeTaskModal()`**  
Closes the task creation modal.

**`window.downloadTaskPDF()`**  
Generates and downloads a PDF audit trail for a task using html2pdf.js with MPGS watermark, all trail entries and status summary.

**`window.filterAssignees()`**  
Filters the assignee list in the task modal by search term.

**`window.loadTasksForPanel()`**  
Fetches tasks for current user (assigned_by or assignee), applies filter + sort, renders task cards with data-task-id attributes. Completed tasks render at 60% opacity.

**`window.openTaskModal()`**  
Opens the Create Task modal (tasks.js copy sets currentMessageId context).

**`window.saveTaskMultiAssignee()`**  
Creates a task with multiple assignees: inserts into tasks table then one task_assignees row per user, sends notifyUser for each assignee.

**`window.taskAction()`**  
Handles all task lifecycle actions: acknowledge, update (rich text comment), file-proof upload, submit, accept, review-again, delegate (with reason), transfer (with reason). Updates task_assignees status, inserts trail entries, sends notifications.

**`window.taskFmtCmd()`**  
Executes document.execCommand for rich-text formatting in the task update contenteditable box.

**`window.taskFmtList()`**  
Toggles a bullet or numbered list in the task update contenteditable box.

---

## Supabase Schema Reference

| Table | Key Columns | Used By |
|---|---|---|
| `messages` | id, room_id, sender_id, text, parent_message_id, created_at | messages.js, main.js |
| `profiles` | id, email, full_name, avatar_url* | main.js, ui-settings.js |
| `tasks` | id, title, assigned_by, deadline, priority, status, original_message_id | tasks.js |
| `task_assignees` | task_id, assignee_id, status, state, acked | tasks.js |
| `task_trails` | task_id, user_id, action, comment, created_at | tasks.js, ui-feed.js |
| `notifications` | id, user_id, type, message, message_id, task_id*, is_read, created_at | ui-panels.js |
| `reminders` | id, user_id, message_id, reminder_time, triggered, created_at | ui-panels.js |
| `scheduled_messages` | id, sender_id, room_id, message_text, scheduled_time, status | ui-panels.js, main.js |
| `bookmarks` | user_id, message_id | messages.js |
| `reactions`* | id, message_id, user_id, value, type, count, created_at | messages.js |

`*` = Optional — app works without these columns/tables via graceful fallback.

### Required SQL Policies

```sql
-- Edit message (sender only)
CREATE POLICY "users update own messages" ON messages
  FOR UPDATE USING (auth.uid() = sender_id);

-- Clear All notifications
CREATE POLICY "users delete own notifications" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Optional: reactions persistence
CREATE TABLE IF NOT EXISTS reactions (
  id uuid default gen_random_uuid() primary key,
  message_id uuid, user_id uuid,
  value text, type text, count int default 1,
  created_at timestamptz default now()
);

-- Optional: task_id in notifications for scroll-to-task
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id uuid;

-- Optional: avatar_url in profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
```

---

## LocalStorage Keys

| Key | Value | Managed By |
|---|---|---|
| `theme` | light / dark / sober-dark | ui-core.js |
| `mpgs_current_room` | room_id | main.js |
| `mpgs_left_sidebar_state` | flex / none | ui-core.js |
| `mpgs_right_sidebar_state` | flex / none | ui-core.js |
| `mpgs_avatar_<uid>` | base64 data URL | ui-settings.js |
| `dept_name_<groupId>` | Display name string | ui-settings.js |
| `dept_color_<groupId>` | Hex colour string | ui-settings.js |
| `dept_members_<groupId>` | JSON array of user IDs | ui-settings.js |
| `dept_admins_<groupId>` | JSON array of admin IDs | ui-settings.js |

---

## Realtime Channels

| Channel Name | Event | What it does |
|---|---|---|
| `public:messages` | INSERT | Reloads messages, plays sound, updates unread badge |
| `task-assignees-changes` | ALL | Debounced task panel reload, sends notifications |
| `trails-changes` | ALL | Debounced task reload, refreshes activity feed |
| `notification-changes` | INSERT (filtered to current user) | Shows toast, plays sound, animates bell, updates badge |
| `scheduled-changes` | UPDATE | Shows sent-toast, calls notifyUser, reloads messages if current room |
| `mpgs-reactions-v1` | broadcast: reaction | Calls applyReactionDOM on other users screens |
| `mpgs-reactions-v1` | broadcast: reaction_remove | Removes chip/tag from other users DOM |

---

*Last updated automatically from source — regenerate when adding new functions.*
