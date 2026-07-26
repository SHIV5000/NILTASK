# NILTASK Release and Rollback Checklist

> **Rule:** Never merge or deploy to production automatically. The owner must explicitly approve the draft PR after relevant checks pass.
>
> Use with `AI.md`, `PROFESSIONALIZATION_PLAN.md`, `SMOKE_TEST_CHECKLIST.md`, `RELEASE_VERSIONING.md`, `PWA_RELEASE_NOTES.md` and `TAILWIND_BUILD_MIGRATION.md`.

## 1. Release record

Complete before every production recommendation:

```text
Release date/time:
Release identifier:
Branch:
PR:
Base commit:
Candidate head commit:
Preview URL:
Vercel deployment URL:
Service-worker cache generation:
Database migration/RPC/Edge Function changes:
Native build changes:
Tester(s):
Result: PASS / FAIL / PARTIAL
Rollback commit or revert PR:
Owner approval received: YES / NO
```

## 2. Scope classification

Mark every affected surface:

- [ ] HTML/bootstrap/load order
- [ ] CSS/theme/Tailwind
- [ ] desktop messages/reactions
- [ ] mobile messages/reactions
- [ ] Tasks and audit trail
- [ ] Activity Feed
- [ ] notifications/sounds/push
- [ ] unread/badges
- [ ] realtime channels/reconnect
- [ ] authentication/session/logout
- [ ] tenant/RBAC/subscription rules
- [ ] Supabase schema/RLS/RPC/trigger
- [ ] Edge Function
- [ ] storage/upload/signed URL
- [ ] service worker/PWA/offline/share target
- [ ] Capacitor/native plugin/configuration
- [ ] admin/developer/log pages

Checks may be skipped only when the release record explains why the surface is unaffected.

## 3. Repository and PR gate

- [ ] Work is on an isolated branch, not `main`.
- [ ] PR targets `main`.
- [ ] PR remains draft until acceptance is complete.
- [ ] PR head is the exact commit tested.
- [ ] PR is mergeable and has no unexpected base change.
- [ ] Changed-file list contains no secret, service-role key or private credential.
- [ ] No unrelated file was replaced by a whole-file write.
- [ ] Large-file replacements were verified with a commit diff.
- [ ] Rollback commit or revert path is identified.
- [ ] `main` and production remain unchanged during preview testing.

## 4. Automated gate

Required commands:

```bash
npm run validate:professionalization
npm run validate:tailwind
```

Required CI result:

```text
Professionalization Validation = success
Vercel = success
```

Confirm:

- [ ] `version.json.v` equals `window.APP_VER`.
- [ ] Supabase anon-key project ref matches `SUPABASE_URL`.
- [ ] Supabase browser key role remains `anon`.
- [ ] seven managed desktop realtime topics remain present.
- [ ] Activity source timer remains 60 seconds.
- [ ] Unread formula and mobile-passive boundary remain present.
- [ ] exact query-versioned runtime assets are in the PWA app shell.
- [ ] service-worker cache generation matches `PWA_RELEASE_NOTES.md`.
- [ ] compiled Tailwind verification build passes while the CDN remains authoritative until visual acceptance.

A green static gate never replaces authenticated or device testing.

## 5. Release-version gate

Record:

```text
version.json.v:
window.APP_VER:
HTML shell generation:
mobile component version:
service-worker cache:
native package version:
```

- [ ] `version.json.v = window.APP_VER`.
- [ ] logger/session metadata shows the intended release.
- [ ] HTML/component markers are not mistaken for the whole release.
- [ ] service-worker cache is advanced only when app-shell semantics changed.
- [ ] native package version changes only when a native binary change requires it.
- [ ] browser already on current release does not enter a heal/reload loop.
- [ ] previous-release browser heals at most once and reaches the app.

## 6. Database and tenant safety

When database-facing code changed:

- [ ] every school-owned query is tenant-scoped.
- [ ] every user-owned query is also user-scoped.
- [ ] RLS was not weakened.
- [ ] service-role credentials remain server-side only.
- [ ] RPC signatures and return shapes match callers.
- [ ] triggers do not duplicate notification/task/audit events.
- [ ] DELETE realtime paths remain safe when old rows lack non-key columns.
- [ ] same-named rooms in different schools cannot share read markers or cached state.
- [ ] test user from tenant A sees no tenant B data.

For schema/RLS changes, record the exact migration and a reverse or corrective migration plan.

## 7. Authentication and lifecycle

- [ ] valid login succeeds.
- [ ] invalid login fails clearly.
- [ ] restored session loads.
- [ ] tenant and role resolve correctly.
- [ ] logout returns to login without hanging.
- [ ] logout clears prior user channels, timers, unread state and app badge.
- [ ] account switch does not show previous-user data or counts.
- [ ] tenant switch does not retain old-tenant channels or cache.
- [ ] push/browser/native token is detached from outgoing user where designed.

## 8. Desktop realtime and unread

Run with two authenticated users where possible.

Expected exactly one channel each:

```text
public:messages-<tenant>
taskflow-bc-<tenant>
scheduled-changes
notifications-changes
tasks-changes
assignees-changes
trails-changes
```

- [ ] runtime snapshot shows one copy of each topic.
- [ ] owner table shows the seven named desktop owners.
- [ ] reconnect does not create duplicates.
- [ ] one off-room message creates one unread increment.
- [ ] mention/reply linked message is not double-counted as attention.
- [ ] reaction/task/reminder increases non-message attention once.
- [ ] opening one room clears that room only.
- [ ] opening Activity may clear attention but preserves unread chats.
- [ ] PWA icon badge equals the global unread total.
- [ ] logout destroys managed channels.

## 9. Message and notification presentation

