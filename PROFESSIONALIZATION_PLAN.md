# NILTASK Professionalization Master Plan

> **Purpose:** This is the permanent engineering execution plan for taking NILTASK from a feature-rich working application to a stable, testable, maintainable and production-grade product.
>
> **How to use this file:** At the start of every future NILTASK engineering session, read `AI.md` first and this file second. `AI.md` is the functionality contract. This file is the implementation order, safety contract, progress ledger and definition of done.
>
> **Repository:** `SHIV5000/NILTASK`
>
> **Production:** `https://niltask.vercel.app/`
>
> **Current isolated work branch:** `agent/activity-feed-no-flicker`
>
> **Current draft PR:** `#204`
>
> **Started:** 2026-07-26
>
> **Merge rule:** Never merge into `main` without explicit owner approval after acceptance checks pass.

---

# 1. Authority and scope

Two repository documents govern all work:

1. `AI.md` — complete product behaviour, permissions, database, lifecycle and parity contract.
2. `PROFESSIONALIZATION_PLAN.md` — execution phases, architectural target, testing order, progress and release gates.

When they appear to conflict:

- Preserve existing product behaviour from `AI.md`.
- Use this plan to decide how and when to refactor it.
- Do not guess database fields, RLS rules, RPC behaviour or task states.
- Mark uncertainty as **VERIFY IN SUPABASE**.
- Never silently remove an existing capability to make refactoring easier.

This is not a visual-redesign project. It is a controlled reliability and architecture programme.

---

# 2. Product outcome

NILTASK must remain a multi-tenant school communication and accountability system with:

- school/tenant isolation;
- role-based access;
- departments, groups and direct messages;
- rich messages, replies, reactions, tags, mentions, forwarding and bookmarks;
- reminders and scheduled messages;
- multi-assignee tasks with independent lifecycle states;
- acknowledgement, progress, proof, submission, return, acceptance, delegation and transfer;
- deadline extensions, reminders, cancellation and audit trail;
- Activity Feed;
- unread counts and attention notifications;
- Web Push and Android FCM;
- personal dashboards, scorecards and reports;
- profile, group and staff administration;
- desktop, mobile web, PWA and Capacitor Android delivery.

Professional-grade means the above functions continue working without recurring console errors, duplicate events, inconsistent badges, UI flicker, leaking timers, wrapper recursion or unexplained desktop/mobile differences.

---

# 3. Current engineering diagnosis

The application has substantial real business logic, but some frontend areas evolved through compatibility patches and repeated decorators. The main risks are:

## 3.1 Multiple owners for one feature

Examples include Activity Feed behaviour distributed across:

- `js/ui-feed.js`;
- versioned Activity decorators;
- refresh-stability wrappers;
- compact filter presentation scripts;
- realtime callbacks;
- fallback polling.

Resulting risks:

- wrapper recursion;
- rendering order conflicts;
- duplicated timers;
- flicker during refresh;
- filters being rebuilt or moved repeatedly;
- difficult cleanup.

## 3.2 Notification state has several inputs

Notifications and attention may be affected by:

- unread messages;
- `notifications` rows;
- room-read state;
- realtime provisional updates;
- polling reconciliation;
- Web Push;
- Android FCM;
- local badges;
- Activity Feed attention counts.

Without one normalization and deduplication authority, this can produce duplicate sound, stale counts or desktop/mobile disagreement.

## 3.3 Global functions and shared mutable state

Many inline handlers and legacy modules depend on `window.*` functions and global state. These cannot be removed abruptly, but they make it easy for multiple scripts to replace the same function.

## 3.4 Lifecycle cleanup is inconsistent

Every interval, timeout, observer, event listener and realtime channel must have one owner and one cleanup path. Reopening screens must not create a second copy.

## 3.5 Build quality is mixed

Known production-quality concerns include:

- Tailwind browser CDN use;
- protected-preview manifest CORS noise;
- previously unreliable browser-side IP lookup;
- service-worker cache/version coordination;
- inline styles and large HTML strings;
- limited automated regression coverage.

## 3.6 Mobile and desktop parity risk

Desktop and mobile have separate renderers. Shared business rules must move into common services without breaking the distinct views.

---

# 4. Non-negotiable safety rules

