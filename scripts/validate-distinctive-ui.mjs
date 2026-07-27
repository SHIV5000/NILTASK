import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => {
  console.error(`Distinctive UI validation failed: ${message}`);
  process.exitCode = 1;
};
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${JSON.stringify(needle)}`);
};

const legacyCss = read('css/mobile.css');
const v2Css = read('css/distinctive-ui-v2.css');
const adapter = read('js/distinctive-ui-v2.js');
const nativeBridge = read('js/native.js');
const index = read('index.html');
const mobile = read('js/mobile.js');
const main = read('js/main.js');
const tasks = read('js/tasks.js');
const notifications = read('js/notifications.js');
const manifest = JSON.parse(read('manifest.json'));
const capacitor = JSON.parse(read('capacitor.config.json'));
const nativePlaceholder = read('www/index.html');

// Universal user-facing product identity. Technical package IDs deliberately stay stable.
if (manifest.name !== 'Noted For Action') fail('manifest.name must be Noted For Action');
if (manifest.short_name !== 'Noted For Action') fail('manifest.short_name must be Noted For Action');
if (capacitor.appName !== 'Noted For Action') fail('Capacitor appName must be Noted For Action');
if (capacitor.appId !== 'in.niltask.app') fail('production package ID changed unexpectedly');
requireText(index, '<title>Noted For Action</title>', 'index.html');
requireText(nativePlaceholder, '<title>Noted For Action</title>', 'www/index.html');
requireText(legacyCss, 'content: "Noted For Action"', 'legacy presentation branding');
requireText(nativeBridge, './js/distinctive-ui-v2.js?v=212', 'presentation adapter loader');

// Simulation-matched structural layer must be present without replacing existing owners.
for (const marker of [
  'nfa-action-rail',
  'nfa-workstream-heading',
  'nfa-context-heading',
  'nfa-desktop-shell',
  'nfa-conversation',
  'nfa-timeline',
  'nfa-mobile-brand-mark',
  'nfa-mobile-dock'
]) requireText(v2Css, marker, 'v2 presentation CSS');

for (const marker of [
  'createRail',
  'decorateDesktop',
  'decorateMobile',
  'nfaActionRail',
  "classList.add('nfa-conversation')",
  "classList.add('nfa-timeline')",
  "call('openActivityFeed')",
  "call('openTopPanel', 'scheduled')",
  "call('openTopPanel', 'bookmarks')",
  "call('openSettings')",
  "call('toggleRightSidebar')"
]) requireText(adapter, marker, 'v2 presentation adapter');

// Desktop presentation mapping. The adapter attaches the new classes to the
// original functional DOM; the original identifiers remain in main.js.
for (const selector of [
  '#leftSidebar',
  '#chatsList',
  '.channel-item',
  '.nfa-conversation',
  '.nfa-timeline',
  '.row-sent',
  '.row-rcvd',
  '.bubble',
  '#sendBtn',
  '#rightSidebar',
  '#tasksPanel',
  '.jira-card',
  '.task-card',
  '.af-card',
  '.nf-row',
  '.modal-content',
  '.top-panel-dropdown'
]) requireText(v2Css, selector, 'desktop v2 CSS mapping');

for (const originalSelector of [
  'id="leftSidebar"',
  'class="flex-1 flex flex-col relative min-w-0 chat-area"',
  'id="messagesContainer"',
  'id="rightSidebar"',
  'id="sendBtn"'
]) requireText(main, originalSelector, 'original desktop DOM contract');

// Mobile presentation mapping. All current screens continue to be rendered by mobile.js.
for (const selector of [
  '#mobileApp',
  '#mSB',
  '#mStage',
  '#mNav',
  '.mn-btn',
  '.m-hdr',
  '.m-row',
  '.m-msgs',
  '.m-bubble-row',
  '.m-bubble',
  '.m-composer',
  '.m-sendbtn',
  '.af-card',
  '.nf-row',
  '#mSheetInner'
]) requireText(v2Css, selector, 'mobile v2 CSS mapping');

// Behavioural owners must remain present. The visual adapter may call their public
// actions, but it must never query or mutate backend/session data itself.
for (const marker of [
  'startSubscriptions',
  'renderMessages',
  'loadChatsList'
]) requireText(main, marker, 'desktop runtime');

for (const marker of [
  'initMobileApp',
  '_initRealtime',
  '_bubbleHTML',
  '_navTo',
  '_render',
  '_ctx'
]) requireText(mobile, marker, 'mobile runtime');

for (const marker of [
  'createTask',
  'loadTasks'
]) requireText(tasks, marker, 'task runtime');

requireText(notifications.toLowerCase(), 'notification', 'notification runtime');

for (const forbidden of [
  'supabase.from(',
  'sb.from(',
  'localStorage.',
  'sessionStorage.',
  'indexedDB.',
  "fetch('/rest/",
  '.insert(',
  '.update(',
  '.delete('
]) {
  if (adapter.includes(forbidden)) fail(`presentation adapter unexpectedly contains data token ${forbidden}`);
}

for (const forbidden of [
  'supabase.from(',
  'sb.from(',
  'addEventListener(',
  'onclick=',
  'localStorage.',
  'sessionStorage.',
  'fetch('
]) {
  if (v2Css.includes(forbidden)) fail(`presentation CSS unexpectedly contains behaviour token ${forbidden}`);
}

if (!process.exitCode) {
  console.log('Distinctive UI v2 validated: simulation structure, branding, desktop/mobile mappings and runtime owners are intact.');
}