For message, mention, reply, reaction, Task, reminder and scheduled-message events:

- [ ] one database row where designed.
- [ ] one visible message/bubble/activity item.
- [ ] at most one in-app toast/heads-up.
- [ ] at most one sound.
- [ ] at most one system push notification.
- [ ] navigation opens the exact room/message/Task.
- [ ] sender is not notified about their own event unless explicitly designed.
- [ ] reconnect/catch-up does not replay presentation twice.

## 10. Activity and Task panels

- [ ] Activity opens without exception.
- [ ] Type and Person filters remain in the source-owned header.
- [ ] no Task filter row appears over Activity.
- [ ] no blank flash during realtime or fallback refresh.
- [ ] scroll remains stable.
- [ ] fallback occurs approximately every 60 seconds.
- [ ] closing Activity stops its timer.
- [ ] opening/closing repeatedly does not grow resources.
- [ ] Task filters/sorts remain functional after closing Activity.
- [ ] Task table changes refresh once.
- [ ] Task trails refresh Activity once when open.

## 11. Mobile/PWA runtime

- [ ] `NILTASK_printMobileRuntimeSnapshot()` reports one `mobile-rt-*` channel.
- [ ] it reports one `presence-*` channel.
- [ ] desktop feature owners are absent.
- [ ] UnreadService reports passive mobile state until the formal handoff.
- [ ] one incoming message renders/counts once despite postgres + broadcast delivery.
- [ ] current-room message does not become unread.
- [ ] unrelated DM is ignored.
- [ ] reconnect backoff recovers without a storm.
- [ ] foreground resume reconciles open chat, unread and attention.
- [ ] 6-second visible fallback remains single until formally replaced.
- [ ] Activity safety polling remains single.
- [ ] presence dots and typing expiry work.
- [ ] keyboard/composer stays above the soft keyboard.
- [ ] 30-minute session shows no increasing duplicate callbacks or DOM growth.

## 12. Tailwind/CSS release gate

Until compiled visual parity is accepted:

- [ ] CDN script remains present.
- [ ] generated verification CSS is not linked from `index.html`.
- [ ] generated verification CSS is not added to the service-worker app shell.

For the future compiled-CSS switch:

- [ ] dedicated preview links the compiled asset.
- [ ] login, desktop, mobile, Activity, Tasks, modals, admin pages and print views match visually.
- [ ] dynamic role/state classes are present.
- [ ] CDN is removed only after parity acceptance.
- [ ] local CSS URL is added to PWA precache.
- [ ] service-worker cache generation is advanced.
- [ ] rollback restores CDN and removes local link.

## 13. PWA/service-worker gate

- [ ] `/manifest.json` works on the public domain.
- [ ] preview protection redirects are documented separately from app defects.
- [ ] new service worker installs.
- [ ] expected `taskflow-*` cache exists.
- [ ] old app-shell caches are removed.
- [ ] `share-inbox` remains preserved.
- [ ] exact query-versioned scripts are cached.
- [ ] navigation is network-first.
- [ ] JS/CSS are network-first with offline fallback.
- [ ] offline reload works after one successful online load.
- [ ] share target still works.
- [ ] quick reply still works where supported.
- [ ] controller change reloads once, not repeatedly.

## 14. Console and diagnostics gate

- [ ] no application-owned uncaught exception.
- [ ] no unhandled promise rejection.
- [ ] no wrapper recursion or stack overflow.
- [ ] no duplicate-channel warning.
- [ ] no browser-side public-IP CORS request.
- [ ] routine logs remain sampled/batched.
- [ ] realtime failures remain visible.
- [ ] remaining warnings are classified as application, preview protection, browser/extension, expected network, third-party or unknown.

## 15. Production approval gate

A production merge may be recommended only when:

- [ ] automated gates pass on the exact head commit.
- [ ] Vercel preview is green.
- [ ] all relevant manual checks pass.
- [ ] no existing capability was removed.
- [ ] tenant isolation remains intact.
- [ ] rollback path is recorded.
- [ ] owner explicitly approves merge.

Do not enable auto-merge.

## 16. Emergency rollback procedure

When a release causes login failure, blank screen, cross-tenant exposure, message loss, duplicate notifications, reconnect storm, broken PWA update or other critical regression:

1. **Stop rollout decisions.** Do not stack unrelated fixes.
2. Record the production commit, failing release value, time, affected surface and first error.
3. Preserve logs/screenshots and the exact failing URL/device.
4. Identify the last known-good production commit.
5. Create a dedicated revert commit/PR; do not rewrite `main` history.
6. Revert application files and any coordinated version/cache changes together.
7. For a bad CSS switch, restore the CDN/local-link state as one change.
8. For a bad PWA shell, advance to a new corrective cache generation rather than reusing the broken cache name.
9. For a database migration, apply the prewritten corrective migration; never delete production data impulsively.
10. Deploy the rollback.
11. Confirm login and tenant isolation first.
12. Confirm messages, unread, notifications and logout.
13. Confirm service-worker update convergence on an installed PWA.
14. Confirm logger rows identify the rollback release.
15. Keep the failed feature branch/PR for diagnosis; do not silently reapply it.
16. Document root cause and prevention check before another release attempt.

## 17. Rollback acceptance

- [ ] production points to the intended rollback commit.
- [ ] release identity reflects the rollback/corrective release.
- [ ] service-worker cache advances if needed to dislodge bad cached assets.
- [ ] Supabase project identity remains correct.
- [ ] login works.
- [ ] no tenant leak.
- [ ] one message sends/receives.
- [ ] unread reconciles.
- [ ] logout cleans up.
- [ ] installed PWA converges.
- [ ] no new critical console error.
- [ ] incident record is complete.