1. Never work directly on `main` for professionalization changes.
2. Never merge without explicit owner approval.
3. Keep production unchanged until a reviewed PR is accepted.
4. Prefer small reversible commits.
5. One behavioural change per commit where practical.
6. Do not mix broad visual redesign with infrastructure refactoring.
7. Do not replace Supabase data with local mock arrays.
8. Every school-owned query must be tenant-scoped.
9. Every user-owned query must also be user-scoped.
10. Do not weaken RLS, RPC or Edge Function security.
11. Do not invent task statuses or audit actions.
12. Preserve existing `window.*` contracts through adapters until all callers are migrated.
13. Do not create a second notification count authority.
14. Do not create a second Activity Feed data pipeline.
15. Do not add function wrappers without ownership markers, idempotence and teardown.
16. Do not use body-wide MutationObservers as a permanent architecture.
17. Every timer, listener, observer and channel must be registered in a cleanup lifecycle.
18. Realtime is for responsiveness; database reconciliation remains authoritative.
19. Errors must be visible in logs but repetitive noise must be sampled or deduplicated.
20. Unknown schema details must be verified, not inferred.

---

# 5. Target frontend architecture

The existing backend and product rules remain. The frontend will gradually move toward the following structure.

## 5.1 Shared platform services

```text
AppSession
  Owns authenticated user, tenant, role, subscription and feature flags.

LifecycleRegistry
  Owns intervals, timeouts, event listeners, MutationObservers and cleanup.

RealtimeManager
  Owns Supabase channels, subscription keys, reconnects and teardown.

UnreadService
  Computes durable room unread state from messages + room_reads.

NotificationService
  Normalizes, deduplicates and routes message/task/reminder attention.

ActivityService
  Fetches, merges, filters and refreshes organisation activity.

MessageService
  Owns message CRUD, replies, forwarding, bookmarks and reaction integration.

TaskService
  Owns multi-assignee task lifecycle and audit-safe actions.

StorageService
  Owns uploads, paths, signed URLs and expiry-safe file opening.

Logger
  Records meaningful diagnostics with sampling and deduplication.
```

## 5.2 Separate views, shared rules

```text
Shared repositories and services
        ↓
Desktop views          Mobile views
```

Desktop and mobile may render differently, but must not independently reimplement:

- task state transitions;
- unread formulas;
- notification deduplication;
- reaction grouping;
- Activity construction;
- permission rules;
- secure storage access.

## 5.3 Compatibility adapters

Legacy calls continue temporarily:

```javascript
window.goToTask = (...args) => TaskService.open(...args);
window.goToMessage = (...args) => MessageService.open(...args);
window.openActivityFeed = (...args) => ActivityController.open(...args);
```

An adapter may delegate to a service, but must not wrap another wrapper recursively.

---

# 6. Standard feature lifecycle pattern

Every major feature should converge on this pattern:

```text
Repository / data source
  → fetch or write Supabase data

Controller / service
  → normalize
  → tenant-filter
  → deduplicate
  → calculate state
  → handle retries and cleanup

View
  → render from supplied state
  → emit user intent
  → never own hidden duplicate business logic
```

Each feature should expose:

- `init()`;
- `open()` where relevant;
- `refresh()`;
- `destroy()` or `close()`;
- explicit event handlers;
- explicit test hooks only when necessary.

---

# 7. Phase plan

## Phase 0 — Baseline, containment and immediate stabilisation

**Status:** IN PROGRESS

### Objective

Stop error growth, document the real system, remove obvious production noise and establish a repeatable baseline before architectural replacement.

### Work items

- [x] Create this master plan.
- [x] Preserve `AI.md` as the binding product contract.
- [x] Reduce routine logger flush frequency and increase batching.
- [x] Deduplicate repeated warning/error bursts.
- [x] Sample healthy realtime lifecycle logs while preserving failures.
- [x] Remove browser-side `api.ipify.org` lookup and its CORS noise.
- [ ] Produce current console baseline on desktop production/preview.
- [ ] Produce current console baseline on mobile responsive mode.
- [ ] Record all active timers, observers and Supabase channels.
- [ ] Record all scripts that replace Activity, notification or navigation globals.
- [ ] Verify manifest behaviour on the public production domain.
- [ ] Verify current Vercel preview-protection behaviour separately from app bugs.
- [ ] Add a repeatable smoke-test checklist.
- [ ] Establish a release rollback checklist.

