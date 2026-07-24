# NILTASK Professional UI — Behaviour Parity Checklist

This branch changes presentation only. Existing JavaScript handlers, Supabase operations, RBAC rules, task lifecycle, notifications, reminders, schedules, and audit behaviour remain authoritative.

## Application shell
- [x] Arimo typography
- [x] Larger readable type scale
- [x] Professional NILTASK navigation rail
- [x] Module-specific icons
- [x] Dynamic 3D school-name branding
- [x] Desktop responsive shell
- [x] Mobile-safe presentation rules

## Messages
- [x] Message bubbles and sender metadata
- [x] Three-dot menu
- [x] Create Task from message
- [x] Reminder
- [x] Edit
- [x] Forward
- [x] Delete
- [x] Reply and reply threads
- [x] Bookmark
- [x] Emoji reactions and text tags
- [x] Files, image previews, and link pills
- [x] Sent/read ticks and edited indicator
- [x] Composer and rich-text toolbar
- [x] Mobile action-sheet styling

## Tasks
- [x] Existing right task panel upgraded
- [x] Global task workspace presentation
- [x] Search and filter surfaces
- [x] Task status and progress summaries
- [x] Multi-assignee display
- [x] Per-assignee status cards
- [x] Individual submissions and review surfaces
- [x] Delegation and transfer action surfaces
- [x] Task action drawer on desktop
- [x] Task action sheet on mobile
- [x] Task trail and evidence sections

## Activity and notifications
- [x] Activity feed panel and cards
- [x] Notification panel and cards
- [x] Direct Open actions retained
- [x] Read/unread and clear controls retained
- [x] Empty, loading, and error states

## Schedule, reminders, and bookmarks
- [x] Scheduled-message panel
- [x] Reminder panel
- [x] Upcoming and fired reminder sections
- [x] Bookmark panel
- [x] Existing Go to message / Cancel / Delete actions retained
- [x] Mobile bottom-sheet presentation

## Settings and modals
- [x] Profile settings
- [x] Group/department settings
- [x] Change password
- [x] Task creation modal
- [x] Reminder modal
- [x] Scheduled-message modal
- [x] Forward modal
- [x] Link-pill modal
- [x] Form focus and accessibility styling

## Behaviour safety checks
- [x] No database migration introduced
- [x] No Supabase query rewritten by the professional UI layer
- [x] No RBAC rule replaced
- [x] No task status value introduced by the professional UI layer
- [x] Existing onclick handlers remain authoritative
- [x] Branch remains isolated from main
- [x] Production deployment not triggered by this branch work

## Final preview checks
1. Login and open the authenticated workspace.
2. Verify school branding and navigation rail.
3. Test every message action.
4. Open Tasks and inspect a multi-assignee task.
5. Test creator review, delegation, and transfer actions with authorised roles.
6. Open Activity, Notifications, Schedule, Reminders, and Bookmarks.
7. Open Settings and all major modals.
8. Repeat key flows at mobile width.
9. Confirm the same database, notification, and task-trail effects as production.
