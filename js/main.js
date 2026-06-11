import { sb } from './shared.js';
import './tasks.js';
import './messages.js'; // NEW: Modular Message Engine Import

let messageSubscription = null;
let taskSubscription = null;
let assigneeSubscription = null;
let trailSubscription = null;

// STATE PERSISTENCE ENGINE
window.currentTheme = localStorage.getItem('theme') || 'light';
window.currentRoom = localStorage.getItem('mpgs_current_room') || 'general';
window.pendingScrollId = null; 
window.pendingFileUpload = null;

window.applyTheme = function() { 
    document.documentElement.setAttribute('data-theme', window.currentTheme); 
};

window.toggleTheme = function() {
    window.currentTheme = window.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', window.currentTheme);
    window.applyTheme();
};

window.showCenterToast = function(msg, icon = 'fa-solid fa-check-circle', color = 'text-green-400') { 
    const t = document.createElement('div'); 
    t.className = 'center-toast opacity-0'; 
    t.innerHTML = `<i class="${icon} ${color}"></i> <span>${msg}</span>`; 
    document.body.appendChild(t); 
    setTimeout(() => t.classList.remove('opacity-0'), 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3000); 
};

window.openSecureFile = async function(path) {
    window.showCenterToast('Authenticating secure file...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(path, 86400);
    if (error) { window.showCenterToast('Access Denied: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    if (data && data.signedUrl) window.open(data.signedUrl, '_blank');
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
    window.showCenterToast('Sign up successful! Please wait for admin approval.', 'fa-solid fa-envelope', 'text-blue-400'); 
};

window.logout = async function() { 
    await sb.auth.signOut(); 
    window.currentUser = null; 
    window.renderAuthScreen(); 
};

window.renderAuthScreen = function() { 
    window.applyTheme();
    document.getElementById('root').innerHTML = `
        <div class="min-h-screen w-full flex items-center justify-center bg-white" style="background-color: var(--bg-body);">
            <div class="modal-content p-10 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden bg-white" style="background-color: var(--bg-sidebar);">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold tracking-tight" style="color: var(--text-primary);">MPGS TaskFlow</h1>
                    <p class="text-sm mt-2" style="color: var(--text-secondary);">Enterprise Communication Portal</p>
                </div>
                <div class="space-y-4">
                    <input id="email" placeholder="Email Address" class="ui-input w-full px-4 py-3 rounded-xl border border-gray-300">
                    <div class="relative">
                        <input id="password" type="password" placeholder="Password (Min 6 chars)" class="ui-input w-full px-4 py-3 rounded-xl border border-gray-300 pr-10">
                        <i class="fa-solid fa-eye absolute right-4 top-4 text-gray-400 cursor-pointer hover:text-gray-600" id="togglePassword"></i>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button id="loginBtn" class="flex-1 py-3 px-4 rounded-xl text-white font-medium shadow-md transition-colors" style="background-color: var(--accent);">Login</button>
                        <button id="signupBtn" class="flex-1 py-3 px-4 rounded-xl border font-medium shadow-sm transition-colors" style="border-color: var(--accent); color: var(--accent);">Sign Up</button>
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
        } catch(e) { document.getElementById('authMsg').innerText = e.message; } 
    };
};

window.toggleRightSidebar = function() {
    const sb = document.getElementById('rightSidebar');
    if (!sb) return;
    const isHidden = window.getComputedStyle(sb).display === 'none';
    sb.style.setProperty('display', isHidden ? 'flex' : 'none', 'important');
    localStorage.setItem('mpgs_right_sidebar_state', isHidden ? 'flex' : 'none');
};

window.toggleLeftSidebar = function() {
    const sb = document.getElementById('leftSidebar');
    if (!sb) return;
    const isHidden = window.getComputedStyle(sb).display === 'none';
    sb.style.setProperty('display', isHidden ? 'flex' : 'none', 'important');
    localStorage.setItem('mpgs_left_sidebar_state', isHidden ? 'flex' : 'none');
};

window.initResizers = function() {
    let isResizingLeft = false, isResizingRight = false;
    const leftSidebar = document.getElementById('leftSidebar');
    const rightSidebar = document.getElementById('rightSidebar');
    
    document.getElementById('leftResizer')?.addEventListener('mousedown', () => { isResizingLeft = true; document.body.style.cursor = 'col-resize'; });
    document.getElementById('rightResizer')?.addEventListener('mousedown', () => { isResizingRight = true; document.body.style.cursor = 'col-resize'; });
    
    document.addEventListener('mousemove', (e) => {
        if(isResizingLeft && leftSidebar) {
            const newWidth = e.clientX;
            if(newWidth > 200 && newWidth < window.innerWidth * 0.5) {
                leftSidebar.style.width = newWidth + 'px';
                localStorage.setItem('mpgs_left_width', newWidth + 'px');
            }
        }
        if(isResizingRight && rightSidebar) {
            const newWidth = window.innerWidth - e.clientX;
            if(newWidth > 250 && newWidth < window.innerWidth * 0.5) {
                rightSidebar.style.width = newWidth + 'px';
                localStorage.setItem('mpgs_right_width', newWidth + 'px');
            }
        }
    });
    document.addEventListener('mouseup', () => { isResizingLeft = false; isResizingRight = false; document.body.style.cursor = 'default'; });
};

window.renderMainApp = function() {
    window.applyTheme();
    const userNameDisplay = window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'User';
    
    const leftWidth = localStorage.getItem('mpgs_left_width') || '320px';
    const rightWidth = localStorage.getItem('mpgs_right_width') || '450px';
    const leftDisplay = localStorage.getItem('mpgs_left_sidebar_state') || 'flex';
    const rightDisplay = localStorage.getItem('mpgs_right_sidebar_state') || 'flex';

    const wt = window.escapeHtml(userNameDisplay.toUpperCase());
    const svgL = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><text x="50%" y="50%" transform="rotate(-30 100 75)" fill="rgba(0,0,0,0.03)" font-size="14" font-family="sans-serif" font-weight="800" text-anchor="middle" dominant-baseline="middle">${wt}</text></svg>`);
    const svgD = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><text x="50%" y="50%" transform="rotate(-30 100 75)" fill="rgba(255,255,255,0.02)" font-size="14" font-family="sans-serif" font-weight="800" text-anchor="middle" dominant-baseline="middle">${wt}</text></svg>`);
    document.documentElement.style.setProperty('--wm-light', `url('data:image/svg+xml;utf8,${svgL}')`);
    document.documentElement.style.setProperty('--wm-dark', `url('data:image/svg+xml;utf8,${svgD}')`);

    document.getElementById('root').innerHTML = `
        <div class="flex h-full w-full bg-white" style="background-color: var(--bg-body);">
            <!-- Left Sidebar -->
            <div id="leftSidebar" class="left-sidebar flex-col border-r z-20 shadow-sm bg-white" style="display: ${leftDisplay}; width: ${leftWidth}; background-color: var(--bg-sidebar); border-color: var(--border-color);">
                <div class="p-4 flex justify-between items-center border-b" style="border-color: var(--border-color);">
                    <h2 class="text-xl font-bold tracking-tight flex items-center gap-2" style="color: var(--text-primary);">
                        <i class="fa-solid fa-comments" style="color: var(--accent);"></i> Chats
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="window.toggleTheme()" class="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style="color: var(--text-secondary);"><i class="fa-solid fa-moon text-sm"></i></button>
                        <button onclick="window.logout()" class="w-8 h-8 rounded-full hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors" style="color: var(--text-secondary);"><i class="fa-solid fa-sign-out-alt text-sm"></i></button>
                    </div>
                </div>
                <div class="p-3"><input type="text" id="globalSearch" placeholder="Search chats" class="ui-input w-full p-2 rounded-xl text-sm outline-none"></div>
                <div id="chatsList" class="flex-1 overflow-y-auto px-2 pb-4"></div>
                
                <div class="p-3 border-t flex flex-col items-center justify-center gap-1.5" style="border-color: var(--border-color); background-color: var(--bg-body);">
                    <div class="text-[13px] font-bold flex items-center gap-2 border shadow-sm px-3 py-1.5 rounded-full w-full justify-center" style="color: var(--text-primary); border-color: var(--border-color); background-color: var(--bg-sidebar);">
                        <div class="w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px]" style="background-color: var(--accent);">${userNameDisplay.charAt(0).toUpperCase()}</div>
                        ${window.escapeHtml(userNameDisplay.toUpperCase())}
                    </div>
                    <div class="text-[9px] font-bold tracking-wider uppercase mt-1" style="color: var(--text-secondary);">
                        v2.0.0 - Modular Engine
                    </div>
                </div>
            </div>

            <div id="leftResizer" class="drag-resizer"></div>

            <!-- Chat Area -->
            <div class="flex-1 flex flex-col relative min-w-0 chat-area">
                <div class="p-4 border-b z-10 flex justify-between items-center shadow-sm backdrop-blur" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                    <div class="flex items-center gap-3">
                        <i class="ti ti-layout-sidebar-left cursor-pointer pr-3 border-r" onclick="window.toggleLeftSidebar()" title="Toggle Channels" style="color: var(--text-secondary); border-color: var(--border-color);"></i>
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight" style="color: var(--text-primary);"># ${window.currentRoom}</span>
                    </div>
                    <div class="flex items-center gap-4 text-xl" style="color: var(--text-secondary);">
                        <i class="ti ti-clock cursor-pointer" onclick="window.openTopPanel('scheduled')" title="Scheduled Messages"></i>
                        <i class="ti ti-bookmark cursor-pointer" onclick="window.openTopPanel('bookmarks')" title="Bookmarks"></i>
                        <i class="ti ti-bell cursor-pointer" onclick="window.openTopPanel('alerts')" title="Notifications"></i>
                        <div class="border-l pl-4 ml-1 flex gap-3" style="border-color: var(--border-color);"><i class="ti ti-layout-sidebar-right cursor-pointer" onclick="window.toggleRightSidebar()" title="Toggle Task Panel"></i></div>
                        <input type="text" id="messageSearchBar" placeholder="Search..." class="ui-input px-3 py-1 rounded-full text-sm w-48 outline-none ml-2">
                    </div>
                </div>
                
                <div id="messagesContainer" class="flex-1 overflow-y-auto p-6 flex flex-col items-center min-w-0">
                    <div class="chat-shell w-full max-w-full bg-transparent border-none" id="chatShellContainer"></div>
                </div>
                
                <!-- Input Strip -->
                <div class="flex flex-col relative border-t p-3 px-5 z-20" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                    <div id="replyBanner" class="hidden mx-0 mt-0 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center z-0 relative shadow-sm text-xs">
                        <div class="text-indigo-700 flex items-center gap-2 overflow-hidden">
                            <i class="fa-solid fa-reply"></i>
                            <span class="font-bold whitespace-nowrap">Replying to:</span>
                            <span id="replyBannerText" class="italic truncate text-indigo-500 max-w-[200px]"></span>
                        </div>
                        <i class="fa-solid fa-times text-indigo-400 hover:text-red-500 cursor-pointer p-1" onclick="window.cancelReply()"></i>
                    </div>

                    <div class="w-full border rounded-xl flex flex-col shadow-sm transition-colors relative" style="background-color: var(--bg-body); border-color: var(--border-color);">
                        <div id="inputEmojiPicker" class="absolute bottom-full left-0 mb-2 hidden shadow-2xl rounded-xl p-3 min-w-[240px] z-50 border" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                           <div class="text-[10px] font-bold mb-1 uppercase tracking-wider" style="color: var(--text-secondary);">Insert Emoji</div>
                           <div class="flex flex-wrap gap-1">
                               ${['👍','❤️','😂','😮','😢','🙏','🎉','🔥','✅','👀'].map(e => `<span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-xl" onclick="window.insertEmoji('${e}')">${e}</span>`).join('')}
                           </div>
                        </div>

                        <div id="toolbar-container" class="border-b rounded-t-xl" style="background-color: var(--bg-body); border-color: var(--border-color);"></div>
                        <div class="flex items-end gap-2 p-1.5 px-2 rounded-b-xl" style="background-color: var(--bg-body);">
                            <button onclick="window.toggleInputEmojiPicker()" class="p-2 transition-colors" title="Quick Emoji" style="color: var(--text-secondary);"><i class="ti ti-mood-smile text-xl"></i></button>
                            <button onclick="document.getElementById('fileAttachment').click()" class="p-2 transition-colors" title="Attach File" style="color: var(--text-secondary);"><i class="ti ti-paperclip text-xl"></i></button>
                            <input type="file" id="fileAttachment" class="hidden">

                            <div class="flex-1 min-w-0 bg-transparent py-1">
                                <div id="richEditor" class="w-full" style="color: var(--text-primary);"></div>
                            </div>

                            <button onclick="window.showScheduleModal()" class="p-2 transition-colors" title="Schedule" style="color: var(--text-secondary);"><i class="ti ti-clock text-xl"></i></button>
                            <button id="sendBtn" class="text-white rounded-lg shadow-md transition-colors h-[38px] w-[46px] flex items-center justify-center mb-0.5" style="background-color: var(--accent);"><i class="ti ti-send text-lg"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="rightResizer" class="drag-resizer"></div>

            <!-- Right Sidebar: Tasks -->
            <div id="rightSidebar" class="right-sidebar border-l flex-col z-20 shadow-sm" style="display: ${rightDisplay}; width: ${rightWidth}; background-color: var(--bg-sidebar); border-color: var(--border-color);">
                <div class="w-full h-full flex flex-col min-w-0"> 
                    <div class="p-3 border-b flex flex-col gap-2" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                        <h3 class="font-bold flex items-center gap-2" style="color: var(--text-primary);"><i class="fa-solid fa-filter" style="color: var(--accent);"></i> Task Filters</h3>
                        <select id="taskFilter" onchange="window.toggleDateFilter()" class="text-xs px-2 py-2 rounded-lg border font-medium shadow-sm outline-none cursor-pointer w-full transition-all" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
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
                    <div id="dateRangeFilter" class="hidden px-3 pt-2 pb-3 border-b flex gap-2 items-center" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                        <input type="date" id="filterStartDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border outline-none" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                        <span class="text-[10px] font-bold" style="color: var(--text-secondary);">TO</span>
                        <input type="date" id="filterEndDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border outline-none" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <div id="tasksPanel" class="flex-1 overflow-y-auto p-4" style="background-color: var(--bg-body);"></div>
                </div>
            </div>
        </div>

        <!-- Modals -->
        <div id="fileRenameModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color: var(--text-primary);">Rename Attachment</h3>
                <input type="text" id="newFileNameInput" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.cancelFileRename()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80 transition-opacity" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">Cancel</button>
                    <button onclick="window.confirmFileRename()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md transition-colors" style="background-color: var(--accent);">Upload</button>
                </div>
            </div>
        </div>

        <div id="scheduleModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 text-center shadow-2xl border" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                <i class="fa-regular fa-clock text-4xl mb-4" style="color: var(--accent);"></i>
                <h3 class="text-xl font-bold mb-2" style="color: var(--text-primary);">Schedule Message</h3>
                <input type="datetime-local" id="scheduleDateTime" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeScheduleModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80 transition-opacity" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">Cancel</button>
                    <button onclick="window.saveScheduledMessage()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md transition-colors" style="background-color: var(--accent);">Confirm</button>
                </div>
            </div>
        </div>

        <div id="taskModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color: var(--text-primary);">Create Task</h3>
                <input id="taskTitle" class="w-full p-3 rounded-xl mb-3 border outline-none text-sm font-medium" placeholder="Task Title" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                
                <p class="text-xs font-bold mb-1 ml-1" style="color: var(--text-secondary);">Assigned To:</p>
                <div class="border rounded-xl mb-3 overflow-hidden" style="border-color: var(--border-color);">
                    <input type="text" id="assigneeSearch" onkeyup="window.filterAssignees()" placeholder="Search users..." class="w-full p-2.5 text-xs border-b outline-none font-medium" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                    <div id="assigneeCheckboxList" class="max-h-32 overflow-y-auto p-2 flex flex-col gap-1" style="background-color: var(--bg-sidebar);"></div>
                </div>

                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <p class="text-xs font-bold mb-1 ml-1" style="color: var(--text-secondary);">Deadline:</p>
                        <input type="date" id="taskDeadline" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                    </div>
                    <div>
                        <p class="text-xs font-bold mb-1 ml-1" style="color: var(--text-secondary);">Priority:</p>
                        <select id="taskPriority" class="w-full p-2.5 rounded-xl border outline-none text-sm font-medium" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                            <option value="Low">Low</option>
                            <option value="Medium" selected>Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                </div>
                <div class="flex gap-3 mt-4 pt-2">
                    <button onclick="window.closeTaskModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80 transition-opacity" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">Cancel</button>
                    <button onclick="window.saveTaskMultiAssignee()" class="flex-1 py-2.5 rounded-xl text-white font-bold shadow-md transition-colors" style="background-color: var(--accent);">Create Ticket</button>
                </div>
            </div>
        </div>

        <div id="reminderModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color: var(--text-primary);">Set Reminder</h3>
                <div class="border p-3 rounded-xl mb-4" style="background-color: var(--bg-body); border-color: var(--border-color);">
                    <p id="reminderMessagePreview" class="text-xs line-clamp-2 italic font-medium" style="color: var(--text-secondary);"></p>
                </div>
                <input type="datetime-local" id="reminderDateTime" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeReminderModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80 transition-opacity" style="background-color: var(--bg-body); border-color: var(--border-color); color: var(--text-primary);">Cancel</button>
                    <button onclick="window.saveReminder()" class="flex-1 py-2.5 rounded-xl text-white font-bold shadow-md transition-colors" style="background-color: var(--accent);">Set Alarm</button>
                </div>
            </div>
        </div>
    `;
    
    // Quill UI Initialization
    window.quillEditor = new Quill('#richEditor', { 
        theme: 'snow', 
        placeholder: 'Type a message...', 
        modules: { 
            toolbar: {
                container: [
                    ['bold','italic','underline','strike'], 
                    [{ 'color': ['#800000', '#006400', '#00008b'] }], 
                    [{'list': 'ordered'}, {'list': 'bullet'}], 
                    ['clean']
                ]
            }
        } 
    });
    
    const toolbar = document.querySelector('.ql-toolbar');
    document.getElementById('toolbar-container').appendChild(toolbar);

    window.quillEditor.root.addEventListener('keydown', (e) => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); window.sendMessage(); } });
    document.getElementById('sendBtn').onclick = window.sendMessage;
    
    // Modals
    document.getElementById('fileAttachment').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const lastDot = file.name.lastIndexOf('.');
        const baseName = lastDot !== -1 ? file.name.substring(0, lastDot) : file.name;
        
        window.pendingFileUpload = file;
        document.getElementById('newFileNameInput').value = baseName;
        document.getElementById('fileRenameModal').classList.remove('hidden');
        document.getElementById('fileRenameModal').classList.add('flex');
    });
    
    const searchBar = document.getElementById('messageSearchBar');
    if(searchBar) searchBar.addEventListener('input', window.applyFilters);
    
    document.addEventListener('click', e => {
        if (!e.target.closest('.menu-wrap')) window.closeDropdowns();
        const ep = document.getElementById('inputEmojiPicker');
        if (ep && !e.target.closest('#inputEmojiPicker') && !e.target.closest('[onclick="window.toggleInputEmojiPicker()"]')) {
            ep.classList.add('hidden');
        }
    });

    window.initResizers();
    if (typeof window.loadChatsList === 'function') window.loadChatsList(); 
    window.loadMessages(); 
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel(); 

    // Intelligent DOM Observer
    const tasksPanel = document.getElementById('tasksPanel');
    if (tasksPanel) {
        new MutationObserver(() => {
            document.querySelectorAll('[id^="trail-"], [id^="task-trail-"]').forEach(el => {
                if (el.dataset.initialized !== 'true') {
                    el.style.display = 'none'; 
                    el.dataset.initialized = 'true';
                }
            });
        }).observe(tasksPanel, { childList: true, subtree: true });
    }
};

window.cancelFileRename = function() {
    window.pendingFileUpload = null;
    document.getElementById('fileAttachment').value = '';
    document.getElementById('fileRenameModal').classList.add('hidden');
    document.getElementById('fileRenameModal').classList.remove('flex');
};

window.confirmFileRename = async function() {
    if (!window.pendingFileUpload) return;
    const file = window.pendingFileUpload;
    window.pendingFileUpload = null;
    
    document.getElementById('fileRenameModal').classList.add('hidden');
    document.getElementById('fileRenameModal').classList.remove('flex');

    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? file.name.substring(lastDot) : '';
    let newName = document.getElementById('newFileNameInput').value.trim();
    if (!newName) newName = lastDot !== -1 ? file.name.substring(0, lastDot) : file.name;
    const finalName = newName + ext;
    
    window.showCenterToast('Uploading secure file...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const sizeKB = Math.round(file.size / 1024);
    const safeName = finalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const filePath = `chat/${Date.now()}_${safeName}`;
    
    const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
    if(error) { window.showCenterToast('Upload failed: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
    
    window.quillEditor.focus();
    const range = window.quillEditor.getSelection();
    const index = range ? range.index : window.quillEditor.getLength();
    
    window.quillEditor.insertText(index, `📁 Attached File: ${finalName} (${sizeKB} KB)\n`, 'link', `https://secure-file.local/${filePath}`);
    window.showCenterToast('File securely attached!', 'fa-solid fa-check-circle', 'text-green-500');
    document.getElementById('fileAttachment').value = ''; 
};

window.insertEmoji = function(char) {
    window.quillEditor.focus();
    const range = window.quillEditor.getSelection();
    const index = range ? range.index : window.quillEditor.getLength();
    window.quillEditor.insertText(index, char);
    window.quillEditor.setSelection(index + char.length); 
    document.getElementById('inputEmojiPicker').classList.add('hidden');
};

window.toggleInputEmojiPicker = function() {
    const ep = document.getElementById('inputEmojiPicker');
    if(ep) ep.classList.toggle('hidden');
};

window.toggleDropdown = function(id) {
    document.querySelectorAll('.bubble-dropdown').forEach(d => {
        if (d.id !== id) d.classList.remove('open');
    });
    document.getElementById(id).classList.toggle('open');
};

window.closeDropdowns = function() {
    document.querySelectorAll('.bubble-dropdown').forEach(d => d.classList.remove('open'));
};

window.toggleTaskTrail = function(id) {
    let el = document.getElementById(id) || document.getElementById('trail-' + id) || document.getElementById('task-trail-' + id);
    if (!el) return;
    const isHidden = window.getComputedStyle(el).display === 'none' || el.style.display === 'none';
    if (isHidden) { el.style.setProperty('display', 'block', 'important'); } 
    else { el.style.setProperty('display', 'none', 'important'); }
};
window.toggleTrail = window.toggleTaskTrail;

window.openTaskModal = async function(mid, text) { 
    window.currentMessageId = mid; 
    let tmp = document.createElement("DIV");
    tmp.innerHTML = text;
    window.currentMessageTextRaw = (tmp.textContent || tmp.innerText || "").substring(0,60) + "...";

    window.closeDropdowns();
    document.getElementById('taskModal').classList.remove('hidden'); 
    document.getElementById('taskModal').classList.add('flex'); 
    document.getElementById('taskTitle').value = (tmp.textContent || tmp.innerText || "").trim(); 
    
    const filteredUsers = window.globalUsersCache.filter(u => u.id !== window.currentUser.id);
    const list = document.getElementById('assigneeCheckboxList');
    list.innerHTML = filteredUsers.map(u => `
        <label class="assignee-item flex items-center gap-2 text-[13px] p-1.5 rounded-lg cursor-pointer transition-colors border border-transparent" style="hover:bg-color: var(--bg-body); hover:border-color: var(--border-color);">
            <input type="checkbox" value="${u.id}" class="assignee-cb w-4 h-4 accent-indigo-600 rounded">
            <span class="assignee-name font-semibold" style="color: var(--text-primary);">${window.escapeHtml(window.toSentenceCase(u.full_name || u.email.split('@')[0]))}</span>
        </label>
    `).join('');
    document.getElementById('assigneeSearch').value = '';
};

window.filterAssignees = function() {
    const term = document.getElementById('assigneeSearch').value.toLowerCase();
    document.querySelectorAll('.assignee-item').forEach(el => {
        const name = el.querySelector('.assignee-name').innerText.toLowerCase();
        el.style.display = name.includes(term) ? 'flex' : 'none';
    });
};

window.closeTaskModal = function() { document.getElementById('taskModal').classList.add('hidden'); document.getElementById('taskModal').classList.remove('flex'); };

window.showReminderModal = function(mid, text) { 
    window.currentReminderId = mid; 
    window.closeDropdowns();
    document.getElementById('reminderMessagePreview').innerText = text; 
    document.getElementById('reminderModal').classList.remove('hidden'); 
    document.getElementById('reminderModal').classList.add('flex'); 
};

window.closeReminderModal = function() { document.getElementById('reminderModal').classList.add('hidden'); document.getElementById('reminderModal').classList.remove('flex'); };

window.saveReminder = async function() { 
    const dt = document.getElementById('reminderDateTime').value; 
    if(!dt) return; 
    await sb.from('reminders').insert({ user_id: window.currentUser.id, message_id: window.currentReminderId, reminder_time: new Date(dt).toISOString(), triggered: false }); 
    window.showCenterToast('Reminder Set Successfully'); 
    window.closeReminderModal(); 
};

window.toggleDateFilter = function() {
    const val = document.getElementById('taskFilter').value;
    const dr = document.getElementById('dateRangeFilter');
    if (val === 'date_range') dr.classList.remove('hidden');
    else dr.classList.add('hidden');
    window.loadTasksForPanel();
};

window.applyFilters = function() {
    const search = document.getElementById('messageSearchBar').value.toLowerCase();
    document.querySelectorAll('.row-sent, .row-rcvd').forEach(el => {
        let show = true;
        const text = el.innerText.toLowerCase();
        if (search && !text.includes(search)) show = false;
        el.style.display = show ? 'flex' : 'none';
    });
};

window.openTopPanel = async function(type) {
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    const panel = document.createElement('div');
    panel.className = 'top-panel-dropdown right-10 top-16 w-80 max-h-96 overflow-y-auto p-4 border shadow-2xl rounded-2xl z-50';
    panel.style.backgroundColor = 'var(--bg-sidebar)';
    panel.style.borderColor = 'var(--border-color)';
    
    if (type === 'scheduled') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color: var(--border-color); color: var(--text-primary);"><i class="fa-regular fa-clock text-blue-500"></i> Scheduled Messages</h4>`;
        const {data} = await sb.from('scheduled_messages').select('*').eq('sender_id', window.currentUser.id).eq('status', 'pending');
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs italic text-center py-4" style="color: var(--text-secondary);">No scheduled messages.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm flex justify-between items-center group/item transition-colors" style="background-color: var(--bg-body); border-color: var(--border-color);">
                <span class="truncate w-48" style="color: var(--text-primary);">${window.escapeHtml(d.message_text)}</span>
                <i class="fa-solid fa-times hover:text-red-500 cursor-pointer p-1" style="color: var(--text-secondary);" onclick="window.deleteScheduled('${d.id}')"></i>
            </div>`;
        });
    } else if (type === 'bookmarks') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color: var(--border-color); color: var(--text-primary);"><i class="fa-regular fa-bookmark text-orange-500"></i> Bookmarks</h4>`;
        const {data} = await sb.from('bookmarks').select('*, messages(text)').eq('user_id', window.currentUser.id);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs italic text-center py-4" style="color: var(--text-secondary);">No bookmarks found.</p>`;
        data?.forEach(d => {
            panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm cursor-pointer transition-colors group/item" style="background-color: var(--bg-body); border-color: var(--border-color);" onclick="window.scrollToAndHighlight('row-${d.message_id}')">
                <span class="truncate block" style="color: var(--text-primary);">${window.escapeHtml(d.messages?.text)}</span>
            </div>`;
        });
    } else if (type === 'alerts') {
        panel.innerHTML = `<h4 class="font-bold border-b pb-3 mb-3 flex items-center gap-2" style="border-color: var(--border-color); color: var(--text-primary);"><i class="fa-regular fa-bell text-yellow-500"></i> Notifications</h4>`;
        const {data} = await sb.from('notifications').select('*').eq('user_id', window.currentUser.id).order('created_at', {ascending: false}).limit(10);
        if(!data || data.length===0) panel.innerHTML += `<p class="text-xs italic text-center py-4" style="color: var(--text-secondary);">All caught up!</p>`;
        data?.forEach(d => {
             panel.innerHTML += `<div class="mb-2 p-2.5 border rounded-xl text-sm cursor-pointer transition-colors group/item" style="background-color: var(--bg-body); border-color: var(--border-color);" onclick="window.scrollToAndHighlight('row-${d.message_id}')">
                <span class="block font-medium" style="color: var(--text-primary);">${window.escapeHtml(d.message)}</span>
                <div class="text-[9px] mt-1" style="color: var(--text-secondary);">${window.getISTTime(d.created_at)}</div>
            </div>`;
        });
    }
    document.querySelector('.chat-area').appendChild(panel);
};

window.deleteScheduled = async function(id) {
    await sb.from('scheduled_messages').delete().eq('id', id);
    document.querySelectorAll('.top-panel-dropdown').forEach(m => m.remove());
    window.showCenterToast('Scheduled message cancelled.', 'fa-solid fa-info-circle', 'text-yellow-400');
};

window.showScheduleModal = function() {
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    if(!txt) { window.showCenterToast('Type a message first.', 'fa-solid fa-exclamation-triangle', 'text-yellow-500'); return; }
    document.getElementById('scheduleModal').classList.remove('hidden');
    document.getElementById('scheduleModal').classList.add('flex');
};

window.closeScheduleModal = function() { document.getElementById('scheduleModal').classList.add('hidden'); document.getElementById('scheduleModal').classList.remove('flex'); };

window.saveScheduledMessage = async function() {
    const time = document.getElementById('scheduleDateTime').value;
    if(!time) return;
    let txt = window.quillEditor.root.innerHTML.trim();
    txt = txt.replace(/^(<p><br><\/p>)+|(<p><br><\/p>)+$/g, '');
    await sb.from('scheduled_messages').insert({ sender_id: window.currentUser.id, room_id: window.currentRoom, message_text: txt, scheduled_time: new Date(time).toISOString(), status: 'pending' });
    window.closeScheduleModal();
    window.quillEditor.root.innerHTML = '';
    window.showCenterToast('Message Scheduled Successfully!');
};

window.loadChatsList = async function() {
    const groups = ['general', 'math', 'science', 'leadership'];
    const {data: users} = await sb.from('profiles').select('id, email, full_name');
    window.globalUsersCache = users || []; 
    
    let html = `<div class="px-4 py-2 mt-2 text-[10px] font-black tracking-widest uppercase" style="color: var(--text-secondary);">Channels</div>`;
    groups.forEach(g => { 
        const isCurrent = window.currentRoom === g;
        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border" style="background-color: ${isCurrent ? 'var(--bg-body)' : 'transparent'}; border-color: ${isCurrent ? 'var(--border-color)' : 'transparent'}; font-weight: ${isCurrent ? 'bold' : 'normal'};" data-room="${g}" data-name="# ${g}">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-xs border" style="background-color: var(--bg-sidebar); border-color: var(--border-color); color: var(--text-secondary);"><i class="ti ti-hash"></i></div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color: var(--text-primary);"># ${g}</span>
        </div>`; 
    });
    html += `<div class="px-4 py-2 mt-4 text-[10px] font-black tracking-widest uppercase" style="color: var(--text-secondary);">Direct Messages</div>`;
    window.globalUsersCache.filter(u => u.id !== window.currentUser.id).forEach(u => { 
        const name = window.toSentenceCase(u.full_name || u.email.split('@')[0]);
        const isCurrent = window.currentRoom === 'dm_' + u.id;
        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border" style="background-color: ${isCurrent ? 'var(--bg-body)' : 'transparent'}; border-color: ${isCurrent ? 'var(--border-color)' : 'transparent'}; font-weight: ${isCurrent ? 'bold' : 'normal'};" data-room="dm_${u.id}" data-name="${name}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm" style="background: var(--accent)">${name.charAt(0).toUpperCase()}</div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color: var(--text-primary);">${name}</span>
        </div>`; 
    });
    document.getElementById('chatsList').innerHTML = html;
    
    document.querySelectorAll('.channel-item').forEach(el => { 
        el.addEventListener('click', () => { 
            window.currentRoom = el.dataset.room; 
            localStorage.setItem('mpgs_current_room', el.dataset.room); 
            window.loadChatsList(); // Re-render to update highlights
            const titleSpan = document.getElementById('roomTitleDisplay');
            if(titleSpan) titleSpan.innerText = el.dataset.name;
            document.getElementById('chatShellContainer').innerHTML = '<div class="m-auto flex flex-col items-center opacity-50 pt-10"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3" style="color: var(--text-secondary);"></i><p class="text-sm font-medium" style="color: var(--text-secondary);">Loading chat...</p></div>';
            window.loadMessages(); 
        }); 
    });
};

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
