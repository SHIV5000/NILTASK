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

const dock = read('js/desktop-wide-activity-dock-v5.js');
const trail = read('js/desktop-phase1-trail-fix-v3.js');
const mobile = read('js/mobile.js');
const native = read('js/native.js');

assert(dock.includes('MIN_WIDTH = 1180'), 'Activity dock is restricted to wide desktops');
assert(dock.includes("matchMedia?.('(pointer: coarse)')"), 'Coarse-pointer tablets are excluded');
assert(dock.includes('!window.IS_NATIVE'), 'Capacitor/native is excluded');
assert(dock.includes('nfa_activity_dock_visible_v1:'), 'Visibility preference is stored per tenant/user');
assert(dock.includes('window.openActivityFeed'), 'Existing Activity open owner is wrapped');
assert(dock.includes('window.closeActivityFeed'), 'Existing Activity close owner is wrapped');
assert(dock.includes('__nfaPhase1HardeningWrapped'), 'Persistent dock waits for the unread-preserving Activity owner');
assert(dock.includes('openDock({ persist: false })'), 'Wide desktop opens Activity by default without rewriting preference');
assert(dock.includes("action === 'tasks'"), 'Task navigation temporarily releases the right panel');
assert(dock.includes("action === 'chat'"), 'Chat navigation restores the preferred Activity dock');
assert(dock.includes('Hide Activity Feed'), 'A clear user hide control is installed');
assert(dock.includes('nfaSetActivityDockVisible'), 'A stable show/hide entry point is exposed');
assert(!dock.includes('new MutationObserver') && !dock.includes('MutationObserver('), 'No MutationObserver is added');
assert(!dock.includes('setInterval('), 'No new polling loop is added');
assert(!dock.includes("from('notifications')"), 'Activity read/write database ownership is not duplicated');
assert(trail.includes("import('./desktop-wide-activity-dock-v5.js?v=1')"), 'The dock loads after the desktop hardening chain');
assert(!mobile.includes('desktop-wide-activity-dock-v5'), 'Mobile runtime does not import the desktop dock');
assert(!native.includes('desktop-wide-activity-dock-v5'), 'Native bridge does not import the desktop dock directly');

if (process.exitCode) {
  console.error('\nDesktop wide Activity dock validation failed.');
  process.exit(process.exitCode);
}
console.log('\nDesktop wide Activity dock validation passed.');
