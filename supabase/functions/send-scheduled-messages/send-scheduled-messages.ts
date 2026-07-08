import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // 1. SECURITY LOCK
  // FIXED: SUPABASE_ANON_KEY (not RUPABASE_ANON_KEY). This is one of the
  // reserved env vars Supabase auto-injects into every Edge Function —
  // you never need to set it yourself, and in fact Supabase blocks you
  // from manually creating a secret with this exact name. The previous
  // "RUPABASE_*" names were never going to resolve to anything, so this
  // check always failed and the function always returned 401 before ever
  // reaching the actual reminder/scheduled-message logic below.
  const authHeader = req.headers.get('Authorization')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  if (!authHeader || authHeader !== `Bearer ${supabaseAnonKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized access blocked." }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    })
  }

  // 2. DATABASE INITIALIZATION
  // FIXED: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — also auto-provided,
  // also previously misspelled with the same RUPABASE typo.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date().toISOString()

  // 3. LOGIC: PROCESS REMINDERS
  const { data: reminders } = await supabase.from('reminders')
    .select('id, user_id, message_id, messages(text)')
    .lte('reminder_time', now)
    .eq('triggered', false)

  if (reminders?.length) {
    await Promise.all(reminders.map(async (r) => {
      await supabase.from('reminders').update({ triggered: true }).eq('id', r.id)
      await supabase.from('notifications').insert({
        user_id: r.user_id,
        type: 'reminder',
        message: `Reminder: "${r.messages?.text?.substring(0, 80)}"`,
        message_id: r.message_id
      })
    }))
  }

  // 4. LOGIC: PROCESS SCHEDULED MESSAGES
  const { data: scheduled } = await supabase.from('scheduled_messages')
    .select('*')
    .lte('scheduled_time', now)
    .eq('status', 'pending')

  if (scheduled?.length) {
    await Promise.all(scheduled.map(async (m) => {
      // ATOMIC CLAIM (prevents double-send when a 1-min cron overlaps itself):
      // flip pending → processing conditionally. If another concurrent run already
      // claimed this row, the conditional update matches 0 rows and we skip it.
      const { data: claimed } = await supabase.from('scheduled_messages')
        .update({ status: 'processing' })
        .eq('id', m.id).eq('status', 'pending')
        .select('id');
      if (!claimed?.length) return;   // already taken by an overlapping invocation

      // FIXED: tenant_id was missing here. The messages table requires it
      // (multi-tenant isolation), so this insert was almost certainly
      // failing a NOT NULL constraint on every single scheduled message —
      // silently, since the function only records the failure into
      // scheduled_messages.status rather than surfacing it, and the
      // function's own HTTP response is still 200 OK regardless of whether
      // any individual message succeeded.
      const { error: insertError } = await supabase.from('messages').insert({
        room_id: m.room_id,
        sender_id: m.sender_id,
        tenant_id: m.tenant_id,
        text: m.message_text,
        created_at: new Date().toISOString()
      })

      await supabase.from('scheduled_messages')
        .update({ status: insertError ? 'failed' : 'sent' })
        .eq('id', m.id)

      if (insertError) {
        console.error(`Failed to send scheduled message ${m.id}:`, insertError.message)
      }
    }))
  }

  return new Response(JSON.stringify({
      status: "success",
      reminders_processed: reminders?.length || 0,
      scheduled_processed: scheduled?.length || 0
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
})
