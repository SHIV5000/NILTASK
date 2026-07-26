# NILTASK Repeatable Smoke-Test Checklist

> **Purpose:** Minimum manual acceptance suite for every preview deployment and every professionalization phase.
>
> **Use with:** `AI.md`, `PROFESSIONALIZATION_PLAN.md`, and `RUNTIME_OWNERSHIP_INVENTORY.md`.
>
> **Rule:** A phase is not complete because the screen looks correct once. It is complete only when the relevant checks pass repeatedly on desktop and mobile without new console errors.

---

# 1. Test record

Complete this block for every run:

```text
Date/time:
Branch:
Commit:
Preview URL:
Browser/device:
User role:
Tenant:
Tester:
Result: PASS / FAIL / PARTIAL
New console errors:
Notes:
```

Do not test production changes from an unmerged preview by assuming production behaves identically. Record the exact URL and commit.

---

# 2. Clean-start preparation

- [ ] Open a new browser profile or Incognito window where practical.
- [ ] Hard refresh the preview.
- [ ] Confirm the expected commit/version loaded.
- [ ] Clear the Console.
- [ ] Enable Preserve Log for navigation/reload tests.
- [ ] Confirm no immediate uncaught exception appears during boot.
- [ ] Confirm login screen or restored session appears without a blank page.
- [ ] Confirm only expected preview-only Vercel protection warnings are present.

---

# 3. Authentication and tenant context

- [ ] Valid user can sign in.
- [ ] Invalid credentials show a clear error.
- [ ] Session restores after reload.
- [ ] Current school/tenant loads correctly.
- [ ] Current user name, designation and role display correctly.
- [ ] Feature flags correctly show/hide Tasks, uploads, reports and scheduling.
- [ ] Trial/subscription restrictions still apply.
- [ ] Logout returns to login.
- [ ] After logout, previous-user notifications, channels and timers do not continue visibly.

Security check:

- [ ] No data from another tenant appears in chat, Tasks, Activity or notifications.

---

# 4. Desktop shell

- [ ] Left sidebar opens and renders groups/DMs.
- [ ] Sidebar search works.
- [ ] Group opens correctly.
- [ ] Direct message opens correctly.
- [ ] Unread badges match the selected/open room.
- [ ] Right sidebar opens/closes without breaking centre chat width.
- [ ] Task panel opens.
- [ ] Activity Feed opens.
- [ ] Settings opens and closes.
- [ ] Theme loads without first-paint colour flash.

---

# 5. Message flow

Use two signed-in users when possible.

- [ ] Send a plain message.
- [ ] Sender sees it immediately.
- [ ] Recipient sees it once, not twice.
- [ ] Recipient receives at most one in-app sound.
- [ ] Recipient unread count increases once when the room is closed.
- [ ] Opening the room clears/reconciles unread correctly.
- [ ] Reload preserves the message.
- [ ] Reply creates one child message with correct parent context.
- [ ] Thread/reply count updates once.
- [ ] Reaction adds once on both clients.
- [ ] Reaction removal removes once.
- [ ] Bookmark and unbookmark work.
- [ ] Forward works to the intended room.
- [ ] Edit own message works.
- [ ] Delete follows the current soft-delete/moderation rules.
- [ ] Mention alerts the mentioned user once.
- [ ] Attachment upload/open works through secure storage access.

Console requirement:

- [ ] No unhandled promise rejection or duplicate-channel warning during the flow.

---

# 6. Task flow

Use a task creator and at least two assignees where possible.

## Creation

- [ ] Create Task from a message.
- [ ] Select multiple assignees.
- [ ] Set deadline, priority and proof requirement.
- [ ] One shared task is created.
- [ ] Each assignee receives an independent `pending_ack` assignment.
- [ ] CREATE trail appears once.

## Assignee lifecycle

- [ ] Acknowledge.
- [ ] Start Work.
- [ ] Post Progress Update.
- [ ] Upload Proof.
- [ ] Submit for Review.
- [ ] Proof-required Task blocks submission when proof is missing.

## Reviewer lifecycle

- [ ] Accept one assignee without changing another assignee incorrectly.
- [ ] Return one assignee for changes with feedback.
- [ ] Resubmit and accept.
- [ ] Transfer closes the old assignment and creates a new `pending_ack` assignment.
- [ ] Delegation keeps original accountability and creates a delegate assignment.
- [ ] Extension request appears once.
- [ ] Approve/reject extension works.
- [ ] Reminder appears once.
- [ ] Cancellation closes active assignments and retains history.

## Reporting

- [ ] Timeline renders all actions.
- [ ] Unknown trail action would render generically.
- [ ] Task PDF opens/downloads where permitted.

---

# 7. Task panel filters

- [ ] Compact Filter dropdown is visible.
- [ ] Compact Sort dropdown is visible.
- [ ] Options contain plain names, not repeated `Filter:`/`Sort:` prefixes.
- [ ] All filter works.
- [ ] Today works.
- [ ] Pending works.
- [ ] Done works.
- [ ] By Me works.
- [ ] To Me works.
- [ ] Delegated works.
- [ ] Transferred works.
- [ ] Date Range reveals date controls.
- [ ] Deadline ascending/descending works.
- [ ] Newest/Oldest works.
- [ ] Opening Activity hides the Task filter bar.
- [ ] Closing Activity restores the Task filter bar once.

---

# 8. Activity Feed stability

## Basic behaviour

