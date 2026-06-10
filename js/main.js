import { sb } from './shared.js';
import './tasks.js'; // Imports and binds tasks to window

window.showReminderModal = function(mid, text) { 
    window.currentReminderId = mid; 
    document.querySelectorAll('.msg-menu-dropdown').forEach(m=>m.remove());
    document.getElementById('reminderMessagePreview').innerText = text; 
    document.getElementById('reminderModal').classList.remove('hidden'); 
    document.getElementById('reminderModal').classList.add('flex'); 
}

window.closeReminderModal = function() { 
    document.getElementById('reminderModal').classList.add('hidden'); 
    document.getElementById('reminderModal').classList.remove('flex'); 
}

window.saveReminder = async function() { 
    const dt = document.getElementById('reminderDateTime').value; 
    if(!dt) return; 
    await sb.from('reminders').insert({ user_id: window.currentUser.id, message_id: window.currentReminderId, reminder_time: new Date(dt).toISOString(), triggered: false }); 
    window.showCenterToast('Reminder Set Successfully'); 
    window.closeReminderModal(); 
}

window.toggleBookmark = async function(mid) { 
    document.querySelectorAll('.msg-menu-dropdown').forEach(m=>m.remove());
    const {data: ex} = await sb.from('bookmarks').select('id').eq('user_id', window.currentUser.id).eq('message_id',mid).maybeSingle(); 
    if(ex) { await sb.from('bookmarks').delete().eq('id',ex.id); window.showCenterToast('Bookmark removed', 'fa-solid fa-info-circle', 'text-yellow-400'); } 
    else { await sb.from('bookmarks').insert({ user_id: window.currentUser.id, message_id: mid }); window.showCenterToast('Message Bookmarked'); } 
}

window.initiateReply = function(parentId, text) {
    window.currentlyReplyingTo = parentId;
    const banner = document.getElementById('replyBanner');
    const bannerText = document.getElementById('replyBannerText');
    banner.classList.remove('hidden');
    bannerText.innerText = text;
    window.quillEditor.focus();
};

window.cancelReply = function() {
    window.currentlyReplyingTo = null;
    const banner = document.getElementById('replyBanner');
    if(banner) banner.classList.add('hidden');
};

window.toggleDateFilter = function() {
    const val = document.getElementById('taskFilter').value;
    const dr = document.getElementById('dateRangeFilter');
    if (val === 'date_range') dr.classList.remove('hidden');
    else dr.classList.add('hidden');
    window.loadTasksForPanel();
}

window.applyFilters = function() {
    const search = document.getElementById('messageSearchBar').value.toLowerCase();
    document.querySelectorAll('#messagesContainer > div.message-bubble').forEach(el => {
        let show = true;
        const text = el.innerText.toLowerCase();
        if (search && !text.includes(search)) show = false;
        el.style.display = show ? 'flex' : 'none';
    });
}

window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    const panel = document.createElement('div');
    panel.className = 'top-panel-dropdown right-10 top-16 w-80 max-h-96 overflow-y-auto p-4';
    
    if (type === 'scheduled') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-2 mb-2"><i class="fa-regular fa-clock"></i> Scheduled Messages</h4>`;
        const {data} = await sb.from('scheduled_messages').select('*').eq('sender_id', window.currentUser.id).eq('status', 'pending');
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs text-gray-500">No scheduled messages.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2 bg-black/5 rounded text-sm flex justify-between items-center">
                <span class="truncate w-48">${window.escapeHtml(d.message_text)}</span>
                <i class="fa-solid fa-times text-red-500 cursor-pointer" onclick="window.deleteScheduled('${d.id}')"></i>
            </div>`;
        });
    } else if (type === 'bookmarks') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-2 mb-2"><i class="fa-regular fa-bookmark"></i> Bookmarks</h4>`;
        const {data} = await sb.from('bookmarks').select('*, messages(text)').eq('user_id', window.currentUser.id);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs text-gray-500">No bookmarks.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2 bg-black/5 rounded text-sm cursor-pointer hover:bg-black/10" onclick="window.scrollToAndHighlight('msg-${d.message_id}')">
                <span class="truncate block">${window.escapeHtml(d.messages?.text)}</span>
            </div>`;
        });
    } else if (type === 'alerts') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-2 mb-2"><i class="fa-regular fa-bell"></i> Alerts</h4>`;
        const {data} = await sb.from('notifications').select('*').eq('user_id', window.currentUser.id).order('created_at', {ascending: false}).limit(10);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs text-gray-500">All caught up!</p>`;
        data?.forEach(d => {
             panel.innerHTML += `<div class="mb-2 p-2 bg-black/5 rounded text-sm cursor-pointer hover:bg-black/10" onclick="window.scrollToAndHighlight('msg-${d.message_id}')">
                <span class="block">${window.escapeHtml(d.message)}</span>
            </div>`;
        });
    }
    document.querySelector('.chat-area').appendChild(panel);
}

