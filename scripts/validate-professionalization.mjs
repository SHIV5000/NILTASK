import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const failures = [];
const passes = [];

function filePath(relative) {
  return path.join(root, relative);
}

function read(relative) {
  const absolute = filePath(relative);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relative}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function check(condition, label, detail = '') {
  if (condition) passes.push(label);
  else failures.push(detail ? `${label}: ${detail}` : label);
}

function contains(source, needle, label) {
  check(source.includes(needle), label, `expected ${JSON.stringify(needle)}`);
}

function excludes(source, needle, label) {
  check(!source.includes(needle), label, `forbidden ${JSON.stringify(needle)}`);
}

function parseJson(relative) {
  const source = read(relative);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch (error) {
    failures.push(`Invalid JSON: ${relative}: ${error.message}`);
    return null;
  }
}

function parseClassic(relative) {
  const source = read(relative);
  if (!source) return;
  try {
    new vm.Script(source, { filename: relative });
    passes.push(`Classic script parses: ${relative}`);
  } catch (error) {
    failures.push(`Classic script syntax error: ${relative}: ${error.message}`);
  }
}

const packageJson = parseJson('package.json');
parseJson('manifest.json');
parseJson('version.json');

const indexHtml = read('index.html');
const uiFeed = read('js/ui-feed.js');
const activityCompat = read('js/activity-v208.js');
const textLoader = read('js/utils/text.js');
const realtimeOwners = read('js/core/realtime-feature-owners.js');
const unreadService = read('js/core/unread-service.js');
const feedCore = read('js/core/feed.js');
const mobileDiagnostics = read('js/core/mobile-runtime-diagnostics.js');
const serviceWorker = read('sw.js');
const pwaNotes = read('PWA_RELEASE_NOTES.md');
const tailwindInput = read('css/tailwind.input.css');
const gitignore = read('.gitignore');
const validationWorkflow = read('.github/workflows/professionalization-validation.yml');

contains(uiFeed, 'const _AF_REFRESH_MS = 60000;', 'Activity fallback remains 60 seconds');
contains(uiFeed, "window.NILTASK_ACTIVITY_CONTROLLER_VERSION = 'v1'", 'Source Activity controller marker remains present');
excludes(textLoader, 'activity-feed-stability.js', 'Retired Activity stability loader stays removed');
excludes(textLoader, 'activity-v207.js', 'Retired Activity wrapper loader stays removed');
excludes(activityCompat, 'new MutationObserver', 'Activity compatibility entrypoint constructs no observer');
excludes(activityCompat, 'openActivityFeed =', 'Activity compatibility entrypoint has no function wrapper');
contains(activityCompat, "window.NILTASK_ACTIVITY_UI_VERSION = 'source-owned-layout-v2'", 'Activity layout compatibility marker remains present');

const ownerNames = [
  'desktop-shared-broadcast',
  'desktop-message-reactions',
  'desktop-scheduled-messages',
  'desktop-notification-rows',
  'desktop-tasks',
  'desktop-task-assignees',
  'desktop-task-trails',
];
for (const owner of ownerNames) contains(realtimeOwners, owner, `Realtime owner retained: ${owner}`);

const managedTopicFragments = [
  "'public:messages-' + current.tenantId",
  "'taskflow-bc-' + current.tenantId",
  "scheduled:'scheduled-changes'",
  "notifications:'notifications-changes'",
  "tasks:'tasks-changes'",
  "assignees:'assignees-changes'",
  "trails:'trails-changes'",
];
for (const topic of managedTopicFragments) contains(realtimeOwners, topic, `Managed realtime topic retained: ${topic}`);
contains(realtimeOwners, 'desktop: !window.isMobileView?.()', 'Desktop realtime owners remain mobile-gated');
contains(realtimeOwners, 'rt.register(OWNERS.messages, channel);', 'Managed message channel remains registered');

contains(unreadService, 'STATE.total = STATE.roomTotal + clean(STATE.attention);', 'Unread total remains room plus attention');
contains(unreadService, 'if (isMobileRuntime()) return;', 'Unread renderer remains passive on mobile');
contains(unreadService, 'if (isMobileRuntime() || window.IS_NATIVE) return;', 'Unread app-badge writer remains passive on mobile/native');
contains(unreadService, 'STATE.sidebarObserver.observe(target, { childList:true });', 'Unread observer remains scoped to chat list children');
excludes(unreadService, 'document.body', 'Unread service has no body-wide observer');
contains(feedCore, ".not('type', 'in', '(reply,mention,message)')", 'Message/reply/mention attention rows remain excluded');
contains(feedCore, 'const _lastUnreadByUser = new Map();', 'Attention fallback remains isolated per user');