### Exit criteria

- No known stack-overflow or wrapper-recursion error.
- No browser-side IP CORS request.
- Repetitive warnings no longer flood remote logs.
- Current defects and owners are inventoried.
- Smoke test can be repeated before and after every phase.

---

## Phase 1 — Build, assets and deployment hygiene

**Status:** NOT STARTED

### Objective

Remove avoidable production warnings and establish predictable asset/version delivery.

### Work items

- [ ] Replace Tailwind browser CDN with compiled local CSS.
- [ ] Preserve all currently used utility classes during compilation.
- [ ] Minify production CSS without changing layout.
- [ ] Verify script/module load order.
- [ ] Remove obsolete duplicate assets only after usage search.
- [ ] Standardise cache-busting/version source.
- [ ] Coordinate `APP_VER`, `version.json` and service-worker cache version.
- [ ] Verify manifest content type, icons and start URL.
- [ ] Verify PWA update flow and one-time controller reload.
- [ ] Add deployment validation for required files.

### Exit criteria

- No Tailwind production warning.
- Public production manifest returns correctly.
- New release assets are not stranded behind stale service-worker cache.
- Preview-only authentication redirects are documented and not misclassified.

---

## Phase 2 — Runtime lifecycle and realtime ownership

**Status:** NOT STARTED

### Objective

Create one authority for channels, timers, listeners and observers.

### Deliverables

- `LifecycleRegistry` or equivalent.
- `RealtimeManager` or equivalent.
- Named ownership for every interval, timeout, listener, observer and channel.
- Idempotent `start()` and `stop()` semantics.
- Logout cleanup.
- room-change cleanup.
- panel-open/panel-close cleanup.

### Work items

- [ ] Inventory `setInterval` and `setTimeout` calls.
- [ ] Inventory MutationObservers.
- [ ] Inventory global event listeners.
- [ ] Inventory Supabase channels and subscriptions.
- [ ] Assign stable keys to channels.
- [ ] Prevent duplicate registration for the same tenant/user/room.
- [ ] Centralise reconnect diagnostics.
- [ ] Stop polling when owning screen closes.
- [ ] Stop tenant channels on logout or tenant switch.
- [ ] Add runtime diagnostics command for active resources.

### Exit criteria

- Opening and closing a feature repeatedly does not increase active resource count.
- Changing rooms removes old room-specific subscriptions.
- Logout leaves no application channel running.
- Realtime reconnects do not duplicate events.

---

## Phase 3 — Notification, unread and badge authority

**Status:** NOT STARTED

### Objective

Create one durable notification pipeline and eliminate duplicate or stale attention states.

### Required model

Normalize each attention event into a stable shape:

```text
id
kind
source_id
user_id
tenant_id
room_id
message_id
task_id
created_at
is_read
navigation_target
dedupe_key
```

Suggested stable keys:

```text
message:<message_id>:<recipient_id>
mention:<message_id>:<recipient_id>
reply:<message_id>:<recipient_id>
reaction:<message_id>:<actor_id>:<recipient_id>
task:<task_id>:<assignee_id>:<action>
reminder:<reminder_id>:<recipient_id>
```

### Work items

- [ ] Map all notification creation paths.
- [ ] Map all badge update paths.
- [ ] Map sound/chime triggers.
- [ ] Map Web Push and FCM delivery paths.
- [ ] Define authoritative unread formula.
- [ ] Deduplicate message-derived notifications against unread messages.
- [ ] Prevent sender self-notification.
- [ ] Ensure mark-read updates all views.
- [ ] Ensure dismiss/clear does not resurrect after reconciliation.
- [ ] Ensure desktop and mobile use shared count logic.
- [ ] Ensure reconnect does not replay sound/toast for old events.
- [ ] Preserve push deep links.

### Exit criteria

- One message produces one recipient attention event.
- One event produces at most one sound/toast per device session.
- Bell, room badge, Activity attention and app badge reconcile after reload.
- Desktop and mobile counts agree with the database.
- Realtime reconnect does not duplicate old alerts.

---

## Phase 4 — Activity Feed single-owner rebuild

**Status:** NOT STARTED

### Objective

Replace the layered Activity implementation with one controller, one renderer and one lifecycle.

### Target module responsibilities

