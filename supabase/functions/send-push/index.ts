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
    if (!m || !m.room_id || m.deleted_at) {
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
    if (!recipientIds.length) return new Response('no recipients', { status: 200 });

    const { data: sp } = await supabase
      .from('profiles').select('full_name,email').eq('id', senderId).maybeSingle();
    const senderName = sp?.full_name || sp?.email?.split('@')[0] || 'Someone';
    const text = (m.text || '').replace(/<[^>]*>/g, '').trim().slice(0, 120) || '📎 Attachment';
    const title = room.startsWith('dm_') ? senderName : `${senderName} · ${room}`;
    const payload = JSON.stringify({ title, body: text, url: '/', tag: room });

    const { data: subs } = await supabase
      .from('push_subscriptions').select('endpoint,subscription')
      .in('user_id', recipientIds);

    await Promise.all((subs || []).map(async (s: { endpoint: string; subscription: unknown }) => {
      try {
        await webpush.sendNotification(s.subscription as webpush.PushSubscription, payload);
      } catch (e: any) {
        // Expired/invalid subscription → remove it.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }));

    return new Response('ok', { status: 200 });
  } catch (e) {
    // Never fail the webhook loudly — log and return 200.
    console.error('send-push error', e);
    return new Response('error', { status: 200 });
  }
});
