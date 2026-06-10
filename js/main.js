import { sb } from './shared.js';
import './tasks.js'; // Imports and binds tasks to window

window.currentTheme = localStorage.getItem('theme') || 'light';

window.applyTheme = function() { 
    document.documentElement.setAttribute('data-theme', window.currentTheme); 
};

window.signIn = async function(email, pwd) { 
    const {data, error} = await sb.auth.signInWithPassword({email, password: pwd}); 
    if(!error && data?.user) { 
        window.currentUser = data.user; 
        await window.ensureProfile(); 
        window.renderMainApp(); 
        window.startSubscriptions(); 
        return true; 
    } 
    return false; 
};

window.signUp = async function(email, pwd) { 
    const {data, error} = await sb.auth.signUp({email, password: pwd}); 
    if(error) throw error; 
    window.showCenterToast('Sign up successful! Please wait for admin approval or check email.', 'fa-solid fa-envelope', 'text-blue-400'); 
};

window.logout = async function() { 
    await sb.auth.signOut(); 
    window.currentUser = null; 
    window.renderAuthScreen(); 
};

window.renderAuthScreen = function() { 
    window.applyTheme();
    document.getElementById('root').innerHTML = `
        <div class="min-h-screen w-full flex items-center justify-center" style="background-color: var(--bg-body);">
            <div class="modal-content p-10 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold tracking-tight">MPGS TaskFlow</h1>
                    <p class="text-sm mt-2" style="color: var(--text-secondary)">Enterprise Communication Portal</p>
                </div>
                <div class="space-y-4">
                    <input id="email" placeholder="Email Address" class="ui-input w-full px-4 py-3 rounded-xl">
                    <div class="relative">
                        <input id="password" type="password" placeholder="Password (Min 6 chars)" class="ui-input w-full px-4 py-3 rounded-xl pr-10">
                        <i class="fa-solid fa-eye absolute right-4 top-4 text-gray-400 cursor-pointer hover:text-gray-600" id="togglePassword"></i>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button id="loginBtn" class="flex-1 py-3 px-4 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-medium shadow-md transition-colors">Login</button>
                        <button id="signupBtn" class="flex-1 py-3 px-4 rounded-xl border border-[var(--accent)] text-[var(--accent)] hover:bg-black/5 font-medium shadow-sm transition-colors">Sign Up</button>
                    </div>
                    <div id="authMsg" class="mt-4 text-center text-red-500 text-sm font-medium h-5"></div>
                </div>
            </div>
        </div>`; 
    
    document.getElementById('togglePassword').onclick = () => {
        const pwd = document.getElementById('password');
        const icon = document.getElementById('togglePassword');
        if (pwd.type === 'password') { pwd.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
        else { pwd.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
    };

    document.getElementById('loginBtn').onclick = async () => { 
        const ok = await window.signIn(document.getElementById('email').value, document.getElementById('password').value); 
        if(!ok) document.getElementById('authMsg').innerText = 'Invalid credentials'; 
    };
    
    document.getElementById('signupBtn').onclick = async () => { 
        try { 
            const email = document.getElementById('email').value;
            const pwd = document.getElementById('password').value;
            if(pwd.length < 6) throw new Error("Password must be at least 6 characters.");
            if(!email) throw new Error("Email is required.");
            await window.signUp(email, pwd); 
        } 
        catch(e) { document.getElementById('authMsg').innerText = e.message; } 
    };
};

window.renderMainApp = function() {
    window.applyTheme();
    const userNameDisplay = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'User';

    document.getElementById('root').innerHTML = `
        <div class="flex h-full w-full">
            <div class="w-80 sidebar-glass flex flex-col border-r z-20 shadow-sm">
                <div class="p-4 flex justify-between items-center border-b" style="border-color: var(--border-color)">
                    <h2 class="text-xl font-bold tracking-tight flex items-center gap-2">
                        <i class="fa-solid fa-comments" style="color: var(--accent)"></i> Chats
                    </h2>
                    <button onclick="window.logout()" class="w-8 h-8 rounded-full hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors"><i class="fa-solid fa-sign-out-alt text-sm"></i></button>
                </div>
                <div class="p-3"><input type="text" id="globalSearch" placeholder="Search chats" class="ui-input w-full p-2 rounded-xl text-sm"></div>
                <div id="chatsList" class="flex-1 overflow-y-auto px-2 pb-4"></div>
                
                <div class="p-3 border-t flex flex-col items-center justify-center gap-1.5" style="border-color: var(--border-color)">
                    <div class="text-[13px] font-bold text-gray-700 flex items-center gap-2 bg-black/5 px-3 py-1.5 rounded-full w-full justify-center">
                        <div class="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[10px]">${userNameDisplay.charAt(0).toUpperCase()}</div>
                        ${window.escapeHtml(userNameDisplay.toUpperCase())}
                    </div>
                    <div class="text-[9px] font-bold tracking-wider text-gray-400 uppercase mt-1">
                        v1.13.3 - UI Rendering Restored
                    </div>
                </div>
            </div>

            <div class="flex-1 flex flex-col chat-area relative">
                <div class="p-4 sidebar-glass border-b z-10 flex justify-between items-center shadow-sm" style="border-color: var(--border-color)">
                    <div class="flex items-center gap-3">
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight"># ${window.currentRoom}</span>
                    </div>
                    <div class="flex items-center gap-5 text-xl" style="color: var(--text-secondary)">
                        <i class="fa-regular fa-clock cursor-pointer hover:text-[var(--accent)] top-bar-icon" onclick="window.openTopPanel('scheduled')" title="Scheduled Messages"></i>
                        <i class="fa-regular fa-bookmark cursor-pointer hover:text-[var(--accent)] top-bar-icon" onclick="window.openTopPanel('bookmarks')" title="Bookmarks"></i>
                        <i class="fa-regular fa-bell cursor-pointer hover:text-[var(--accent)] top-bar-icon" onclick="window.openTopPanel('alerts')" title="Notifications"></i>
                        <input type="text" id="messageSearchBar" placeholder="Search..." class="ui-input px-3 py-1 rounded-full text-sm w-48">
                    </div>
                </div>
                
                <div id="messagesContainer" class="flex-1 overflow-y-auto p-6 flex flex-col"></div>
                
                <div class="input-container flex flex-col relative">
                    <div id="replyBanner" class="hidden mx-2 mt-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-t-xl flex justify-between items-center z-0 relative shadow-sm text-xs border-b-0">
                        <div class="text-indigo-700 flex items-center gap-2 overflow-hidden">
                            <i class="fa-solid fa-reply"></i>
                            <span class="font-bold whitespace-nowrap">Replying to:</span>
                            <span id="replyBannerText" class="italic truncate text-indigo-500 max-w-[200px]"></span>
                        </div>
                        <i class="fa-solid fa-times text-indigo-400 hover:text-red-500 cursor-pointer p-1" onclick="window.cancelReply()"></i>
                    </div>

                    <div class="quill-wrapper z-10 bg-white shadow-sm">
                        <div id="richEditor"></div>
                    </div>
                    <div class="flex justify-between items-center mt-2 px-2">
                        <div class="flex gap-4 text-xl" style="color: var(--text-secondary)">
                            <i class="fa-regular fa-face-smile cursor-pointer hover:text-[var(--accent)]" title="Emoji" onclick="window.addEmoji()"></i>
                            <i class="fa-solid fa-paperclip cursor-pointer hover:text-[var(--accent)]" title="Attach File" onclick="document.getElementById('fileAttachment').click()"></i>
                            <input type="file" id="fileAttachment" class="hidden">
                        </div>
                        <div class="flex gap-2">
                            <button id="scheduleMsgBtn" class="px-4 py-2 rounded-full font-medium text-sm border bg-transparent hover:bg-black/5" style="color: var(--text-secondary); border-color: var(--border-color); cursor: pointer;">
                                <i class="fa-regular fa-clock"></i> Schedule
                            </button>
                            <button id="sendBtn" class="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full px-5 py-2 font-medium flex items-center gap-2 transition-colors">
                                Send <i class="fa-solid fa-paper-plane text-sm"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="w-[450px] sidebar-glass border-l flex flex-col z-20 shadow-sm hidden md:flex" style="border-color: var(--border-color)">
                <div class="p-3 border-b flex flex-col gap-2 bg-white">
                    <h3 class="font-bold text-gray-800 flex items-center gap-2"><i class="fa-solid fa-filter text-[var(--accent)]"></i> Task Filters</h3>
                    <select id="taskFilter" onchange="window.toggleDateFilter()" class="ui-input text-xs px-2 py-2 rounded-lg border-gray-200 font-medium text-gray-700 bg-gray-50 shadow-sm outline-none cursor-pointer w-full focus:ring-2 focus:ring-[var(--accent)] transition-all">
                        <option value="all">All Tasks</option>
                        <option value="today">Today</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="allotted_by_me">Allotted by Me</option>
                        <option value="allotted_to_me">Allotted to Me</option>
                        <option value="delegated">Delegated</option>
                        <option value="transferred">Transferred</option>
                        <option value="date_range">Date Range</option>
                    </select>
                </div>
                <div id="dateRangeFilter" class="hidden px-3 pt-2 pb-3 bg-white border-b border-gray-100 flex gap-2 items-center">
                    <input type="date" id="filterStartDate" onchange="window.loadTasksForPanel()" class="ui-input text-xs px-2 py-1.5 rounded w-full border-gray-300">
                    <span class="text-[10px] font-bold text-gray-400">TO</span>
                    <input type="date" id="filterEndDate" onchange="window.loadTasksForPanel()" class="ui-input text-xs px-2 py-1.5 rounded w-full border-gray-300">
                </div>
                <div id="tasksPanel" class="flex-1 overflow-y-auto p-4 bg-gray-50/50"></div>
            </div>
        </div>

        <div id="scheduleModal" class="fixed inset-0 modal-overlay hidden items-center justify-center z-50">
            <div class="modal-content rounded-2xl p-6 w-full max-w-sm mx-4 text-center">
                <i class="fa-regular fa-clock text-4xl mb-4" style="color: var(--accent)"></i>
                <h3 class="text-xl font-bold mb-2">Schedule Message</h3>
                <p class="text-sm mb-6" style="color: var(--text-secondary)">Select when to send your composed message.</p>
                <input type="datetime-local" id="scheduleDateTime" class="ui-input w-full p-3 rounded-xl mb-6">
                <div class="flex gap-3">
                    <button onclick="window.closeScheduleModal()" class="flex-1 py-2.5 rounded-xl font-medium ui-input border-none cursor-pointer">Cancel</button>
                    <button onclick="window.saveScheduledMessage()" class="flex-1 py-2.5 rounded-xl font-medium bg-[var(--accent)] text-white">Confirm</button>
                </div>
            </div>
        </div>

        <div id="taskModal" class="fixed inset-0 modal-overlay hidden items-center justify-center z-50">
            <div class="modal-content rounded-2xl p-6 w-full max-w-md mx-4">
                <h3 class="text-xl font-bold mb-4">Create Task</h3>
                <input id="taskTitle" class="ui-input w-full p-3 rounded-xl mb-3" placeholder="Task Title">
                
                <p class="text-xs font-bold text-gray-500 mb-1">Assigned To:</p>
                <div class="border rounded-xl mb-3 overflow-hidden border-gray-300">
                    <input type="text" id="assigneeSearch" onkeyup="window.filterAssignees()" placeholder="Search users..." class="w-full p-2 text-xs border-b outline-none bg-gray-50 text-gray-700">
                    <div id="assigneeCheckboxList" class="max-h-32 overflow-y-auto bg-white p-2 flex flex-col gap-1">
                        </div>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <p class="text-xs font-bold text-gray-500 mb-1">Deadline:</p>
                        <input type="date" id="taskDeadline" class="ui-input w-full p-2.5 rounded-xl">
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-500 mb-1">Priority:</p>
                        <select id="taskPriority" class="ui-input w-full p-2.5 rounded-xl">
                            <option value="Low">Low</option>
                            <option value="Medium" selected>Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                </div>
                <label class="flex items-start gap-2 text-xs cursor-pointer mt-2 mb-4 p-2.5 bg-black/5 rounded-lg text-gray-700">
                    <input type="checkbox" id="taskRequireProof" class="mt-0.5"> 
                    <span><b>Require proof File To Complete</b><br><span class="opacity-70">(Users Need To Upload File To Submit Task)</span></span>
                </label>
                <div class="flex gap-3 mt-4">
                    <button onclick="window.closeTaskModal()" class="flex-1 py-2.5 rounded-xl ui-input border-none cursor-pointer hover:bg-gray-100 font-bold">Cancel</button>
                    <button onclick="window.saveTaskMultiAssignee()" class="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold transition-colors">Create</button>
                </div>
            </div>
        </div>

        <div id="reminderModal" class="fixed inset-0 modal-overlay hidden items-center justify-center z-50">
            <div class="modal-content rounded-2xl p-6 w-full max-w-sm mx-4">
                <h3 class="text-xl font-bold mb-4">Set Reminder</h3>
                <p id="reminderMessagePreview" class="text-sm mb-4 truncate text-gray-500"></p>
                <input type="datetime-local" id="reminderDateTime" class="ui-input w-full p-3 rounded-xl mb-6">
                <div class="flex gap-3">
                    <button onclick="window.closeReminderModal()" class="flex-1 py-2.5 rounded-xl ui-input border-none cursor-pointer">Cancel</button>
                    <button onclick="window.saveReminder()" class="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold">Set</button>
                </div>
            </div>
        </div>
    `;
    
    window.quillEditor = new Quill('#richEditor', { 
        theme: 'snow', 
        placeholder: 'Type a message...', 
        modules: { toolbar: [['bold','italic','underline','strike'], [{'list': 'ordered'}, {'list': 'bullet'}], ['clean']] } 
    });

    document.getElementById('sendBtn').onclick = window.sendMessage;
    window.quillEditor.root.addEventListener('keydown', (e) => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); window.sendMessage(); } });
    
    document.getElementById('fileAttachment').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            window.showCenterToast('Uploading secure file...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
            const sizeKB = Math.round(file.size / 1024);
            const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const filePath = `chat/${Date.now()}_${safeName}`;
            
            const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
            if(error) {
                window.showCenterToast('Upload failed: ' + error.message, 'fa-solid fa-times', 'text-red-500');
                return;
            }
            
            window.quillEditor.focus();
            const range = window.quillEditor.getSelection() || { index: window.quillEditor.getLength() };
            window.quillEditor.insertText(range.index, `📁 Attached File: ${file.name} (${sizeKB} KB)\n`, 'link', `secure-file:${filePath}`);
            
            window.showCenterToast('File securely attached!', 'fa-solid fa-check-circle', 'text-green-500');
            e.target.value = ''; 
        }
    });

    document.getElementById('scheduleMsgBtn').onclick = window.showScheduleModal;
    document.getElementById('messageSearchBar').addEventListener('input', window.applyFilters);
    
    window.loadChatsList(); 
    window.loadMessages(); 
    window.loadTasksForPanel(); 
};

