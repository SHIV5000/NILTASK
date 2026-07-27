import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('js/core/chat-parity-service.js', 'utf8');

class MiniEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    return true;
  }
}

class MiniCustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; this.target = null; }
}

class MiniClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(value) { return this.values.has(value); }
  add(...values) { values.forEach(value => this.values.add(value)); }
}

let documentRef;
class MiniElement extends MiniEventTarget {
  constructor({ id = '', classes = [], dataset = {}, outerHTML = '' } = {}) {
    super();
    this.id = id;
    this.classList = new MiniClassList(classes);
    this.dataset = { ...dataset };
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.innerHTML = '';
    this.textContent = '';
    this.offsetParent = {};
    this._outerHTML = outerHTML;
    this.insertedHTML = [];
  }
  get outerHTML() {
    return this._outerHTML || `<div${this.id ? ` id="${this.id}"` : ''}>${this.innerHTML}</div>`;
  }
  set outerHTML(value) { this._outerHTML = value; }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    if (child.id) documentRef.register(child);
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter(item => item !== child);
    child.parentElement = null;
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some(child => child.contains(node));
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    return false;
  }
  closest(selector) {
    const selectors = selector.split(',').map(item => item.trim());
    let node = this;
    while (node) {
      for (const item of selectors) {
        if (item.startsWith('#') && node.id === item.slice(1)) return node;
        if (item.startsWith('.') && node.classList.contains(item.slice(1))) return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  querySelector(selector) {
    if (selector.includes(',')) {
      for (const part of selector.split(',')) {
        const result = this.querySelector(part.trim());
        if (result) return result;
      }
      return null;
    }
    const action = selector.match(/^\[data-action="([^"]+)"\](?:\[data-(room|pid)\])?$/);
    if (action) {
      const [_, name, required] = action;
      return this.walk().find(node => node.dataset.action === name && (!required || node.dataset[required])) || null;
    }
    if (selector.startsWith('#')) return this.walk().find(node => node.id === selector.slice(1)) || null;
    if (selector.startsWith('.')) return this.walk().find(node => node.classList.contains(selector.slice(1))) || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector === ':scope > .reply-item') return this.children.filter(child => child.classList.contains('reply-item'));
    if (selector.startsWith('.')) return this.walk().filter(node => node !== this && node.classList.contains(selector.slice(1)));
    return [];
  }
  walk() {
    const result = [this];
    for (const child of this.children) result.push(...child.walk());
    return result;
  }
  insertAdjacentHTML(_position, html) { this.insertedHTML.push(html); }
}

class MiniDocument extends MiniEventTarget {
  constructor() {
    super();
    this.map = new Map();
    this.visibilityState = 'visible';
  }
  register(element) {
    if (element.id) this.map.set(element.id, element);
    return element;
  }
  unregister(id) { this.map.delete(id); }
  getElementById(id) { return this.map.get(id) || null; }
  querySelectorAll(selector) {
    if (selector === '#mMsgArea,#mDMArea,#mThreadArea') {
      return ['mMsgArea','mDMArea','mThreadArea'].map(id => this.getElementById(id)).filter(Boolean);
    }
    if (selector === '[id^="row-"]') {
      return [...this.map.values()].filter(element => element.id.startsWith('row-'));
    }
    return [];
  }
  createElement() { return new MiniElement(); }
}

class MiniMutationObserver {
  constructor(callback) { this.callback = callback; this.active = false; }
  observe() { this.active = true; }
  disconnect() { this.active = false; }
}

const document = new MiniDocument();
documentRef = document;
const local = new Map();
const localStorage = {
  getItem(key) { return local.has(key) ? local.get(key) : null; },
  setItem(key, value) { local.set(key, String(value)); },
  removeItem(key) { local.delete(key); }
};

const mobileApp = document.register(new MiniElement({ id:'mobileApp' }));
const composer = new MiniElement({ classes:['m-ce'] });
const sendGroup = new MiniElement({ dataset:{ action:'sendGroup', room:'staff' } });
const typingArea = document.register(new MiniElement({ id:'mTypingArea' }));
const msgArea = document.register(new MiniElement({ id:'mMsgArea' }));
const msgRow = document.register(new MiniElement({
  id:'row-msg-1', classes:['m-bubble-row'],
  outerHTML:'<div class="m-bubble-row" id="row-msg-1"><div class="m-bubble"><div class="m-btext">Cached message</div></div></div>'
}));
const bubble = new MiniElement({ classes:['m-bubble'] });
const btext = new MiniElement({ classes:['m-btext'] });
bubble.appendChild(btext);
msgRow.appendChild(bubble);
msgArea.appendChild(msgRow);
mobileApp.appendChild(sendGroup);
mobileApp.appendChild(composer);
mobileApp.appendChild(typingArea);
mobileApp.appendChild(msgArea);

let mobileMode = true;
let reactionMap = {
  'msg-1': [{ message_id:'msg-1', user_id:'desktop-user', value:'Noted', type:'tag', count:1 }]
};
const channels = [];
class FakeChannel {
  constructor(topic) { this.topic = topic; this.state = 'closed'; this.handlers = []; this.sent = []; }
  on(type, filter, callback) { this.handlers.push({ type, filter, callback }); return this; }
  subscribe(callback) {
    this.state = 'joined';
    this.subscribeCallback = callback;
    setTimeout(() => callback('SUBSCRIBED'), 0);
    return this;
  }
  send(payload) { this.sent.push(payload); return Promise.resolve('ok'); }
  emit(type, event, payload) {
    for (const handler of this.handlers) {
      if (handler.type === type && handler.filter?.event === event) handler.callback({ payload });
    }
  }
}

const sb = {
  channel(topic) { const channel = new FakeChannel(topic); channels.push(channel); return channel; },
  removeChannel(channel) { channel.state = 'closed'; return Promise.resolve(); },
  from() { throw new Error('fallback query path should not be used in this test'); }
};

const windowTarget = new MiniEventTarget();
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
  MutationObserver: MiniMutationObserver,
  document,
  navigator: { onLine:true },
  localStorage,
  currentUser: { id:'mobile-user', email:'mobile@example.com', full_name:'Mobile User' },
  currentTenantId: 'tenant-1',
  globalUsersCache: [{ id:'mobile-user', full_name:'Mobile User' }],
  currentRoom: 'staff',
  isMobileView: () => mobileMode,
  sb,
  NFA_fetchReactions: async (_sb, ids, tenantId) => {
    assert.equal(tenantId, 'tenant-1');
    const result = {};
    ids.forEach(id => { if (reactionMap[id]) result[id] = reactionMap[id]; });
    return result;
  },
  NILTASK_RealtimeManager: {
    register() {},
    async stopOwner() {}
  },
  escapeHtml(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
});

