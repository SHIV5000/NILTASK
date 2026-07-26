import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../js/core/unread-service.js', import.meta.url), 'utf8');
let roomCalls = 0;
let attentionCalls = 0;
let badgeWrites = 0;
const listeners = new Map();
const mobileApp = { id:'mobileApp' };
const document = {
  readyState:'complete',
  visibilityState:'visible',
  getElementById(id) { return id === 'mobileApp' ? mobileApp : null; },
  querySelector() { return null; },
  createElement() { return { style:{}, appendChild(){}, setAttribute(){}, classList:{ add(){} } }; },
  head:{ appendChild(){} },
  documentElement:{ classList:{ add(){} } },
  addEventListener(type, fn) { listeners.set('document:' + type, fn); },
};
const window = {
  innerWidth:390,
  currentUser:{ id:'user-1' },
  currentTenantId:'tenant-1',
  unreadCounts:{ seededRoom:2 },
  isMobileView() { return true; },
  NFA_computeRoomUnread: async (_sb, opts) => {
    roomCalls += 1;
    return { perRoom:{ roomA:3 }, total:3, opts };
  },
  NFA_unreadCount: async (_sb, uid) => {
    attentionCalls += 1;
    return uid === 'user-1' ? 2 : 0;
  },
  addEventListener(type, fn) { listeners.set('window:' + type, fn); },
  dispatchEvent() {},
};
const navigator = {
  setAppBadge() { badgeWrites += 1; },
  clearAppBadge() { badgeWrites += 1; },
};
class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
}
class MutationObserver { observe() {} disconnect() {} }

const context = vm.createContext({
  window, document, navigator, CustomEvent, MutationObserver, console,
  setTimeout, clearTimeout, setInterval, clearInterval, Date, Object, Number, Promise,
});
vm.runInContext(source, context, { filename:'/js/core/unread-service.js' });
await new Promise(resolve => setTimeout(resolve, 130));

assert.equal(window.NILTASK_UnreadService.version, 'v4');
assert.equal(window.NFA_computeRoomUnread.__nfaMobileUnreadHandoff, true);
assert.equal(window.NFA_unreadCount.__nfaMobileUnreadHandoff, true);
let snapshot = window.NILTASK_UnreadService.snapshot();
assert.equal(snapshot.mobileHandoffInstalled, true);
assert.equal(snapshot.mobileUsesExistingQueries, true);
assert.equal(snapshot.mobileOwnPoll, false);
assert.equal(snapshot.mobileRenderPassive, true);
assert.equal(snapshot.perRoom.seededRoom, 2);

await window.NFA_computeRoomUnread({}, { uid:'user-1', tid:'tenant-1' });
await window.NFA_unreadCount({}, 'user-1');
snapshot = window.NILTASK_UnreadService.snapshot();
assert.equal(JSON.stringify(snapshot.perRoom), JSON.stringify({ roomA:3 }));
assert.equal(snapshot.attention, 2);
assert.equal(snapshot.total, 5);
assert.equal(snapshot.mobileRoomObservations, 1);
assert.equal(snapshot.mobileAttentionObservations, 1);
assert.equal(roomCalls, 1);
assert.equal(attentionCalls, 1);

await window.NILTASK_UnreadService.refresh('must-not-query-mobile');
window.NILTASK_UnreadService.refreshSoon('must-not-schedule-mobile', 1);
await new Promise(resolve => setTimeout(resolve, 20));
assert.equal(roomCalls, 1);
assert.equal(attentionCalls, 1);
assert.equal(badgeWrites, 0);

window.currentUser = { id:'user-2' };
window.currentTenantId = 'tenant-2';
await window.NFA_computeRoomUnread({}, { uid:'user-1', tid:'tenant-1' });
snapshot = window.NILTASK_UnreadService.snapshot();
assert.equal(JSON.stringify(snapshot.perRoom), JSON.stringify({ roomA:3 }));
assert.equal(snapshot.userId, 'user-1');
assert.equal(snapshot.tenantId, 'tenant-1');

console.log('Mobile unread handoff behavior passed.');
