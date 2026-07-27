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

const css = read('css/mobile.css');
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
requireText(css, 'content: "Noted For Action"', 'presentation branding');

// Desktop presentation mapping. These selectors sit on the existing functional DOM.
for (const selector of [
  '.left-sidebar',
  '.right-sidebar',
  '.channel-item',
  '.chat-area',
  '.bubble',
  '.input-container',
  '.quill-wrapper',
  '.jira-card',
  '.task-card',
  '.af-card',
  '.nf-row',
  '.modal-content',
  '.top-panel-dropdown'
]) requireText(css, selector, 'desktop CSS mapping');

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
  '.m-bubble',
  '.m-composer',
  '.m-sendbtn',
  '.af-card',
  '.nf-row',
  '#mSheetInner'
]) requireText(css, selector, 'mobile CSS mapping');

// Behavioural owners must remain present. This validator does not replace the existing
// professionalization/chat/mobile tests; it adds a presentation-to-feature contract.
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
  'renderTasks'
]) requireText(tasks, marker, 'task runtime');

for (const marker of [
  'notification'
]) requireText(notifications.toLowerCase(), marker, 'notification runtime');

// The distinctive layer must stay presentation-only.
for (const forbidden of [
  'supabase.from(',
  'sb.from(',
  'addEventListener(',
  'onclick=',
  'localStorage.',
  'sessionStorage.',
  'fetch('
]) {
  if (css.includes(forbidden)) fail(`presentation CSS unexpectedly contains behaviour token ${forbidden}`);
}

if (!process.exitCode) {
  console.log('Distinctive UI mapping validated: branding, desktop, mobile and behavioural owners are intact.');
}
