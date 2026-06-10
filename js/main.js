import { sb } from './shared.js';
import './tasks.js'; // Imports and binds tasks to window

// Explicitly declare subscription trackers
let messageSubscription = null;
let taskSubscription = null;
let assigneeSubscription = null;
let trailSubscription = null;

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
            <div class="modal-content p-10 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden bg-white">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold tracking-tight text-gray-900">MPGS TaskFlow</h1>
                    <p class="text-sm mt-2 text-gray-500">Enterprise Communication Portal</p>
                </div>
                <div class="space-y-4">
                    <input id="email" placeholder="Email Address" class="ui-input w-full px-4 py-3 rounded-xl border border-gray-300">
                    <div class="relative">
                        <input id="password" type="password" placeholder="Password (Min 6 chars)" class="ui-input w-full px-4 py-3 rounded-xl border border-gray-300 pr-10">
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
        <div class="flex h-full w-full bg-gray-50">
            <div class="w-80 flex flex-col border-r z-20 shadow-sm bg-white border-gray-200">
                <div class="p-4 flex justify-between items-center border-b border-gray-200">
                    <h2 class="text-xl font-bold tracking-tight flex items-center gap-2 text-gray-800">
                        <i class="fa-solid fa-comments text-[var(--accent)]"></i> Chats
                    </h2>
                    <button onclick="window.logout()" class="w-8 h-8 rounded-full hover:bg-red-100 text-gray-500 hover:text-red-600 flex items-center justify-center transition-colors"><i class="fa-solid fa-sign-out-alt text-sm"></i></button>
                </div>
                <div class="p-3"><input type="text" id="globalSearch" placeholder="Search chats" class="w-full p-2 rounded-xl text-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-[var(--accent)]"></div>
                <div id="chatsList" class="flex-1 overflow-y-auto px-2 pb-4"></div>
                
                <div class="p-3 border-t border-gray-200 flex flex-col items-center justify-center gap-1.5 bg-gray-50/50">
                    <div class="text-[13px] font-bold text-gray-700 flex items-center gap-2 bg-white border border-gray-200 shadow-sm px-3 py-1.5 rounded-full w-full justify-center">
                        <div class="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[10px]">${userNameDisplay.charAt(0).toUpperCase()}</div>
                        ${window.escapeHtml(userNameDisplay.toUpperCase())}
                    </div>
                    <div class="text-[9px] font-bold tracking-wider text-gray-400 uppercase mt-1">
                        v1.14.0 - Premium UI Upgrade
                    </div>
                </div>
            </div>

            <div class="flex-1 flex flex-col relative" style="background-color: var(--bg-chat); background-image: var(--chat-pattern); background-blend-mode: overlay;">
                <div class="p-4 border-b z-10 flex justify-between items-center shadow-sm bg-white/95 backdrop-blur border-gray-200">
                    <div class="flex items-center gap-3">
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight text-gray-800"># ${window.currentRoom}</span>
                    </div>
                    <div class="flex items-center gap-5 text-xl text-gray-500">
                        <i class="fa-regular fa-clock cursor-pointer hover:text-[var(--accent)] top-bar-icon" onclick="window.openTopPanel('scheduled')" title="Scheduled Messages"></i>
                        <i class="fa-regular fa-bookmark cursor-pointer hover:text-[var(--accent)] top-bar-icon" onclick="window.openTopPanel('bookmarks')" title="Bookmarks"></i>
                        <i class="fa-regular fa-bell cursor-pointer hover:text-[var(--accent)] top-bar-icon" onclick="window.openTopPanel('alerts')" title="Notifications"></i>
                        <input type="text" id="messageSearchBar" placeholder="Search..." class="px-3 py-1 rounded-full text-sm w-48 border border-gray-200 bg-gray-50 focus:outline-none focus:border-[var(--accent)]">
                    </div>
                </div>
                
                <div id="messagesContainer" class="flex-1 overflow-y-auto p-6 flex flex-col"></div>
                
                <div class="flex flex-col relative bg-white border-t border-gray-200 p-3 px-5">
                    <div id="replyBanner" class="hidden mx-2 mt-0 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center z-0 relative shadow-sm text-xs">
                        <div class="text-indigo-700 flex items-center gap-2 overflow-hidden">
                            <i class="fa-solid fa-reply"></i>
                            <span class="font-bold whitespace-nowrap">Replying to:</span>
                            <span id="replyBannerText" class="italic truncate text-indigo-500 max-w-[200px]"></span>
                        </div>
                        <i class="fa-solid fa-times text-indigo-400 hover:text-red-500 cursor-pointer p-1" onclick="window.cancelReply()"></i>
                    </div>

                    <div class="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden flex flex-col relative z-10 shadow-inner">
                        <div id="richEditor"></div>
                    </div>
                    <div class="flex justify-between items-center mt-3 px-2">
                        <div class="flex gap-4 text-xl text-gray-500">
                            <i class="fa-regular fa-face-smile cursor-pointer hover:text-[var(--accent)] transition-colors" title="Emoji" onclick="window.addEmoji()"></i>
                            <i class="fa-solid fa-paperclip cursor-pointer hover:text-[var(--accent)] transition-colors" title="Attach File" onclick="document.getElementById('fileAttachment').click()"></i>
                            <input type="file" id="fileAttachment" class="hidden">
                        </div>
                        <div class="flex gap-2">
                            <button id="scheduleMsgBtn" class="px-4 py-2 rounded-full font-bold text-xs border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 shadow-sm cursor-pointer transition-colors">
                                <i class="fa-regular fa-clock"></i> Schedule
                            </button>
                            <button id="sendBtn" class="bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-full px-5 py-2 font-bold flex items-center gap-2 shadow-md transition-colors text-sm">
                                Send <i class="fa-solid fa-paper-plane text-xs"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="w-[450px] border-l flex flex-col z-20 shadow-sm hidden md:flex bg-gray-50 border-gray-200">
                <div class="p-3 border-b border-gray-200 flex flex-col gap-2 bg-white">
                    <h3 class="font-bold text-gray-800 flex items-center gap-2"><i class="fa-solid fa-filter text-[var(--accent)]"></i> Task Filters</h3>
                    <select id="taskFilter" onchange="window.toggleDateFilter()" class="text-xs px-2 py-2 rounded-lg border border-gray-200 font-medium text-gray-700 bg-gray-50 shadow-sm outline-none cursor-pointer w-full focus:ring-2 focus:ring-[var(--accent)] transition-all">
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
                <div id="dateRangeFilter" class="hidden px-3 pt-2 pb-3 bg-white border-b border-gray-200 flex gap-2 items-center">
                    <input type="date" id="filterStartDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border border-gray-300 bg-gray-50 outline-none focus:border-[var(--accent)]">
                    <span class="text-[10px] font-bold text-gray-400">TO</span>
                    <input type="date" id="filterEndDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border border-gray-300 bg-gray-50 outline-none focus:border-[var(--accent)]">
                </div>
                <div id="tasksPanel" class="flex-1 overflow-y-auto p-4 bg-gray-50"></div>
            </div>
        </div>

        <div id="scheduleModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 text-center shadow-2xl border border-gray-200">
                <i class="fa-regular fa-clock text-4xl mb-4 text-[var(--accent)]"></i>
                <h3 class="text-xl font-bold mb-2 text-gray-800">Schedule Message</h3>
                <p class="text-sm mb-6 text-gray-500">Select when to send your composed message.</p>
                <input type="datetime-local" id="scheduleDateTime" class="w-full p-3 rounded-xl mb-6 border border-gray-300 bg-gray-50 outline-none focus:border-[var(--accent)]">
                <div class="flex gap-3">
                    <button onclick="window.closeScheduleModal()" class="flex-1 py-2.5 rounded-xl font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">Cancel</button>
                    <button onclick="window.saveScheduledMessage()" class="flex-1 py-2.5 rounded-xl font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-md transition-colors">Confirm</button>
                </div>
            </div>
        </div>

        <div id="taskModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200">
                <h3 class="text-xl font-bold mb-4 text-gray-800">Create Task</h3>
                <input id="taskTitle" class="w-full p-3 rounded-xl mb-3 border border-gray-300 bg-gray-50 outline-none focus:border-[var(--accent)] text-sm font-medium" placeholder="Task Title">
                
                <p class="text-xs font-bold text-gray-500 mb-1 ml-1">Assigned To:</p>
                <div class="border rounded-xl mb-3 overflow-hidden border-gray-300">
                    <input type="text" id="assigneeSearch" onkeyup="window.filterAssignees()" placeholder="Search users..." class="w-full p-2.5 text-xs border-b border-gray-200 outline-none bg-gray-50 text-gray-700 font-medium">
                    <div id="assigneeCheckboxList" class="max-h-32 overflow-y-auto bg-white p-2 flex flex-col gap-1">
                        </div>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <p class="text-xs font-bold text-gray-500 mb-1 ml-1">Deadline:</p>
                        <input type="date" id="taskDeadline" class="w-full p-2.5 rounded-xl border border-gray-300 bg-gray-50 outline-none focus:border-[var(--accent)] text-sm">
                    </div>
                    <div>
                        <p class="text-xs font-bold text-gray-500 mb-1 ml-1">Priority:</p>
                        <select id="taskPriority" class="w-full p-2.5 rounded-xl border border-gray-300 bg-gray-50 outline-none focus:border-[var(--accent)] text-sm font-medium">
                            <option value="Low">Low</option>
                            <option value="Medium" selected>Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                </div>
                <label class="flex items-start gap-2 text-xs cursor-pointer mt-2 mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900 transition-colors hover:bg-indigo-100">
                    <input type="checkbox" id="taskRequireProof" class="mt-0.5 w-4 h-4 accent-indigo-600 rounded"> 
                    <span><b class="text-sm">Require proof File To Complete</b><br><span class="opacity-80 leading-tight block mt-0.5">Users Need To Upload File To Submit Task</span></span>
                </label>
                <div class="flex gap-3 mt-4 pt-2">
                    <button onclick="window.closeTaskModal()" class="flex-1 py-2.5 rounded-xl font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">Cancel</button>
                    <button onclick="window.saveTaskMultiAssignee()" class="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold shadow-md transition-colors">Create Ticket</button>
                </div>
            </div>
        </div>

        <div id="reminderModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-gray-200">
                <h3 class="text-xl font-bold mb-4 text-gray-800">Set Reminder</h3>
                <div class="bg-gray-50 border border-gray-200 p-3 rounded-xl mb-4">
                    <p id="reminderMessagePreview" class="text-xs text-gray-600 line-clamp-2 italic font-medium"></p>
                </div>
                <input type="datetime-local" id="reminderDateTime" class="w-full p-3 rounded-xl mb-6 border border-gray-300 bg-gray-50 outline-none focus:border-[var(--accent)] text-sm">
                <div class="flex gap-3">
                    <button onclick="window.closeReminderModal()" class="flex-1 py-2.5 rounded-xl font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">Cancel</button>
                    <button onclick="window.saveReminder()" class="flex-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold shadow-md transition-colors">Set Alarm</button>
                </div>
            </div>
        </div>
    `;
    
    window.quillEditor = new Quill('#richEditor', { 
        theme: 'snow', 
        placeholder: 'Type a message...', 
        modules: { toolbar: [['bold','italic','underline','strike'], [{'list': 'ordered'}, [{'list': 'bullet'}]], ['clean']] } 
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
        <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-indigo-100">
            <input type="checkbox" value="${u.id}" class="assignee-cb w-4 h-4 accent-indigo-600 rounded">
            <span class="assignee-name font-semibold text-gray-700">${window.escapeHtml(window.toSentenceCase(u.full_name || u.email.split('@')[0]))}</span>
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
    document.querySelectorAll('.group\\/thread').forEach(el => {
        let show = true;
        const text = el.innerText.toLowerCase();
        if (search && !text.includes(search)) show = false;
        el.style.display = show ? 'flex' : 'none';
    });
}

window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    const panel = document.createElement('div');
    panel.className = 'top-panel-dropdown right-10 top-16 w-80 max-h-96 overflow-y-auto p-4 bg-white border border-gray-200 shadow-2xl rounded-2xl z-50';
    
    if (type === 'scheduled') {
        panel.innerHTML = `<h4 class="font-bold border-b border-gray-100 pb-3 mb-3 text-gray-800 flex items-center gap-2"><i class="fa-regular fa-clock text-blue-500"></i> Scheduled Messages</h4>`;
        const {data} = await sb.from('scheduled_messages').select('*').eq('sender_id', window.currentUser.id).eq('status', 'pending');
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs text-gray-500 italic text-center py-4">No scheduled messages.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm flex justify-between items-center group/item hover:bg-gray-100 transition-colors">
                <span class="truncate w-48 text-gray-700">${window.escapeHtml(d.message_text)}</span>
                <i class="fa-solid fa-times text-gray-300 hover:text-red-500 cursor-pointer p-1" onclick="window.deleteScheduled('${d.id}')"></i>
            </div>`;
        });
    } else if (type === 'bookmarks') {
        panel.innerHTML = `<h4 class="font-bold border-b border-gray-100 pb-3 mb-3 text-gray-800 flex items-center gap-2"><i class="fa-regular fa-bookmark text-orange-500"></i> Bookmarks</h4>`;
        const {data} = await sb.from('bookmarks').select('*, messages(text)').eq('user_id', window.currentUser.id);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs text-gray-500 italic text-center py-4">No bookmarks found.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm cursor-pointer hover:bg-gray-100 transition-colors group/item" onclick="window.scrollToAndHighlight('msg-${d.message_id}')">
                <span class="truncate block text-gray-700">${window.escapeHtml(d.messages?.text)}</span>
            </div>`;
        });
    } else if (type === 'alerts') {
        panel.innerHTML = `<h4 class="font-bold border-b border-gray-100 pb-3 mb-3 text-gray-800 flex items-center gap-2"><i class="fa-regular fa-bell text-yellow-500"></i> Notifications</h4>`;
        const {data} = await sb.from('notifications').select('*').eq('user_id', window.currentUser.id).order('created_at', {ascending: false}).limit(10);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs text-gray-500 italic text-center py-4">All caught up!</p>`;
        data?.forEach(d => {
             panel.innerHTML += `<div class="mb-2 p-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm cursor-pointer hover:bg-gray-100 transition-colors group/item" onclick="window.scrollToAndHighlight('msg-${d.message_id}')">
                <span class="block text-gray-700 font-medium">${window.escapeHtml(d.message)}</span>
                <div class="text-[9px] text-gray-400 mt-1">${window.getISTTime(d.created_at)}</div>
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
    
    let html = `<div class="px-4 py-2 mt-2 text-[10px] font-black tracking-widest text-gray-400 uppercase">Channels</div>`;
    groups.forEach(g => { 
        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer hover:bg-gray-100 flex items-center gap-3 transition-colors ${window.currentRoom === g ? 'bg-gray-100 border border-gray-200 font-bold shadow-sm' : 'border border-transparent'}" data-room="${g}" data-name="# ${g}">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 text-xs bg-gray-50 border border-gray-200"><i class="fa-solid fa-hashtag"></i></div>
            <span class="flex-1 truncate text-gray-700 tracking-wide text-sm"># ${g}</span>
        </div>`; 
    });
    html += `<div class="px-4 py-2 mt-4 text-[10px] font-black tracking-widest text-gray-400 uppercase">Direct Messages</div>`;
    window.globalUsersCache.filter(u => u.id !== window.currentUser.id).forEach(u => { 
        const name = window.toSentenceCase(u.full_name || u.email.split('@')[0]);
        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer hover:bg-gray-100 flex items-center gap-3 transition-colors ${window.currentRoom === 'dm_' + u.id ? 'bg-gray-100 border border-gray-200 font-bold shadow-sm' : 'border border-transparent'}" data-room="dm_${u.id}" data-name="${name}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm" style="background: var(--accent)">${name.charAt(0).toUpperCase()}</div>
            <span class="flex-1 truncate text-gray-700 tracking-wide text-sm">${name}</span>
        </div>`; 
    });
    document.getElementById('chatsList').innerHTML = html;
    
    document.querySelectorAll('.channel-item').forEach(el => { 
        el.addEventListener('click', () => { 
            window.currentRoom = el.dataset.room; 
            document.querySelectorAll('.channel-item').forEach(item => { item.classList.remove('bg-gray-100', 'border-gray-200', 'font-bold', 'shadow-sm'); item.classList.add('border-transparent'); });
            el.classList.remove('border-transparent');
            el.classList.add('bg-gray-100', 'border-gray-200', 'font-bold', 'shadow-sm');
            const titleSpan = document.getElementById('roomTitleDisplay');
            if(titleSpan) titleSpan.innerText = el.dataset.name;
            document.getElementById('messagesContainer').innerHTML = '<div class="m-auto flex flex-col items-center opacity-50"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3 text-gray-400"></i><p class="text-sm font-medium text-gray-500">Loading chat...</p></div>';
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
    if(c) {
        setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50); // Slight delay ensures images/layout calculate before scrolling
    }
}

// -----------------------------------------------------------------------------
// PREMIUM UI RENDERING CORE (BUBBLES & TREE VIEW)
// -----------------------------------------------------------------------------
window.renderMessages = function(messages) {
    const c = document.getElementById('messagesContainer');
    if (!c) return;
    if (!messages.length) { c.innerHTML = '<div class="m-auto flex flex-col items-center opacity-50"><i class="fa-regular fa-comments text-5xl mb-3 text-gray-300"></i><p class="font-medium text-gray-500">Say hello!</p></div>'; return; }
    
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
        const snippetText = window.getSnippet(msg.text);
        let displayHtml = msg.text.replace(/href="secure-file:([^"]+)"/g, `href="javascript:void(0);" onclick="window.openSecureFile('$1'); return false;" class="text-blue-600 underline font-medium hover:text-blue-800 transition-colors"`);

        const avatarInitial = senderName.charAt(0).toUpperCase();

        const bubbleBg = isOwn ? 'bg-[var(--sent-bg)] border-[var(--border-color)] text-gray-900' : 'bg-white border-gray-200 text-gray-800';
        const avatarBg = isOwn ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'bg-indigo-50 text-indigo-700 border-indigo-200';
        
        // --- PARENT MESSAGE LAYOUT ---
        let html = `
        <div id="msg-${msg.id}" class="flex flex-col items-start mb-6 w-full group/thread">
            
            <div class="${isOwn ? 'self-end flex-row-reverse' : 'self-start flex-row'} flex items-end gap-3 max-w-[85%] relative z-10 w-full">
                
                <div class="w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-[13px] font-black shrink-0 mb-1 shadow-sm relative z-10 border">
                    ${avatarInitial}
                </div>
                
                <div class="relative group/parent pb-1 flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-full">
                    <span class="text-[11px] font-bold text-gray-500 mb-1 mx-1 block tracking-wide">${window.escapeHtml(senderName)}</span>
                    
                    <div class="${bubbleBg} p-3.5 rounded-2xl ${isOwn ? 'rounded-br-none' : 'rounded-bl-none'} shadow-sm border relative w-full">
                        
                        <div class="absolute -top-3 ${isOwn ? '-left-2' : '-right-2'} bg-white border border-gray-200 shadow-md rounded-xl p-1 flex gap-1 opacity-0 group-hover/parent:opacity-100 transition-opacity z-20">
                            <i class="fa-solid fa-reply text-[11px] p-2 text-gray-400 hover:text-[var(--accent)] hover:bg-gray-50 rounded-lg cursor-pointer transition-colors" title="Reply" onclick="window.initiateReply('${msg.id}', '${snippetText}')"></i>
                            <i class="fa-solid fa-ellipsis-vertical text-[11px] p-2 text-gray-400 hover:text-[var(--accent)] hover:bg-gray-50 rounded-lg cursor-pointer menu-dots transition-colors" data-msg-id="${msg.id}" data-msg-text="${window.escapeHtml(msg.text)}"></i>
                        </div>
                        
                        <div class="text-[14.5px] leading-relaxed msg-text-content break-words font-medium">${displayHtml}</div>
                        <div class="text-[10px] text-gray-400 ${isOwn ? 'text-right' : 'text-right'} mt-2 font-bold tracking-wide">${time} ${isOwn ? '<i class="fa-solid fa-check-double text-blue-500 ml-1"></i>' : ''}</div>
                    </div>
                    
                    <div class="flex justify-start items-center gap-1.5 mt-1.5 px-1 opacity-0 group-hover/parent:opacity-100 transition-opacity duration-300">
                        <div class="relative inline-block group/tagbtn">
                            <button class="w-6 h-6 bg-white border border-gray-200 rounded-full text-[10px] text-gray-500 hover:bg-gray-50 flex items-center justify-center shadow-sm transition-colors">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                            <div class="absolute bottom-full ${isOwn ? 'right-0' : 'left-0'} mb-2 hidden group-hover/tagbtn:flex bg-white border border-gray-200 shadow-xl rounded-xl p-2 gap-2 z-50 items-center">
                                <span class="cursor-pointer bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-green-200 transition-colors shadow-sm" onclick="window.showCenterToast('Tag Applied: Thanks', 'fa-solid fa-check', 'text-green-500')">Thanks</span>
                                <span class="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-blue-200 transition-colors shadow-sm" onclick="window.showCenterToast('Tag Applied: Good', 'fa-solid fa-check', 'text-blue-500')">Good</span>
                                <span class="cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-orange-200 transition-colors shadow-sm" onclick="window.showCenterToast('Tag Applied: Noted', 'fa-solid fa-check', 'text-orange-500')">Noted</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        // --- REPLIES (TREE VIEW STRUCTURE) ---
        if (replies[msg.id] && replies[msg.id].length > 0) {
            
            // Layout spine orientation based on who sent the parent
            const spineAlign = isOwn ? 'mr-[17px] pr-6 border-r-2 items-end border-gray-200' : 'ml-[17px] pl-6 border-l-2 items-start border-gray-200';
            const connectorClass = isOwn ? '-right-6' : '-left-6';

            html += `<div class="mt-2 ${spineAlign} flex flex-col gap-5 relative w-full max-w-[85%] pb-3 ${isOwn ? 'self-end' : 'self-start'}">`;
            
            replies[msg.id].forEach((child, idx) => { 
                const cIsOwn = child.sender_id === window.currentUser.id;
                const cName = window.toSentenceCase(child.profiles?.full_name || child.profiles?.email.split('@')[0] || 'Unknown');
                const cTime = window.getISTTime(child.created_at);
                let cDisplayHtml = child.text.replace(/href="secure-file:([^"]+)"/g, `href="javascript:void(0);" onclick="window.openSecureFile('$1'); return false;" class="text-blue-600 underline font-medium hover:text-blue-800 transition-colors"`);
                const cSnippet = window.getSnippet(child.text);
                
                const cBubbleBg = cIsOwn ? 'bg-[var(--sent-bg)] border-[var(--border-color)] text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-800';
                
                html += `
                <div class="flex items-end ${cIsOwn ? 'justify-end' : 'justify-start'} gap-2 w-full relative group/child">
                    <div class="absolute top-1/2 ${connectorClass} w-6 h-px bg-gray-300"></div>
                    
                    <div class="relative w-auto max-w-[95%] pb-1 flex flex-col ${cIsOwn ? 'items-end' : 'items-start'}">
                        
                        <div class="${cBubbleBg} p-3 rounded-2xl ${cIsOwn ? 'rounded-br-none' : 'rounded-bl-none'} shadow-sm border relative">
                            
                            <div class="absolute -top-3 ${cIsOwn ? '-left-2' : '-right-2'} bg-white border border-gray-200 shadow-md rounded-xl p-1 flex gap-1 opacity-0 group-hover/child:opacity-100 transition-opacity z-20">
                                <i class="fa-solid fa-reply text-[11px] p-2 text-gray-400 hover:text-[var(--accent)] hover:bg-gray-50 rounded-lg cursor-pointer transition-colors" title="Reply" onclick="window.initiateReply('${msg.id}', '${cSnippet}')"></i>
                            </div>
                            
                            <div class="flex justify-between items-start mb-1.5 gap-4">
                                <div class="text-[10px] font-bold ${cIsOwn ? 'text-[var(--accent)]' : 'text-gray-600'} flex items-center gap-2 tracking-wide">
                                    <span class="${cIsOwn ? 'bg-white/60' : 'bg-white'} ${cIsOwn ? 'text-[var(--accent)]' : 'text-gray-500'} px-2 py-0.5 rounded-md shadow-sm text-[9px] border ${cIsOwn ? 'border-[var(--accent)]/20' : 'border-gray-200'}">#${idx + 1}</span>
                                    ${window.escapeHtml(cName)}
                                </div>
                            </div>
                            
                            <div class="text-[13.5px] leading-snug break-words font-medium">${cDisplayHtml}</div>
                            <div class="text-[9px] text-gray-400 text-right mt-1.5 font-bold tracking-wide">${cTime} ${cIsOwn ? '<i class="fa-solid fa-check-double text-blue-500 ml-1"></i>' : ''}</div>
                        </div>
                        
                        <div class="flex ${cIsOwn ? 'justify-end' : 'justify-start'} items-center gap-1.5 mt-1.5 px-1 opacity-0 group-hover/child:opacity-100 transition-opacity">
                            <div class="relative inline-block group/tagbtn">
                                <button class="w-6 h-6 bg-white border border-gray-200 rounded-full text-[10px] text-gray-500 hover:bg-gray-50 flex items-center justify-center shadow-sm transition-colors">
                                    <i class="fa-solid fa-plus"></i>
                                </button>
                                <div class="absolute bottom-full ${cIsOwn ? 'right-0' : 'left-0'} mb-2 hidden group-hover/tagbtn:flex bg-white border border-gray-200 shadow-xl rounded-xl p-2 gap-2 z-50 items-center">
                                    <span class="cursor-pointer bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-green-200 transition-colors shadow-sm" onclick="window.showCenterToast('Tag Applied: Thanks', 'fa-solid fa-check', 'text-green-500')">Thanks</span>
                                    <span class="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-blue-200 transition-colors shadow-sm" onclick="window.showCenterToast('Tag Applied: Good', 'fa-solid fa-check', 'text-blue-500')">Good</span>
                                    <span class="cursor-pointer bg-orange-50 hover:bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-orange-200 transition-colors shadow-sm" onclick="window.showCenterToast('Tag Applied: Noted', 'fa-solid fa-check', 'text-orange-500')">Noted</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }

    c.innerHTML = topLevel.map(msg => buildMsgHTML(msg)).join('');

    document.querySelectorAll('.menu-dots').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.msg-menu-dropdown').forEach(m => m.remove());
            const mid = el.dataset.msgId, mtext = el.dataset.msgText;
            const menu = document.createElement('div');
            menu.className = 'msg-menu-dropdown p-1.5 shadow-xl border-gray-200';
            menu.style.minWidth = '180px';
            menu.innerHTML = `
                <div class="cursor-pointer px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg transition-colors flex items-center gap-3" onclick="window.openTaskModal('${mid}', '${mtext.replace(/'/g, "\\'")}')"><i class="fa-solid fa-tasks text-emerald-500 w-4"></i> Create Task</div>
                <div class="cursor-pointer px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-yellow-50 hover:text-yellow-700 rounded-lg transition-colors flex items-center gap-3 mt-1" onclick="window.showReminderModal('${mid}', '${mtext.replace(/'/g, "\\'")}')"><i class="fa-regular fa-bell text-yellow-500 w-4"></i> Reminder</div>
                <div class="cursor-pointer px-3 py-2 text-[13px] font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-700 rounded-lg transition-colors flex items-center gap-3 mt-1" onclick="window.toggleBookmark('${mid}')"><i class="fa-solid fa-star text-orange-400 w-4"></i> Bookmark</div>
            `;
            document.body.appendChild(menu);
            const rect = el.getBoundingClientRect();
            menu.style.top = (rect.bottom + window.scrollY) + 'px';
            menu.style.left = (rect.left - 150 + window.scrollX) + 'px';
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
