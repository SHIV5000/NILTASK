# AI-HELPER.md — Onboarding for any AI/developer working on this project

> Read this fully before writing code. It is the single source of truth for what
> this app is, how it is built, where everything lives, and the rules you must
> follow so you don't destabilise a live product used by real schools.

---

## 1. What this product is

**Noted For Action** (internal codename **NILTASK / TaskFlow**) is a **multi‑tenant
school communication + task‑management SaaS**. Each school is a **tenant**; all data
is isolated per `tenant_id`.

Two core capabilities:
- **Chat** — group channels + 1:1 direct messages (DMs), replies/threads, reactions,
  file attachments, @mentions, forwarding, scheduled messages. Reference apps:
  WhatsApp / Slack / Teams.
- **Tasks** — multi‑assignee tasks with an ACK → submit → accept/review workflow,
  proof‑file uploads, audit trail, delegation/transfer, PDF export, scorecard/
  dashboard. Reference apps: Jira / Asana.

Live URL: **https://niltask.vercel.app/**

### Three delivery surfaces (ONE codebase)
| Surface | What it is | How it loads |
|---|---|---|
| **Web app** | Desktop browser UI | The Vercel site, `js/main.js`‑centric |
| **PWA** | Installable web app (`manifest.json` + `sw.js`) | Same site; service worker caches shell, Web Push |
| **Native Android app** | Capacitor shell (**remote‑URL model**) | The APK is a thin WebView that loads the **live Vercel site**; it does NOT bundle the web code. `js/native.js` adds native push (FCM), status bar, back button, badges |

**Critical mental model:** the Android app is NOT a separate build of the UI. It
loads `https://niltask.vercel.app`. So **merging to `main` updates the installed
app** on next open. Only truly native things (app icon, splash, plugins) live in
the APK and need a rebuild.

Responsive split: `window.isMobileView()` (in `js/shared.js`) decides mobile vs
web UI — `≤768px`, or a coarse‑pointer tablet `≤1366px`, or `window.IS_NATIVE`.
Mobile UI = `js/mobile.js`; web UI = `js/main.js` + friends.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Frontend | **Vanilla JS** (ES modules + a few classic scripts), no framework. Tailwind (CDN in dev) + custom CSS |
| Backend | **Supabase** — Postgres + Auth + Realtime + Storage + Edge Functions (Deno) |
| Hosting | **Vercel** (deploys from `main`) |
| Native | **Capacitor 6** (Android; iOS possible later), **Firebase Cloud Messaging** for native push |
| Cron | cron-job.org (or Supabase scheduled) triggers the scheduled‑messages function |

Supabase project ref: `apfymygzwkzjhhgmtkaj` (URL + anon key are public in
`js/shared.js` — that is expected; **security relies on RLS**, never on hiding the
anon key).

---

## 3. Repository map

### Root HTML (each is an entry page)
| File | Purpose |
|---|---|
| `index.html` | The app shell (web + PWA + native all boot here). Loads all `js/*` |
| `admin.html` / `js/admin.js` | Principal/Admin panel (staff, roles, scorecard, tags, approvals, CSV/PDF) |
| `signup.html` | Tenant/school signup (calls `complete_tenant_signup` RPC — NOT in repo) |
| `Landing.html` | Marketing landing + pricing |
| `logs.html` / `developer.html` | Live log monitor / dev tooling |
| `offline.html` | PWA offline fallback |

