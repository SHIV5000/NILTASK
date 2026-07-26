import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const failures = [];
const passes = [];

function filePath(relative) { return path.join(root, relative); }
function read(relative) {
  const absolute = filePath(relative);
  if (!fs.existsSync(absolute)) { failures.push(`Missing required file: ${relative}`); return ''; }
  return fs.readFileSync(absolute, 'utf8');
}
function check(condition, label, detail = '') {
  if (condition) passes.push(label); else failures.push(detail ? `${label}: ${detail}` : label);
}
function contains(source, needle, label) { check(source.includes(needle), label, `expected ${JSON.stringify(needle)}`); }
function excludes(source, needle, label) { check(!source.includes(needle), label, `forbidden ${JSON.stringify(needle)}`); }
function parseJson(relative) {
  const source = read(relative); if (!source) return null;
  try { return JSON.parse(source); } catch (error) { failures.push(`Invalid JSON: ${relative}: ${error.message}`); return null; }
}
function parseClassic(relative) {
  const source = read(relative); if (!source) return;
  try { new vm.Script(source, { filename: relative }); passes.push(`Classic script parses: ${relative}`); }
  catch (error) { failures.push(`Classic script syntax error: ${relative}: ${error.message}`); }
}
function matchValue(source, pattern, label) {
  const match = source.match(pattern); check(Boolean(match?.[1]), label); return match?.[1] || null;
}

const packageJson = parseJson('package.json');
parseJson('manifest.json');
const versionJson = parseJson('version.json');
const indexHtml = read('index.html');
const sharedJs = read('js/shared.js');
const mainJs = read('js/main.js');
const messagesJs = read('js/messages.js');
const uiSettings = read('js/ui-settings.js');
const uiFeed = read('js/ui-feed.js');
const activityCompat = read('js/activity-v208.js');
const textLoader = read('js/utils/text.js');
const realtimeOwners = read('js/core/realtime-feature-owners.js');
const subscriptionGuard = read('js/runtime-subscription-guard.js');
const sessionLifecycle = read('js/core/session-lifecycle.js');
const unreadService = read('js/core/unread-service.js');
const feedCore = read('js/core/feed.js');
const mobileDiagnostics = read('js/core/mobile-runtime-diagnostics.js');
const serviceWorker = read('sw.js');
const pwaNotes = read('PWA_RELEASE_NOTES.md');
const releaseVersioning = read('RELEASE_VERSIONING.md');
const tailwindInput = read('css/tailwind.input.css');
const gitignore = read('.gitignore');
const validationWorkflow = read('.github/workflows/professionalization-validation.yml');

const appVersion = matchValue(sharedJs, /window\.APP_VER\s*=\s*['"]([^'"]+)['"]/, 'Runtime APP_VER is declared');
check(Boolean(versionJson?.v), 'version.json release value is declared');
check(appVersion === versionJson?.v, 'Runtime APP_VER matches version.json', `APP_VER=${appVersion}, version.json=${versionJson?.v}`);
contains(sharedJs, "fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' })", 'Version healer fetches release authority without cache');
contains(sharedJs, "keys.filter(k => k !== 'share-inbox')", 'Version healer preserves share-inbox');
contains(indexHtml, 'meta name="niltask-version" content="v208"', 'HTML shell generation marker remains present');
contains(indexHtml, "window.NILTASK_APP_VERSION = 'v208'", 'HTML shell component version remains present');