const context = vm.createContext(windowTarget);
new vm.Script(source, { filename:'/js/core/chat-parity-service.js' }).runInContext(context);
await new Promise(resolve => setTimeout(resolve, 150));

assert.equal(windowTarget.NILTASK_ChatParity.version, 'v2');
assert.equal(channels.length, 1);
const channel = channels[0];
assert.equal(channel.topic, 'niltask-chat-parity-tenant-1');
assert.equal(channel.state, 'joined');

// Mobile typing must publish on the cross-platform topic.
document.dispatchEvent({ type:'input', target:composer });
assert.equal(channel.sent.length, 1);
assert.equal(channel.sent[0].event, 'typing');
assert.equal(channel.sent[0].payload.room, 'staff');
assert.equal(channel.sent[0].payload.tenant_id, 'tenant-1');

// A different user's typing event must paint the mobile typing area.
channel.emit('broadcast', 'typing', {
  room:'staff', uid:'desktop-user', tenant_id:'tenant-1', name:'Desktop User', active:true
});
assert.match(typingArea.innerHTML, /Desktop is typing/);

// A desktop text tag must be normalized and patched onto the mobile message bubble.
await windowTarget.NILTASK_ChatParity.syncReactions(['msg-1']);
const mobileCache = JSON.parse(localStorage.getItem('tenant-1_mob_reactions'));
assert.equal(mobileCache['msg-1'][0].type, 'tag');
assert.equal(mobileCache['msg-1'][0].value, 'Noted');
assert.ok(btext.insertedHTML.some(html => html.includes('Noted')));

// The last rendered mobile rows must restore when the same room opens offline.
windowTarget.NILTASK_ChatParity.processOfflineCache();
const cacheKey = 'niltask_mobile_html_cache:mobile-user:tenant-1:group:staff';
assert.ok(localStorage.getItem(cacheKey));
msgArea.removeChild(msgRow);
document.unregister('row-msg-1');
windowTarget.navigator.onLine = false;
windowTarget.NILTASK_ChatParity.processOfflineCache();
assert.match(msgArea.innerHTML, /Cached message/);
assert.equal(windowTarget.NILTASK_ChatParity.snapshot().offlineRestores, 1);

// Desktop nested replies must gain stable row/footer IDs and reaction controls.
mobileMode = false;
document.unregister('mobileApp');
const shell = document.register(new MiniElement({ id:'chatShellContainer' }));
const replyWrap = document.register(new MiniElement({ id:'rw-parent-1' }));
const replyRow = new MiniElement({ classes:['reply-item'] });
const replyBody = new MiniElement({ classes:['reply-body'] });
replyRow.appendChild(replyBody);
replyWrap.appendChild(replyRow);
shell.appendChild(replyWrap);
windowTarget._roomMsgs = [
  { id:'parent-1', text:'Parent', sender_id:'desktop-user' },
  { id:'reply-1', parent_message_id:'parent-1', text:'Reply', sender_id:'mobile-user' }
];
windowTarget.reactionsCache = {
  'reply-1': [{ message_id:'reply-1', user_id:'mobile-user', value:'Thank You', type:'tag', count:1 }]
};
windowTarget.NILTASK_ChatParity.decorateDesktopReplies();
const footer = document.getElementById('footer-reply-1');
assert.equal(replyRow.id, 'row-reply-1');
assert.ok(footer);
assert.match(footer.innerHTML, /Thank You/);
assert.match(footer.innerHTML, /_showReactionPicker\('reply-1'/);

// Re-running decoration with unchanged state must not rewrite/count the footer again.
const before = windowTarget.NILTASK_ChatParity.snapshot().replyRowsDecorated;
windowTarget.NILTASK_ChatParity.decorateDesktopReplies();
assert.equal(windowTarget.NILTASK_ChatParity.snapshot().replyRowsDecorated, before);

// Canonical DB reconciliation must update a visible reply reaction too.
reactionMap = {
  'reply-1': [{ message_id:'reply-1', user_id:'desktop-user', value:'🔥', type:'emoji', count:1 }]
};
await windowTarget.NILTASK_ChatParity.syncReactions(['reply-1']);
assert.match(footer.innerHTML, /🔥/);

await windowTarget.NILTASK_ChatParity.dispose('test-complete');
assert.equal(windowTarget.NILTASK_ChatParity.snapshot().disposed, true);

console.log('Cross-device chat parity behavioral test passed.');