### JavaScript (`js/`)
| File | Responsibility |
|---|---|
| `shared.js` | Supabase client (`export const sb`, also `window.sb`), global state, `window.APP_VER`, `isMobileView()`, stale‑build self‑heal, common helpers |
| `auth.js` | Login/logout, session, tenant resolution |
| `rbac.js` | Role model + capability checks (`canCreateGroup`, `canSeeTaskHub`, `admin_panel`, …). **Client‑side gating only — must be backed by RLS** |
| `main.js` | **Web** app controller: chat list, web realtime subscriptions, web bell/badges, sidebar |
| `messages.js` | Web message rendering, send, edit/delete, replies/threads, reactions, forward |
| `tasks.js` | Task CRUD + workflow (web) |
| `mobile.js` | **The entire mobile/native UI** (~4k lines): screens, realtime, badges, reactions, replies, settings, groups, tasks, activity feed. `_MOB_VER` version string |
| `native.js` | Capacitor bridge (no‑ops on web). FCM token registration → `push_tokens`, notification channels, deep‑link on tap, hardware back, status bar/splash |
| `notifications.js` | Web Push subscribe, DND (`_setDND` → `notify_muted`), in‑app notification helpers, sound |
| `ui-core.js`, `ui-panels.js`, `ui-feed.js`, `ui-settings.js` | Web UI subsystems (panels, activity feed, settings) |
| `db.js` | Small DB helpers |
| `core/feed.js` | **Shared** activity‑feed builder `NFA_buildActivity` + `NFA_unreadCount` (used by BOTH web + mobile) |
| `core/unread.js` | **Shared** per‑room unread engine `NFA_computeRoomUnread` (room_reads + messages → perRoom counts + unread message‑id set) |
| `core/reactions.js` | Shared reaction fetch/group helpers |
| `utils/text.js` | Canonical `escapeHtml`/`stripHtml`/`snippet`/`getSnippet`/`escapeJs` (classic script; also `window.x`) |
| `utils/logger.js` | Remote log capture for the Live Log Monitor |

### CSS: `css/theme.css` (web), `css/mobile.css` + inline `_injectCSS()` in `mobile.js`.

### Service worker: `sw.js` — precache list, push handler (DM/mention prominence,
quick‑reply from the shade, app badge), stale‑while‑revalidate for JS/CSS,
network‑first navigation, Web Share Target. Bump `CACHE` on every release.

### Native: `capacitor.config.json` (`appId: in.niltask.app`, `appName: "Noted For
Action"`, `server.url: https://niltask.vercel.app`), `package.json` (Capacitor
deps), `www/index.html` (placeholder), `android/` (generated; needs
`google-services.json` in `android/app/` for FCM).

### Supabase (`supabase/`)
- `functions/send-push/` — **the push engine** (Deno). Triggered by a DB **Webhook**
  on `messages` INSERT. Sends **Web Push** (VAPID) to `push_subscriptions` AND
  **native FCM** (HTTP v1) to `push_tokens`. Honors read receipts (`room_reads`),
  @mentions, and per‑user mute (`profiles.notify_muted` → silent `nfa_silent`
  channel vs alert `nfa_alerts`). Creates `notifications` rows for @mentions only.
- `functions/send-scheduled-messages/` — posts due `scheduled_messages`.
- `migrations/*.sql` — schema + RLS (see §5). `*.sql` in `supabase/` root are
  one‑off ops (enable realtime, storage policy, tenant repair, quick_tags).

### Docs: `ARCHITECTURE.md`, `NOTIFICATIONS.md`, `CAPACITOR_PLAN.md`,
`RECTIFICATIONPLAN.md`, `INDEX.md`, `plan.md`.

---

## 4. Database tables (Postgres, all tenant‑scoped unless noted)

