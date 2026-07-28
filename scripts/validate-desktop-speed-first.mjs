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
const css = read('css/desktop-speed-first.css');
const native = read('js/native.js');
const main = read('js/main.js');
const mobile = read('js/mobile.js');

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
  "window.innerWidth < 769",
  'window.IS_NATIVE',
  "./css/desktop-speed-first.css?v=1",
  "import('./desktop-speed-first.js?v=1')",
  "document.addEventListener('DOMContentLoaded'"
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
  'animation: infinite',
  'backdrop-filter:',
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
console.log('Desktop speed-first Phase 1 validated: desktop-only shell, existing owners, no polling/observers/data duplication.');
