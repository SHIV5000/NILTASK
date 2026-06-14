/**
 * ui-panels.js — MPGS TaskFlow
 * ─────────────────────────────────────────────────────────────────────────────
 * Top-bar panels, notifications, bell badge, reminders, schedule modal.
 * Depends on: ui-core.js (showCenterToast, stripHtml)
 *
 * Functions: openTopPanel (alerts/bookmarks/reminders/scheduled),
 *            dismissNotif, clearAllNotifications, clearFiredReminders,
 *            refreshNotificationBadge, markNotifRead, animateBell,
 *            showReminderModal, saveReminder,
 *            showScheduleModal, saveScheduledMessage
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { sb } from './shared.js';
window.showReminderModal = function(mid, text) {
    window.currentReminderId=mid; window.closeDropdowns();
    document.getElementById('reminderMessagePreview').innerText=window.stripHtml(text);
    document.getElementById('reminderModal').classList.remove('hidden');
    document.getElementById('reminderModal').classList.add('flex');
};

window.closeReminderModal = function() { document.getElementById('reminderModal').classList.add('hidden'); document.getElementById('reminderModal').classList.remove('flex'); };

window.saveReminder = async function() {
    const dt=document.getElementById('reminderDateTime').value; if(!dt) return;
    await sb.from('reminders').insert({user_id:window.currentUser.id,message_id:window.currentReminderId,reminder_time:new Date(dt).toISOString(),triggered:false});
    window.showCenterToast('Reminder Set Successfully ⏰');
    window.closeReminderModal();
};

window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    const panel=document.createElement('div');
    panel.className='top-panel-dropdown right-10 top-16 max-h-[500px] overflow-y-auto p-4 border shadow-2xl rounded-2xl z-50';
    panel.style.cssText='background-color:var(--bg-sidebar);border-color:var(--border-color);width:340px;';

    // ── SCHEDULED ──────────────────────────────────────────────────────────
    if (type==='scheduled') {
        panel.innerHTML=`<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-regular fa-clock text-blue-500"></i> Scheduled Messages</h4>`;
        const {data}=await sb.from('scheduled_messages').select('*').eq('sender_id',window.currentUser.id).eq('status','pending').order('scheduled_time',{ascending:true});
        if(!data?.length){panel.innerHTML+=`<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No scheduled messages.</p>`;}
        else data.forEach(d=>{
            const txt=window.stripHtml(d.message_text);
            const t=new Date(d.scheduled_time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                    <i class="fa-regular fa-clock mt-0.5 flex-shrink-0" style="color:var(--accent);font-size:13px;"></i>
                    <div class="min-w-0 flex-1">
                        <p class="text-xs font-semibold truncate" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,80))}</p>
                        <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(59,130,246,0.12);color:#3b82f6;"><i class="fa-solid fa-clock" style="font-size:9px;"></i> ${t}</span>
                    </div>
                </div>
                <div class="border-t flex" style="border-color:var(--border-color);">
                    <button onclick="window.deleteScheduled('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);"><i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel</button>
                </div>
            </div>`;
        });

    // ── REMINDERS ──────────────────────────────────────────────────────────
    } else if (type==='reminders') {
        panel.innerHTML=`<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-solid fa-stopwatch text-purple-500"></i> Reminders</h4>`;
        const {data:upcoming}=await sb.from('reminders').select('*, messages(text, room_id)').eq('user_id',window.currentUser.id).eq('triggered',false).order('reminder_time',{ascending:true});
        const {data:fired}=await sb.from('notifications').select('*').eq('user_id',window.currentUser.id).eq('type','reminder').order('created_at',{ascending:false}).limit(10);

        if(upcoming?.length){
            panel.innerHTML+=`<div class="text-[9px] font-black tracking-widest uppercase mb-2" style="color:var(--text-secondary);">⏳ Upcoming</div>`;
            upcoming.forEach(d=>{
                const txt=window.stripHtml(d.messages?.text||'Message...');
                const t=new Date(d.reminder_time).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                const overdue=new Date(d.reminder_time)<new Date();
                const roomId=d.messages?.room_id||null;
                panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                    <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                        <i class="fa-solid fa-stopwatch mt-0.5 flex-shrink-0" style="color:#a855f7;font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:${overdue?'rgba(239,68,68,0.12)':'rgba(168,85,247,0.12)'};color:${overdue?'#ef4444':'#a855f7'};"><i class="fa-solid fa-bell" style="font-size:9px;"></i> ${t}${overdue?' · Overdue':''}</span>
                        </div>
                    </div>
                    <div class="border-t flex" style="border-color:var(--border-color);">
                        <button onclick="window.goToMessage('${d.message_id}',null,'${roomId}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:opacity-70 border-r" style="color:var(--accent);border-color:var(--border-color);"><i class="fa-solid fa-arrow-right" style="font-size:9px;"></i> Go to message</button>
                        <button onclick="window.deleteReminder('${d.id}')" class="flex-1 py-1.5 text-[11px] font-bold flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-600 transition-colors" style="color:var(--text-secondary);"><i class="fa-solid fa-trash-alt" style="font-size:10px;"></i> Cancel</button>
                    </div>
                </div>`;
            });
        } else {
            panel.innerHTML+=`<p class="text-xs italic text-center py-3" style="color:var(--text-secondary);">No upcoming reminders.</p>`;
        }

        if(fired?.length){
            panel.innerHTML+=`<div class="flex items-center justify-between mt-4 mb-2">
                <div class="text-[9px] font-black tracking-widest uppercase" style="color:var(--text-secondary);">✅ Fired</div>
                <button onclick="window.clearFiredReminders()" class="text-[10px] font-bold hover:text-red-500 px-2 py-0.5 rounded-lg transition-colors" style="color:var(--text-secondary);">Clear all</button>
            </div>`;
            fired.forEach(d=>{
                const msg=window.stripHtml(d.message);
                const t=new Date(d.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" id="fired-${d.id}" style="border-color:var(--border-color);opacity:${d.is_read?'0.5':'1'};">
                    <div class="p-2.5 flex items-start gap-2" style="background-color:var(--bg-body);">
                        <i class="fa-solid fa-check-circle mt-0.5 flex-shrink-0" style="color:#22c55e;font-size:13px;"></i>
                        <div class="min-w-0 flex-1 cursor-pointer hover:opacity-80" onclick="window.goToMessage('${d.message_id}','${d.id}')">
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(msg.substring(0,100))}</p>
                            <span class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style="background:rgba(34,197,94,0.12);color:#16a34a;"><i class="fa-solid fa-clock" style="font-size:9px;"></i> ${t}</span>
                        </div>
                        <button onclick="window.dismissFired('${d.id}')" class="flex-shrink-0 ml-1 p-1.5 rounded hover:bg-red-50 hover:text-red-500 transition-colors" style="color:var(--text-secondary);" title="Dismiss"><i class="fa-solid fa-times" style="font-size:11px;"></i></button>
                    </div>
                </div>`;
            });
        }

    // ── BOOKMARKS ──────────────────────────────────────────────────────────
    } else if (type==='bookmarks') {
        panel.innerHTML=`<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color:var(--border-color);color:var(--text-primary);"><i class="fa-regular fa-bookmark text-orange-500"></i> Bookmarks</h4>`;
        const {data}=await sb.from('bookmarks').select('*, messages(text, room_id)').eq('user_id',window.currentUser.id);
        if(!data?.length){panel.innerHTML+=`<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">No bookmarks yet.</p>`;}
        else data.forEach(d=>{
            const txt=window.stripHtml(d.messages?.text||'');
            const roomId=d.messages?.room_id||null;
            panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" style="border-color:var(--border-color);">
                <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);" onclick="window.goToMessage('${d.message_id}',null,'${roomId}')">
                    <i class="fa-solid fa-bookmark mt-0.5 flex-shrink-0" style="color:#f97316;font-size:13px;"></i>
                    <p class="text-xs font-medium line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(txt.substring(0,120))}</p>
                </div>
            </div>`;
        });

    // ── ALERTS ─────────────────────────────────────────────────────────────
    } else if (type==='alerts') {
        const {data}=await sb.from('notifications').select('*').eq('user_id',window.currentUser.id).order('created_at',{ascending:false}).limit(20);

        // Batch-fetch message info (sender + room) for all notifications that have message_id
        const msgIds=(data||[]).filter(d=>d.message_id).map(d=>d.message_id);
        let msgInfoMap=new Map();
        if(msgIds.length){
            const {data:relMsgs}=await sb.from('messages').select('id,room_id,sender_id,profiles(full_name,email)').in('id',msgIds);
            relMsgs?.forEach(m=>msgInfoMap.set(m.id,m));
        }

        panel.innerHTML=`<div class="flex items-center justify-between border-b pb-3 mb-3" style="border-color:var(--border-color);">
            <h4 class="font-bold flex items-center gap-2" style="color:var(--text-primary);"><i class="fa-regular fa-bell text-yellow-500"></i> Notifications</h4>
            ${data?.length?`<button onclick="window.clearAllNotifications()" class="text-[10px] font-bold hover:text-red-500 px-2 py-0.5 rounded-lg transition-colors" style="color:var(--text-secondary);">Clear all</button>`:''}
        </div>`;

        if(!data?.length){
            panel.innerHTML+=`<p class="text-xs italic text-center py-6" style="color:var(--text-secondary);">All caught up! 🎉</p>`;
        } else {
            // Mark all unread as read silently
            const unreadIds=data.filter(d=>!d.is_read).map(d=>d.id);
            if(unreadIds.length) sb.from('notifications').update({is_read:true}).in('id',unreadIds).then(()=>// ─── BADGE: Refresh unread count on the bell icon ─────────────────────────────
window.refreshNotificationBadge?.());

            const iconMap={reminder:'fa-stopwatch',task:'fa-clipboard-check',message:'fa-comment',general:'fa-bell'};
            const colorMap={reminder:'#a855f7',task:'#3b82f6',message:'#22c55e',general:'#f59e0b'};

            data.forEach(d=>{
                const msg=window.stripHtml(d.message);
                const t=new Date(d.created_at).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                const tp=d.type||'general';
                const ic=iconMap[tp]||'fa-bell', co=colorMap[tp]||'#f59e0b';

                // Resolve sender + room from batch-fetched message data
                const relMsg=msgInfoMap.get(d.message_id);
                const senderName=relMsg?.profiles
                    ? (window.toSentenceCase?.(relMsg.profiles.full_name||relMsg.profiles.email?.split('@')[0])||'')
                    : '';
                const roomLabel=relMsg?.room_id
                    ? (relMsg.room_id.startsWith('dm_') ? '💬 DM' : `# ${relMsg.room_id}`)
                    : '';

                const clickFn = tp==='task'
                    ? `window.goToTask('${d.task_id||''}','${d.id}')`
                    : `window.goToMessage('${d.message_id}','${d.id}')`;

                // Unread = full opacity, Read = 60%
                const opacity = d.is_read ? '0.6' : '1';
                const unreadDot = !d.is_read
                    ? `<span class="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style="background:${co};"></span>`
                    : '';

                panel.innerHTML+=`<div class="mb-2 rounded-xl border overflow-hidden" id="notif-${d.id}" style="border-color:var(--border-color);opacity:${opacity};">
                    <div class="p-2.5 flex items-start gap-2 cursor-pointer hover:opacity-80" style="background-color:var(--bg-body);"
                        onclick="${clickFn}; (function(n){if(n)n.style.opacity='0.6';})(document.getElementById('notif-${d.id}'));">
                        ${unreadDot}
                        <i class="fa-solid ${ic} mt-0.5 flex-shrink-0" style="color:${co};font-size:13px;"></i>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5 flex-wrap mb-1">
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase" style="background:${co}18;color:${co};">${tp}</span>
                                ${senderName?`<span class="text-[9px] font-bold" style="color:var(--text-primary);">${window.escapeHtml(senderName)}</span>`:''}
                                ${roomLabel?`<span class="text-[9px] font-semibold" style="color:var(--text-secondary);">${window.escapeHtml(roomLabel)}</span>`:''}
                                <span class="text-[9px] ml-auto flex-shrink-0 whitespace-nowrap" style="color:var(--text-secondary);">${t}</span>
                            </div>
                            <p class="text-xs font-semibold line-clamp-2" style="color:var(--text-primary);">${window.escapeHtml(msg.substring(0,120))}</p>
                        </div>
                        <button onclick="event.stopPropagation();window.dismissNotif('${d.id}')" class="flex-shrink-0 ml-1 p-1.5 rounded hover:bg-red-50 hover:text-red-500 transition-colors" style="color:var(--text-secondary);" title="Dismiss"><i class="fa-solid fa-times" style="font-size:10px;"></i></button>
                    </div>
                    ${!d.is_read?`<div class="px-2.5 pb-1.5"><span style="font-size:9px;font-weight:700;color:#16a34a;background:rgba(34,197,94,0.1);border-radius:8px;padding:1px 6px;">NEW</span></div>`:'<div class="px-2.5 pb-1.5"><span style="font-size:9px;color:var(--text-secondary);font-weight:600;">READ ✓</span></div>'}
                </div>`;
            });
        }
    }
    document.querySelector('.chat-area').appendChild(panel);
};

// ─── NOTIFICATION HELPERS ──────────────────────────────────────────────────

window.dismissNotif = async function(id) {
    document.getElementById('notif-'+id)?.remove();
    await sb.from('notifications').delete().eq('id',id);
    window.refreshNotificationBadge?.();
};

window.dismissFired = async function(id) {
    document.getElementById('fired-'+id)?.remove();
    await sb.from('notifications').delete().eq('id',id);
    window.refreshNotificationBadge?.();
};
window.deleteNotification = window.dismissNotif;

window.clearAllNotifications = async function() {
    // Delete in DB then refresh — Supabase v2 delete returns {error} only
    const { error } = await sb.from('notifications').delete().eq('user_id', window.currentUser.id);
    if (error) {
        window.showCenterToast('Clear failed — check RLS policy: notifications DELETE', 'fa-solid fa-lock', 'text-red-500');
        console.error('clearAll error:', error);
        return;
    }
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.refreshNotificationBadge?.();
    window.showCenterToast('All notifications cleared.','fa-solid fa-check-circle','text-green-400');
};

window.clearFiredReminders = async function() {
    const { error } = await sb.from('notifications').delete()
        .eq('user_id', window.currentUser.id).eq('type', 'reminder');
    if (error) {
        window.showCenterToast('Clear failed — check RLS policy','fa-solid fa-lock','text-red-500');
        console.error('clearFired error:', error);
        return;
    }
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.refreshNotificationBadge?.();
    window.showCenterToast('Fired reminders cleared.','fa-solid fa-check-circle','text-green-400');
};

// ─── BADGE ─────────────────────────────────────────────────────────────────

window.refreshNotificationBadge = async function() {
    const {count}=await sb.from('notifications').select('*',{count:'exact',head:true}).eq('user_id',window.currentUser.id).eq('is_read',false);
    const bellEl=document.querySelector('i.ti-bell'); if(!bellEl) return;
    let host=bellEl.closest('.bell-host');
    if(!host){host=document.createElement('span');host.className='bell-host';bellEl.parentNode.insertBefore(host,bellEl);host.appendChild(bellEl);}
    host.querySelector('.notif-badge')?.remove();
    if(count&&count>0){const b=document.createElement('span');b.className='notif-badge';b.textContent=count>9?'9+':count;host.appendChild(b);}
};

window.markNotifRead = async function(id) {
    if(!id||id==='null'||id==='undefined') return;
    await sb.from('notifications').update({is_read:true}).eq('id',id);
    window.refreshNotificationBadge?.();
};

window.deleteReminder = async function(id) {
    await sb.from('reminders').delete().eq('id',id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.showCenterToast('Reminder cancelled.','fa-solid fa-info-circle','text-yellow-400');
};

window.deleteScheduled = async function(id) {
    await sb.from('scheduled_messages').delete().eq('id',id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m=>m.remove());
    window.showCenterToast('Scheduled message cancelled.','fa-solid fa-info-circle','text-yellow-400');
};

// ─── BELL ANIMATION ────────────────────────────────────────────────────────

window.animateBell = function() {
    const bellEl=document.querySelector('i.ti-bell'); if(!bellEl) return;
    bellEl.classList.add('bell-ring');
    const stop=()=>bellEl.classList.remove('bell-ring');
    bellEl.closest('.bell-host')?.addEventListener('click',stop,{once:true});
    bellEl.addEventListener('click',stop,{once:true});
};

// ─── ACTIVITY FEED (right sidebar, task-hub size) ──────────────────────────

window.showScheduleModal = function() {
    if (!window.quillEditor) return;
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    if (!txt) { window.showCenterToast('Type a message first.','fa-solid fa-exclamation-triangle','text-yellow-500'); return; }
    document.getElementById('scheduleModal').classList.remove('hidden');
    document.getElementById('scheduleModal').classList.add('flex');
};

window.closeScheduleModal = function() {
    document.getElementById('scheduleModal').classList.add('hidden');
    document.getElementById('scheduleModal').classList.remove('flex');
};

window.saveScheduledMessage = async function() {
    const time = document.getElementById('scheduleDateTime').value;
    if (!time) { window.showCenterToast('Please pick a date/time','fa-solid fa-times','text-red-500'); return; }
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    const { error } = await sb.from('scheduled_messages').insert({
        sender_id: window.currentUser.id,
        room_id: window.currentRoom,
        message_text: txt,
        scheduled_time: new Date(time).toISOString(),
        status: 'pending'
    });
    if (error) { window.showCenterToast('Failed: ' + error.message,'fa-solid fa-times','text-red-500'); return; }
    window.closeScheduleModal();
    window.quillEditor.root.innerHTML = '';
    window.showCenterToast('Message Scheduled ✓ 🕐','fa-solid fa-check-circle','text-green-400');
};

// ─── DASHBOARD ─────────────────────────────────────────────────────────────────
// Opens the personal stats dashboard modal and loads today's stats by default

