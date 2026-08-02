import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let failed = false;

function fail(message) {
  failed = true;
  console.error(`Desktop speed-first validation failed: ${message}`);
}

function requireText(source, text, label) {
  if (!source.includes(text)) fail(`${label} is missing ${JSON.stringify(text)}`);
}

const controller = read('js/desktop-speed-first.js');
const hardening = read('js/desktop-phase1-hardening.js');
const css = read('css/desktop-speed-first.css');
const hardeningCss = read('css/desktop-phase1-hardening.css');
const native = read('js/native.js');
const main = read('js/main.js');
const mobile = read('js/mobile.js');

for (const [label, source] of [
  ['desktop controller', controller],
  ['Phase 1 hardening', hardening],
  ['desktop loader', native]
]) {
  try { new Function(source); }
  catch (error) { fail(`${label} JavaScript syntax is invalid: ${error.message}`); }
}

for (const marker of [
  'nfaDesktopRail',
  'Chat Stream',
  'Task',
  'Activity',
  'Bookmarks',
  'Schedule',
  'Dashboard',
  'nfaDepartmentsHeading',
  'DEPARTMENTS',
  'nfaTaskHubHeading',
  'Task Hub',
  'renderMainApp',
  'loadTasksForPanel',
  "openTopPanel?.('bookmarks')",
  "openTopPanel?.('scheduled')",
  'openActivityFeed',
  'openDashboard',
  'openSettings'
]) requireText(controller, marker, 'desktop controller');

for (const marker of [
  '@media (min-width: 769px)',
  '#nfaDesktopRail',
  '#leftSidebar.nfa-departments-panel',
  '#leftResizer',
  '#rightResizer',
  '#messagesContainer .row-sent',
  '#messagesContainer .row-rcvd',
  'max-width: 70%',
  '#rightSidebar.nfa-task-hub-panel',
  '#nfaTaskHubHeading',
  'prefers-reduced-motion'
]) requireText(css, marker, 'desktop CSS');

for (const marker of [
  'RICH_PREFIX',
  '[NFA_RICH]',
  'resolveTaskId',
  'getTask',
  'activeAssignment',
  'nfaTaskRichSurface',
  'data-nfa-format="bold"',
  'data-nfa-format="italic"',
  'data-nfa-format="underline"',
  'data-nfa-format="insertUnorderedList"',
  'nfaTaskActionCancel',
  ".from('task_trails').insert",
  'captureUnreadNotificationIds',
  'restoreUnreadNotifications',
  'markActivityNotificationRead',
  ".update({ is_read: true })",
  ".update({ is_read: false })",
  'requestAnimationFrame(revealWhenUsable)',
  'window.openTaskUpdateAction = wrapped',
  'window.openActivityFeed = wrappedOpen',
  'window._loadActivityFeed = wrappedLoad'
]) requireText(hardening, marker, 'Phase 1 hardening');

for (const marker of [
  '@media (min-width: 769px) and (pointer: fine)',
  '#nfaTaskActionCancel.nfa-phase1-cancel',
  '.nfa-phase1-rich-toolbar',
  '.nfa-phase1-rich-surface',
  '.nfa-phase1-rich-output',
  'backdrop-filter: none',
  'content-visibility: auto',
  'scrollbar-gutter: stable',
  'prefers-reduced-motion'
]) requireText(hardeningCss, marker, 'Phase 1 hardening CSS');

for (const marker of [
  'window.innerWidth >= 769',
  'window.IS_NATIVE',
  "'(pointer: coarse)'",
  'modulepreload',
  'nfa-supabase-preconnect',
  './css/desktop-speed-first.css?v=2',
  './css/desktop-phase1-hardening.css?v=1',
  "import('./desktop-speed-first.js?v=2')",
  "import('./desktop-phase1-hardening.js?v=1')",
  "document.addEventListener('DOMContentLoaded'",
  'opacity .12s ease-out'
]) requireText(native, marker, 'desktop-only loader');

for (const forbidden of [
  'setInterval(',
  'MutationObserver',
  'querySelectorAll("body',
  "querySelectorAll('body",
  'cloneNode(',
  "from('tasks')",
  "from('messages')",
  "from('profiles')",
  'supabase',
  'indexedDB',
  'requestIdleCallback'
]) {
  if (controller.includes(forbidden)) fail(`controller contains forbidden performance/data token ${forbidden}`);
}

for (const forbidden of [
  'setInterval(',
  'new MutationObserver',
  'requestIdleCallback',
  'nfaCenterWorkspace',
  'desktop-unified-task-composer',
  'openTaskModal =',
  'prompt(',
  'confirm('
]) {
  if (hardening.includes(forbidden)) fail(`Phase 1 hardening contains forbidden workflow/performance token ${forbidden}`);
}

for (const forbidden of [
  'animation: infinite',
  'backdrop-filter: blur(',
  '-webkit-backdrop-filter: blur(',
  'filter: blur(',
  'position: fixed'
]) {
  if (css.includes(forbidden)) fail(`CSS contains forbidden high-cost token ${forbidden}`);
}

for (const requiredOwner of [
  'id="leftSidebar"',
  'id="rightSidebar"',
  'id="leftResizer"',
  'id="rightResizer"',
  'id="messagesContainer"',
  'id="chatsList"',
  'id="tasksPanel"'
]) requireText(main, requiredOwner, 'existing desktop owner');

for (const mobileOwner of ['initMobileApp', '_initRealtime', '_navTo']) {
  requireText(mobile, mobileOwner, 'mobile owner');
}

if (failed) process.exit(1);
console.log('Desktop speed-first Phase 1 validated: legacy task drawer, null-safe rich updates with Cancel, item-level Activity unread handling, faster first paint and mobile/native isolation.');