```text
ActivityRepository
  Query and normalize source rows.

ActivityController
  Open/close, filters, silent refresh, realtime response, 60-second fallback.

ActivityView
  Fixed header, filters, compact cards, empty/error states, navigation.
```

### Work items

- [ ] Inventory all Activity scripts and wrappers.
- [ ] Identify the canonical data-building function.
- [ ] Freeze current accepted UI appearance.
- [ ] Build one idempotent controller.
- [ ] Preserve selected type/person filters.
- [ ] Preserve scroll during silent refresh.
- [ ] Diff items instead of blanking the list.
- [ ] Keep realtime immediate.
- [ ] Keep one 60-second fallback reconciliation timer.
- [ ] Stop timer and listeners on close.
- [ ] Preserve exact message/task navigation.
- [ ] Preserve clear-one and clear-all semantics.
- [ ] Remove old wrappers only after parity tests pass.
- [ ] Remove temporary DOM decorators and body-wide observers.

### Exit criteria

- No visible blanking or flicker during ten minutes of use.
- Header and filters remain fixed.
- Scroll and filter state remain stable.
- One open panel has exactly one fallback timer.
- Open/close repeated 20 times produces no increased listener/timer count.
- No Activity-owned console error.

---

## Phase 5 — Shared message and task services

**Status:** NOT STARTED

### Objective

Move business rules out of duplicated desktop/mobile renderers while retaining compatibility.

### Message service work

- [ ] Shared message fetch/normalization.
- [ ] Shared reply/thread model.
- [ ] Shared reaction grouping.
- [ ] Shared bookmark operations.
- [ ] Shared forward rules.
- [ ] Shared secure-file opening.
- [ ] Shared unread reconciliation hooks.
- [ ] Maintain legacy global adapters.

### Task service work

- [ ] Shared effective assignee-state calculation.
- [ ] Shared action validity checks.
- [ ] Preserve independent assignee rows.
- [ ] Preserve proof requirement enforcement.
- [ ] Preserve trail actions and unknown-action rendering.
- [ ] Preserve delegation accountability.
- [ ] Preserve transfer semantics.
- [ ] Preserve extension RPCs.
- [ ] Preserve task-to-chat compilation without duplicate posts.
- [ ] Maintain legacy global adapters.

### Exit criteria

- Desktop and mobile call shared business rules.
- No task action is offered in an invalid state.
- Multi-assignee tasks retain independent statuses.
- Message and task parity checklists pass on both renderers.

---

## Phase 6 — PWA, storage, IndexedDB and native hardening

**Status:** NOT STARTED

### Objective

Make install, offline, cache, storage and Android behaviour predictable.

### Work items

- [ ] Centralise IndexedDB ownership and version upgrades.
- [ ] Verify Dexie fallback behaviour.
- [ ] Ensure no duplicate object-store creation race.
- [ ] Store object paths, not long-lived expiring private URLs.
- [ ] Generate signed URLs on demand.
- [ ] Verify task-proof and attachment permission behaviour.
- [ ] Test service-worker install/update/offline paths.
- [ ] Test Web Share Target.
- [ ] Test push quick reply.
- [ ] Test app badge updates.
- [ ] Test Android back navigation.
- [ ] Test FCM token lifecycle and deep links.
- [ ] Verify web/native duplicate push suppression.

### Exit criteria

- PWA installs and updates correctly.
- Offline fallback works.
- Private attachments reopen after URL expiry.
- IndexedDB upgrades do not generate constraint errors.
- Push navigation works from background and terminated states where supported.

---

## Phase 7 — Automated testing, security and performance

**Status:** NOT STARTED

### Objective

Turn the most important business flows into repeatable release gates.

### Test layers

#### Unit tests

- tenant and user scoping helpers;
- unread deduplication;
- notification event keys;
- task effective status;
- task action validity;
- Activity merge/deduplication;
- date/time presentation;
- sanitisation and escaping.

#### Integration tests

- Supabase query mapping using a safe test tenant;
- messages and room reads;
- notification mark-read/dismiss;
- task lifecycle writes;
- extension RPCs;
- storage paths and signed URLs;
- service-worker registration where feasible.

#### End-to-end tests

