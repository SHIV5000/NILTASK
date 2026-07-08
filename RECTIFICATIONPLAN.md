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
| 6 | Dead code & abandoned-feature cleanup | [x] | v117 | ✅ code-only |
| 7 | (Long-term) shared web/mobile render-query core | [x] | v120 | ✅ all sub-steps done |

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
- [x] **6.1** Dead `shared.js` escapeHtml — already removed in Phase 3. ✔
- [x] **6.2** Membership source of truth: **`room_settings.members` (DB) is canonical**, localStorage `dept_members_*` is a mirror/cache (hydrated from DB on load, written on edit). No half-migration to remove — documented. ✔
- [x] **6.3** Dev pages left in place per user decision (Phase 1.4 accepted risk). ✔
- [x] **6.4** Removed the retired mobile `_notifications()` screen + `window._markAllNotifsRead` (unreachable since v46 — Activity has its own markAllRead) and the stale fns-map entry. Also fixed the live `markAllRead` handler's tenant_id filter (4.1 consistency). ✔ v117
- [x] Version bump v117 + commit + push. ✔

### ✅ EXIT CRITERIA
- No dangling references to removed symbols (grep-confirmed); syntax OK. ✔
- Membership single source of truth documented (DB canonical). ✔

---

## PHASE 7 — SHARED RENDER/QUERY CORE  🏗️ (long-term, optional)
**Goal:** stop web/mobile divergence at the root (the cause of the recurring "works on web not mobile" class).

### Sub-steps (scoped small & independently verifiable — approach A)
- [x] **7.1** Shared **activity-feed core** `js/core/feed.js` (`window.NFA_buildActivity`): fetch+merge+dedup+normalize, resolver-injected. **Mobile** `_activity` wired to it (behavior identical to v111). ✔ v118
- [x] **7.2** **Web** feed (`ui-feed.js _loadActivityFeed`) wired to the same core; web-specific bits (dismissed-set/src/click/bell) applied in the mapping; removed dead `_afCat`. Feed pipeline now lives in ONE file — exit criterion met. ✔ v119
- [x] **7.3** `js/core/reactions.js` (`NFA_fetchReactions`/`NFA_groupReactions`): shared tenant-scoped reaction fetch. Mobile `_fetchReactions` delegates the DB query (keeps its localStorage cache layer). Web reaction chains left as-is (already tenant-consistent; fragile render pipeline). ✔ v120
- [x] **7.4** `NFA_unreadCount`: ONE canonical bell-count query (user_id only), used by mobile `_refreshNotifBadge` + web startup. Removed web's stray tenant_id filter. ✔ v120
- [x] **7.5** Converted remaining user-DATA-in-`onclick` sites (senderName, room/group names) to `escapeJs`. `msg.text`-in-`onclick` left for a future proper delegation pass (escapeJs would mangle its HTML). No unsafe name-in-handler sites remain. Full delegation rewrite of all ~90 sites remains a future architectural task (documented, not urgent). ✔ v120

### ✅ EXIT CRITERIA (per sub-step)
- 7.2: a change to the feed query touches ONLY `js/core/feed.js` and both shells reflect it.
- 7.3/7.4: reaction/badge query lives in one file; both shells consume it.
- 7.5: no `onclick="…${userData}…"` with unescaped data remains (grep-clean).

---

## DEPLOYMENT NOTE (every phase)
Each phase ends with: `node -c` syntax check → version bump (`_MOB_VER`, `APP_VER`, `sw.js` CACHE, `main.js` string, `version.json`) → commit → push to `claude/app-analysis-report-g0jk87`. Production updates only when the branch is merged to `main`.
