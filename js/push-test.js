import { sb } from './shared.js';

const VAPID_PUBLIC = 'BC1e4iEc-QRWZB2pugDZCElyEFWTja-XS_L0Ij_1gq1Ox2zs6s1gMOSF-k7Leu70yJw81jHChVIvltxOuDGlQEM';

const checksEl = document.getElementById('checks');
const logEl = document.getElementById('log');
const enableBtn = document.getElementById('enableBtn');
const refreshBtn = document.getElementById('refreshBtn');
const fcmWarning = document.getElementById('fcmWarning');

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  logEl.textContent = `[${ts}] ${msg}\n` + (logEl.textContent === 'Waiting…' ? '' : logEl.textContent);
}

function b64ToUint8(base64) {
  const padding = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function addCheck(label, state, detail = '') {
  const row = document.createElement('div');
  row.className = 'row';
  const left = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'label';
  title.textContent = label;
  left.appendChild(title);
  if (detail) {
    const d = document.createElement('div');
    d.className = 'detail';
    d.textContent = detail;
    left.appendChild(d);
  }
  const pill = document.createElement('div');
  pill.className = 'pill ' + (state === 'pass' ? 'ok' : state === 'fail' ? 'bad' : 'warn');
  pill.textContent = state === 'pass' ? 'PASS' : state === 'fail' ? 'FAIL' : 'CHECK';
  row.append(left, pill);
  checksEl.appendChild(row);
}

async function getContext() {
  const result = {
    secure: window.isSecureContext,
    swSupported: 'serviceWorker' in navigator,
    pushSupported: 'PushManager' in window,
    notifSupported: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    installed: matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true,
    session: null,
    tenantId: null,
    profileLabel: '',
    registration: null,
    subscription: null,
    serverRegistered: false,
    serverError: '',
    hasNativeToken: false,
    nativeTokenCheckKnown: false,
  };

  try {
    const { data: { session } } = await sb.auth.getSession();
    result.session = session || null;
    if (session?.user?.id) {
      const { data: profile } = await sb.from('profiles')
        .select('tenant_id,full_name,email')
        .eq('id', session.user.id)
        .maybeSingle();
      result.tenantId = profile?.tenant_id || null;
      result.profileLabel = profile?.full_name || profile?.email || session.user.email || session.user.id;
    }
  } catch (e) {
    log('Auth/profile check failed: ' + (e?.message || e));
  }

  if (result.swSupported) {
    try {
      result.registration = await navigator.serviceWorker.getRegistration('/');
      if (!result.registration) {
        result.registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      }
      await navigator.serviceWorker.ready;
    } catch (e) {
      log('Service worker check failed: ' + (e?.message || e));
    }
  }

  if (result.registration?.pushManager) {
    try {
      result.subscription = await result.registration.pushManager.getSubscription();
    } catch (e) {
      log('Subscription read failed: ' + (e?.message || e));
    }
  }

  if (result.session?.user?.id && result.subscription?.endpoint) {
    try {
      const { data, error } = await sb.from('push_subscriptions')
        .select('endpoint,user_id,tenant_id')
        .eq('endpoint', result.subscription.endpoint)
        .maybeSingle();
      if (error) result.serverError = error.message || String(error);
      result.serverRegistered = !!data;
    } catch (e) {
      result.serverError = e?.message || String(e);
    }
  }

  if (result.session?.user?.id) {
    try {
      const { data, error } = await sb.from('push_tokens')
        .select('user_id')
        .eq('user_id', result.session.user.id)
        .limit(1);
      if (!error) {
        result.nativeTokenCheckKnown = true;
        result.hasNativeToken = Array.isArray(data) && data.length > 0;
      }
    } catch (_) {}
  }

  return result;
}

async function renderDiagnostics() {
  checksEl.innerHTML = '';
  const c = await getContext();

  addCheck('HTTPS / secure context', c.secure ? 'pass' : 'fail', location.origin);
  addCheck('Service Worker support', c.swSupported ? 'pass' : 'fail', c.registration ? 'Registration found/ready' : 'No active registration');
  addCheck('Push API support', c.pushSupported ? 'pass' : 'fail');
  addCheck('Notification API support', c.notifSupported ? 'pass' : 'fail');
  addCheck('Installed PWA mode', c.installed ? 'pass' : 'check', c.installed ? 'Running as installed app' : 'Browser tab is okay for setup; install before final closed-app test');
  addCheck('NILTASK login', c.session?.user?.id ? 'pass' : 'fail', c.profileLabel || 'Open NILTASK and log in first');
  addCheck('Tenant resolved', c.tenantId ? 'pass' : 'fail', c.tenantId || 'No tenant_id available');
  addCheck('Notification permission', c.permission === 'granted' ? 'pass' : (c.permission === 'denied' ? 'fail' : 'check'), c.permission);
  addCheck('Browser Push subscription', c.subscription ? 'pass' : 'check', c.subscription?.endpoint ? c.subscription.endpoint.slice(0, 90) + '…' : 'No subscription yet');
  addCheck('Subscription stored on server', c.serverRegistered ? 'pass' : 'check', c.serverRegistered ? 'Matching row found in push_subscriptions' : (c.serverError || 'Not registered yet'));

  if (c.nativeTokenCheckKnown) {
    addCheck('Native FCM conflict', c.hasNativeToken ? 'check' : 'pass', c.hasNativeToken ? 'Native token exists; production send-push may skip Web Push for this user' : 'No native token found for this user');
  } else {
    addCheck('Native FCM conflict', 'check', 'Could not read push_tokens from this client; treat as unknown');
  }

  fcmWarning.hidden = !c.hasNativeToken;
  log('Diagnostics refreshed.');
  return c;
}

async function enablePush() {
  enableBtn.disabled = true;
  try {
    const c = await getContext();
    if (!c.secure) throw new Error('This page is not in a secure HTTPS context.');
    if (!c.swSupported || !c.pushSupported || !c.notifSupported) throw new Error('This browser does not support required Web Push APIs.');
    if (!c.session?.user?.id) throw new Error('Please log in to NILTASK first, then return to this page.');
    if (!c.tenantId) throw new Error('Could not resolve your NILTASK tenant.');

    let permission = Notification.permission;
    if (permission !== 'granted') permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notification permission was not granted.');

    let reg = c.registration || await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(VAPID_PUBLIC)
      });
    }

    const { error } = await sb.from('push_subscriptions').upsert({
      user_id: c.session.user.id,
      tenant_id: c.tenantId,
      endpoint: sub.endpoint,
      subscription: sub.toJSON()
    }, { onConflict: 'endpoint' });
    if (error) throw error;

    log('Web Push subscription created/confirmed and stored on server.');
    await renderDiagnostics();
  } catch (e) {
    log('ERROR: ' + (e?.message || e));
    alert(e?.message || String(e));
  } finally {
    enableBtn.disabled = false;
  }
}

enableBtn.addEventListener('click', enablePush);
refreshBtn.addEventListener('click', renderDiagnostics);

renderDiagnostics().catch(e => log('Initial diagnostics failed: ' + (e?.message || e)));
