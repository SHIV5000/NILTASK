/**
 * Capacitor NATIVE BRIDGE (Phase B).
 *
 * Loaded on the live website. It NO-OPS entirely when not running inside the
 * native app (i.e. plain web + PWA behaviour is 100% unchanged). Only when the
 * page is loaded by the Capacitor Android/iOS shell — which injects
 * `window.Capacitor` and the native plugin bridge — does any of this run.
 *
 * It uses the GLOBAL plugin bridge (window.Capacitor.Plugins.*), NOT npm
 * imports, because in the remote-URL model the page is served from Vercel and
 * the plugins are compiled into the native shell. Classic script (like text.js),
 * loaded before the module scripts.
 */
(function () {
  'use strict';

  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) {
    window.IS_NATIVE = false;
    return; // web / PWA — do nothing
  }
  window.IS_NATIVE = true;
  var P = Cap.Plugins || {};
  // Expose a tiny exit hook for the ES-module mobile shell. The native plugin
  // bridge is only available to this classic script, but the app-level back
  // stack lives in js/mobile.js. Without this bridge, double-back at the mobile
  // root could only call window.close()/about:blank, which leaves Capacitor
  // shells on a blank page instead of closing the Android activity.
  try { window.__nativeExitApp = function () { P.App && P.App.exitApp && P.App.exitApp(); }; } catch (e) {}
  var platform = (Cap.getPlatform && Cap.getPlatform()) || 'android';

  // ── Status bar + splash ────────────────────────────────────────────────
  try { P.StatusBar && P.StatusBar.setBackgroundColor({ color: '#312e81' }); } catch (e) {}
  try { P.StatusBar && P.StatusBar.setStyle({ style: 'DARK' }); } catch (e) {}
  // Hide the splash once the real app has had a moment to paint from the URL.
  setTimeout(function () { try { P.SplashScreen && P.SplashScreen.hide(); } catch (e) {} }, 800);

  // ── Hardware back button → the app's own back navigation ───────────────
  try {
    P.App && P.App.addListener && P.App.addListener('backButton', function () {
      if (typeof window._back === 'function') window._back();
      else if (P.App.exitApp && (!window.history || window.history.length <= 1)) P.App.exitApp();
    });
  } catch (e) {}

  // ── Push: register with FCM/APNs, save the token to Supabase ───────────
  var _tokenSaved = null;
  function saveToken(token) {
    if (!token || _tokenSaved === token) return;
    var uid = window.currentUser && window.currentUser.id;
    var tid = window.currentTenantId;
    if (!uid || !tid || !window.sb) return; // not logged in yet — retried by the poller
    _tokenSaved = token;
    try { window.__lastPushToken = token; } catch (e) {}
    try {
      // A device belongs to exactly ONE signed-in user. Clear any rows that map
      // THIS device token to a DIFFERENT user first — otherwise pushes meant for
      // a previously-signed-in account on this phone keep landing here (the user
      // saw "notifications for messages I sent / other people's chats"). Then
      // upsert the token under the current user.
      window.sb.from('push_tokens').delete().eq('token', token).neq('user_id', uid)
        .then(function () {}, function () {});
      window.sb.from('push_tokens').upsert(
        { user_id: uid, tenant_id: tid, token: token, platform: platform, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      ).then(function () {}, function () { _tokenSaved = null; });
    } catch (e) { _tokenSaved = null; }
  }

  var _lastToken = null;
  function registerPush() {
    if (!P.PushNotifications) return;
    // WhatsApp-style heads-up: Android 8+ only shows a slide-down banner (and full
    // content on the lock screen) when the channel is IMPORTANCE_HIGH + PUBLIC.
    // IMPORTANT: Android freezes a channel's importance at CREATE time — editing an
    // existing channel is ignored. A prior build may have created 'default' at a
    // lower importance, so use a FRESH channel id ('nfa_alerts') to guarantee the
    // high-importance settings actually take effect. send-push targets this id.
    try {
      P.PushNotifications.createChannel && P.PushNotifications.createChannel({
        id: 'nfa_alerts', name: 'Messages & Alerts',
        description: 'Chat messages, mentions, tasks and reminders',
        importance: 5,     // HIGH → heads-up banner slides down from the top
        visibility: 1,     // PUBLIC → shows message content on the lock screen
        sound: 'default', vibration: true, lights: true,
      });
    } catch (e) {}
    // Foreground policy (chosen model): when the app is OPEN, the in-app slide-down
    // banner (driven by realtime in mobile.js) is the single alert — so consume the
    // foreground push here WITHOUT posting anything, killing the duplicate OS +
    // in-app "kiosk". When the app is closed/background the OS shows it (via the
    // notification payload) on the lock screen; that path never reaches this handler.
    P.PushNotifications.addListener('pushNotificationReceived', function () { /* suppress in foreground */ });
    P.PushNotifications.addListener('registration', function (t) {
      _lastToken = (t && t.value) || null;
      saveToken(_lastToken);
    });
    P.PushNotifications.addListener('registrationError', function () {});
    // Tapping a notification opens the exact chat (reuse the existing deep-link).
    P.PushNotifications.addListener('pushNotificationActionPerformed', function (a) {
      var room = a && a.notification && a.notification.data && a.notification.data.room;
      if (!room) return;
      if (typeof window._openRoomByRoom === 'function') window._openRoomByRoom(room);
      else { try { location.href = '/?room=' + encodeURIComponent(room); } catch (e) {} }
    });
    P.PushNotifications.requestPermissions().then(function (r) {
      if (r && r.receive === 'granted') P.PushNotifications.register();
    });
  }
  registerPush();

  // Login is async; keep trying to save the token until the session exists, then
  // re-save if the user/tenant changes (e.g. re-login).
  var _pollUid = null;
  setInterval(function () {
    var uid = window.currentUser && window.currentUser.id;
    if (uid && uid !== _pollUid && _lastToken) { _pollUid = uid; _tokenSaved = null; saveToken(_lastToken); }
  }, 3000);
})();

/* GitHub Primer UI branch loader. Visual only; no application actions are replaced. */
(function () {
  'use strict';
  var STORAGE_KEY = 'niltask_github_primer_theme';
  function loadCss() {
    if (document.getElementById('githubPrimerUiCss')) return;
    var link = document.createElement('link');
    link.id = 'githubPrimerUiCss';
    link.rel = 'stylesheet';
    link.href = './css/github-primer-ui.css?v=1';
    document.head.appendChild(link);
  }
  function apply(theme) {
    var value = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.add('github-primer-ui');
    if (value === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
    var icon = document.querySelector('#githubPrimerThemeToggle i');
    if (icon) icon.className = value === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    var button = document.getElementById('githubPrimerThemeToggle');
    if (button) button.title = value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }
  function current() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function ensureToggle() {
    if (document.getElementById('githubPrimerThemeToggle')) return;
    var chat = document.querySelector('.chat-area');
    var header = chat && chat.firstElementChild;
    var actions = header && header.lastElementChild;
    if (!actions) return;
    var button = document.createElement('button');
    button.id = 'githubPrimerThemeToggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Toggle light and dark theme');
    button.innerHTML = '<i class="fa-solid fa-moon"></i>';
    button.onclick = function () { apply(current() === 'dark' ? 'light' : 'dark'); };
    actions.prepend(button);
    apply(current());
  }
  function enhance() {
    loadCss();
    document.documentElement.classList.add('github-primer-ui');
    ensureToggle();
  }
  loadCss();
  apply(current());
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; enhance(); });
  }
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
