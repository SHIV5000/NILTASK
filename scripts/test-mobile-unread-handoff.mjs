import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'js/core/unread-service.js'), 'utf8');

class MiniEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event) {
    event.target = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return true;
  }
}

class MiniCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const windowTarget = new MiniEventTarget();
let roomQueries = 0;
let attentionQueries = 0;
let badgeWrites = 0;

const originalComputeRoomUnread = async (_sb, opts) => {
  roomQueries += 1;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(opts.uid, 'mobile-user');
  assert.equal(opts.tid, 'school-tenant');
  return { perRoom: { staff: 2, dm_mobile_user_other: 1 }, total: 3 };
};

const originalUnreadCount = async (_sb, userId) => {
  attentionQueries += 1;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(userId, 'mobile-user');
  return 4;
};

Object.assign(windowTarget, {
  window: windowTarget,
  globalThis: windowTarget,
  console,
  Date,
  Promise,
  Object,
  Number,
  String,
  Boolean,
  Math,
  Set,
  Map,
  Array,
  Error,
  JSON,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  CustomEvent: MiniCustomEvent,
  innerWidth: 390,
  IS_NATIVE: false,
  __mobThemeLock: true,
  isMobileView: () => true,
  currentUser: { id: 'mobile-user' },
  currentTenantId: 'school-tenant',
  unreadCounts: { staff: 5 },
  sb: { marker: 'supabase-client' },
  NFA_computeRoomUnread: originalComputeRoomUnread,
  NFA_unreadCount: originalUnreadCount,
  navigator: {
    setAppBadge() { badgeWrites += 1; },
    clearAppBadge() { badgeWrites += 1; },
  },
  logger: { logError(error) { throw error; } },
});

windowTarget.document = Object.assign(new MiniEventTarget(), {
  readyState: 'complete',
  visibilityState: 'visible',
  getElementById(id) { return id === 'mobileApp' ? { id } : null; },
  querySelector() { return null; },
  createElement() {
    return { style:{}, classList:{ add() {} }, appendChild() {}, setAttribute() {} };
  },
  head: { appendChild() {} },
  documentElement: { classList:{ add() {} } },
});

const context = vm.createContext(windowTarget);
new vm.Script(source, { filename:'/js/core/unread-service.js' }).runInContext(context);

assert.equal(windowTarget.NILTASK_UnreadService.version, 'v4');
assert.equal(windowTarget.NFA_computeRoomUnread.__nfaUnreadServiceMobileAdapter, true);
assert.equal(windowTarget.NFA_unreadCount.__nfaUnreadServiceMobileAdapter, true);

// mobile.js invokes these two paths together from its existing fallback/reconnect
// cadence. They must share one in-flight UnreadService.refresh() operation.
const attentionPromise = windowTarget.NFA_unreadCount(windowTarget.sb, 'mobile-user');
const roomPromise = windowTarget.NFA_computeRoomUnread(windowTarget.sb, {
  uid:'mobile-user', tid:'school-tenant'
});
const [attention, rooms] = await Promise.all([attentionPromise, roomPromise]);

assert.equal(attention, 4);
assert.deepEqual({ ...rooms.perRoom }, { staff:2, dm_mobile_user_other:1 });
assert.equal(roomQueries, 1, 'paired mobile calls must perform one room query');
assert.equal(attentionQueries, 1, 'paired mobile calls must perform one attention query');

// A second deferred refresh here would create an extra cadence hidden behind the
// existing six-second mobile fallback. Coalescing must not set the desktop pending flag.
await new Promise(resolve => setTimeout(resolve, 180));
assert.equal(roomQueries, 1, 'mobile coalescing must not schedule a second room query');
assert.equal(attentionQueries, 1, 'mobile coalescing must not schedule a second attention query');

const snapshot = windowTarget.NILTASK_UnreadService.snapshot();
assert.equal(snapshot.mobileHandoff, true);
assert.equal(snapshot.mobileHandoffInstalled, true);
assert.equal(snapshot.mobileAdaptersInstalled, true);
assert.equal(snapshot.passiveMobile, false);
assert.equal(snapshot.mobileUsesExistingQueries, false);
assert.equal(snapshot.mobileUsesSharedRefresh, true);
assert.equal(snapshot.mobileOwnPoll, false);
assert.equal(snapshot.mobileOwnsPolling, false);
assert.equal(snapshot.mobileOwnsRendering, false);
assert.equal(snapshot.mobileOwnsAppBadge, false);
assert.equal(snapshot.roomTotal, 3);
assert.equal(snapshot.attention, 4);
assert.equal(snapshot.total, 7);
assert.equal(snapshot.mobileRefreshCount, 1);
assert.equal(snapshot.mobileCoalescedCalls, 1);
assert.equal(snapshot.mobileRoomObservations, 1);
assert.equal(snapshot.mobileAttentionObservations, 1);
assert.ok(snapshot.mobileEventConsumedAt);
assert.equal(windowTarget.NILTASK_MobileUnreadState.total, 7);
assert.equal(badgeWrites, 0, 'shared service must not write the mobile app badge');

// The shared query result must not overwrite the mobile live provisional floor;
// mobile.js still merges DB truth with realtime increments and zeros the open room.
assert.equal(windowTarget.unreadCounts.staff, 5);

const roomAdapter = windowTarget.NFA_computeRoomUnread;
const attentionAdapter = windowTarget.NFA_unreadCount;
windowTarget.NILTASK_UnreadService.dispose();
assert.notEqual(windowTarget.NFA_computeRoomUnread, roomAdapter);
assert.notEqual(windowTarget.NFA_unreadCount, attentionAdapter);
assert.equal(windowTarget.NFA_computeRoomUnread, originalComputeRoomUnread);
assert.equal(windowTarget.NFA_unreadCount, originalUnreadCount);

console.log('Mobile unread handoff behavioral test passed.');