const supabaseRef = matchValue(sharedJs, /export const SUPABASE_URL\s*=\s*['"]https:\/\/([^.]+)\.supabase\.co['"]/, 'Supabase project URL is declared');
const anonKey = matchValue(sharedJs, /export const SUPABASE_ANON_KEY\s*=\s*['"]([^'"]+)['"]/, 'Supabase anon key is declared');
let anonPayload = null;
if (anonKey) {
  try {
    const parts = anonKey.split('.');
    check(parts.length === 3, 'Supabase anon key has JWT structure');
    anonPayload = JSON.parse(Buffer.from(parts[1] || '', 'base64url').toString('utf8'));
  } catch (error) { failures.push(`Supabase anon key payload could not be decoded: ${error.message}`); }
}
if (anonPayload) {
  check(anonPayload.ref === supabaseRef, 'Supabase anon key project ref matches SUPABASE_URL', `key ref=${anonPayload.ref}, URL ref=${supabaseRef}`);
  check(anonPayload.role === 'anon', 'Supabase browser key retains anon role', `role=${anonPayload.role}`);
}

contains(uiFeed, 'const _AF_REFRESH_MS = 60000;', 'Activity fallback remains 60 seconds');
contains(uiFeed, "window.NILTASK_ACTIVITY_CONTROLLER_VERSION = 'v1'", 'Source Activity controller marker remains present');
excludes(textLoader, 'activity-feed-stability.js', 'Retired Activity stability loader stays removed');
excludes(textLoader, 'activity-v207.js', 'Retired Activity wrapper loader stays removed');
excludes(activityCompat, 'new MutationObserver', 'Activity compatibility entrypoint constructs no observer');
excludes(activityCompat, 'openActivityFeed =', 'Activity compatibility entrypoint has no function wrapper');
contains(activityCompat, "window.NILTASK_ACTIVITY_UI_VERSION = 'source-owned-layout-v2'", 'Activity layout compatibility marker remains present');

const ownerNames = ['desktop-shared-broadcast','desktop-message-reactions','desktop-scheduled-messages','desktop-notification-rows','desktop-tasks','desktop-task-assignees','desktop-task-trails'];
for (const owner of ownerNames) contains(realtimeOwners, owner, `Realtime owner retained: ${owner}`);
const managedTopicFragments = ["'public:messages-' + current.tenantId","'taskflow-bc-' + current.tenantId","scheduled:'scheduled-changes'","notifications:'notifications-changes'","tasks:'tasks-changes'","assignees:'assignees-changes'","trails:'trails-changes'"];
for (const topic of managedTopicFragments) contains(realtimeOwners, topic, `Managed realtime topic retained: ${topic}`);
contains(realtimeOwners, 'desktop: !window.isMobileView?.()', 'Desktop realtime owners remain mobile-gated');
contains(realtimeOwners, 'rt.register(OWNERS.messages, channel);', 'Managed message channel remains registered');

contains(realtimeOwners, "event:'INSERT', schema:'public', table:'reactions'", 'Managed postgres reaction INSERT remains present');
contains(realtimeOwners, "event:'DELETE', schema:'public', table:'reactions'", 'Managed postgres reaction DELETE remains present');
contains(messagesJs, "isDelete:false, src:'w'", 'Web reaction add remains published to shared cross-platform channel');
contains(messagesJs, "isDelete:true, src:'w'", 'Web reaction remove remains published to shared cross-platform channel');
contains(mainJs, "window._sharedBroadcast?.send({ type: 'broadcast', event: 'typing'", 'Web typing remains published to shared cross-platform channel');
contains(mainJs, "window._sharedBroadcast?.send({ type:'broadcast', event:'group_photo'", 'New-group photo/name remains published to shared cross-platform channel');
contains(uiSettings, "window._sharedBroadcast?.send({ type:'broadcast', event:'group_photo'", 'Group settings remain published to shared cross-platform channel');
contains(subscriptionGuard, "const VERSION = 'v7';", 'Subscription guard component version is v7');
contains(subscriptionGuard, "channel.state === 'joined'", 'Legacy retirement waits for joined replacement channels');
contains(subscriptionGuard, 'replacementChannelsReady(tenantId)', 'Legacy retirement verifies both managed replacements');
contains(subscriptionGuard, "'mpgs-reactions-v1-' + tenantId", 'Legacy reaction topic remains explicitly identified');
contains(subscriptionGuard, 'await manager.removeTopics([legacyTopic], { channel: window._reactionsBroadcast });', 'Legacy reaction channel is removed through RealtimeManager');
contains(subscriptionGuard, 'window._reactionsBroadcast = null;', 'Legacy reaction channel reference is cleared');
contains(subscriptionGuard, 'legacyReactionRetirementScheduled', 'Subscription-start event reports retirement scheduling');
contains(textLoader, 'js/runtime-subscription-guard.js?v=7', 'Bootstrap loads subscription guard v7');

contains(textLoader, 'window.NILTASK_MobileRuntime = Object.freeze({', 'MobileRuntime API is exported');
contains(textLoader, 'function mobileCallsite()', 'Mobile runtime tracks resources by source callsite');
contains(textLoader, '/\\/js\\/mobile(?:-tasks)?\\.js', 'Mobile runtime callsite is limited to mobile modules');
contains(textLoader, 'if (tracked && STATE.stopped) return 0;', 'Stopped mobile runtime blocks new timers and animation frames');
contains(textLoader, "topic.startsWith('mobile-rt-') || topic.startsWith('presence-')", 'Mobile runtime limits channel cleanup to mobile topics');
contains(textLoader, "restartMode: 'page-reload'", 'Mobile runtime advertises reload-only restart');
contains(textLoader, 'window.location.reload();', 'Mobile runtime restart reloads the page');
contains(textLoader, 'window.NILTASK_MOBILE_RUNTIME_VERSION = VERSION;', 'Mobile runtime version marker is exported');
contains(textLoader, 'js/core/session-lifecycle.js?v=4', 'Bootstrap loads session lifecycle v4');
contains(textLoader, 'js/core/mobile-runtime-diagnostics.js?v=3', 'Bootstrap loads mobile diagnostics v3');
contains(textLoader, 'js/core/unread-service.js?v=4', 'Bootstrap loads unread service v4');
contains(sessionLifecycle, "const VERSION = 'v4';", 'Session lifecycle component version is v4');
contains(sessionLifecycle, 'await withTimeout(stopMobileRuntime(reason), 1500);', 'Session cleanup stops mobile runtime');
const mobileStopIndex = sessionLifecycle.indexOf('await withTimeout(stopMobileRuntime(reason), 1500);');
const realtimeStopIndex = sessionLifecycle.indexOf('await withTimeout(stopRealtimeRuntime(), 1800);');
check(mobileStopIndex >= 0 && realtimeStopIndex >= 0 && mobileStopIndex < realtimeStopIndex, 'Mobile runtime stops before general realtime teardown');
contains(sessionLifecycle, 'mobileRuntime: window.NILTASK_MobileRuntime?.snapshot?.() || null', 'Session snapshot includes mobile lifecycle state');
contains(sessionLifecycle, "requestRuntimeReload('tenant-change');", 'Tenant changes reload stopped runtime');
contains(sessionLifecycle, ".finally(() => requestRuntimeReload('user-change'))", 'Account changes reload after cleanup');
contains(sessionLifecycle, "requestRuntimeReload('signed-in-after-cleanup');", 'Same-page sign-in reloads a stopped runtime');
contains(sessionLifecycle, 'reloadingForIdentityChange: STATE.reloadingForIdentityChange', 'Session snapshot reports identity reload state');

contains(unreadService, "const VERSION = 'v4';", 'Unread service component version is v4');
contains(unreadService, 'STATE.total = STATE.roomTotal + clean(STATE.attention);', 'Unread total remains room plus attention');
contains(unreadService, 'function installMobileHandoff()', 'Unread service exposes explicit mobile handoff');
contains(unreadService, 'wrappedRooms.__nfaMobileUnreadHandoff = true;', 'Mobile room helper is observed once');
contains(unreadService, 'wrappedAttention.__nfaMobileUnreadHandoff = true;', 'Mobile attention helper is observed once');
contains(unreadService, 'if (STATE.disposed || isMobileRuntime()) return snapshot();', 'Shared refresh cannot issue a second mobile query');
contains(unreadService, 'if (isMobileRuntime()) return snapshot();', 'Shared scheduled refresh cannot create a mobile poll');
contains(unreadService, 'mobileOwnPoll: false', 'Unread snapshot declares no mobile poll ownership');
contains(unreadService, 'mobileRenderPassive: isMobileRuntime()', 'Unread snapshot declares mobile renderer passivity');
contains(unreadService, 'if (isMobileRuntime() || window.IS_NATIVE) return;', 'Unread OS badge writer remains passive on mobile/native');
contains(unreadService, 'if (userId && current.userId && userId !== current.userId) return false;', 'Mobile unread handoff rejects stale user results');
contains(unreadService, 'if (tenantId && current.tenantId && tenantId !== current.tenantId) return false;', 'Mobile unread handoff rejects stale tenant results');
contains(unreadService, 'STATE.sidebarObserver.observe(target, { childList:true });', 'Unread observer remains scoped to chat list children');
excludes(unreadService, 'document.body', 'Unread service has no body-wide observer');
contains(feedCore, ".not('type', 'in', '(reply,mention,message)')", 'Message/reply/mention attention rows remain excluded');
contains(feedCore, 'const _lastUnreadByUser = new Map();', 'Attention fallback remains isolated per user');

contains(mobileDiagnostics, "const VERSION = 'v3';", 'Mobile diagnostics component version is v3');
contains(mobileDiagnostics, "findTopic(list, 'mobile-rt-')", 'Mobile diagnostic checks main channel topic');
contains(mobileDiagnostics, "findTopic(list, 'presence-')", 'Mobile diagnostic checks presence topic');
contains(mobileDiagnostics, 'sharedUnreadHandoffInstalled', 'Mobile diagnostic verifies unread handoff installation');
contains(mobileDiagnostics, 'sharedUnreadUsesExistingQueries', 'Mobile diagnostic verifies reuse of mobile queries');
contains(mobileDiagnostics, 'sharedUnreadHasNoOwnPoll', 'Mobile diagnostic verifies no second unread poll');
contains(mobileDiagnostics, 'sharedUnreadRenderPassive', 'Mobile diagnostic verifies one mobile renderer');
contains(mobileDiagnostics, 'stoppedRuntimeHasNoTrackedResources', 'Mobile diagnostic verifies stopped resource counts');
contains(mobileDiagnostics, 'stoppedRuntimeHasNoMobileChannels', 'Mobile diagnostic verifies stopped channel counts');
contains(mobileDiagnostics, 'desktopOwnersAbsent: desktopFeatureOwners.length === 0', 'Mobile diagnostic enforces desktop-owner absence');
contains(mobileDiagnostics, 'window.NILTASK_printMobileRuntimeSnapshot = print;', 'Mobile runtime print command remains exported');

const dynamicAssets = [...textLoader.matchAll(/load\([^,]+,\s*'([^']+\?v=\d+)'/g)].map(match => match[1]);
check(dynamicAssets.length >= 8, 'Dynamic runtime asset inventory found', `found ${dynamicAssets.length}`);
check(new Set(dynamicAssets).size === dynamicAssets.length, 'Dynamic runtime assets are unique');
for (const asset of dynamicAssets) contains(serviceWorker, `'/${asset}'`, `PWA precaches exact dynamic asset: ${asset}`);
const cacheMatch = serviceWorker.match(/const CACHE = '([^']+)'/);
check(Boolean(cacheMatch), 'Service-worker cache version is declared');
if (cacheMatch) {
  contains(pwaNotes, cacheMatch[1], 'PWA release notes match service-worker cache version');
  contains(releaseVersioning, cacheMatch[1], 'Release-version contract matches service-worker cache version');
}
contains(serviceWorker, "k !== 'share-inbox'", 'PWA activation preserves share-inbox');
contains(serviceWorker, "fetch(e.request, { cache: 'no-store' })", 'PWA navigation remains network-first');
contains(serviceWorker, "'/version.json'", 'PWA app shell includes version.json');

check(packageJson?.scripts?.['validate:professionalization'] === 'node scripts/validate-professionalization.mjs', 'Package exposes professionalization validation script');
check(packageJson?.scripts?.['test:mobile-runtime'] === 'node scripts/test-mobile-runtime-lifecycle.mjs', 'Package exposes mobile lifecycle behavioral test');
check(packageJson?.scripts?.['test:mobile-unread'] === 'node scripts/test-mobile-unread-handoff.mjs', 'Package exposes mobile unread behavioral test');
contains(validationWorkflow, 'npm run test:mobile-runtime', 'CI runs mobile lifecycle behavioral test');
contains(validationWorkflow, 'npm run test:mobile-unread', 'CI runs mobile unread behavioral test');
check(packageJson?.scripts?.['build:tailwind'] === 'npx @tailwindcss/cli -i ./css/tailwind.input.css -o ./css/tailwind.generated.css --minify', 'Package exposes pinned Tailwind build command');
check(packageJson?.scripts?.['validate:tailwind'] === 'npm run build:tailwind && node scripts/validate-tailwind-build.mjs', 'Package exposes Tailwind output validation command');
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

for (const relative of ['js/utils/text.js','js/core/realtime-manager.js','js/core/realtime-feature-owners.js','js/core/session-lifecycle.js','js/core/runtime-diagnostics.js','js/core/mobile-runtime-diagnostics.js','js/core/unread-service.js','js/runtime-subscription-guard.js','js/notification-presentation-service.js','js/compact-panel-filters.js','js/activity-v208.js','sw.js']) parseClassic(relative);

if (failures.length) {
  console.error(`\nProfessionalization validation FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\nPassed checks: ${passes.length}`);
  process.exit(1);
}
console.log(`Professionalization validation passed: ${passes.length} checks.`);
