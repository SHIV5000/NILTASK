# RECTIFICATION PLAN — Noted For Action (NILTASK)

> Derived from the full-app audit (security, correctness, speed, duplication, dead code, UX).
> Work top-to-bottom. **Do not start a phase until the previous phase's checklist is 100% ticked and verified.**
> Legend: `[ ]` not started · `[~]` in progress · `[x]` done & verified · `[!]` blocked (needs user/DB action)

**Current app version:** v111 · **Branch:** `claude/app-analysis-report-g0jk87` · **Deploy:** merge branch → `main`

---

## PROGRESS TRACKER (update on every session)

| Phase | Title | Status | Version | Verified |
|-------|-------|--------|---------|----------|
| 1 | Security lockdown (RLS + dead pages) | [ ] | — | — |
| 2 | Speed — avatar payload + Tailwind build + indexes | [ ] | — | — |
| 3 | De-duplication — one escape/strip/util core | [ ] | — | — |
| 4 | Correctness — tenant-filter + escape consistency | [ ] | — | — |
| 5 | Realtime resilience + UX polish | [ ] | — | — |
| 6 | Dead code & abandoned-feature cleanup | [ ] | — | — |
| 7 | (Long-term) shared web/mobile render-query core | [ ] | — | — |

---

## PHASE 1 — SECURITY LOCKDOWN  🔴 (do first)
**Goal:** close the RLS holes and remove dev tooling from production. No user-facing behavior change.

### Tasks
- [ ] **1.1** Write `supabase/migrations/20260708_notifications_owner_rls.sql`: owner-scoped `SELECT`/`UPDATE`/`DELETE` policies on `public.notifications` (`user_id = auth.uid()`). Keep existing INSERT policy.
- [ ] **1.2** Write `supabase/migrations/20260708_scheduled_messages_rls.sql`: owner + tenant scoped policies on `scheduled_messages` (`sender_id = auth.uid()`).
- [ ] **1.3** Harden client deletes to match RLS (defense in depth):
  - `ui-panels.js:238,244` `dismissNotif`/`dismissFired` → add `.eq('user_id', currentUser.id)`
  - `ui-panels.js:334` `deleteScheduled` → add `.eq('sender_id', currentUser.id)`
  - `mobile.js:3966` scheduled delete → add `.eq('sender_id', _uid)` (already has tenant)
- [ ] **1.4** Remove `developer.html`, `logs.html`, `Landing.html` from the production deploy path (move to `/devtools/` excluded from Vercel, or delete if unused). Confirm nothing in the app links to them first (audit showed only `developer.html`→`logs.html`).
- [ ] **1.5** Confirm `push_subscriptions.sql` (already updated) is in the run-list.
- [ ] Version bump + commit + push.

### 🔒 USER/DB ACTIONS (blockers — mark `[!]` until confirmed)
- [ ] Run in Supabase SQL editor: `20260708_notifications_owner_rls.sql`, `20260708_scheduled_messages_rls.sql`, `push_subscriptions.sql`, and (still pending from before) `20260707_notifications_unique.sql`, `20260707_room_reads.sql`.

### ✅ EXIT CRITERIA (verify before Phase 2)
- Dismissing a notification removes it AND it does not reappear after the 60s poll.
- A non-owner cannot read/delete another user's notifications (test via a second account).
- `push_subscriptions` upsert returns 200 (no 403) after re-login on a shared device.
- `developer.html`/`logs.html` return 404 in production.

---

## PHASE 2 — SPEED  🟠
**Goal:** cut the mobile home-load payload and startup cost. Measurable, no behavior change.

### Tasks
- [ ] **2.1** Stop pulling base64 `avatar_url` on list/hot paths:
  - `mobile.js:410, 473` `profiles.select('*')` → explicit columns **without** `avatar_url`
  - `mobile.js:2167` profile self-load may keep avatar (single row, fine)
  - `main.js:1111` drop `avatar_url` from the tenant-members list; fetch avatars lazily per visible row.
- [ ] **2.2** Add a lightweight avatar fetch: load `avatar_url` only for members actually rendered (viewport), cached in-memory.
- [ ] **2.3** Replace `cdn.tailwindcss.com` (runtime JIT) with a prebuilt static `css/tailwind.build.css` for `index.html`, `admin.html`, `signup.html`. (Tailwind CLI build committed; drop the CDN `<script>`.)
- [ ] **2.4** Write `supabase/migrations/20260708_perf_indexes.sql`: `messages(room_id,tenant_id,created_at desc)`, `tasks(tenant_id,created_at desc)`, `reactions(message_id)`, `notifications(user_id,is_read)`.
- [ ] Version bump + commit + push.

### 🔒 USER/DB ACTIONS
- [ ] Run `20260708_perf_indexes.sql`.

### ✅ EXIT CRITERIA
- Home render network payload on mobile drops materially (compare `profiles` response size before/after).
- No `cdn.tailwindcss.com` console warning; styles unchanged visually.
- Chat/task loads still correct; avatars still appear (lazily).

---

