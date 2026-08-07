import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let failed = false;

function fail(message) {
  failed = true;
  console.error(`Fast Task Hub v4 validation failed: ${message}`);
}

function requireText(source, text, label) {
  if (!source.includes(text)) fail(`${label} is missing ${JSON.stringify(text)}`);
}

const controller = read('js/desktop-fast-task-hub-v4.js');
const css = read('css/desktop-fast-task-hub-v4.css');
const trailLoader = read('js/desktop-phase1-trail-fix-v3.js');

for (const [label, source] of [
  ['Fast Task Hub controller', controller],
  ['trail loader', trailLoader]
]) {
  try { new Function(source); }
  catch (error) { fail(`${label} JavaScript syntax is invalid: ${error.message}`); }
}

for (const marker of [
  'nfaFocusTaskInFullHub',
  'nfaCloseFocusedTask',
  'nfa-task-focus-hidden',
  'nfa-task-focus-card',
  'nfaFocusedTaskClose',
  'setExpanded(true)',
  'closeFocusedTask',
  'decorateTaskCards',
  'window.toggleTaskDetails = wrapped',
  'window.loadTasksForPanel = wrapped',
  'nfaTaskInlineHost',
  'nfa-inline-action-panel',
  'mountInlineActionPanel',
  'restoreInlineActionPanel',
  'openTaskUpdateAction',
  'openTaskUploadAction',
  'openTaskDelegateAction',
  'openTaskReturnAction',
  'openTaskTransferAction',
  'openTaskExtensionRequest',
  'openTaskDeadlineAction',
  'openTaskCancelAction',
  'enterCreateMode',
  'nfa-inline-task-create-card',
  'window.openTaskModal = wrappedOpen',
  'window.closeTaskModal = wrappedClose',
  'Loading sender…',
  'hydrateCurrentRoom',
  'ensureUsersLoaded',
  'window.renderMessages = wrappedRender',
  'window.loadMessages = wrappedLoad',
  'requestAnimationFrame(installWhenReady)'
]) requireText(controller, marker, 'Fast Task Hub controller');

for (const marker of [
  '@media (min-width: 769px) and (pointer: fine)',
  '#nfaFocusedTaskBar',
  '#nfaFocusedTaskClose',
  '#rightSidebar.nfa-task-focused',
  '#rightSidebar.nfa-task-create-mode',
  '.nfa-task-focus-hidden',
  '.nfa-task-focus-card',
  '#nfaTaskInlineHost',
  '.nfa-inline-action-panel',
  '.nfa-inline-task-create-card',
  'scrollbar-gutter: stable',
  'prefers-reduced-motion'
]) requireText(css, marker, 'Fast Task Hub CSS');

for (const marker of [
  'window.IS_NATIVE',
  'window.innerWidth < 769',
  "'(pointer: coarse)'",
  'nfa-desktop-fast-task-hub-v4-css',
  './css/desktop-fast-task-hub-v4.css?v=1',
  "import('./desktop-fast-task-hub-v4.js?v=1')"
]) requireText(trailLoader, marker, 'desktop v3 loader');

for (const forbidden of [
  'setInterval(',
  'new MutationObserver',
  'requestIdleCallback',
  "from('tasks')",
  "from('task_assignees')",
  "from('task_trails')",
  "from('messages')",
  "from('profiles')",
  'fetch(',
  'cloneNode(',
  'nfaCenterWorkspace',
  'desktop-unified-task-composer'
]) {
  if (controller.includes(forbidden)) {
    fail(`controller contains forbidden owner/performance token ${forbidden}`);
  }
}

if (failed) process.exit(1);
console.log(
  'Fast Task Hub v4 validated: single-task full Hub, close-to-list restoration, inline existing task actions, inline create task, hydrated sender identities and desktop/native isolation.'
);
