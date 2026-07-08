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
