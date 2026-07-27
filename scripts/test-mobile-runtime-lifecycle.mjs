import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'js/utils/text.js'), 'utf8');

class FakeEventTarget {
  constructor() { this._listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) {
    this._listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event) {
    for (const listener of this._listeners.get(event.type) || []) listener.call(this, event);
    return true;
  }
}

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.connected = false;
  }
  observe() { this.connected = true; }
  disconnect() { this.connected = false; }
}

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const sandbox = new FakeEventTarget();
const document = new FakeEventTarget();
const visualViewport = new FakeEventTarget();
const serviceWorker = new FakeEventTarget();
let reloads = 0;
const storage = new Map();

Object.assign(document, {
  readyState: 'complete',
  body: {},
  head: { appendChild() {} },
  querySelector() { return null; },
  createElement() { return { dataset: {}, style: {}, appendChild() {} }; },
  getElementById() { return null; },
});

Object.assign(sandbox, {
  window: sandbox,
  globalThis: sandbox,
  document,
  visualViewport,
  EventTarget: FakeEventTarget,
  MutationObserver: FakeMutationObserver,
  CustomEvent: FakeCustomEvent,
  navigator: { serviceWorker },
  location: { reload() { reloads += 1; } },
  sessionStorage: {
    setItem(key, value) { storage.set(key, String(value)); },
    getItem(key) { return storage.get(key) ?? null; },
  },
  console,
  Error,
  Date,
  Promise,
  Set,
  Map,
  Array,
  Object,
  Boolean,
  Number,
  String,
  RegExp,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame(callback) { return setTimeout(() => callback(Date.now()), 50); },
  cancelAnimationFrame(handle) { clearTimeout(handle); },
});

document.defaultView = sandbox;
vm.createContext(sandbox);
new vm.Script(source, { filename: '/js/utils/text.js' }).runInContext(sandbox);

assert.ok(sandbox.NILTASK_MobileRuntime, 'MobileRuntime should be exported by early bootstrap');
assert.equal(sandbox.NILTASK_MobileRuntime.snapshot().stopped, false);

const channels = [
  { topic: 'realtime:mobile-rt-tenant-a', state: 'joined', async unsubscribe() {} },
  { topic: 'realtime:presence-tenant-a', state: 'joined', async unsubscribe() {} },
  { topic: 'realtime:public:messages-tenant-a', state: 'joined', async unsubscribe() {} },
];
sandbox.sb = {
  getChannels() { return channels; },
  async removeChannel(channel) {
    const index = channels.indexOf(channel);
    if (index >= 0) channels.splice(index, 1);
  },
};

new vm.Script(`
  window.__mobileListener = function () {};
  window.__mobileTimeout = setTimeout(function () {}, 60000);
  window.__mobileInterval = setInterval(function () {}, 60000);
  window.__mobileRaf = requestAnimationFrame(function () {});
  window.addEventListener('online', window.__mobileListener);
  window.__mobileObserver = new MutationObserver(function () {});
  window.__mobileObserver.observe(document.body, { childList: true });
`, { filename: '/js/mobile.js' }).runInContext(sandbox);

const before = sandbox.NILTASK_MobileRuntime.snapshot();
assert.ok(before.tracked.timeouts >= 1, 'mobile timeout should be tracked');
assert.ok(before.tracked.intervals >= 1, 'mobile interval should be tracked');
assert.ok(before.tracked.animationFrames >= 1, 'mobile animation frame should be tracked');
assert.ok(before.tracked.listeners >= 1, 'mobile persistent listener should be tracked');
assert.ok(before.tracked.observers >= 1, 'mobile observer should be tracked');
assert.equal(before.channels.length, 2, 'only mobile and presence channels should be lifecycle-owned');

await sandbox.NILTASK_MobileRuntime.stop('test-stop');
const stopped = sandbox.NILTASK_MobileRuntime.snapshot();
assert.equal(stopped.stopped, true);
assert.deepEqual(
  Object.fromEntries(Object.entries(stopped.tracked).map(([key, value]) => [key, Number(value)])),
  { timeouts: 0, intervals: 0, animationFrames: 0, listeners: 0, observers: 0 },
  'all tracked mobile resources should be cleared'
);
assert.equal(stopped.channels.length, 0, 'mobile channels should be removed');
assert.equal(channels.length, 1, 'non-mobile channel should remain');
assert.equal(channels[0].topic, 'realtime:public:messages-tenant-a');
assert.equal(stopped.lastStop.reason, 'test-stop');
assert.equal(stopped.restartMode, 'page-reload');
assert.equal(sandbox.__mobileObserver.connected, false, 'tracked observer should be disconnected');

new vm.Script(`window.__blockedMobileTimer = setTimeout(function () {}, 1000);`, {
  filename: '/js/mobile.js',
}).runInContext(sandbox);
assert.equal(sandbox.__blockedMobileTimer, 0, 'stopped mobile runtime should reject reconnect timers');

new vm.Script(`window.__desktopTimer = setTimeout(function () {}, 60000);`, {
  filename: '/js/main.js',
}).runInContext(sandbox);
assert.notEqual(sandbox.__desktopTimer, 0, 'non-mobile timer should retain native behavior');
clearTimeout(sandbox.__desktopTimer);

sandbox.NILTASK_MobileRuntime.start('test-restart');
assert.equal(reloads, 1, 'restart should reload exactly once');
assert.equal(storage.get('niltask_mobile_restart_reason'), 'test-restart');

console.log('Mobile runtime lifecycle behavioral test passed.');
