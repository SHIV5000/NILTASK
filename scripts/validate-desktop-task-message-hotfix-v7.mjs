import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const assert = (condition, message) => {
  if (!condition) {
    console.error(`✖ ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${message}`);
  }
};

const native = read('js/native.js');
const speedShim = read('desktop-speed-first.js');
const hardeningShim = read('desktop-phase1-hardening.js');
const polishShim = read('desktop-phase1-polish-v2.js');
const trailShim = read('desktop-phase1-trail-fix-v3.js');
const loader = read('js/desktop-fast-task-hub-v4.js');
const hotfix = read('js/desktop-task-messages-v6-hotfix-v7.js');
const mobile = read('js/mobile.js');

try {
  new Function(hotfix);
  console.log('✓ Task Message v7 hotfix syntax is valid');
} catch (error) {
  console.error(`✖ Task Message v7 hotfix syntax is invalid: ${error.message}`);
  process.exitCode = 1;
}

assert(native.includes("import('./desktop-speed-first.js?v=2')"), 'Classic desktop loader still uses its stable root entry');
assert(native.includes("import('./desktop-phase1-hardening.js?v=1')"), 'Classic hardening loader still uses its stable root entry');
assert(native.includes("import('./desktop-phase1-polish-v2.js?v=1')"), 'Classic polish loader still uses its stable root entry');
assert(native.includes("import('./desktop-phase1-trail-fix-v3.js?v=1')"), 'Classic trail loader still uses its stable root entry');
assert(speedShim.includes("./js/desktop-speed-first.js?v=2"), 'Root speed entry resolves to /js desktop controller');
assert(hardeningShim.includes("./js/desktop-phase1-hardening.js?v=1"), 'Root hardening entry resolves to /js controller');
assert(polishShim.includes("./js/desktop-phase1-polish-v2.js?v=1"), 'Root polish entry resolves to /js controller');
assert(trailShim.includes("./js/desktop-phase1-trail-fix-v3.js?v=1"), 'Root trail entry resolves to /js controller');
assert(loader.includes("import('./desktop-task-messages-v6-hotfix-v7.js?v=1')"), 'Task Message loader chains the v7 runtime hardening');
assert(hotfix.includes('Loading sender…'), 'Missing cached sender identity is never painted as Unknown by the hotfix');
assert(hotfix.includes('ensureUsersLoaded'), 'Sender hydration waits for the existing user directory owner');
assert(hotfix.includes('hydrateCurrentRoom'), 'Current room is force-repainted after identity hydration');
assert(hotfix.includes('if (!open.__nfaTaskMessagesV6 || !close.__nfaTaskMessagesV6) return false;'), 'Inline create fix waits for the Task Message owner');
assert(hotfix.includes('restoreCreateCard();\n\n    const modal'), 'Old create hosts are removed before the new inline host is created');
assert(hotfix.includes("modal.classList.add('flex')"), 'Create Task has a visible modal fallback when inline mounting cannot resolve');
assert(hotfix.includes('window.nfaRefreshTaskMessages?.(true)'), 'Task Messages refresh after create/close/save flows');
assert(!hotfix.includes('setInterval('), 'Hotfix adds no persistent polling loop');
assert(!hotfix.includes('new MutationObserver') && !hotfix.includes('MutationObserver('), 'Hotfix adds no MutationObserver');
assert(!hotfix.includes(".from('"), 'Hotfix does not duplicate database mutation/query ownership');
assert(!mobile.includes('desktop-task-messages-v6-hotfix-v7'), 'Mobile runtime does not import the desktop hotfix');

if (process.exitCode) {
  console.error('\nDesktop Task Message v7 hotfix validation failed.');
  process.exit(process.exitCode);
}
console.log('\nDesktop Task Message v7 hotfix validation passed.');