- authentication/session restore;
- open room and send message;
- reply/reaction/bookmark;
- create multi-assignee task;
- acknowledge/start/upload/submit/return/accept;
- delegate/transfer/extension/cancel;
- notification deduplication;
- Activity Feed long-session stability;
- mobile parity;
- logout cleanup.

### Security checks

- [ ] Verify tenant isolation for every repository/service.
- [ ] Verify personal-data user scoping.
- [ ] Verify admin restrictions.
- [ ] Verify service-role work remains server-side.
- [ ] Verify storage access policy.
- [ ] Verify no secret is committed.
- [ ] Verify HTML sanitisation and attribute escaping.

### Performance checks

- [ ] Long-running session memory/resource count.
- [ ] Message-list rendering cost.
- [ ] Activity refresh cost.
- [ ] Logger traffic.
- [ ] Realtime reconnect storm behaviour.
- [ ] service-worker cache size.
- [ ] mobile low-memory behaviour.

### Exit criteria

- Critical end-to-end suite passes.
- No cross-tenant test access.
- No recurring unhandled error during soak test.
- Resource counts remain stable during repeated navigation.

---

## Phase 8 — Controlled release and production observation

**Status:** NOT STARTED

### Objective

Release safely with a rollback path and evidence.

### Release process

1. Freeze branch changes.
2. Run static checks and tests.
3. Review changed files and migration impact.
4. Deploy preview.
5. Execute desktop smoke test.
6. Execute mobile smoke test.
7. Execute PWA/Android checks where relevant.
8. Review console and remote app logs.
9. Obtain owner approval.
10. Merge only after explicit approval.
11. Observe production.
12. Roll back immediately if release gates fail.

### Production observation windows

- first 15 minutes;
- first hour;
- first school day;
- 24-hour review.

### Exit criteria

- Error rate remains below agreed threshold.
- No duplicate-notification spike.
- No unread-count divergence.
- No Activity flicker regression.
- No mobile/native regression.
- Rollback has not been required, or was successfully executed and documented.

---

# 8. Required smoke-test checklist

Run this before and after each meaningful change.

## Authentication and shell

- [ ] Login succeeds.
- [ ] Session restores after refresh.
- [ ] Correct school/tenant and user appear.
- [ ] Role-gated controls match the account.
- [ ] Logout completes and channels stop.

## Chat

- [ ] Open group room.
- [ ] Open direct message.
- [ ] Send message.
- [ ] Reply to message.
- [ ] Add/remove reaction.
- [ ] Bookmark/unbookmark.
- [ ] Navigate through deep link.
- [ ] Unread count clears correctly after open.

## Tasks

- [ ] Open task hub.
- [ ] Filter and sort.
- [ ] Create task with multiple assignees.
- [ ] Acknowledge and start.
- [ ] Post update.
- [ ] Upload proof.
- [ ] Submit.
- [ ] Return and resubmit.
- [ ] Accept.
- [ ] Delegate/transfer where permitted.
- [ ] Request/respond to extension.
- [ ] Cancel with audit trail.

## Notifications

- [ ] One new event creates one attention item.
- [ ] Sound/toast plays once.
- [ ] Bell count is correct.
- [ ] Mark read updates all relevant UI.
- [ ] Clear/dismiss persists after refresh.
- [ ] Deep link opens exact destination.

## Activity Feed

- [ ] Opens without console error.
- [ ] Fixed header and filters appear.
- [ ] Filters work.
- [ ] Refresh does not blank the feed.
- [ ] Scroll is preserved.
- [ ] Message item opens exact message.
- [ ] Task item opens exact task.
- [ ] Close restores task panel correctly.

## Mobile/PWA

- [ ] Mobile navigation appears.
- [ ] Mobile composer remains keyboard-safe.
- [ ] Task actions remain available according to status.
- [ ] PWA opens and updates.
- [ ] Back navigation is correct.

---

# 9. Professional-grade release gates

The app is not to be described as professionally hardened until all are true:

- [ ] No recurring uncaught exception.
- [ ] No wrapper recursion.
- [ ] No Activity Feed flicker during silent refresh.
- [ ] No duplicate notification for one logical event.
- [ ] Badge counts reconcile after reload and reconnect.
- [ ] No duplicate realtime subscriptions.
- [ ] Timers/listeners/observers are cleaned up.
- [ ] Desktop/mobile critical-flow parity passes.
- [ ] Tenant isolation tests pass.
- [ ] Multi-assignee task lifecycle passes.
- [ ] PWA install/update/offline checks pass.
- [ ] Push deep links pass.
- [ ] Tailwind CDN warning is removed.
- [ ] Production manifest is valid.
- [ ] Critical automated tests pass.
- [ ] Rollback procedure is documented and tested.

