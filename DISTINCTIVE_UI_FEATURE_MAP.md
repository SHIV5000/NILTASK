# Noted For Action — Distinctive UI Feature Map

## Purpose

This branch applies the approved workstream/accountability visual structure to the existing application while retaining the existing functional DOM, data owners, permissions, realtime owners, database calls, storage contracts and native bridge.

The product name shown to users is **Noted For Action**. Internal identifiers such as the repository name, production package ID `in.niltask.app`, existing storage keys, log prefixes and database artefact names remain stable where changing them would create migration or compatibility risk.

## Change boundary

### Changed

- `css/mobile.css`: earlier additive presentation compatibility layer.
- `css/distinctive-ui-v2.css`: simulation-matched desktop and mobile visual structure.
- `css/distinctive-ui-compact.css`: compact laptop spacing, responsive density and visible resize grips.
- `js/distinctive-ui-v2.js`: presentation adapter, action-rail routing and user panel-width preferences.
- `scripts/validate-distinctive-ui.mjs`: feature, selector, branding and resize-contract validation.
- `package.json`: exposes `npm run validate:distinctive-ui`.
- `.github/workflows/professionalization-validation.yml`: runs the new validation with all existing gates.
- preview workflow files: isolated Noted For Action Preview APK naming and branch URL.

### Intentionally unchanged

- `js/main.js`
- `js/mobile.js`
- `js/messages.js`
- `js/tasks.js`
- `js/mobile-tasks.js`
- `js/notifications.js`
- all Supabase queries, migrations and RLS assumptions
- all realtime channel ownership and cleanup
- all offline queue and message/task behaviour
- production package ID and production URL

`js/native.js` retains its existing native behaviour and appends the presentation-adapter loader after the native bridge.

## Desktop feature mapping

| Functional area | Existing functional owner | Presentation mapping |
|---|---|---|
| Authentication and login | `js/auth.js`, `#root` | Login remains visible and functional. Common fields, buttons and surfaces inherit the Noted For Action geometry. |
| Action rail | Presentation adapter calling existing public actions | Stream, Tasks, Pulse, Later, Saved and Settings route to the existing sidebar, task, Activity, scheduled-message, bookmark and settings actions. |
| Groups and direct messages | `js/main.js`, existing sidebar rows | Existing rows become workstream cards. Click, unread, context-menu and search handlers remain on the same nodes. |
| Conversation header | Existing room/header DOM | The header uses the institutional workspace treatment while room title, members, mute and search retain their identifiers and handlers. |
| Messages | `renderMessages`, `js/messages.js` | Existing message rows and bubbles become timeline work entries. Stable message IDs, menus and sender data remain intact. |
| Replies and threads | Existing reply/thread handlers | Thread links, nested replies and stable row/footer IDs retain their original handlers. |
| Reactions and text tags | Reaction runtime and cache | Existing chips and pickers retain their data and handlers; only presentation changes. |
| Attachments and previews | Existing upload/open/download handlers | File/image cards inherit the visual system. No bucket, URL or metadata handling changes. |
| Composer and formatting | Quill and existing send handlers | Toolbar, mentions, attachments, schedule and send actions remain intact inside the compact composer shell. |
| Tasks | `js/tasks.js` | Task cards, status and priority surfaces use the action-first design. Creation, assignment, acknowledgement, progress, review, delegation, transfer, evidence and trail behaviour are unchanged. |
| Activity | `js/ui-feed.js`, `js/activity-v208.js` | The feed uses the resizable right panel and compact cards without changing refresh, filtering, clearing or navigation. |
| Notifications | `js/notifications.js` | Unread and attention states receive the new styling while count, clear and navigation behaviour remains unchanged. |
| Scheduled messages | Existing schedule module | Scheduling and delivery logic is unchanged. |
| Reminders | Existing reminder module | Due-time and notification logic is unchanged. |
| Bookmarks | Existing bookmark module | Save, remove and navigation handlers remain unchanged. |
| Profile/settings | `js/ui-settings.js` | Existing forms and theme/profile workflows retain their structure and behaviour. |

## Desktop panel sizing contract

- The action rail remains a fixed compact navigation strip.
- The Workstreams panel is user-resizable from **220 px to 420 px**.
- The Tasks/Activity/Action Pulse panel is user-resizable from **250 px to 520 px**.
- The conversation panel is not given a redundant third handle: it automatically expands or contracts between the two user-resizable side panels and retains a safe minimum reading width.
- The visible separators between Workstreams/conversation and conversation/right panel are draggable by mouse, stylus or touch pointer.
- Widths are saved only in the presentation-specific keys `nfa_v2_left_width` and `nfa_v2_right_width`.
- Double-clicking either separator restores the adaptive laptop/desktop default.
- Compact defaults are automatically selected for narrower screens or screen heights up to 900 px.
- At phone/tablet widths the existing mobile shell remains authoritative.

## Mobile feature mapping

| Functional area | Existing functional owner | Presentation mapping |
|---|---|---|
| Mobile lifecycle | `initMobileApp`, MobileRuntime and SessionLifecycle | Lifecycle JavaScript is unchanged. `#mobileApp`, `#mStage` and `.mScr` are presentation targets only. |
| Top bar and identity | `#mSB`, existing presence handlers | Brand mark and workspace treatment are added without replacing user, school, search, presence or notification controls. |
| Bottom navigation | `#mNav`, `.mn-btn` | Existing tabs become the floating action dock. Tab order, badges and callbacks remain unchanged. |
| Group/DM lists | `.m-row`, `_navTo` | Rows become workstream cards. Click, unread, avatar, presence and preview behaviour remains unchanged. |
| Conversations | `_bubbleHTML`, realtime insert | Mobile entries use timeline styling while stable row IDs, reactions, menus, replies and live insert remain intact. |
| Threads/replies | Existing thread screen | Parent cards, reply links and caches remain unchanged. |
| Typing/presence | ChatParity and presence handlers | Runtime ownership remains unchanged. |
| Reactions/tags | Existing picker and reconciliation | Values, data attributes and listeners remain unchanged. |
| Composer | `.m-composer`, `.m-ce-wrap`, `.m-sendbtn` | Keyboard, formatting, mentions, attachments, offline queue and send logic remain unchanged. |
| Mobile tasks | `js/mobile-tasks.js` | Task state transitions, permissions and evidence handling remain unchanged. |
| Activity/notifications | Existing `.af-*` and `.nf-*` owners | Refresh, clear, open and badge logic remains unchanged. |
| Offline/background | Existing IndexedDB, queues and runtime owners | No queue, restore, timer, subscription or resume ownership changes. |

## Branding contract

User-facing product naming resolves to **Noted For Action** in the document title, PWA manifest, Capacitor app name, native placeholder and visible application chrome.

Internal technical names are not mass-renamed where doing so could break package installation, caches, database scripts, diagnostics or compatibility logic.

## Validation gates

```text
npm run validate:professionalization
npm run test:mobile-runtime
npm run test:mobile-unread
npm run validate:chat-parity
npm run test:chat-parity
npm run validate:mobile-preview
npm run validate:pwa-assets
npm run validate:distinctive-ui
npm run validate:tailwind
```

## Approval boundary

This branch and draft pull request are for preview and review only. They must not be merged into `main` until authenticated desktop and mobile testing confirms visual acceptance and functional parity.