window.deleteScheduled = async function(id) {
    await sb.from('scheduled_messages').delete().eq('id', id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.showCenterToast('Scheduled message cancelled.', 'fa-solid fa-info-circle', 'text-yellow-400');
}

window.showScheduleModal = function() {
    const txt = window.quillEditor.root.innerHTML.trim();
    if(!txt || txt === '<p><br></p>') { window.showCenterToast('Type a message first.', 'fa-solid fa-exclamation-triangle', 'text-yellow-500'); return; }
    document.getElementById('scheduleModal').classList.remove('hidden');
    document.getElementById('scheduleModal').classList.add('flex');
}

window.closeScheduleModal = function() {
    document.getElementById('scheduleModal').classList.add('hidden');
    document.getElementById('scheduleModal').classList.remove('flex');
}

window.saveScheduledMessage = async function() {
    const time = document.getElementById('scheduleDateTime').value;
    if(!time) return;
    const txt = window.quillEditor.root.innerHTML.trim();
    await sb.from('scheduled_messages').insert({ sender_id: window.currentUser.id, room_id: window.currentRoom, message_text: txt, scheduled_time: new Date(time).toISOString(), status: 'pending' });
    window.closeScheduleModal();
    window.quillEditor.root.innerHTML = '';
    window.showCenterToast('Message Scheduled Successfully!');
}

window.addEmoji = function() {
    window.quillEditor.root.innerHTML += '😀'; 
    window.showCenterToast('Emoji added!', 'fa-regular fa-face-smile', 'text-yellow-400');
}

window.loadChatsList = async function() {
    const groups = ['general', 'math', 'science', 'leadership'];
    const {data: users} = await sb.from('profiles').select('id, email, full_name');
    window.globalUsersCache = users || []; 
    
    let html = `<div class="px-3 py-2 mt-2 text-[11px] font-bold tracking-wider uppercase" style="color: var(--text-secondary)">Groups</div>`;
    groups.forEach(g => { 
        html += `<div class="channel-item p-2 mx-2 mb-1 rounded-lg cursor-pointer hover:bg-black/5 flex items-center gap-3 ${window.currentRoom === g ? 'bg-black/5' : ''}" data-room="${g}" data-name="# ${g}"><div class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs bg-gray-400"><i class="fa-solid fa-users"></i></div><span class="flex-1 truncate font-medium"># ${g}</span></div>`; 
    });
    html += `<div class="px-3 py-2 mt-4 text-[11px] font-bold tracking-wider uppercase" style="color: var(--text-secondary)">Direct Messages</div>`;
    window.globalUsersCache.filter(u => u.id !== window.currentUser.id).forEach(u => { 
        const name = window.toSentenceCase(u.full_name || u.email.split('@')[0]);
        html += `<div class="channel-item p-2 mx-2 mb-1 rounded-lg cursor-pointer hover:bg-black/5 flex items-center gap-3 ${window.currentRoom === 'dm_' + u.id ? 'bg-black/5' : ''}" data-room="dm_${u.id}" data-name="${name}"><div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs" style="background: var(--accent)">${name.charAt(0).toUpperCase()}</div><span class="flex-1 truncate font-medium">${name}</span></div>`; 
    });
    document.getElementById('chatsList').innerHTML = html;
    
    document.querySelectorAll('.channel-item').forEach(el => { 
        el.addEventListener('click', () => { 
            window.currentRoom = el.dataset.room; 
            document.querySelectorAll('.channel-item').forEach(item => item.classList.remove('bg-black/5'));
            el.classList.add('bg-black/5');
            const titleSpan = document.getElementById('roomTitleDisplay');
            if(titleSpan) titleSpan.innerText = el.dataset.name;
            document.getElementById('messagesContainer').innerHTML = '<div class="m-auto flex flex-col items-center opacity-50"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3" style="color: var(--accent)"></i><p>Loading chat...</p></div>';
            window.loadMessages(); 
        }); 
    });
}

window.sendMessage = async function() {
    const text = window.quillEditor.root.innerHTML.trim();
    if (!text || text === '<p><br></p>') return;
    
    let payload = { room_id: window.currentRoom, sender_id: window.currentUser.id, text, created_at: new Date().toISOString() };
    if (window.currentlyReplyingTo) {
        payload.parent_message_id = window.currentlyReplyingTo;
    }
    
    await sb.from('messages').insert(payload);
    window.quillEditor.root.innerHTML = '';
    window.cancelReply();
    window.loadMessages();
}

window.loadMessages = async function() {
    const {data: msgs} = await sb.from('messages').select('*, profiles(full_name, email)').eq('room_id', window.currentRoom).order('created_at', {ascending: true});
    window.renderMessages(msgs || []);
    window.applyFilters();
    const c = document.getElementById('messagesContainer');
    if(c) c.scrollTop = c.scrollHeight;
}

window.renderMessages = function(messages) {
    const c = document.getElementById('messagesContainer');
    if (!c) return;
    if (!messages.length) { c.innerHTML = '<div class="m-auto flex flex-col items-center opacity-50"><i class="fa-regular fa-comments text-5xl mb-3"></i><p>Say hello!</p></div>'; return; }
    
    const msgMap = new Map();
    messages.forEach(m => msgMap.set(m.id, m));
    const topLevel = [];
    const replies = {};
    
    messages.forEach(msg => {
        if (msg.parent_message_id) {
            let rootId = msg.parent_message_id;
            const visited = new Set();
            while (msgMap.has(rootId) && msgMap.get(rootId).parent_message_id) {
                if(visited.has(rootId)) break;
                visited.add(rootId);
                rootId = msgMap.get(rootId).parent_message_id;
            }
            if (!replies[rootId]) replies[rootId] = [];
            replies[rootId].push(msg);
        } else {
            topLevel.push(msg);
        }
    });

    function buildMsgHTML(msg) {
        const isOwn = msg.sender_id === window.currentUser.id;
        const senderName = window.toSentenceCase(msg.profiles?.full_name || msg.profiles?.email.split('@')[0] || 'Unknown');
        const time = window.getISTTime(msg.created_at);
        const alignClass = isOwn ? 'sent' : 'received';
        const snippetText = window.getSnippet(msg.text);
        
        let displayHtml = msg.text.replace(/href="secure-file:([^"]+)"/g, `href="javascript:void(0);" onclick="window.openSecureFile('$1'); return false;" class="text-blue-600 underline font-medium"`);

        let html = `<div id="msg-${msg.id}" class="message-bubble ${alignClass}">
                    <div class="bubble-content">
                        <div class="bubble-controls top-bar-icon">
                            <i class="fa-solid fa-reply" title="Reply" onclick="window.initiateReply('${msg.id}', '${snippetText}')"></i>
                            <i class="fa-solid fa-ellipsis-vertical menu-dots" data-msg-id="${msg.id}" data-msg-text="${window.escapeHtml(msg.text)}"></i>
                        </div>
                        <div class="message-meta">
                            <span class="font-bold" style="${isOwn ? 'display:none;' : 'color: var(--accent)'}">${window.escapeHtml(senderName)}</span>
                            <span class="ml-auto opacity-60 text-xs">${time} ${isOwn ? '<i class="fa-solid fa-check-double text-blue-400"></i>' : ''}</span>
                        </div>
                        <div class="text-[15px] leading-relaxed pr-8 msg-text-content">${displayHtml}</div>
                    </div>
                </div>`;
        
        if (replies[msg.id] && replies[msg.id].length > 0) {
            html += `<div class="ml-12 border-l border-gray-300 pl-4 mb-4 flex flex-col gap-3">`;
            replies[msg.id].forEach((child, idx) => { 
                const cName = window.toSentenceCase(child.profiles?.full_name || child.profiles?.email.split('@')[0] || 'Unknown');
                const cTime = window.getISTTime(child.created_at);
                let cDisplayHtml = child.text.replace(/href="secure-file:([^"]+)"/g, `href="javascript:void(0);" onclick="window.openSecureFile('$1'); return false;" class="text-blue-600 underline font-medium"`);
                const cSnippet = window.getSnippet(child.text);
                
                html += `
                <div class="message-bubble received w-full max-w-full mb-0 relative group">
                    <div class="absolute -left-4 top-4 w-4 h-px bg-gray-300"></div>
                    <div class="bubble-content shadow-sm" style="background: var(--received-bg); border-radius: 8px;">
                        <div class="flex justify-between items-start mb-1">
                            <div class="text-[11px] flex items-center gap-2">
                                <span class="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-[9px] font-bold">#${idx + 1}</span>
                                <span class="font-bold text-gray-700">${window.escapeHtml(cName)}</span>
                                <span class="opacity-60">${cTime}</span>
                            </div>
                            <i class="fa-solid fa-reply text-gray-400 hover:text-[var(--accent)] cursor-pointer text-xs opacity-0 group-hover:opacity-100 transition-opacity" title="Reply" onclick="window.initiateReply('${msg.id}', '${cSnippet}')"></i>
                        </div>
                        <div class="text-[13px] leading-snug text-gray-800 mt-1">${cDisplayHtml}</div>
                        <div class="mt-2 pt-2 border-t border-gray-100 flex gap-1.5">
                            <button class="px-2 py-0.5 bg-gray-50 hover:bg-gray-100 rounded text-[10px] text-gray-500 border border-gray-200 transition-colors">👍</button>
                            <button class="px-2 py-0.5 bg-gray-50 hover:bg-gray-100 rounded text-[10px] text-gray-500 border border-gray-200 transition-colors">❤️</button>
                            <button class="px-2 py-0.5 bg-gray-50 hover:bg-gray-100 rounded text-[10px] text-gray-500 border border-gray-200 transition-colors">✅</button>
                        </div>
                    </div>
                </div>`;
            });
            html += `</div>`;
        }
        return html;
    }

    c.innerHTML = topLevel.map(msg => buildMsgHTML(msg)).join('');

    document.querySelectorAll('.menu-dots').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.msg-menu-dropdown').forEach(m => m.remove());
            const mid = el.dataset.msgId, mtext = el.dataset.msgText;
            const menu = document.createElement('div');
            menu.className = 'msg-menu-dropdown p-1';
            menu.style.minWidth = '160px';
            menu.innerHTML = `
                <div class="cursor-pointer px-3 py-2 text-sm hover:bg-black/5 transition flex items-center gap-2" onclick="window.openTaskModal('${mid}', '${mtext.replace(/'/g, "\\'")}')"><i class="fa-solid fa-tasks text-emerald-500 w-4"></i> Create Task</div>
                <div class="cursor-pointer px-3 py-2 text-sm hover:bg-black/5 transition flex items-center gap-2" onclick="window.showReminderModal('${mid}', '${mtext.replace(/'/g, "\\'")}')"><i class="fa-regular fa-bell text-yellow-500 w-4"></i> Reminder</div>
                <div class="cursor-pointer px-3 py-2 text-sm hover:bg-black/5 transition flex items-center gap-2" onclick="window.toggleBookmark('${mid}')"><i class="fa-solid fa-star text-orange-400 w-4"></i> Bookmark</div>
            `;
            document.body.appendChild(menu);
            const rect = el.getBoundingClientRect();
            menu.style.top = (rect.bottom + window.scrollY) + 'px';
            menu.style.left = (rect.left - 120 + window.scrollX) + 'px';
        });
    });
}