contains(mobileDiagnostics, "findTopic(list, 'mobile-rt-')", 'Mobile diagnostic checks main channel topic');
contains(mobileDiagnostics, "findTopic(list, 'presence-')", 'Mobile diagnostic checks presence topic');
contains(mobileDiagnostics, 'desktopOwnersAbsent: desktopFeatureOwners.length === 0', 'Mobile diagnostic enforces desktop-owner absence');
contains(mobileDiagnostics, 'window.NILTASK_printMobileRuntimeSnapshot = print;', 'Mobile runtime print command remains exported');

const dynamicAssets = [...textLoader.matchAll(/load\([^,]+,\s*'([^']+\?v=\d+)'/g)].map(match => match[1]);
check(dynamicAssets.length >= 8, 'Dynamic runtime asset inventory found', `found ${dynamicAssets.length}`);
check(new Set(dynamicAssets).size === dynamicAssets.length, 'Dynamic runtime assets are unique');
for (const asset of dynamicAssets) {
  contains(serviceWorker, `'/${asset}'`, `PWA precaches exact dynamic asset: ${asset}`);
}

const cacheMatch = serviceWorker.match(/const CACHE = '([^']+)'/);
check(Boolean(cacheMatch), 'Service-worker cache version is declared');
if (cacheMatch) contains(pwaNotes, cacheMatch[1], 'PWA release notes match service-worker cache version');
contains(serviceWorker, "k !== 'share-inbox'", 'PWA activation preserves share-inbox');
contains(serviceWorker, "fetch(e.request, { cache: 'no-store' })", 'PWA navigation remains network-first');

check(
  packageJson?.scripts?.['validate:professionalization'] === 'node scripts/validate-professionalization.mjs',
  'Package exposes professionalization validation script'
);
check(
  packageJson?.scripts?.['build:tailwind'] === 'npx @tailwindcss/cli -i ./css/tailwind.input.css -o ./css/tailwind.generated.css --minify',
  'Package exposes pinned Tailwind build command'
);
check(
  packageJson?.scripts?.['validate:tailwind'] === 'npm run build:tailwind && node scripts/validate-tailwind-build.mjs',
  'Package exposes Tailwind output validation command'
);
check(packageJson?.devDependencies?.tailwindcss === '4.3.0', 'Tailwind dependency is pinned to 4.3.0');
check(packageJson?.devDependencies?.['@tailwindcss/cli'] === '4.3.0', 'Tailwind CLI dependency is pinned to 4.3.0');
contains(tailwindInput, '@import "tailwindcss" source(none);', 'Tailwind build disables implicit source detection');
contains(tailwindInput, '@source "../index.html";', 'Tailwind build scans index.html');
contains(tailwindInput, '@source "../js";', 'Tailwind build scans JavaScript renderers');
contains(tailwindInput, '@source "../www";', 'Tailwind build scans the local Capacitor shell');
contains(gitignore, 'css/tailwind.generated.css', 'Generated Tailwind verification CSS remains untracked');
contains(validationWorkflow, 'npm run validate:tailwind', 'CI validates the compiled Tailwind output');
contains(indexHtml, '<script src="https://cdn.tailwindcss.com"></script>', 'Tailwind CDN remains until visual parity acceptance');
excludes(indexHtml, 'tailwind.generated.css', 'Unaccepted generated Tailwind CSS is not linked in production');

for (const relative of [
  'js/core/realtime-manager.js',
  'js/core/realtime-feature-owners.js',
  'js/core/session-lifecycle.js',
  'js/core/runtime-diagnostics.js',
  'js/core/mobile-runtime-diagnostics.js',
  'js/core/unread-service.js',
  'js/runtime-subscription-guard.js',
  'js/notification-presentation-service.js',
  'js/compact-panel-filters.js',
  'js/activity-v208.js',
  'sw.js',
]) parseClassic(relative);

if (failures.length) {
  console.error(`\nProfessionalization validation FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\nPassed checks: ${passes.length}`);
  process.exit(1);
}

console.log(`Professionalization validation passed: ${passes.length} checks.`);