| Table | Purpose |
|---|---|
| `tenants` | One row per school. FK target for `tenant_id` everywhere |
| `profiles` | Users (id = auth.users.id): `full_name, email, designation, department, avatar_url, last_seen, tenant_id, role, notify_muted` |
| `allowed_users` | Signup allow‑list per tenant |
| `roles` / `user_roles` | Role definitions + assignments (permissions JSON). Note: legacy `profiles.role` also exists — two sources of truth (tech debt) |
| `messages` | Chat messages: `room_id, tenant_id, sender_id, text (HTML), parent_message_id, created_at, updated_at, deleted_at`. DM rooms = `dm_<sortedUidA>_<sortedUidB>` |
| `room_settings` | Group metadata: `room_id, tenant_id, name, color, members(jsonb), archived, photo` |
| `room_reads` | **Per‑user last‑read marker** `(user_id, room_id, last_read_at)` — the durable unread source of truth |
| `reactions` | `message_id, user_id, value, type` (unique on message_id,user_id,value) |
| `notifications` | Attention stream: `user_id, type(message/mention/reply/reaction/task/reminder), message, message_id, task_id, tenant_id, is_read` (unique user_id,message_id) |
| `tasks`, `task_assignees`, `task_trails` | Task workflow + audit |
| `reminders`, `scheduled_messages` | Reminders + scheduled sends |
| `bookmarks`, `quick_tags` | Saved messages + tenant quick‑reply tags |
| `push_subscriptions` | Web Push endpoints (`endpoint` PK, `subscription` jsonb, user_id) |
| `push_tokens` | Native FCM/APNs device tokens (`token` PK, user_id, tenant_id, platform) |
| `feature_flags`, `subscriptions` | Feature gating + billing (partial) |

**RLS is the real security boundary.** Every table is owner/tenant scoped. When you
add a query, always filter `tenant_id` (and `user_id` where per‑user). Realtime
delivery also requires the table be in the `supabase_realtime` publication
(`supabase/enable_realtime.sql`).

---

## 5. The notification / badge system (most‑touched area — understand it)

This has been rebuilt into **one authoritative engine**. Do not reintroduce parallel
counters.

**Model (current, "everything, de‑duped"):**
- **Per‑chat rows** (DM + group) show that room's unread = messages after your
  `room_reads.last_read_at` (via `NFA_computeRoomUnread`).
- **Bell + Activity‑tab** number = **every unread message + attention items**
  (mention/reply/reaction/task/reminder), each counted **once**:
  - a mention/reply IS an unread message → its `notifications` row is de‑duped out
    (its `message_id` is in the unread‑message‑id set);
  - a reaction/task/reminder points at an already‑read/no message → it adds.
- **App‑icon badge** = same grand total.

**Mobile engine (`js/mobile.js`):**
- `_recomputeBadges()` — the ONE authority. Re‑derives everything from DB
  (room_reads + messages + notifications). `_refreshNotifBadge` and
  `_reconcileUnread` are thin aliases to it.
- `_scheduleReconcile()` — debounced (~1.2s) recompute fired after every realtime
  message/notification event (heals dropped events).
- `_fallbackPoll` / `_scheduleFallback` — steady **15s** poll while visible / 60s
  hidden, **independent of socket "healthy" state** (mobile realtime lies).
- Instant provisional bumps on each event for snappy feel; reconcile makes it exact.
- `_bellCount` = authoritative grand total; `_renderBellBadge`/`_updateAppBadge` use
  it directly (never re‑add `_sumUnread`).

**Push (`send-push`):** OS notifications for all recipients; `notifications` rows
only for @mentions (attention). Foreground native pushes are suppressed by
`native.js` (`pushNotificationReceived` no‑op) so the in‑app banner is the single
alert when the app is open.

**Golden rule:** the DB (`room_reads`, `messages`, `notifications`) is the source of
truth. Live increments are only for instant feel and must always be reconciled.

---

## 6. Realtime

- Supabase `postgres_changes` on `messages`, `notifications`, `reactions`,
  `task_assignees`, `room_settings`, `profiles`, filtered by `tenant_id`/`user_id`.
- Mobile realtime **flaps constantly** (screen sleep, network, free‑tier ceiling)
  and can report `joined` while dropping events → that's why the poll + reconcile
  safety net exists. Never rely on realtime alone for correctness.
- Cross‑platform broadcast channel `taskflow-bc-<tid>` bridges group messages/
  reactions/typing between web and mobile. DMs are NEVER broadcast tenant‑wide
  (privacy) — they use `postgres_changes` only.

---

## 7. Versioning & release flow (FOLLOW EXACTLY)