window.startSubscriptions = function() { 
    if(messageSubscription) messageSubscription.unsubscribe();
    messageSubscription = sb.channel('public:messages').on('postgres_changes', {event:'INSERT', schema:'public', table:'messages'}, (p) => { if(p.new.room_id === window.currentRoom) window.loadMessages(); }).subscribe();
    
    if(taskSubscription) taskSubscription.unsubscribe(); 
    taskSubscription = sb.channel('tasks-changes').on('postgres_changes', {event:'*', schema:'public', table:'tasks'}, () => { window.loadTasksForPanel(); }).subscribe(); 
    
    if(assigneeSubscription) assigneeSubscription.unsubscribe(); 
    assigneeSubscription = sb.channel('assignees-changes').on('postgres_changes', {event:'*', schema:'public', table:'task_assignees'}, () => { window.loadTasksForPanel(); }).subscribe(); 
    
    if(trailSubscription) trailSubscription.unsubscribe(); 
    trailSubscription = sb.channel('trails-changes').on('postgres_changes', {event:'*', schema:'public', table:'task_trails'}, () => { window.loadTasksForPanel(); }).subscribe(); 
}

// Ensure ensureProfile exists globally
window.ensureProfile = async function() { 
    if(!window.currentUser) return; 
    const {data:ex}=await sb.from('profiles').select('id').eq('id',window.currentUser.id).maybeSingle(); 
    if(!ex) await sb.from('profiles').insert({id:window.currentUser.id, email:window.currentUser.email, full_name:window.currentUser.email.split('@')[0], role:'teacher'}); 
}

// Boot Sequence
(async() => { 
    const {data: {session}} = await sb.auth.getSession(); 
    if(!session) window.renderAuthScreen(); 
    else { 
        window.currentUser = session.user; 
        await window.ensureProfile(); 
        window.renderMainApp(); 
        window.startSubscriptions(); 
    } 
})();
