/**
 * Supabase Edge Function: send-scheduled-messages
 * ─────────────────────────────────────────────────
 * Runs on a cron schedule (every 1 minute via pg_cron or Supabase cron).
 * 
 * Processes:
 *  1. Fired reminders → insert notification row (bell icon)
 *  2. Pending scheduled messages → insert into messages + insert notification
 *
 * The KEY FIX: we insert a notification row when a scheduled message is sent.
 * The client-side 'notificationSubscription' listens to notifications table INSERT
 * (which IS reliable). This avoids needing realtime on scheduled_messages.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Security: simple shared-secret header check
  const auth = req.headers.get('RUPABASE_ANON_KEY')
  if (auth !== Deno.env.get('RUPABASE_ANON_KEY')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('RUPABASE_URL')!,
    Deno.env.get('RUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date().toISOString()
  const results: string[] = []

  // ── 1. Process reminders that have fired ─────────────────────────────────────
  const { data: reminders } = await supabase
    .from('reminders')
    .select('*')
    .lte('reminder_time', now)
    .eq('triggered', false)

  if (reminders?.length) {
    await Promise.all(reminders.map(async (r) => {
      // Mark reminder as triggered
      await supabase.from('reminders').update({ triggered: true }).eq('id', r.id)

      // Insert notification so it appears in bell icon + plays sound on client
      await supabase.from('notifications').insert({
        user_id:    r.user_id,
        type:       'reminder',
        message:    '⏰ Reminder: Your scheduled reminder has fired.',
        message_id: r.message_id,
        is_read:    false
      })
      results.push(`reminder:${r.id}`)
    }))
  }

  // ── 2. Process pending scheduled messages ─────────────────────────────────────
  const { data: scheduled } = await supabase
    .from('scheduled_messages')
    .select('*')
    .lte('scheduled_time', now)
    .eq('status', 'pending')

  if (scheduled?.length) {
    await Promise.all(scheduled.map(async (m) => {
      // Insert message into the messages table (makes it appear in chat)
      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .insert({
          room_id:   m.room_id,
          sender_id: m.sender_id,
          text:      m.message_text
        })
        .select('id')
        .single()

      // Update status
      const newStatus = msgErr ? 'failed' : 'sent'
      await supabase.from('scheduled_messages').update({ status: newStatus }).eq('id', m.id)

      // ── THE FIX: Insert notification so client bell icon lights up ─────────────
      // This uses the notifications table which HAS realtime enabled.
      // The client's notificationSubscription will pick this up instantly.
      if (!msgErr) {
        const textPreview = (m.message_text || '')
          .replace(/<[^>]+>/g, '')   // strip HTML tags
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 60)

        await supabase.from('notifications').insert({
          user_id:    m.sender_id,
          type:       'message',
          message:    `📨 Scheduled message sent: ${textPreview}`,
          message_id: msgData?.id || null,
          is_read:    false
        })
        results.push(`scheduled:${m.id}`)
      }
    }))
  }

  return new Response(
    JSON.stringify({ success: true, processed: results }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
