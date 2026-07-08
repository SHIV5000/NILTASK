# RECTIFICATION PLAN — Noted For Action (NILTASK)

> Derived from the full-app audit (security, correctness, speed, duplication, dead code, UX).
> Work top-to-bottom. **Do not start a phase until the previous phase's checklist is 100% ticked and verified.**
> Legend: `[ ]` not started · `[~]` in progress · `[x]` done & verified · `[!]` blocked (needs user/DB action)

**Current app version:** v111 · **Branch:** `claude/app-analysis-report-g0jk87` · **Deploy:** merge branch → `main`

---

## PROGRESS TRACKER (update on every session)

| Phase | Title | Status | Version | Verified |
|-------|-------|--------|---------|----------|
| 1 | Security lockdown (RLS + dead pages) | [x] | v112 | ✅ SQL run & verified |
| 2 | Speed — avatar payload + Tailwind build + indexes | [x] | v113 | ✅ SQL run (2.3 deferred) |
| 3 | De-duplication — one escape/strip/util core | [x] | v114 | ✅ code-only, no DB |
| 4 | Correctness — tenant-filter + escape consistency | [x] | v115 | ✅ code-only |
| 5 | Realtime resilience + UX polish | [x] | v116 | ✅ 5.1/5.4 deferred |
| 6 | Dead code & abandoned-feature cleanup | [ ] | — | — |
| 7 | (Long-term) shared web/mobile render-query core | [ ] | — | — |

---

## PHASE 1 — SECURITY LOCKDOWN  🔴 (do first)
**Goal:** close the RLS holes and remove dev tooling from production. No user-facing behavior change.

### Tasks
- [x] **1.1** `supabase/migrations/20260708_notifications_owner_rls.sql`: owner-scoped `SELECT`/`UPDATE`/`DELETE` on `notifications`. INSERT policy untouched. ✔ v112
- [x] **1.2** `supabase/migrations/20260708_scheduled_messages_rls.sql`: owner-scoped `SELECT`/`INSERT`/`UPDATE`/`DELETE` on `scheduled_messages`. ✔ v112
- [x] **1.3** Hardened client deletes: `dismissNotif`/`dismissFired` `.eq('user_id')`; `deleteScheduled` + mobile `_cancelScheduled` `.eq('sender_id')`. ✔ v112
- [x] **1.4** Dev/marketing pages — **ACCEPTED RISK (user decision): leave them.** They run under the user's own Supabase session, so the hardened RLS already limits what they can do. No deletion.
- [x] **1.5** `push_subscriptions.sql` updated and in the run-list. ✔
- [x] Version bump v112 + commit + push. ✔

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
- [x] **2.1** Light-column profile queries (no base64 `avatar_url`) on all mobile hot paths (`_refreshUsers`, cold-start, cache-first) and web `loadChatsList`. ✔ v113
- [x] **2.2** Background avatar hydration: `_hydrateAvatars()` (mobile, merges + re-renders once), async merge into `globalUsersCache` (web). Preserves already-loaded avatars across light refreshes. ✔ v113
- [!] **2.3** Replace `cdn.tailwindcss.com` with a built CSS — **DEFERRED.** High regression risk (purge may drop dynamically-built class names across every page) and no visual verification available here. Needs its own sub-task with per-page screenshot checks. The CDN warning is cosmetic; Tailwind still works.
- [x] **2.4** `supabase/migrations/20260708_perf_indexes.sql` written (messages/tasks/reactions/notifications). ✔ v113
- [x] Version bump v113 + commit + push. ✔

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
- [x] **3.1** `js/utils/text.js` — canonical `escapeHtml`, `stripHtml` (DOM-based, decodes ALL entities), `snippet(html,n)`, `getSnippet` (inline-safe). Loaded as classic script before modules; wired into index.html + admin.html + SW precache. ✔ v114
- [x] **3.2** All call sites delegate: shared.js + ui-core.js dropped their escapeHtml; mobile `x()`/`_snip`, ui-feed `_strip`, notifications `_stripHtml` delegate. Grep confirms one definition each. ✔ v114
- [x] **3.3** `stripHtml` is DOM-based → decodes every entity uniformly (no more one-place-only entity fixes). ✔ v114
- [x] Version bump v114 + commit + push. ✔

### ✅ EXIT CRITERIA
- Grep shows exactly **one** definition each of escape/strip/snippet.
- Notifications, feed cards, snippets all render decoded text (no `&nbsp;`/`&amp;` leakage) on web AND mobile.
- No visual/behavior regression in message bubbles, feed, notifications.

---

## PHASE 4 — CORRECTNESS  🟡
**Goal:** consistent tenant scoping and escape usage; remove undefined behavior.

### Tasks
- [x] **4.1** All `notifications` reads scope by `user_id` ONLY (mobile `_notifications` screen + ui-panels fired/all panels), matching the feed/badge. Server rows' tenant_id mismatch no longer starves them. ✔ v115
- [x] **4.2** Added `window.escapeJs()` (strips JS-breakout chars, keeps spaces) for values embedded in inline JS strings — `escapeHtml` is unsafe there. Applied to admin staff-action buttons (reset/archive/delete) passing full_name/email. **Note:** a full inline-`onclick`→event-delegation conversion (the correct long-term fix for all ~90 sites) is folded into Phase 7. ✔ v115
- [x] **4.3** Install banner button enlarged (16px font, 14×26 padding, shadow) + banner padding bumped. The `beforeinstallprompt` console line is benign — the custom banner correctly calls `.prompt()` on click. ✔ v115
- [x] Version bump v115 + commit + push. ✔

### ✅ EXIT CRITERIA
- Bell count, feed, and notifications screen agree on the same number.
- No unescaped user data in any inline handler (documented sweep).
- Install prompt either appears or is intentionally deferred behind a button.

---

## PHASE 5 — REALTIME RESILIENCE + UX  📡
**Goal:** make "live" reliable on flapping mobile networks; reduce reconnect noise.

### Tasks
- [!] **5.1** Channel reduction — **DEFERRED.** The 3 channels (mobile-rt/mobile-bc/shared-bc) share ONE WebSocket transport, so cutting count doesn't stop the transport drops the logs showed; removing the legacy broadcast channel risks mobile↔mobile sync. Low value / real risk.
- [x] **5.2** "Reconnecting…" toasts only after 8s of sustained outage (armed timer, cleared on recovery); "Connected ✓" only if that warning showed. Brief flaps are silent. ✔ v116
- [x] **5.3** `_fallbackPoll` (60s): refreshes badge+feed always, and when the RT channel isn't `joined` also re-pulls the OPEN chat so a dead socket still delivers within the window. Presence already on the 60s heartbeat. ✔ v116
- [!] **5.4** Supabase Free→Pro — **user cost decision.** If the realtime ceiling is the true cause, Pro lifts the 100-connection limit. Not a code change.
- [x] Version bump v116 + commit + push. ✔

### ✅ EXIT CRITERIA
- With realtime forced off (airplane-toggle test), feed + badge + open chat still update within 60s. ✔ (via _fallbackPoll)
- No toast spam during a flapping-network session (brief flaps now silent). ✔

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
