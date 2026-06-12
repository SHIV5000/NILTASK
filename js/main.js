import { sb } from './shared.js';
import './ui.js';
import './auth.js';
import './tasks.js';
import './messages.js';

let messageSubscription = null;
let taskSubscription = null;
let assigneeSubscription = null;
let trailSubscription = null;

// Global Scroll & Highlight Engine
window.scrollToAndHighlight = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Element ${elementId} not found`);
        window.showCenterToast('Message not found in current view', 'fa-solid fa-exclamation-triangle', 'text-yellow-500');
        return;
    }
    
    // Smooth scroll to the message row
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Apply temporary highlight effect
    const bubble = element.querySelector('.bubble');
    if (bubble) {
        bubble.classList.add('glow-target');
        setTimeout(() => bubble.classList.add('active-glow'), 50);
        setTimeout(() => {
            bubble.classList.remove('glow-target', 'active-glow');
        }, 3000);
    }
    
    // Close any open top panel after scrolling
    document.querySelectorAll('.top-panel-dropdown').forEach(panel => panel.remove());
};


// ADD THIS BLOCK inside window.startSubscriptions, after trailSubscription block:

let notificationSubscription = null;

if(notificationSubscription) notificationSubscription.unsubscribe();
notificationSubscription = sb.channel('notifications-changes')
    .on('postgres_changes', {
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${window.currentUser.id}`
    }, (payload) => {
        // Show toast immediately
        if(payload.new.type === 'reminder') {
            window.showCenterToast(
                `⏰ ${payload.new.message}`, 
                'fa-solid fa-stopwatch', 
                'text-purple-400'
            );
        } else {
            window.showCenterToast(payload.new.message, 'fa-solid fa-bell', 'text-yellow-400');
        }
        // Refresh badge count
        if(typeof window.refreshNotificationBadge === 'function') {
            window.refreshNotificationBadge();
        }
    })
    .subscribe();








