// send-push — Supabase Edge Function
// Triggered by a Database Webhook on INSERT into public.messages. Sends a Web
// Push notification to every recipient's registered devices when the app is closed.
//
// Deploy:  supabase functions deploy send-push --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC=... VAPID_PRIVATE=... \
//            VAPID_SUBJECT=mailto:you@school.com PUSH_HOOK_SECRET=<random>
// Webhook: Database → Webhooks → new → table public.messages, event INSERT,
//          type HTTP POST → the function URL, add header  x-hook-secret: <random>
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC')!,
  Deno.env.get('VAPID_PRIVATE')!,
);

const HOOK_SECRET = Deno.env.get('PUSH_HOOK_SECRET') || '';


// ── FCM (native Android/iOS push) ─────────────────────────────────────────────
// Uses a Firebase service-account JSON stored in the FCM_SERVICE_ACCOUNT secret.
// If the secret is absent, getFcmAccessToken() returns null → the FCM path is a
// no-op (Web Push still works). Signs a Google OAuth JWT (RS256) via Web Crypto,
// exchanges it for an access token, then POSTs to the FCM HTTP v1 API.
let _svc: { client_email: string; private_key: string; project_id: string; token_uri?: string } | null = null;
try { const raw = Deno.env.get('FCM_SERVICE_ACCOUNT'); if (raw) _svc = JSON.parse(raw); } catch (_e) { _svc = null; }
const FCM_PROJECT_ID = _svc?.project_id || '';
let _fcmToken: { value: string; exp: number } | null = null;

function _b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function _importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
async function getFcmAccessToken(): Promise<string | null> {
  if (!_svc) return null;
  const now = Math.floor(Date.now() / 1000);
  if (_fcmToken && _fcmToken.exp > now + 60) return _fcmToken.value;
  const tokenUri = _svc.token_uri || 'https://oauth2.googleapis.com/token';
  const header = _b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = _b64url(new TextEncoder().encode(JSON.stringify({
    iss: _svc.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: tokenUri, iat: now, exp: now + 3600,
  })));
  const key = await _importPrivateKey(_svc.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(header + '.' + claim));
  const jwt = header + '.' + claim + '.' + _b64url(sig);
  const res = await fetch(tokenUri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt,
  });
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) { console.log('fcm token error', JSON.stringify(j)); return null; }
  _fcmToken = { value: j.access_token, exp: now + (j.expires_in || 3600) };
  return _fcmToken.value;
}
// Returns true (delivered), 'gone' (invalid token → delete), or false (other error).
async function sendFcm(accessToken: string, projectId: string, token: string,
  p: { title: string; body: string; room: string; url: string; priority: string; muted?: boolean }): Promise<boolean | 'gone'> {
  try {
    // Muted recipients: deliver SILENTLY — a LOW-importance channel (no sound, no
    // heads-up, still on the lock screen) and no APNs sound. Otherwise full alert.
    // NOTE: we deliberately do NOT set android.notification_count / apns badge — OEM
    // launchers handle that field inconsistently (some SUM it per notification →
    // "+3 every message"). Letting the OS count notifications natively gives a sane
    // +1 per message that clears when the shade/app is opened.
    const muted = !!p.muted;
    const res = await fetch('https://fcm.googleapis.com/v1/projects/' + projectId + '/messages:send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: p.title, body: (p.body || '').slice(0, 240) },
          data: { room: p.room || '', url: p.url || '/' },
          android: { priority: (p.priority === 'high' && !muted) ? 'high' : 'normal',
            notification: { channel_id: muted ? 'nfa_silent' : 'nfa_alerts', default_sound: !muted } },
          apns: { headers: { 'apns-priority': (p.priority === 'high' && !muted) ? '10' : '5' },
            payload: { aps: muted ? { 'content-available': 1 } : { sound: 'default' } } },
        },
      }),
    });
    if (res.ok) return true;
    const errText = await res.text();
    if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(errText)) return 'gone';
    console.log('fcm send failed', res.status, errText.slice(0, 200));
    return false;
  } catch (e) { console.log('fcm send exception', (e as any)?.message); return false; }
}

