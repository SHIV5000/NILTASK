import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
let failed = false;

function fail(message) {
  failed = true;
  console.error(`Task Message v6 validation failed: ${message}`);
}
function requireText(source, text, label) {
  if (!source.includes(text)) fail(`${label} is missing ${JSON.stringify(text)}`);
}

const loader = read('js/desktop-fast-task-hub-v4.js');
const controller = read('js/desktop-task-messages-v6.js');
const css = read('css/desktop-task-messages-v6.css');
const trailLoader = read('js/desktop-phase1-trail-fix-v3.js');
const mobile = read('js/mobile.js');
const native = read('js/native.js');

for (const [label, source] of [
  ['Task Message compatibility loader', loader],
  ['Task Message controller', controller],
  ['trail loader', trailLoader]
]) {
  try { new Function(source); }
  catch (error) { fail(`${label} JavaScript syntax is invalid: ${error.message}`); }
}

for (const marker of [
  'old desktop Task Hub workflow is retired',
  'desktop-task-messages-v6.css?v=1',
  "import('./desktop-task-messages-v6.js?v=1')",
  'nfaTaskLensActivityBridge',
  'nfa_activity_dock_visible_v1:'
]) requireText(loader, marker, 'Task Message loader');

for (const marker of [
  '__NFA_DESKTOP_TASK_MESSAGES_V6__',
  "from('tasks')",
  "from('task_assignees')",
  "from('task_trails')",
  'original_message_id',
  'nfa-task-message-v6',
  'Task Message',
  'nfaConversationModeV6',
  'nfaTaskLensV6',
  'Needs My Action',
  'Assigned to Me',
  'Assigned by Me',
  'Due / Overdue',
  'Completed',
  'wrapCreateOwners',
  'window.openTaskModal = wrappedOpen',
  'nfa-v6-inline-create-card',
  'mountActionPanel',
  'nfa-v6-inline-panel',
  'openTaskUpdateAction',
  'openTaskUploadAction',
  'openTaskDelegateAction',
  'openTaskReturnAction',
  'openTaskTransferAction',
  'openTaskExtensionRequest',
  'openTaskDeadlineAction',
  'openTaskCancelAction',
  "window.taskAction?.(taskId, assigneeId, 'accept')",
  'window.sendTaskReminder',
  'openTaskFromLens',
  'window.openTaskOriginalMessage',
  'window.goToTask = wrapped',
  'window.goToTaskNotif = wrappedNotif',
  'retireTaskHub',
  'nfa-v6-task-hub-retired',
  'window.nfaOpenTaskLens',
  'window.nfaOpenTaskMessage'
]) requireText(controller, marker, 'Task Message controller');

for (const marker of [
  '@media (min-width:769px) and (pointer:fine)',
  '.nfa-v6-task-hub-retired #tasksPanel',
  '#nfaConversationModeV6',
  '.nfa-task-message-v6',
  '.nfa-v6-task-expanded',
  '.nfa-v6-action-strip',
  '.nfa-v6-inline-action-host',
  '.nfa-v6-create-host',
  '#nfaTaskLensV6',
  '.nfa-v6-lens-filters',
  '.nfa-v6-lens-card',
  '#rightSidebar.nfa-v6-no-task-hub'
]) requireText(css, marker, 'Task Message CSS');

for (const marker of [
  'window.IS_NATIVE',
  'window.innerWidth < 769',
  "'(pointer: coarse)'",
  "import('./desktop-fast-task-hub-v4.js?v=1')"
]) requireText(trailLoader, marker, 'desktop loader chain');

for (const forbidden of [
  'setInterval(',
  'new MutationObserver',
  'MutationObserver(',
  'requestIdleCallback',
  'cloneNode(',
  'nfaCenterWorkspace',
  'desktop-unified-task-composer'
]) {
  if (controller.includes(forbidden)) fail(`controller contains forbidden performance/workspace token ${forbidden}`);
}

for (const forbidden of [
  'desktop-task-messages-v6',
  'nfaTaskLensV6',
  'nfa-task-message-v6'
]) {
  if (mobile.includes(forbidden)) fail(`mobile runtime unexpectedly imports desktop Task Messages: ${forbidden}`);
  if (native.includes(forbidden)) fail(`native bridge directly imports desktop Task Messages: ${forbidden}`);
}

if (failed) process.exit(1);
console.log('Task Message v6 validated: original-message task surface, inline existing task actions, inline conversion form, central Task Lens, Activity-route handoff, retired Task Hub and desktop/native isolation.');
