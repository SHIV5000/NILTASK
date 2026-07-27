# Noted For Action — Distinctive UI Feature Map

## Purpose

This branch changes the presentation of the existing application without replacing its functional DOM, event handlers, realtime owners, database calls, permissions, storage keys or native bridge.

The product name shown to users is **Noted For Action**. Internal identifiers such as the repository name, production package ID `in.niltask.app`, storage keys, log prefixes and database artefact names remain stable because changing them would create migration and compatibility risk.

## Change boundary

### Changed

- `css/mobile.css`: additive desktop and mobile presentation layer.
- `scripts/validate-distinctive-ui.mjs`: feature-to-selector and branding validation.
- `package.json`: exposes `npm run validate:distinctive-ui`.
- `.github/workflows/professionalization-validation.yml`: runs the new validation with all existing gates.

### Intentionally unchanged

- `js/main.js`
- `js/mobile.js`
- `js/messages.js`
- `js/tasks.js`
- `js/mobile-tasks.js`
- `js/notifications.js`
- all Supabase queries, migrations and RLS assumptions
- all realtime channel ownership and cleanup
- all offline cache and queue behavior
- all Capacitor/native bridge behavior
- package ID and production URL

## Desktop feature mapping

| Functional area | Existing functional owner | Presentation mapping |
|---|---|---|
| Authentication and login | `js/auth.js`, `#root` | Login remains visible; no mobile blanket-hide rule is introduced. Inputs, buttons and modal surfaces inherit the Noted For Action geometry. |
| Groups and direct messages | `js/main.js`, existing sidebar rows | `.left-sidebar`, `.channel-item`, `.dm-item`, `.group-item` become workstream cards. Existing click, unread, context-menu and search handlers remain on the same nodes. |
| Conversation header | Existing room/header DOM | `#roomTitleDisplay`, `.topbar-title`, header containers use the institutional workspace treatment. Search, mute, members and menu buttons remain unchanged. |
| Messages | `renderMessages`, `js/messages.js` | `.row-sent`, `.row-rcvd`, `.bubble`, `.b-*` are restyled as accountable work entries. Message IDs, menu anchors and sender alignment remain intact. |
| Replies and threads | Existing reply/thread handlers | Thread links, nested reply rows and stable row/footer IDs are untouched. Their buttons and cards inherit the new shape language. |
| Reactions and text tags | Reaction runtime and cache | Existing chips and pickers retain their handlers; only chip radius, borders and emphasis change. |
| Attachments and previews | Existing upload/open/download handlers | File/image cards inherit shared card styling. No URL, bucket or attachment metadata handling changes. |
| Composer and formatting | Quill and existing send handlers | `.input-container` and `.quill-wrapper` receive the new composer shell. Toolbar, mention, attachment, schedule and send actions remain intact. |
| Tasks | `js/tasks.js` | `.jira-card`, `.task-card`, status and priority badges use the action-first visual rail. Creation, multi-assignee states, acknowledgement, progress, review, delegation, transfer, files and trail behavior remain unchanged. |
| Activity | `js/ui-feed.js`, `js/activity-v208.js` | `.af-*` cards retain their source-owned refresh and scroll-preservation logic while sharing the new card identity. |
| Notifications | `js/notifications.js` | `.nf-*` and unread states receive a saffron attention rail. Count, clear, open and navigation behavior remains unchanged. |
| Scheduled messages | Existing schedule module | Schedule cards inherit shared card and modal styling. Scheduling and delivery logic is unchanged. |
| Reminders | Existing reminder module | Reminder cards inherit shared card styling. Due-time and notification logic is unchanged. |
| Bookmarks | Existing bookmark module | Saved items inherit the shared surface treatment. Save/remove/navigation handlers remain unchanged. |
| Search and filters | Existing screen-specific handlers | Active pills and fields use the new visual system without replacing filter values or callbacks. |
| Profile and settings | `js/ui-settings.js` | Existing forms, theme choices, profile fields and dialogs retain their structure and behavior. |
| Admin and developer screens | Existing HTML/JS owners | Shared inputs, buttons, cards and dialogs inherit the palette where common classes are used. Their workflows are not modified. |

## Mobile feature mapping

| Functional area | Existing functional owner | Presentation mapping |
|---|---|---|
| Mobile lifecycle | `initMobileApp`, MobileRuntime and SessionLifecycle | No lifecycle JavaScript changes. `#mobileApp`, `#mStage` and `.mScr` are presentation targets only. |
| Top bar, identity and connectivity | `#mSB`, presence/realtime handlers | Top bar receives the translucent workspace treatment. User, school, search, presence and notification controls keep their IDs and handlers. |
| Bottom navigation | `#mNav`, `.mn-btn` | Existing tabs become a floating action dock. Tab order, badge placement and navigation callbacks remain unchanged. |
| Group/DM lists | `.m-row`, `_navTo`, cached user/room data | Rows become workstream cards. Swipe, click, unread badge, avatar, presence and preview behavior remains unchanged. |
| Group and DM conversations | `_bubbleHTML`, realtime message insert | `.m-msgs`, `.m-bubble-row`, `.m-bubble` become timeline-style work entries. Stable message row IDs, reactions, menus, reply links and live inserts remain intact. |
| Threads and replies | Existing `thread` screen and reply cache | Thread links, parent cards and reply screens retain all behavior and receive shared styling. |
| Typing and presence | ChatParity and mobile presence handlers | Typing indicators and presence dots retain their runtime ownership and receive inherited colors only. |
| Reactions and tags | Existing picker and reconciliation | Existing `.m-chip` controls retain data attributes and listeners. Styling does not alter values or event delivery. |
| Mobile composer | `.m-composer`, `.m-ce-wrap`, `.m-sendbtn` | Composer becomes a distinctive action surface. Keyboard handling, formatting, mentions, attachments, offline queue and send logic remain unchanged. |
| Mobile tasks | `js/mobile-tasks.js` and task runtime | Existing task cards, details, filters and action sheets inherit the new visual language. State transitions and permissions are unchanged. |
| Mobile Activity and notifications | `.af-*`, `.nf-*` | Cards and unread emphasis are mapped without changing refresh, clear, open or badge logic. |
| Sheets, menus and modals | `#mSheetInner`, existing action handlers | Sheets receive the rounded institutional shape. Menu rows and their action bindings remain unchanged. |
| Offline and cache behavior | IndexedDB/localStorage/offline queue | No storage key, queue, cache size, restore or flush logic changes. |
| Background/resume and realtime healing | MobileRuntime and realtime owners | No event, timer, channel or resume logic changes. |
| PWA/native app | service worker, manifest, Capacitor | Package ID and production URL remain stable. The installed app continues to load the same remote application. |

## Branding contract

User-facing product naming must resolve to **Noted For Action** in:

- document title
- PWA manifest name and short name
- Capacitor `appName`
- native placeholder title
- visible application-name chrome

Internal names are not mass-renamed because they may be used by package installation, caches, database scripts, diagnostics or compatibility logic.

## Validation gates

The branch must pass:

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

This branch and its draft pull request are for preview and review only. It must not be merged into `main` until authenticated desktop and mobile testing confirms visual acceptance and functional parity.