Deno.serve(async (req) => {
  try {
    // Optional shared-secret gate (set the same value in the webhook header).
    if (HOOK_SECRET && req.headers.get('x-hook-secret') !== HOOK_SECRET) {
      return new Response('forbidden', { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const m = body.record || body;
    console.log('send-push invoked', JSON.stringify({ room: m?.room_id, sender: m?.sender_id, tenant: m?.tenant_id }));
    if (!m || !m.room_id || m.deleted_at) {
      console.log('send-push skip: no room_id or deleted');
      return new Response('skip', { status: 200 });
    }

    const senderId = m.sender_id;
    const tenantId = m.tenant_id;
    const room = String(m.room_id);

    // Resolve recipients (exclude the sender).
    let recipientIds: string[] = [];
    if (room.startsWith('dm_')) {
      recipientIds = room.split('_').slice(1).filter((id) => id && id !== senderId);
    } else {
      const { data: profs } = await supabase
        .from('profiles').select('id')
        .eq('tenant_id', tenantId).neq('id', senderId);
      recipientIds = (profs || []).map((p: { id: string }) => p.id);
    }
    console.log('send-push recipients', recipientIds.length);
    if (!recipientIds.length) return new Response('no recipients', { status: 200 });

    const { data: sp } = await supabase
      .from('profiles').select('full_name,email').eq('id', senderId).maybeSingle();
    const senderName = sp?.full_name || sp?.email?.split('@')[0] || 'Someone';
    // Strip HTML tags AND decode the common entities so notification/push text is
    // clean ("@Name dddd" not "@Name&nbsp;dddd").
    const text = (m.text || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim().slice(0, 120) || '📎 Attachment';
    const isDMroom = room.startsWith('dm_');
    const isReply = !!m.parent_message_id;

    // UNIFORM FORMAT (WhatsApp-style) for every push:
    //   DM    → title = sender name,  body = message
    //   Group → title = group name,   body = "Sender: message"
    let title = senderName;
    let bodyText = text;
    let groupName = '';
    if (!isDMroom) {
      const { data: rs } = await supabase
        .from('room_settings').select('name')
        .eq('room_id', room).eq('tenant_id', tenantId).maybeSingle();
      groupName = rs?.name || room.replace(/^grp_/, '').replace(/_[a-z0-9]+$/, '').replace(/_/g, ' ');
      title = groupName;
      bodyText = `${senderName}: ${text}`;
    }

    // ── Server-authoritative in-app notifications (bell + Activity feed) ──────
    // Create a notifications row for EVERY recipient here (service role bypasses
    // RLS), so the feed/bell is correct whether the recipient is online, offline,
    // or mid-reconnect — instead of relying on the client to self-insert only
    // when it happens to receive the realtime event. Deduped by (user_id,
    // message_id) via a unique index (upsert ignore-on-conflict).
    const snippet = text.slice(0, 80);
    // @mentions: the client stores mentions as <span class="mention" data-uid="…">.
    // Recipients who were mentioned get a high-priority "mentioned you" notification.
    const mentionedIds = new Set(
      [...String(m.text || '').matchAll(/data-uid="([^"]+)"/g)].map((mm) => mm[1]),
    );
    // ATTENTION STREAM ONLY (standard chat/task model): create an in-app
    // notification row ONLY for recipients who were @mentioned. Plain messages
    // and DMs are represented as per-chat unread (derived from room_reads on the
    // client) — NOT as bell notifications — so the bell stays a meaningful
    // "needs your attention" signal instead of mirroring every message. Reactions,
    // replies-to-you and task events are inserted with correct targeting by the
    // client/tasks paths. The OS push banner below still fires for all recipients.
    const notifRows = recipientIds
      .filter((uid) => mentionedIds.has(uid))
      .map((uid) => ({
        user_id: uid,
        type: 'mention',
        message: `📣 ${senderName} mentioned you${isDMroom ? '' : ' in ' + groupName}: ${snippet}`,
        message_id: m.id,
        tenant_id: tenantId,
        is_read: false,
      }));
    if (notifRows.length) {
      try {
        await supabase.from('notifications')
          .upsert(notifRows, { onConflict: 'user_id,message_id,type', ignoreDuplicates: true });
      } catch (e) {
        console.log('send-push notif insert error', (e as any)?.message);
      }
    }
    const basePayload = { body: bodyText, tag: room, room, url: '/?room=' + encodeURIComponent(room) };
    const payload = JSON.stringify({ ...basePayload, title });
    // Mentions keep the SAME shape (title = DM sender / group name), body flags the mention.
    const mentionPayload = JSON.stringify({
      ...basePayload, title, body: `📣 ${bodyText}`,
      tag: room + ':mention', priority: 'high',
    });

    // Read receipts: don't push to a recipient who is actively reading this room
    // (their last_read_at is at/after this message). Mentions still push.
    const msgTs = new Date(m.created_at || Date.now()).getTime();
    const readUpTo: Record<string, number> = {};
    try {
      const { data: reads } = await supabase
        .from('room_reads').select('user_id,last_read_at')
        .eq('room_id', room).in('user_id', recipientIds);
      (reads || []).forEach((r: { user_id: string; last_read_at: string }) => {
        readUpTo[r.user_id] = new Date(r.last_read_at).getTime();
      });
    } catch (_e) { /* table missing → push to everyone */ }

    // DEDUP: a user with a native FCM token gets the FCM push below; do NOT also
    // send them a Web-Push, or they'd receive TWO notifications for one message.
    const fcmUserIds = new Set<string>();
    try {
      const { data: tk } = await supabase.from('push_tokens').select('user_id').in('user_id', recipientIds);
      (tk || []).forEach((t: { user_id: string }) => fcmUserIds.add(t.user_id));
    } catch (_e) { /* table missing → no native users */ }

    const { data: subs } = await supabase
      .from('push_subscriptions').select('endpoint,subscription,user_id')
      .in('user_id', recipientIds);
    console.log('send-push subscriptions', (subs || []).length);

    let sent = 0, failed = 0, skipped = 0;
    await Promise.all((subs || []).map(async (s: { endpoint: string; subscription: unknown; user_id: string }) => {
      if (fcmUserIds.has(s.user_id)) { skipped++; return; }   // native user → FCM only, no double push
      // Skip if the user has already read up to this message — unless mentioned.
      if (!mentionedIds.has(s.user_id) && readUpTo[s.user_id] && readUpTo[s.user_id] >= msgTs) {
        skipped++; return;
      }
      try {
        await webpush.sendNotification(
          s.subscription as webpush.PushSubscription,
          mentionedIds.has(s.user_id) ? mentionPayload : payload,
        );
        sent++;
      } catch (e: any) {
        failed++;
        console.log('send-push send failed', e?.statusCode, e?.body || e?.message);
        // Expired/invalid subscription → remove it.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }));
    // ── NATIVE push via FCM (Android/iOS Capacitor app) ─────────────────────
    // Delivers to the native apps' device tokens (push_tokens), alongside the
    // Web-Push above. Only runs if the FCM_SERVICE_ACCOUNT secret is set, so it's
    // a no-op until you configure Firebase. Same read-receipt skip as web push.
    let fcmSent = 0, fcmFailed = 0;
    try {
      const accessToken = await getFcmAccessToken();
      if (accessToken) {
        const { data: tokens } = await supabase
          .from('push_tokens').select('token,user_id')
          .in('user_id', recipientIds);
        console.log('send-push fcm-tokens', (tokens || []).length);
        // Per-recipient mute state → silent channel (WhatsApp-style mute).
        const mutedIds = new Set<string>();
        try {
          const { data: muted } = await supabase
            .from('profiles').select('id').eq('notify_muted', true).in('id', recipientIds);
          (muted || []).forEach((m: { id: string }) => mutedIds.add(m.id));
        } catch (_e) { /* column missing → treat all as un-muted */ }
        await Promise.all((tokens || []).map(async (t: { token: string; user_id: string }) => {
          if (!mentionedIds.has(t.user_id) && readUpTo[t.user_id] && readUpTo[t.user_id] >= msgTs) return;
          const isMention = mentionedIds.has(t.user_id);
          const ok = await sendFcm(accessToken, FCM_PROJECT_ID, t.token, {
            title,
            body: isMention ? `📣 ${bodyText}` : bodyText,
            room,
            url: '/?room=' + encodeURIComponent(room),
            priority: isMention || isDMroom ? 'high' : 'normal',
            muted: mutedIds.has(t.user_id),
          });
          if (ok === true) fcmSent++;
          else {
            fcmFailed++;
            if (ok === 'gone') await supabase.from('push_tokens').delete().eq('token', t.token);
          }
        }));
      }
    } catch (e) { console.log('send-push fcm error', (e as any)?.message); }

    console.log('send-push done', JSON.stringify({ sent, failed, skipped, fcmSent, fcmFailed }));

    return new Response('ok', { status: 200 });
  } catch (e) {
    // Never fail the webhook loudly — log and return 200.
    console.error('send-push error', e);
    return new Response('error', { status: 200 });
  }
});