- [ ] Activity opens without an exception.
- [ ] Header contains Type and Person filters.
- [ ] No duplicate Task Filter/Sort row appears above Activity.
- [ ] No subtitle `Organisation activity · India Standard Time` appears.
- [ ] Cards use compact layout.
- [ ] Task accent is indigo.
- [ ] Type filter works.
- [ ] Person filter works.
- [ ] Message activity opens exact room/message.
- [ ] Task activity opens exact task.
- [ ] Clear one works.
- [ ] Clear All follows current confirmed behaviour.

## Refresh behaviour

- [ ] Keep Activity open for at least 3 minutes.
- [ ] No blank white flash occurs.
- [ ] No duplicate filter row flashes.
- [ ] Header and filters remain fixed.
- [ ] Scroll position remains stable during fallback refresh.
- [ ] New realtime event appears promptly.
- [ ] Fallback refresh occurs approximately every 60 seconds, not every 12–15 seconds.
- [ ] Closing Activity stops its fallback timer.
- [ ] Open/close Activity ten times; behaviour remains single and consistent.

Console requirement:

- [ ] No `Maximum call stack size exceeded`.
- [ ] No repeated Activity wrapper error.
- [ ] No growing stream of identical warnings.

---

# 9. Notifications and badges

Test each type individually:

- [ ] new message;
- [ ] mention;
- [ ] reply;
- [ ] reaction;
- [ ] task;
- [ ] reminder;
- [ ] scheduled message where enabled.

For each event:

- [ ] one database attention row where designed;
- [ ] at most one in-app toast/heads-up;
- [ ] at most one sound;
- [ ] badge increases by the correct amount;
- [ ] Activity contains one meaningful item;
- [ ] navigation opens the correct target;
- [ ] marking read reconciles badge;
- [ ] reload does not resurrect an already-read item incorrectly.

Reconnect test:

- [ ] Disable network briefly.
- [ ] Re-enable network.
- [ ] Realtime reconnects.
- [ ] One catch-up reconciliation occurs.
- [ ] Missed items appear once.
- [ ] No duplicate notifications appear after reconnect.

---

# 10. Scheduled messages and reminders

- [ ] Schedule a future message.
- [ ] Pending scheduled item appears once.
- [ ] Cancel works before send.
- [ ] Sent status produces at most one sender toast/sound.
- [ ] Current room reloads once when appropriate.
- [ ] Reminder can be created.
- [ ] Upcoming reminder can be deleted.
- [ ] Fired reminder creates one notification.
- [ ] Fired reminder navigation works.
- [ ] Clear fired reminders works.

This section is especially important after any subscription-startup change because the current architecture previously allowed duplicate scheduled-message channel handlers.

---

# 11. Mobile responsive/PWA

Test at phone width and on a real phone where possible.

- [ ] Desktop shell does not flash before mobile shell.
- [ ] Home/group/DM navigation works.
- [ ] Hardware/browser back behaviour is correct.
- [ ] Composer remains above keyboard.
- [ ] One incoming message creates one bubble and one unread increment.
- [ ] Mobile message deduplication handles realtime + broadcast correctly.
- [ ] Mobile Activity opens and refreshes without flicker.
- [ ] Mobile notification badge matches database truth after reload.
- [ ] Offline banner appears when offline.
- [ ] Queued offline message sends after reconnect.
- [ ] PWA install prompt/installed mode works where supported.
- [ ] App badge clears/updates where supported.

Long-session check:

- [ ] Leave mobile app open for 30 minutes.
- [ ] No repeated reconnect storm.
- [ ] No increasing duplicate callback behaviour.
- [ ] Presence status remains reasonable.

---

# 12. Capacitor Android

When a native build/device is available:

- [ ] Native shell loads live site.
- [ ] Splash hides correctly.
- [ ] Status bar appearance is correct.
- [ ] Hardware back navigates/exists correctly.
- [ ] FCM permission and token registration work.
- [ ] Token is associated with the current user only.
- [ ] Foreground push is suppressed when the in-app banner is the chosen authority.
- [ ] Background push appears once.
- [ ] Tapping push opens the correct room/task.
- [ ] Account switch does not retain previous-user push behaviour.

---

# 13. PWA/service worker

- [ ] `/manifest.json` returns successfully on the public production domain.
- [ ] Protected preview manifest redirect is recorded separately from application bugs.
- [ ] Service worker installs.
- [ ] New release activates after cache/version bump.
- [ ] Old caches are removed except protected share inbox.
- [ ] Offline page appears when navigation cannot reach the network.
- [ ] Share target works where supported.
- [ ] No reload loop occurs during version healing.

---

# 14. Logger and console quality

- [ ] No browser-side `api.ipify.org` request occurs.
- [ ] Routine logs are batched.
- [ ] Identical warnings/errors do not flood repeatedly within 30 seconds.
- [ ] Realtime failures still appear immediately.
- [ ] Healthy realtime status is sampled rather than continuously logged.
- [ ] Logger failure messages do not recursively log themselves.
- [ ] Console has no application-owned uncaught exception at the end of the test.

Record every remaining warning under one category:

```text
APPLICATION BUG
PREVIEW/VERCEL PROTECTION
BROWSER/EXTENSION
EXPECTED NETWORK/OFFLINE
THIRD-PARTY LIBRARY
UNKNOWN — INVESTIGATE
```

---

# 15. Release decision

A preview may be recommended for merge only when:

- [ ] all checks relevant to the changed module pass;
- [ ] no new uncaught errors are introduced;
- [ ] no existing product capability is removed;
- [ ] desktop and mobile parity is confirmed where relevant;
- [ ] tenant isolation remains intact;
- [ ] rollback commit is identified;
- [ ] owner explicitly approves merge.

Never merge automatically.