window.openTaskModal = async function(mid, text) { 
    window.currentMessageId = mid; 
    let tmp = document.createElement("DIV");
    tmp.innerHTML = text;
    window.currentMessageTextRaw = (tmp.textContent || tmp.innerText || "").substring(0,60) + "...";

    document.querySelectorAll('.msg-menu-dropdown').forEach(m=>m.remove());
    document.getElementById('taskModal').classList.remove('hidden'); 
    document.getElementById('taskModal').classList.add('flex'); 
    document.getElementById('taskTitle').value = (tmp.textContent || tmp.innerText || "").trim(); 
    
    const filteredUsers = window.globalUsersCache.filter(u => u.id !== window.currentUser.id);
    const list = document.getElementById('assigneeCheckboxList');
    list.innerHTML = filteredUsers.map(u => `
        <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 hover:bg-gray-100 rounded cursor-pointer transition-colors">
            <input type="checkbox" value="${u.id}" class="assignee-cb w-4 h-4 accent-[var(--accent)]">
            <span class="assignee-name font-medium text-gray-700">${window.escapeHtml(window.toSentenceCase(u.full_name || u.email.split('@')[0]))}</span>
        </label>
    `).join('');
    document.getElementById('assigneeSearch').value = '';
}

window.filterAssignees = function() {
    const term = document.getElementById('assigneeSearch').value.toLowerCase();
    document.querySelectorAll('.assignee-item').forEach(el => {
        const name = el.querySelector('.assignee-name').innerText.toLowerCase();
        el.style.display = name.includes(term) ? 'flex' : 'none';
    });
}

window.closeTaskModal = function() { 
    document.getElementById('taskModal').classList.add('hidden'); 
    document.getElementById('taskModal').classList.remove('flex'); 
}

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
};

window.ensureProfile = async function() { 
    if(!window.currentUser) return; 
    const {data:ex} = await sb.from('profiles').select('id').eq('id', window.currentUser.id).maybeSingle(); 
    if(!ex) await sb.from('profiles').insert({id: window.currentUser.id, email: window.currentUser.email, full_name: window.currentUser.email.split('@')[0], role: 'teacher'}); 
};

// Boot Sequence
;(async() => { 
    const {data: {session}} = await sb.auth.getSession(); 
    if(!session) {
        window.renderAuthScreen(); 
    } else { 
        window.currentUser = session.user; 
        await window.ensureProfile(); 
        window.renderMainApp(); 
        window.startSubscriptions(); 
    } 
})();