Every release bumps **three** strings together, plus `version.json`:
- `js/shared.js` → `window.APP_VER = 'vNNN'`
- `js/mobile.js` → `const _MOB_VER = 'vNNN'`
- `sw.js` → `const CACHE = 'taskflow-vNNN'`
- `version.json` → `{ "v": "vNNN" }`  ← drives the stale‑build self‑heal in
  `shared.js`; **keep it equal to APP_VER** or devices needlessly reload.

Flow:
1. Work on branch **`claude/app-analysis-report-g0jk87`** (or a fresh branch off
   `main` if that PR is already merged).
2. Commit, push, open a PR to `main`, merge. **Merging to `main` = production
   deploy** (Vercel) AND updates the installed native app on next open.
3. `supabase/functions/*` and SQL migrations are **NOT** deployed by Vercel — the
   maintainer runs SQL in the Supabase SQL editor and redeploys edge functions
   (dashboard code editor or `supabase functions deploy`). Always call these out.

Commit message footer used in this repo:
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
Do NOT put model identifiers in code/PRs beyond that footer.

---

## 8. Things that need the maintainer (can't be done from code alone)
- Running SQL migrations (RLS, new columns) in Supabase.
- Setting Supabase **secrets**: `VAPID_PUBLIC/PRIVATE/SUBJECT`, `PUSH_HOOK_SECRET`,
  `FCM_SERVICE_ACCOUNT` (Firebase service‑account JSON — **a secret; never commit**).
- Creating the DB **Webhook** on `messages` INSERT → `send-push` (header
  `x-hook-secret`).
- Firebase project + `google-services.json` in `android/app/` for native push.
- Rebuilding the **APK** (only for native changes: app icon, splash, plugins). JS/UI
  changes do NOT need a rebuild (remote‑URL model).

---

## 9. Conventions & guardrails
- **Keep web and mobile code separate.** Mobile bugs → `js/mobile.js`; web bugs →
  `js/main.js`/`messages.js`/`tasks.js`/`ui-*.js`. Shared logic goes in
  `js/core/*` or `js/utils/*` (used by both) — don't fork it.
- Always **escape** user content with `window.escapeHtml` / `x()` (`utils/text.js`).
- Always filter queries by `tenant_id` (and `user_id` where relevant).
- Prefer **surgical DOM patches** over full re‑renders on the hot path (avoids the
  "cheap app" right‑to‑left slide/flash).
- Idempotent DB writes (`upsert` with `onConflict`) for reactions/room_reads/etc.
- Don't hard‑delete messages — soft delete via `deleted_at`.
- Test matrix for anything touching chat/badges/push: **DM, group, @mention, reply,
  reaction, task, reminder** × **app open / backgrounded / closed / socket‑dropped**.

---

## 10. Known tech debt / candidate next work
- `profiles.role` vs `user_roles` — two role sources; consolidate.
- Web bell/badge model (`ui-panels.js`) is separate from the unified mobile engine —
  align web to the same de‑duped model in `core/`.
- Full offline mode for the native app (remote‑URL WebView shows a browser error
  offline; needs an offline shell / cached navigation).
- App **icon + status‑bar (notification) icon** — native resources in
  `android/app/res/*`, need an APK rebuild to theme them.
- Chat‑open / message‑load performance profiling.
- Rate limiting; server‑side enforcement of the 30‑min edit window.
- iOS target (needs Mac + Apple account; the same `native.js` bridge applies).

---

## 11. Quick start for a new AI session
1. Read this file + `ARCHITECTURE.md` + `NOTIFICATIONS.md`.
2. Identify surface (web vs mobile vs native vs edge function) → open the right file
   from §3.
3. Make the change on the feature branch; bump the 4 version strings (§7).
4. If it touches DB/RLS/secrets/webhook/APK, **explicitly list the maintainer steps**.
5. Open a PR to `main` to deploy; note any Supabase SQL / function redeploys needed.