## PHASE 3 — DE-DUPLICATION  ♻️
**Goal:** one implementation of the utilities that keep causing recurring bugs. Behavior-preserving refactor.

### Tasks
- [ ] **3.1** Create `js/utils/text.js` exporting a single `escapeHtml`, `stripHtml`, `snippet(text, n)` (strip tags + decode entities + truncate). Cover all cases the 4 current variants handle.
- [ ] **3.2** Replace call sites:
  - Remove dead `shared.js:118` `escapeHtml`; keep one canonical (re-export from utils).
  - `ui-core.js:78` escapeHtml → delegate to utils.
  - `mobile.js` `x()` (`:3995`) + `_snip` (`:4025`) → delegate to utils.
  - `ui-feed.js` `_strip`, `notifications.js:291` `_stripHtml`, `shared.js` `getSnippet` → delegate to utils.
- [ ] **3.3** Verify entity handling parity (`&nbsp;`, `&amp;`, `&#39;`) so the notification/feed entity bugs cannot recur in only one place.
- [ ] Version bump + commit + push.

### ✅ EXIT CRITERIA
- Grep shows exactly **one** definition each of escape/strip/snippet.
- Notifications, feed cards, snippets all render decoded text (no `&nbsp;`/`&amp;` leakage) on web AND mobile.
- No visual/behavior regression in message bubbles, feed, notifications.

---

## PHASE 4 — CORRECTNESS  🟡
**Goal:** consistent tenant scoping and escape usage; remove undefined behavior.

### Tasks
- [ ] **4.1** Standardize `notifications` query scope across `_activity`, `_refreshNotifBadge`, `_notifications()` (mobile) and web feed — pick `user_id` (+ optional tenant) consistently; document why.
- [ ] **4.2** Audit the 90 inline `onclick="${…}"` sites; ensure every interpolated **data** value is wrapped in the canonical `escapeHtml`. List any that aren't; fix.
- [ ] **4.3** Fix `beforeinstallprompt`: either wire a real install button to the stored event, or stop `preventDefault()` so the banner shows.
- [ ] Version bump + commit + push.

### ✅ EXIT CRITERIA
- Bell count, feed, and notifications screen agree on the same number.
- No unescaped user data in any inline handler (documented sweep).
- Install prompt either appears or is intentionally deferred behind a button.

---

## PHASE 5 — REALTIME RESILIENCE + UX  📡
**Goal:** make "live" reliable on flapping mobile networks; reduce reconnect noise.

### Tasks
- [ ] **5.1** Investigate the Free-tier realtime ceiling: reduce channels per client where possible (the dual `mobile-bc`+`shared-bc` — can group broadcasts collapse to one channel?).
- [ ] **5.2** Suppress "Reconnecting…/Connected ✓" toast unless disconnected > ~8s (avoid flicker on 10s flaps).
- [ ] **5.3** Ensure the 60s poll fallback also drives: feed (done v111), badge (done), presence, and per-chat unread — confirm all four survive a fully-dead socket.
- [ ] **5.4** Consider upgrading Supabase Free → Pro if connection ceiling is the true cause (user decision — cost note in audit).
- [ ] Version bump + commit + push.

### ✅ EXIT CRITERIA
- With realtime forced off (airplane-toggle test), feed + badge + unread still update within 60s.
- No toast spam during a flapping-network session.

---

## PHASE 6 — DEAD CODE & ABANDONED FEATURES  🗑️
**Goal:** shrink the bundle and remove half-built paths.

### Tasks
- [ ] **6.1** Delete the dead `shared.js` escapeHtml (if not already in P3).
- [ ] **6.2** Resolve `room_members`/`members jsonb`: either finish DB-backed membership or remove the half-migration and keep localStorage as the single source (document choice).
- [ ] **6.3** Remove/relocate dev pages (if not done in P1.4).
- [ ] **6.4** Prune any unreferenced functions surfaced during P3/P4 refactors.
- [ ] Version bump + commit + push.

### ✅ EXIT CRITERIA
- No unreferenced top-level functions in `mobile.js`/`main.js` (spot-checked).
- Membership has a single documented source of truth.

---

## PHASE 7 — SHARED RENDER/QUERY CORE  🏗️ (long-term, optional)
**Goal:** stop web/mobile divergence at the root (the cause of the recurring "works on web not mobile" class).

### Tasks
- [ ] **7.1** Extract shared query builders (feed, reactions, notifications) into `js/core/` consumed by BOTH shells.
- [ ] **7.2** Migrate one feature end-to-end (Activity feed is the natural first — already aligned) to the shared core as the pattern.
- [ ] **7.3** Roll remaining features onto the core incrementally.

### ✅ EXIT CRITERIA
- A query change for the feed touches ONE file and both shells reflect it.

---

## DEPLOYMENT NOTE (every phase)
Each phase ends with: `node -c` syntax check → version bump (`_MOB_VER`, `APP_VER`, `sw.js` CACHE, `main.js` string, `version.json`) → commit → push to `claude/app-analysis-report-g0jk87`. Production updates only when the branch is merged to `main`.
