# Noted For Action — Distinctive UI Feature Map

## Purpose

This branch presents the complete authenticated web, PWA and mobile application through a distinctive workstream/accountability interface before any production merge.

The approved simulation is represented by:

- a plum action rail;
- a workstream navigation panel;
- a timeline-based conversation surface;
- an action-pulse context panel;
- a floating mobile action dock;
- cut-corner Noted For Action brand marks;
- plum, saffron and blue-grey visual tokens.

## Safety architecture

The redesign is implemented as a **presentation adapter**, not as a replacement application.

- `js/main.js` remains the owner of the authenticated desktop DOM and all desktop actions.
- `js/mobile.js` remains the owner of the mobile shell, navigation stack, messages, offline queue and realtime behaviour.
- `js/tasks.js` and `js/mobile-tasks.js` remain the task owners.
- Existing IDs, classes and public `window.*` actions remain in place.
- `js/distinctive-ui-v2.js` adds visual wrappers/classes and routes the new rail controls to existing public actions.
- `css/distinctive-ui-v2.css` provides the simulation-matched appearance.
- The adapter contains no Supabase query, insert, update, delete, storage mutation or session ownership.

## Desktop mapping

| Existing feature | Existing owner | Distinctive presentation |
|---|---|---|
| School identity and account controls | `js/main.js` | Workstream header and action rail |
| Departments/groups | `loadChatsList` | Workstream cards |
| Direct messages/staff | `loadChatsList` | Direct workstream cards |
| Current room title and members | `js/main.js` | Conversation header |
| Message search | `js/main.js` | Header search field |
| Messages and replies | `messages.js` / `main.js` | Single timeline with diamond nodes |
| Sent and received identity | Existing bubble classes | Accent-edge timeline cards |
| Emoji reactions and text tags | Existing message handlers | Compact metadata pills |
| Reply, bookmark, reminder and task actions | Existing message handlers | Timeline-card action row |
| Attachments and rich composer | Existing Quill/file handlers | Rounded workstream composer |
| Typing indicator | Existing chat parity service | Preserved below timeline |
| Scheduled messages | Existing top panel | Action rail: Later |
| Bookmarks | Existing top panel | Action rail: Saved |
| Activity and notifications | Existing feed/notification owners | Action rail: Pulse |
| Task panel and task trail | `tasks.js` | Action-pulse context panel |
| Task filtering and sorting | `tasks.js` | Context-panel controls |
| Settings and profile | Existing settings owner | Action rail: Settings/profile |
| Theme and logout | Existing controls | Preserved in workstream header |
| Modals, sheets and dropdowns | Existing owners | Distinctive rounded surfaces |

## Mobile mapping

| Existing feature | Existing owner | Distinctive presentation |
|---|---|---|
| Authenticated top bar | `mobile.js` | Cut-corner Noted For Action mark |
| Home/groups/direct messages | `mobile.js` | Workstream cards |
| Bottom navigation | `mobile.js` | Floating five-part action dock |
| Group/DM/thread headers | `mobile.js` | Compact workspace headers |
| Messages and replies | `_bubbleHTML` / chat parity | Timeline cards with diamond nodes |
| Sent/received identity | Existing `snt`/`rcv` classes | Accent-edge timeline cards |
| Reactions, tags and thread links | Existing handlers | Metadata pills |
| Composer, attachment and formatting | Existing handlers | Floating rounded composer |
| Tasks and task details | `mobile-tasks.js` | Distinctive action cards |
| Activity and notifications | Existing mobile feed owners | Distinctive pulse cards |
| Offline cached reopen and queued send | Existing cache/queue owners | No change to behaviour |
| Realtime, typing and unread | Existing runtime owners | No change to behaviour |
| Sheets, modals and menus | Existing mobile owners | Distinctive rounded sheets |
| Native push and hardware back | `native.js` | Native bridge preserved; adapter loader appended after the bridge |

## Functional owners explicitly unchanged

- Supabase client and database calls
- authentication and tenant selection
- RLS expectations
- realtime subscription ownership
- unread authority
- cross-device chat parity
- offline message and user caches
- queued sending
- account and tenant lifecycle cleanup
- push-token registration
- native package IDs and production URL

## Required validation

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

## Owner review before merge

- authenticated desktop workstreams and direct messages;
- desktop messages, replies, reactions, tags and files;
- desktop composer, schedules, bookmarks, Activity and task panel;
- authenticated mobile groups, direct messages and threads;
- mobile composer, reactions, tags, files, tasks and Activity;
- offline reopen and queued send;
- background/resume and account/tenant switching;
- light and dark modes;
- small laptop widths, phone widths, keyboard and large text;
- installed-PWA update convergence.

PR #205 must remain draft until the owner accepts the appearance and the focused authenticated tests pass.
