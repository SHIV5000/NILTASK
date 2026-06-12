import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    // Initialize Supabase with the powerful Service Role Key to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Fetch pending messages that are past their scheduled time
    const { data: messages, error: fetchError } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_time', new Date().toISOString())

    if (fetchError) {
        return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    if (!messages || messages.length === 0) {
        return new Response(JSON.stringify({ message: "No scheduled messages pending." }), { status: 200 })
    }

    let sentCount = 0;

    // 2. Loop through and officially "send" each message
    for (const msg of messages) {
        const { error: insertError } = await supabase
            .from('messages')
            .insert({
                room_id: msg.room_id,
                sender_id: msg.sender_id,
                text: msg.message_text,
                created_at: new Date().toISOString()
            })

        if (!insertError) {
            // 3. Mark the scheduled tracker as 'sent'
            await supabase
                .from('scheduled_messages')
                .update({ status: 'sent' })
                .eq('id', msg.id)
            
            sentCount++;
        }
    }

    return new Response(
        JSON.stringify({ message: `Successfully executed ${sentCount} scheduled messages.` }), 
        { headers: { "Content-Type": "application/json" }, status: 200 }
    )
})
