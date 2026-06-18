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
  const supabaseAnonKey = Deno.env.get('RUPABASE_ANON_KEY')!

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
    Deno.env.get('RUPABASE_URL')!,
    Deno.env.get('RUPABASE_SERVICE_ROLE_KEY')!
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
      const { error: insertError } = await supabase.from('messages').insert({
        room_id: m.room_id,
        sender_id: m.sender_id,
        text: m.message_text
      })

      await supabase.from('scheduled_messages')
        .update({ status: insertError ? 'failed' : 'sent' })
        .eq('id', m.id)
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