---

# 10. Work sequencing rules

Use this order unless a production-blocking defect requires interruption:

```text
Phase 0 baseline
→ Phase 1 build hygiene
→ Phase 2 lifecycle/realtime ownership
→ Phase 3 notification authority
→ Phase 4 Activity single-owner rebuild
→ Phase 5 message/task shared services
→ Phase 6 PWA/storage/native
→ Phase 7 tests/security/performance
→ Phase 8 release
```

A later phase may be investigated early, but broad implementation should not bypass foundational phases.

---

# 11. Commit and PR discipline

Each commit message should identify the engineering intent, for example:

```text
Remove unreliable browser-side public IP lookup
Add lifecycle registry for Activity resources
Centralize notification dedupe keys
Replace Activity wrappers with single controller
Compile Tailwind CSS for production
```

Every PR update must state:

- files changed;
- behaviour changed;
- behaviour intentionally unchanged;
- tests performed;
- remaining risks;
- preview deployment status;
- whether `main` and production remain untouched.

Do not conceal untested areas.

---

# 12. Current issue register

| ID | Issue | Severity | Phase | Status |
|---|---|---:|---:|---|
| NF-001 | Activity Feed refresh flicker | High | 4 | Mitigated, architectural replacement pending |
| NF-002 | Activity function-wrapper recursion risk | Critical | 0/4 | Known collisions fixed; permanent removal pending |
| NF-003 | Notification/badge inconsistency risk | High | 3 | Not started |
| NF-004 | Duplicate timer/channel risk | High | 2 | Not started |
| NF-005 | Tailwind CDN production warning | Medium | 1 | Not started |
| NF-006 | Preview manifest CORS due to Vercel protection | Low/Environment | 1 | Document and verify production |
| NF-007 | Browser-side IP lookup CORS noise | Medium | 0 | Completed 2026-07-26 |
| NF-008 | Excessive logger traffic | Medium | 0 | Improved 2026-07-26 |
| NF-009 | IndexedDB ownership/version duplication | Medium | 6 | Not started |
| NF-010 | Desktop/mobile business-rule duplication | High | 5 | Not started |
| NF-011 | Limited automated regression suite | High | 7 | Not started |
| NF-012 | Body-wide presentation MutationObservers | Medium | 4 | Temporary; remove during rebuild |

---

# 13. Progress ledger

## 2026-07-26 — Programme start

- Owner chose not to rebuild through Google AI Studio.
- ChatGPT accepted responsibility for the controlled professionalization programme.
- `AI.md` remains the binding feature and backend contract.
- Created `PROFESSIONALIZATION_PLAN.md` as the permanent execution and memory document.
- Phase 0 marked IN PROGRESS.
- Logger batching changed to 30 routine records or 60 seconds.
- Repetitive warnings/errors deduplicated for short bursts.
- Healthy realtime lifecycle logs sampled while failures remain immediate.
- Removed browser-side `api.ipify.org` request.
- No merge authorised.

---

# 14. Next executable tasks

The next tasks, in order, are:

1. Capture a clean desktop console baseline after the IP lookup removal.
2. Capture a mobile responsive console baseline.
3. Inventory all Activity-related wrappers, timers and observers.
4. Inventory notification creation, count, sound and navigation paths.
5. Create the first smoke-test document or automated harness.
6. Verify production manifest separately from protected preview behaviour.
7. Plan Tailwind compilation without altering current UI.

Do not begin a broad Activity rewrite until the inventory and smoke test exist.

---

# 15. Resume instructions for future sessions

At the start of any future session:

1. Read `AI.md`.
2. Read `PROFESSIONALIZATION_PLAN.md`.
3. Inspect the latest branch/PR status.
4. Read the Progress Ledger and Current Issue Register.
5. Continue the first unchecked task in the active phase.
6. Update this file when a task, risk, decision or phase status changes.
7. Keep `main` unchanged unless the owner explicitly approves a merge.

This file must be updated throughout the programme so progress does not depend on conversational memory alone.