window.renderMainApp = function() {
    if (typeof window.applyTheme === 'function') window.applyTheme();
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
            <div id="leftSidebar" class="left-sidebar flex-col border-r z-20 shadow-sm bg-white" style="display: ${leftDisplay}; width: ${leftWidth}; background-color: var(--bg-sidebar); border-color: var(--border-color);">
                <div class="p-4 flex justify-between items-center border-b" style="border-color: var(--border-color);">
                    <h2 class="text-xl font-bold tracking-tight flex items-center gap-2" style="color: var(--text-primary);">
                        <i class="fa-solid fa-comments" style="color: var(--accent);"></i> Chats
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="window.toggleTheme()" class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors" title="Cycle theme: Light → Original Dark → Sober Dark" style="color: var(--text-secondary);">
                            <i id="themeToggleIcon" class="fa-solid ${window.currentTheme === 'light' ? 'fa-sun' : (window.currentTheme === 'dark' ? 'fa-moon' : 'fa-cloud-moon')} text-sm"></i>
                        </button>
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
                        v1.50.0 - Frontend Anchor Hub
                    </div>
                </div>
            </div>

            <div id="leftResizer" class="drag-resizer"></div>

            <div class="flex-1 flex flex-col relative min-w-0 chat-area">
                <div class="p-4 border-b z-10 flex justify-between items-center shadow-sm backdrop-blur" style="background-color: var(--bg-sidebar); border-color: var(--border-color);">
                    <div class="flex items-center gap-3">
                        <i class="ti ti-layout-sidebar-left cursor-pointer pr-3 border-r" onclick="window.toggleLeftSidebar()" title="Toggle Channels" style="color: var(--text-secondary); border-color: var(--border-color);"></i>
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight" style="color: var(--text-primary);"># ${window.currentRoom}</span>
                    </div>
                    <div class="flex items-center gap-4 text-xl" style="color: var(--text-secondary);">
                        <i class="ti ti-clock cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('scheduled')" title="Scheduled Messages"></i>
                        <i class="fa-solid fa-stopwatch text-[18px] cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('reminders')" title="Upcoming Reminders"></i>
                        <i class="ti ti-bookmark cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('bookmarks')" title="Bookmarks"></i>
                        <i class="ti ti-bell cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('alerts')" title="Notifications"></i>
                        <div class="border-l pl-4 ml-1 flex gap-3" style="border-color: var(--border-color);"><i class="ti ti-layout-sidebar-right cursor-pointer" onclick="window.toggleRightSidebar()" title="Toggle Task Panel"></i></div>
                        <input type="text" id="messageSearchBar" placeholder="Search..." class="ui-input px-3 py-1 rounded-full text-sm w-48 outline-none ml-2">
                    </div>
                </div>
                
                <div id="messagesContainer" class="flex-1 overflow-y-auto p-6 flex flex-col items-center min-w-0">
                    <div class="chat-shell w-full max-w-full bg-transparent border-none" id="chatShellContainer"></div>
                </div>
                
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

    window.quillEditor.root.addEventListener('keydown', (e) => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); if(typeof window.sendMessage === 'function') window.sendMessage(); } });
    document.getElementById('sendBtn').onclick = () => { if(typeof window.sendMessage === 'function') window.sendMessage(); };
    
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
    if(searchBar) searchBar.addEventListener('input', () => { if(typeof window.applyFilters === 'function') window.applyFilters(); });
    
    // Global Panel Dismissal Listener
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.menu-wrap')) { if(typeof window.closeDropdowns === 'function') window.closeDropdowns(); }
        
        const ep = document.getElementById('inputEmojiPicker');
        if (ep && !e.target.closest('#inputEmojiPicker') && !e.target.closest('[onclick="window.toggleInputEmojiPicker()"]')) {
            ep.classList.add('hidden');
        }

        const panel = document.querySelector('.top-panel-dropdown');
        if (!panel) return;
        const isClickInsidePanel = panel.contains(e.target);
        const isClickOnTopBarIcon = e.target.closest('.top-bar-icon') !== null;
        if (!isClickInsidePanel && !isClickOnTopBarIcon) {
            panel.remove();
        }
    });

    if (typeof window.initResizers === 'function') window.initResizers();
    if (typeof window.loadChatsList === 'function') window.loadChatsList(); 
    if (typeof window.loadMessages === 'function') window.loadMessages(); 
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel(); 
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
        const name = (typeof window.toSentenceCase === 'function') ? window.toSentenceCase(u.full_name || u.email.split('@')[0]) : (u.full_name || u.email.split('@')[0]);
        const isCurrent = window.currentRoom === 'dm_' + u.id;
        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border" style="background-color: ${isCurrent ? 'var(--bg-body)' : 'transparent'}; border-color: ${isCurrent ? 'var(--border-color)' : 'transparent'}; font-weight: ${isCurrent ? 'bold' : 'normal'};" data-room="dm_${u.id}" data-name="${name}">
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm" style="background: var(--accent)">${name.charAt(0).toUpperCase()}</div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color: var(--text-primary);">${name}</span>
        </div>`; 
    });
    
    const chatsListEl = document.getElementById('chatsList');
    if(chatsListEl) {
        chatsListEl.innerHTML = html;
        document.querySelectorAll('.channel-item').forEach(el => { 
            el.addEventListener('click', () => { 
                window.currentRoom = el.dataset.room; 
                localStorage.setItem('mpgs_current_room', el.dataset.room); 
                window.loadChatsList(); 
                const titleSpan = document.getElementById('roomTitleDisplay');
                if(titleSpan) titleSpan.innerText = el.dataset.name;
                const shell = document.getElementById('chatShellContainer');
                if (shell) shell.innerHTML = '<div class="m-auto flex flex-col items-center opacity-50 pt-10"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3" style="color: var(--text-secondary);"></i><p class="text-sm font-medium" style="color: var(--text-secondary);">Loading chat...</p></div>';
                if (typeof window.loadMessages === 'function') window.loadMessages(); 
            }); 
        });
    }
};

window.startSubscriptions = function() { 
    if(messageSubscription) messageSubscription.unsubscribe();
    messageSubscription = sb.channel('public:messages').on('postgres_changes', {event:'INSERT', schema:'public', table:'messages'}, (p) => { if(p.new.room_id === window.currentRoom && typeof window.loadMessages === 'function') window.loadMessages(); }).subscribe();
    
    if(taskSubscription) taskSubscription.unsubscribe(); 
    taskSubscription = sb.channel('tasks-changes').on('postgres_changes', {event:'*', schema:'public', table:'tasks'}, () => { if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel(); }).subscribe(); 
    
    if(assigneeSubscription) assigneeSubscription.unsubscribe(); 
    assigneeSubscription = sb.channel('assignees-changes').on('postgres_changes', {event:'*', schema:'public', table:'task_assignees'}, () => { if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel(); }).subscribe(); 
    
    if(trailSubscription) trailSubscription.unsubscribe(); 
    trailSubscription = sb.channel('trails-changes').on('postgres_changes', {event:'*', schema:'public', table:'task_trails'}, () => { if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel(); }).subscribe(); 

    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
    
};

// Boot Sequence
;(async() => { 
    const {data: {session}} = await sb.auth.getSession(); 
    if(!session) {
        if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen(); 
    } else { 
        window.currentUser = session.user; 
        if (typeof window.ensureProfile === 'function') await window.ensureProfile(); 
        if (typeof window.renderMainApp === 'function') window.renderMainApp(); 
        if (typeof window.startSubscriptions === 'function') window.startSubscriptions(); 
    } 
})();
