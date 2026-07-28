import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let failed = false;
const fail = message => { failed = true; console.error(`Desktop workspace v4 validation failed: ${message}`); };
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${JSON.stringify(needle)}`);
};

const js = read('js/desktop-workspace-v4.js');
const loader = read('js/desktop-workspace-loader-v4.js');
const css = read('css/desktop-workspace-v4.css');
const native = read('js/native.js');
const center = read('js/center-workspace-v3.js');
const messages = read('js/messages.js');
const tasks = read('js/tasks.js');
const panels = read('js/ui-panels.js');
const feed = read('js/ui-feed.js');

requireText(native, './js/desktop-workspace-loader-v4.js?v=215', 'desktop v4 loader bootstrap');
requireText(loader, 'window.IS_NATIVE || window.innerWidth <= 768', 'mobile/native exclusion');
requireText(loader, "import('./desktop-workspace-v4.js?v=215')", 'conditional desktop import');
requireText(loader, "window.addEventListener('resize', loadDesktopWorkspace", 'desktop resize activation');
requireText(js, "import { sb } from './shared.js'", 'scoped data client import');
requireText(js, 'const isDesktop', 'desktop-only boundary');

for (const marker of [
  "railButton('stream', 'Chat Stream'",
  "railButton('tasks', 'Task'",
  "railButton('activity', 'Activity'",
  "railButton('bookmarks', 'Bookmarks'",
  "railButton('scheduled', 'Schedule'",
  "railButton('dashboard', 'Dashboard'",
  "node.textContent = 'DEPARTMENTS'",
  "context.innerHTML = '<strong>Task Hub</strong>'",
  "node.textContent = 'Activity Hub'"
]) requireText(js, marker, 'desktop navigation/labels');

for (const marker of [
  'openTaskHub',
  "openCenter('task-hub', 'Task Hub'",
  '#tasksPanel .nt-task-card[data-task-id]',
  'nfa-open-task-button',
  "window.nfaOpenTaskCenter?.(taskId, 'manage')"
]) requireText(js, marker, 'centre Task Hub');

for (const marker of [
  'openBookmarksCenter',
  "from('bookmarks')",
  'nfa-collection-remove',
  "window.bookmarkedSet?.delete?.(item.message_id)",
  'exactGoToMessage(item.message_id'
]) requireText(js, marker, 'centre bookmarks and removal');

for (const marker of [
  'openScheduleCenter',
  "from('scheduled_messages')",
  "order('scheduled_time', { ascending: false })",
  'clearAllSchedules',
  'Clear All',
  "String(item.status || 'pending')"
]) requireText(js, marker, 'complete schedule history');

for (const marker of [
  'installActivityHubOpener',
  'Activity Hub',
  'nfa-activity-unread-badge',
  'refreshActivityBadge',
  'NFA_buildActivity',
  'markActivityRead',
  "update({ is_read: true })"
]) requireText(js, marker, 'Activity Hub unread contract');

for (const marker of [
  'exactGoToMessage',
  "from('messages').select('id,room_id')",
  "target.scrollIntoView({ behavior:'smooth', block:'center'",
  "target.classList.add('nfa-focus-target')",
  '3050'
]) requireText(js, marker, 'exact cross-room navigation');

for (const marker of [
  'scrollLatest',
  'scheduleLatestScroll',
  "window.pendingScrollId = 'BOTTOM'",
  "container.scrollTo({ top, behavior:'smooth' })",
  "['openRoomById', 'openChatRoom']"
]) requireText(js, marker, 'latest-message positioning');

for (const marker of [
  'refreshProfiles',
  "from('profiles')",
  'hydrateAvatars',
  '.bubble',
  '.nt-task-person',
  '#chatsList [data-uid]',
  '.nfa207-avatar',
  'nfa-universal-avatar'
]) requireText(js, marker, 'universal profile photos');

for (const marker of [
  '#nfaWorkstreamHeading',
  '#nfaContextHeading',
  '.nfa-activity-unread-badge',
  'max-width: 70%',
  ':not(:has(.bubble))::before',
  '.nfa-center-task-hub',
  '.nfa-center-collection',
  '.nfa-universal-avatar',
  '.nfa-focus-target',
  'scroll-behavior: smooth',
  'prefers-reduced-motion'
]) requireText(css, marker, 'desktop v4 CSS');

// Existing owners remain available and the v4 layer routes to them.
for (const marker of ['row-sent', 'row-rcvd', 'bubble sent', 'bubble rcvd']) {
  requireText(messages, marker, 'message owner');
}
for (const marker of ['loadTasksForPanel', 'openTaskFromNotification', 'renderTaskTrail']) {
  requireText(tasks, marker, 'task owner');
}
for (const marker of ['openTopPanel', "type==='bookmarks'", "type==='scheduled'"]) {
  requireText(panels, marker, 'bookmark/schedule owner');
}
for (const marker of ['openActivityFeed', '_loadActivityFeed', 'NFA_buildActivity']) {
  const source = marker === 'NFA_buildActivity' ? read('js/core/feed.js') : feed;
  requireText(source, marker, 'activity owner');
}
requireText(center, 'nfaOpenTaskCenter', 'centre task router');

// V4 may read/update/delete only the user-visible collections needed by these
// requirements. It must not own authentication, message/task writes, realtime,
// offline queues or mobile navigation.
for (const forbidden of [
  '.insert(',
  '.upsert(',
  'sb.auth.',
  '.channel(',
  'removeChannel(',
  'startSubscriptions',
  'indexedDB',
  'sessionStorage',
  'unreadCounts',
  "_navTo('",
  'mStage',
  'mobileApp'
]) {
  if (js.includes(forbidden)) fail(`desktop v4 unexpectedly contains ${forbidden}`);
}

for (const requiredScope of [
  ".eq('user_id', window.currentUser?.id)",
  ".eq('tenant_id', window.currentTenantId)",
  ".eq('sender_id', window.currentUser?.id)"
]) requireText(js, requiredScope, 'user/tenant write scope');

for (const forbidden of ['addEventListener(', 'onclick=', 'localStorage.', 'sessionStorage.', 'fetch(']) {
  if (css.includes(forbidden)) fail(`desktop v4 CSS unexpectedly contains behavior token ${forbidden}`);
}

if (failed) process.exit(1);
console.log('Desktop workspace v4 validated: all 16 requested web/desktop contracts are mapped, mobile/native is excluded, and existing owners remain intact.');
