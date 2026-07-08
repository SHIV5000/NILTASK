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

    // Friendly title: DM → sender's name; group → "Sender · GroupName" (not the raw room id).
    let title = senderName;
    let groupName = '';
    if (!isDMroom) {
      const { data: rs } = await supabase
        .from('room_settings').select('name')
        .eq('room_id', room).eq('tenant_id', tenantId).maybeSingle();
      groupName = rs?.name || room.replace(/^grp_/, '').replace(/_[a-z0-9]+$/, '').replace(/_/g, ' ');
      title = `${senderName} · ${groupName}`;
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
    const notifRows = recipientIds.map((uid) => {
      const mentioned = mentionedIds.has(uid);
      return {
        user_id: uid,
        type: mentioned ? 'mention' : (isReply ? 'reply' : 'message'),
        message: mentioned
          ? `📣 ${senderName} mentioned you${isDMroom ? '' : ' in ' + groupName}: ${snippet}`
          : isReply
            ? `↩ ${senderName} replied: ${snippet}`
            : (isDMroom ? `💬 ${senderName}: ${snippet}` : `${senderName} in ${groupName}: ${snippet}`),
        message_id: m.id,
        tenant_id: tenantId,
        is_read: false,
      };
    });
    try {
      await supabase.from('notifications')
        .upsert(notifRows, { onConflict: 'user_id,message_id', ignoreDuplicates: true });
    } catch (e) {
      console.log('send-push notif insert error', (e as any)?.message);
    }
    const basePayload = { body: text, tag: room, room, url: '/?room=' + encodeURIComponent(room) };
    const payload = JSON.stringify({ ...basePayload, title });
    // Distinct high-priority payload for users who were @mentioned.
    const mentionPayload = JSON.stringify({
      ...basePayload, title: `📣 ${senderName} mentioned you${isDMroom ? '' : ' · ' + groupName}`,
      tag: room + ':mention', priority: 'high',
    });

    const { data: subs } = await supabase
      .from('push_subscriptions').select('endpoint,subscription,user_id')
      .in('user_id', recipientIds);
    console.log('send-push subscriptions', (subs || []).length);

    let sent = 0, failed = 0;
    await Promise.all((subs || []).map(async (s: { endpoint: string; subscription: unknown; user_id: string }) => {
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
    console.log('send-push done', JSON.stringify({ sent, failed }));

    return new Response('ok', { status: 200 });
  } catch (e) {
    // Never fail the webhook loudly — log and return 200.
    console.error('send-push error', e);
    return new Response('error', { status: 200 });
  }
});
