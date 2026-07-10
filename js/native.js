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
    try {
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
      // Silent channel for muted users: still shows on the lock screen / shade, but
      // no sound and no vibration (importance LOW). send-push targets this channel
      // for recipients whose profiles.notify_muted is true.
      P.PushNotifications.createChannel && P.PushNotifications.createChannel({
        id: 'nfa_silent', name: 'Muted messages',
        description: 'Messages while Do Not Disturb / mute is on',
        importance: 2,     // LOW → no sound, no heads-up; still on the lock screen
        visibility: 1, vibration: false,
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
