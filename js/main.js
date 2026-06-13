import { sb } from './shared.js';
import './ui.js';
import './auth.js';
import './tasks.js';
import './messages.js';

// v1.51.0 - Departments/Staff sidebar, unread badges, search fix, cross-room scroll

let messageSubscription = null;
let taskSubscription = null;
let assigneeSubscription = null;
let trailSubscription = null;
let notificationSubscription = null;

// Unread counts per room
window.unreadCounts = {};

window.scrollToAndHighlight = function(elementId) {
    const element = document.getElementById(elementId);
    if (!element) {
        window.showCenterToast('Message not found in current view', 'fa-solid fa-exclamation-triangle', 'text-yellow-500');
        return;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const bubble = element.querySelector('.bubble');
    if (bubble) {
        bubble.classList.add('glow-target');
        setTimeout(() => bubble.classList.add('active-glow'), 50);
        setTimeout(() => bubble.classList.remove('glow-target', 'active-glow'), 3000);
    }
    document.querySelectorAll('.top-panel-dropdown').forEach(p => p.remove());
};

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
        <div class="flex h-full w-full" style="background-color:var(--bg-body);">

            <!-- LEFT SIDEBAR -->
            <div id="leftSidebar" class="left-sidebar flex-col border-r z-20 shadow-sm" style="display:${leftDisplay};width:${leftWidth};background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="p-4 flex justify-between items-center border-b" style="border-color:var(--border-color);">
                    <h2 class="text-xl font-bold tracking-tight flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-comments" style="color:var(--accent);"></i> Chats
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="window.toggleTheme()" class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors" title="Toggle Theme" style="color:var(--text-secondary);">
                            <i id="themeToggleIcon" class="fa-solid ${window.currentTheme === 'light' ? 'fa-sun' : (window.currentTheme === 'dark' ? 'fa-moon' : 'fa-cloud-moon')} text-sm"></i>
                        </button>
                        <button onclick="window.logout()" class="w-8 h-8 rounded-full hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors" style="color:var(--text-secondary);">
                            <i class="fa-solid fa-sign-out-alt text-sm"></i>
                        </button>
                    </div>
                </div>

                <!-- SEARCH BAR -->
                <div class="p-3">
                    <input type="text" id="sidebarSearch" placeholder="Search departments & staff..."
                        class="ui-input w-full p-2 rounded-xl text-sm outline-none"
                        oninput="window.filterSidebar(this.value)">
                </div>

                <div id="chatsList" class="flex-1 overflow-y-auto px-2 pb-4"></div>

                <div class="p-3 border-t flex flex-col items-center justify-center gap-1.5" style="border-color:var(--border-color);background-color:var(--bg-body);">
                    <div class="text-[13px] font-bold flex items-center gap-2 border shadow-sm px-3 py-1.5 rounded-full w-full justify-center" style="color:var(--text-primary);border-color:var(--border-color);background-color:var(--bg-sidebar);">
                        <div class="w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px]" style="background-color:var(--accent);">${userNameDisplay.charAt(0).toUpperCase()}</div>
                        ${window.escapeHtml(userNameDisplay.toUpperCase())}
                    </div>
                    <div class="text-[9px] font-bold tracking-wider uppercase mt-1" style="color:var(--text-secondary);">v1.54.0 - Link pill, no rename modal, reactions RT, cross-scroll DB lookup</div>
                </div>
            </div>

            <div id="leftResizer" class="drag-resizer"></div>

            <!-- CHAT AREA -->
            <div class="flex-1 flex flex-col relative min-w-0 chat-area">
                <div class="p-4 border-b z-10 flex justify-between items-center shadow-sm backdrop-blur" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                    <div class="flex items-center gap-3">
                        <i class="ti ti-layout-sidebar-left cursor-pointer pr-3 border-r" onclick="window.toggleLeftSidebar()" title="Toggle Sidebar" style="color:var(--text-secondary);border-color:var(--border-color);"></i>
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight" style="color:var(--text-primary);">${window.currentRoom}</span>
                    </div>
                    <div class="flex items-center gap-4 text-xl" style="color:var(--text-secondary);">
                        <i class="ti ti-clock cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('scheduled')" title="Scheduled Messages"></i>
                        <i class="fa-solid fa-stopwatch text-[18px] cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('reminders')" title="Reminders"></i>
                        <i class="ti ti-bookmark cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('bookmarks')" title="Bookmarks"></i>
                        <i class="ti ti-bell cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openTopPanel('alerts')" title="Notifications"></i>
                        <i class="fa-solid fa-bolt text-[16px] cursor-pointer top-bar-icon hover:text-[var(--accent)] transition-colors" onclick="window.openActivityFeed()" title="Activity Feed"></i>
                        <div class="border-l pl-4 ml-1 flex gap-3" style="border-color:var(--border-color);">
                            <i class="ti ti-layout-sidebar-right cursor-pointer" onclick="window.toggleRightSidebar()" title="Toggle Task Panel"></i>
                        </div>
                        <input type="text" id="messageSearchBar" placeholder="Search..." class="ui-input px-3 py-1 rounded-full text-sm w-48 outline-none ml-2">
                    </div>
                </div>

                <div id="messagesContainer" class="flex-1 overflow-y-auto p-6 flex flex-col items-center min-w-0">
                    <div class="chat-shell w-full max-w-full bg-transparent border-none" id="chatShellContainer"></div>
                </div>

                <div class="flex flex-col relative border-t p-3 px-5 z-20" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                    <div id="replyBanner" class="hidden mx-0 mt-0 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center z-0 relative shadow-sm text-xs">
                        <div class="text-indigo-700 flex items-center gap-2 overflow-hidden">
                            <i class="fa-solid fa-reply"></i>
                            <span class="font-bold whitespace-nowrap">Replying to:</span>
                            <span id="replyBannerText" class="italic truncate text-indigo-500 max-w-[200px]"></span>
                        </div>
                        <i class="fa-solid fa-times text-indigo-400 hover:text-red-500 cursor-pointer p-1" onclick="window.cancelReply()"></i>
                    </div>

                    <div class="w-full border rounded-xl flex flex-col shadow-sm transition-colors relative" style="background-color:var(--bg-body);border-color:var(--border-color);">
                        <div id="inputEmojiPicker" class="absolute bottom-full left-0 mb-2 hidden shadow-2xl rounded-xl p-3 min-w-[240px] z-50 border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                            <div class="text-[10px] font-bold mb-1 uppercase tracking-wider" style="color:var(--text-secondary);">Insert Emoji</div>
                            <div class="flex flex-wrap gap-1">
                                ${['👍','❤️','😂','😮','😢','🙏','🎉','🔥','✅','👀'].map(e => `<span class="cursor-pointer hover:bg-gray-100 p-1.5 rounded-lg text-xl" onclick="window.insertEmoji('${e}')">${e}</span>`).join('')}
                            </div>
                        </div>
                        <div id="toolbar-container" class="border-b rounded-t-xl" style="background-color:var(--bg-body);border-color:var(--border-color);"></div>
                        <div class="flex items-end gap-2 p-1.5 px-2 rounded-b-xl" style="background-color:var(--bg-body);">
                            <button onclick="window.toggleInputEmojiPicker()" class="p-2 transition-colors" title="Emoji" style="color:var(--text-secondary);"><i class="ti ti-mood-smile text-xl"></i></button>
                            <button onclick="document.getElementById('fileAttachment').click()" class="p-2 transition-colors" title="Attach File" style="color:var(--text-secondary);"><i class="ti ti-paperclip text-xl"></i></button>
                            <input type="file" id="fileAttachment" class="hidden">
                            <div class="flex-1 min-w-0 bg-transparent py-1">
                                <div id="richEditor" class="w-full" style="color:var(--text-primary);"></div>
                            </div>
                            <button onclick="window.openLinkModal('main')" class="p-2 transition-colors" title="Insert Link Pill" style="color:var(--text-secondary);"><i class="fa-solid fa-link text-[16px]"></i></button>
                            <button onclick="window.showScheduleModal()" class="p-2 transition-colors" title="Schedule" style="color:var(--text-secondary);"><i class="ti ti-clock text-xl"></i></button>
                            <button id="sendBtn" class="text-white rounded-lg shadow-md transition-colors h-[38px] w-[46px] flex items-center justify-center mb-0.5" style="background-color:var(--accent);"><i class="ti ti-send text-lg"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="rightResizer" class="drag-resizer"></div>

            <!-- RIGHT SIDEBAR -->
            <div id="rightSidebar" class="right-sidebar border-l flex-col z-20 shadow-sm" style="display:${rightDisplay};width:${rightWidth};background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="w-full h-full flex flex-col min-w-0">
                    <div class="p-3 border-b flex flex-col gap-2" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                        <h3 class="font-bold flex items-center gap-2" style="color:var(--text-primary);"><i class="fa-solid fa-filter" style="color:var(--accent);"></i> Task Filters</h3>
                        <select id="taskFilter" onchange="window.toggleDateFilter()" class="text-xs px-2 py-2 rounded-lg border font-medium shadow-sm outline-none cursor-pointer w-full transition-all" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
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
                        <select id="taskSort" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-2 rounded-lg border font-medium shadow-sm outline-none cursor-pointer w-full transition-all" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                            <option value="deadline_asc">⬆ Deadline: Earliest First</option>
                            <option value="deadline_desc">⬇ Deadline: Latest First</option>
                            <option value="created_desc">⬇ Created: Newest First</option>
                            <option value="created_asc">⬆ Created: Oldest First</option>
                        </select>
                    </div>
                    <div id="dateRangeFilter" class="hidden px-3 pt-2 pb-3 border-b flex gap-2 items-center" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                        <input type="date" id="filterStartDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border outline-none" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                        <span class="text-[10px] font-bold" style="color:var(--text-secondary);">TO</span>
                        <input type="date" id="filterEndDate" onchange="window.loadTasksForPanel()" class="text-xs px-2 py-1.5 rounded w-full border outline-none" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                    </div>
                    <div id="tasksPanel" class="flex-1 overflow-y-auto p-4" style="background-color:var(--bg-body);"></div>
                </div>
            </div>
        </div>

        <!-- MODALS -->
        <div id="fileRenameModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color:var(--text-primary);">Rename Attachment</h3>
                <input type="text" id="newFileNameInput" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.cancelFileRename()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.confirmFileRename()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Upload</button>
                </div>
            </div>
        </div>

        <div id="scheduleModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 text-center shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <i class="fa-regular fa-clock text-4xl mb-4" style="color:var(--accent);"></i>
                <h3 class="text-xl font-bold mb-2" style="color:var(--text-primary);">Schedule Message</h3>
                <input type="datetime-local" id="scheduleDateTime" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeScheduleModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveScheduledMessage()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Confirm</button>
                </div>
            </div>
        </div>

        <div id="taskModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color:var(--text-primary);">Create Task</h3>
                <input id="taskTitle" class="w-full p-3 rounded-xl mb-3 border outline-none text-sm font-medium" placeholder="Task Title" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <p class="text-xs font-bold mb-1 ml-1" style="color:var(--text-secondary);">Assigned To:</p>
                <div class="border rounded-xl mb-3 overflow-hidden" style="border-color:var(--border-color);">
                    <input type="text" id="assigneeSearch" onkeyup="window.filterAssignees()" placeholder="Search users..." class="w-full p-2.5 text-xs border-b outline-none font-medium" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                    <div id="assigneeCheckboxList" class="max-h-32 overflow-y-auto p-2 flex flex-col gap-1" style="background-color:var(--bg-sidebar);"></div>
                </div>
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <p class="text-xs font-bold mb-1 ml-1" style="color:var(--text-secondary);">Deadline:</p>
                        <input type="date" id="taskDeadline" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                    </div>
                    <div>
                        <p class="text-xs font-bold mb-1 ml-1" style="color:var(--text-secondary);">Priority:</p>
                        <select id="taskPriority" class="w-full p-2.5 rounded-xl border outline-none text-sm font-medium" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                            <option value="Low">Low</option>
                            <option value="Medium" selected>Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                </div>
                <div class="flex gap-3 mt-4 pt-2">
                    <button onclick="window.closeTaskModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveTaskMultiAssignee()" class="flex-1 py-2.5 rounded-xl text-white font-bold shadow-md" style="background-color:var(--accent);">Create Ticket</button>
                </div>
            </div>
        </div>

        <!-- Link Pill Modal -->
        <div id="linkPillModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-lg font-bold mb-1" style="color:var(--text-primary);">Insert Link</h3>
                <p class="text-xs mb-4" style="color:var(--text-secondary);">URL is hidden — only the name appears as a pill to recipients.</p>
                <input type="text" id="linkPillName" placeholder="Display name (e.g. View Report)" class="w-full p-3 rounded-xl mb-3 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <input type="url" id="linkPillUrl" placeholder="https://..." class="w-full p-3 rounded-xl mb-5 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeLinkModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.insertLinkPill()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Insert Pill</button>
                </div>
            </div>
        </div>

        <div id="reminderModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-xl font-bold mb-4" style="color:var(--text-primary);">Set Reminder</h3>
                <div class="border p-3 rounded-xl mb-4" style="background-color:var(--bg-body);border-color:var(--border-color);">
                    <p id="reminderMessagePreview" class="text-xs line-clamp-2 italic font-medium" style="color:var(--text-secondary);"></p>
                </div>
                <input type="datetime-local" id="reminderDateTime" class="w-full p-3 rounded-xl mb-6 border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                <div class="flex gap-3">
                    <button onclick="window.closeReminderModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveReminder()" class="flex-1 py-2.5 rounded-xl text-white font-bold shadow-md" style="background-color:var(--accent);">Set Alarm</button>
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
                    [{ 'color': ['#800000','#006400','#00008b'] }],
                    [{'list':'ordered'},{'list':'bullet'}],
                    ['clean']
                ]
            }
        }
    });

    const toolbar = document.querySelector('.ql-toolbar');
    document.getElementById('toolbar-container').appendChild(toolbar);

    window.quillEditor.root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (typeof window.sendMessage === 'function') window.sendMessage(); }
    });
    document.getElementById('sendBtn').onclick = () => { if (typeof window.sendMessage === 'function') window.sendMessage(); };

    // File attachment — direct upload, no rename modal
    document.getElementById('fileAttachment').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        window.showCenterToast('Uploading...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
        const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filePath = `chat/${Date.now()}_${safeName}`;
        const sizeKB = Math.round(file.size / 1024);
        const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
        if (error) { window.showCenterToast('Upload failed: ' + error.message, 'fa-solid fa-times', 'text-red-500'); return; }
        if (window.quillEditor) {
            window.quillEditor.focus();
            const range = window.quillEditor.getSelection();
            const index = range ? range.index : window.quillEditor.getLength();
            window.quillEditor.insertText(index, `📁 ${file.name} (${sizeKB} KB)
`, 'link', `https://secure-file.local/${filePath}`);
        }
        window.showCenterToast('File attached!', 'fa-solid fa-check-circle', 'text-green-500');
        e.target.value = '';
    });

    const searchBar = document.getElementById('messageSearchBar');
    if (searchBar) searchBar.addEventListener('input', () => { if (typeof window.applyFilters === 'function') window.applyFilters(); });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.menu-wrap')) { if (typeof window.closeDropdowns === 'function') window.closeDropdowns(); }
        const ep = document.getElementById('inputEmojiPicker');
        if (ep && !e.target.closest('#inputEmojiPicker') && !e.target.closest('[onclick="window.toggleInputEmojiPicker()"]')) ep.classList.add('hidden');
        const panel = document.querySelector('.top-panel-dropdown');
        if (!panel) return;
        if (!panel.contains(e.target) && !e.target.closest('.top-bar-icon')) panel.remove();
    });

    if (typeof window.initResizers === 'function') window.initResizers();
    if (typeof window.loadChatsList === 'function') window.loadChatsList();
    if (typeof window.loadMessages === 'function') window.loadMessages();
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};

// ─── SIDEBAR SEARCH ────────────────────────────────────────────────────────
window.filterSidebar = function(term) {
    const t = term.toLowerCase().trim();
    document.querySelectorAll('.channel-item').forEach(el => {
        const name = (el.dataset.name || '').toLowerCase();
        el.style.display = (!t || name.includes(t)) ? 'flex' : 'none';
    });
    // Show/hide section labels based on whether any items visible
    document.querySelectorAll('.sidebar-section-label').forEach(label => {
        const nextItems = [];
        let next = label.nextElementSibling;
        while (next && next.classList.contains('channel-item')) { nextItems.push(next); next = next.nextElementSibling; }
        const anyVisible = nextItems.some(el => el.style.display !== 'none');
        label.style.display = (!t || anyVisible) ? 'block' : 'none';
    });
};

// ─── LOAD CHATS LIST (Departments + Staff Members) ─────────────────────────
window.loadChatsList = async function() {
    const departments = ['general', 'math', 'science', 'leadership'];
    const {data: users} = await sb.from('profiles').select('id, email, full_name');
    window.globalUsersCache = users || [];

    // Department label colours for avatars
    const deptColors = { general: '#6366f1', math: '#0ea5e9', science: '#10b981', leadership: '#f59e0b' };
    const deptInitials = { general: 'GN', math: 'MA', science: 'SC', leadership: 'LD' };

    let html = `<div class="sidebar-section-label px-4 py-2 mt-2 text-[10px] font-black tracking-widest uppercase" style="color:var(--text-secondary);">Departments</div>`;

    departments.forEach(g => {
        const isCurrent = window.currentRoom === g;
        const unread = window.unreadCounts?.[g] || 0;
        const bgColor = deptColors[g] || 'var(--accent)';
        const initials = deptInitials[g] || g.substring(0,2).toUpperCase();
        const displayName = g.charAt(0).toUpperCase() + g.slice(1);

        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border"
            style="background-color:${isCurrent ? 'var(--bg-body)' : 'transparent'};border-color:${isCurrent ? 'var(--border-color)' : 'transparent'};font-weight:${isCurrent ? 'bold' : 'normal'};"
            data-room="${g}" data-name="${displayName}">
            <div class="relative flex-shrink-0">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm"
                    style="background:${bgColor};">${initials}</div>
                ${unread > 0 ? `<span class="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full" style="background:#22c55e;"></span>
                    <span class="absolute -top-1 -right-1 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style="background:#22c55e;">${unread > 9 ? '9+' : unread}</span>` : ''}
            </div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color:var(--text-primary);">${displayName}</span>
        </div>`;
    });

    html += `<div class="sidebar-section-label px-4 py-2 mt-4 text-[10px] font-black tracking-widest uppercase" style="color:var(--text-secondary);">Staff Members</div>`;

    window.globalUsersCache.filter(u => u.id !== window.currentUser.id).forEach(u => {
        const name = (typeof window.toSentenceCase === 'function') ? window.toSentenceCase(u.full_name || u.email.split('@')[0]) : (u.full_name || u.email.split('@')[0]);
        // Use canonical DM room ID so both sides match
        const dmRoomId = typeof window.getDmRoomId === 'function' ? window.getDmRoomId(u.id) : 'dm_' + u.id;
        const isCurrent = window.currentRoom === dmRoomId;
        const unread = window.unreadCounts?.[dmRoomId] || 0;

        html += `<div class="channel-item p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border"
            style="background-color:${isCurrent ? 'var(--bg-body)' : 'transparent'};border-color:${isCurrent ? 'var(--border-color)' : 'transparent'};font-weight:${isCurrent ? 'bold' : 'normal'};"
            data-room="${dmRoomId}" data-name="${name}">
            <div class="relative flex-shrink-0">
                <div class="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm" style="background:var(--accent);">${name.charAt(0).toUpperCase()}</div>
                ${unread > 0 ? `<span class="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full" style="background:#22c55e;"></span>
                    <span class="absolute -top-1 -right-1 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style="background:#22c55e;">${unread > 9 ? '9+' : unread}</span>` : ''}
            </div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color:var(--text-primary);">${window.escapeHtml(name)}</span>
        </div>`;
    });

    const chatsListEl = document.getElementById('chatsList');
    if (chatsListEl) {
        chatsListEl.innerHTML = html;
        document.querySelectorAll('.channel-item').forEach(el => {
            el.addEventListener('click', () => {
                window.currentRoom = el.dataset.room;
                localStorage.setItem('mpgs_current_room', el.dataset.room);
                // Clear unread for this room
                if (window.unreadCounts) window.unreadCounts[el.dataset.room] = 0;
                window.loadChatsList();
                const titleSpan = document.getElementById('roomTitleDisplay');
                if (titleSpan) titleSpan.innerText = el.dataset.name;
                const shell = document.getElementById('chatShellContainer');
                if (shell) shell.innerHTML = '<div class="m-auto flex flex-col items-center opacity-50 pt-10"><i class="fa-solid fa-circle-notch fa-spin text-3xl mb-3" style="color:var(--text-secondary);"></i><p class="text-sm font-medium" style="color:var(--text-secondary);">Loading chat...</p></div>';
                if (typeof window.loadMessages === 'function') window.loadMessages();
            });
        });
    }
};

// ─── DM ROOM KEY HELPER ────────────────────────────────────────────────────
// Both sides of a DM must use the same room key.
// We use "dm_<smaller_uuid>_<larger_uuid>" so it's identical for both users.
window.getDmRoomId = function(otherUserId) {
    const me = window.currentUser.id;
    const ids = [me, otherUserId].sort();
    return `dm_${ids[0]}_${ids[1]}`;
};

// ─── SOUNDS ────────────────────────────────────────────────────────────────
window._soundLastPlayed = {};
window.playSound = function(type) {
    const now = Date.now();
    // Debounce: same sound can't fire more than once per 2 seconds
    if (window._soundLastPlayed[type] && now - window._soundLastPlayed[type] < 2000) return;
    window._soundLastPlayed[type] = now;
    const urls = {
        message: 'https://apfymygzwkzjhhgmtkaj.supabase.co/storage/v1/object/sign/sounds/just-saying-593.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iNWUyZGMwYy1lZDIwLTRlNTQtYTVkNS1hYTBmODFiN2MxNzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzb3VuZHMvanVzdC1zYXlpbmctNTkzLm1wMyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODEyNzg2ODgsImV4cCI6MTkzODk1ODY4OH0.NIpeQ5KadtgFTs4isNicayCmXoTcWWHFu2m3mS-9Txs',
        reminder: 'https://apfymygzwkzjhhgmtkaj.supabase.co/storage/v1/object/sign/sounds/when-604.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iNWUyZGMwYy1lZDIwLTRlNTQtYTVkNS1hYTBmODFiN2MxNzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzb3VuZHMvd2hlbi02MDQubXAzIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MTI3ODc0MCwiZXhwIjoxOTM4OTU4NzQwfQ.Ic5nmchKsn-dVPkRjQiJ8tRavAUCvPgbpQ4xiwu6RCk',
        task: 'https://apfymygzwkzjhhgmtkaj.supabase.co/storage/v1/object/sign/sounds/youve-been-informed-345.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9iNWUyZGMwYy1lZDIwLTRlNTQtYTVkNS1hYTBmODFiN2MxNzkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJzb3VuZHMveW91dmUtYmVlbi1pbmZvcm1lZC0zNDUubXAzIiwic2NvcGUiOiJkb3dubG9hZCIsImlhdCI6MTc4MTI3ODc5OSwiZXhwIjoxOTM4OTU4Nzk5fQ.w1dP5ECmZNfoGbD8fBSZBfnlJUeeQkdX7z3-bDv-Vbk'
    };
    const url = urls[type];
    if (!url) return;
    try {
        const audio = new Audio(url);
        audio.volume = 0.6;
        audio.play().catch(() => {}); // ignore autoplay block
    } catch (e) {}
};

// ─── DEBOUNCED loadTasksForPanel ────────────────────────────────────────────
let _taskPanelTimer = null;
window.debouncedLoadTasks = function() {
    clearTimeout(_taskPanelTimer);
    _taskPanelTimer = setTimeout(() => {
        if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
    }, 600); // 600ms — absorbs rapid multi-assignee bursts
};

// ─── SUBSCRIPTIONS ─────────────────────────────────────────────────────────
window.startSubscriptions = function() {
    if (messageSubscription) messageSubscription.unsubscribe();
    messageSubscription = sb.channel('public:messages')
        .on('postgres_changes', {event:'INSERT', schema:'public', table:'messages'}, (p) => {
            const incomingRoom = p.new.room_id;
            const isForMe = incomingRoom === window.currentRoom ||
                // DM: check both orientations — sender used dm_<their_id>_<my_id> or dm_<my_id>_<their_id>
                (incomingRoom.startsWith('dm_') && incomingRoom.includes(window.currentUser.id) && incomingRoom === window.currentRoom);

            if (incomingRoom === window.currentRoom) {
                if (typeof window.loadMessages === 'function') window.loadMessages();
                // Play sound for received messages (not own)
                if (p.new.sender_id !== window.currentUser.id) window.playSound('message');
            } else {
                window.unreadCounts = window.unreadCounts || {};
                window.unreadCounts[incomingRoom] = (window.unreadCounts[incomingRoom] || 0) + 1;
                if (typeof window.loadChatsList === 'function') window.loadChatsList();
                // Play sound for DM received in background
                if (incomingRoom.startsWith('dm_') && incomingRoom.includes(window.currentUser.id) && p.new.sender_id !== window.currentUser.id) {
                    window.playSound('message');
                }
            }
        }).subscribe();

    // Reactions real-time — update other viewers' DOM when a reaction is added
    let reactionsSubscription = null;
    if (reactionsSubscription) reactionsSubscription.unsubscribe();
    reactionsSubscription = sb.channel('reactions-changes')
        .on('postgres_changes', {event:'INSERT', schema:'public', table:'reactions'}, (p) => {
            // Only update if the reaction is NOT from current user (they already have it in DOM)
            if (p.new.user_id !== window.currentUser.id) {
                if (typeof window.applyReactionDOM === 'function') {
                    window.applyReactionDOM(p.new.message_id, p.new.value, p.new.type);
                }
            }
        }).subscribe();

    // Scheduled messages: notify sender when status changes to 'sent'
    let scheduledSubscription = null;
    if (scheduledSubscription) scheduledSubscription.unsubscribe();
    scheduledSubscription = sb.channel('scheduled-changes')
        .on('postgres_changes', {event:'UPDATE', schema:'public', table:'scheduled_messages',
            filter: `sender_id=eq.${window.currentUser.id}`}, (p) => {
            if (p.new.status === 'sent') {
                const msg = window.stripHtml ? window.stripHtml(p.new.message_text) : p.new.message_text;
                window.showCenterToast(`📨 Scheduled message sent: ${msg.substring(0,50)}`, 'fa-solid fa-clock', 'text-blue-400');
                window.playSound('message');
                window.notifyUser(window.currentUser.id, `📨 Scheduled message sent: ${msg.substring(0,50)}`, null, 'message');
            }
        }).subscribe();

    if (taskSubscription) taskSubscription.unsubscribe();
    taskSubscription = sb.channel('tasks-changes')
        .on('postgres_changes', {event:'*', schema:'public', table:'tasks'}, () => {
            window.debouncedLoadTasks();
        }).subscribe();

    if (assigneeSubscription) assigneeSubscription.unsubscribe();
    assigneeSubscription = sb.channel('assignees-changes')
        .on('postgres_changes', {event:'*', schema:'public', table:'task_assignees'}, () => {
            window.debouncedLoadTasks();
        }).subscribe();

    if (trailSubscription) trailSubscription.unsubscribe();
    trailSubscription = sb.channel('trails-changes')
        .on('postgres_changes', {event:'*', schema:'public', table:'task_trails'}, () => {
            window.debouncedLoadTasks();
        }).subscribe();

    if (notificationSubscription) notificationSubscription.unsubscribe();
    notificationSubscription = sb.channel('notifications-changes')
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'notifications',
            filter: `user_id=eq.${window.currentUser.id}`
        }, (payload) => {
            const msg = window.stripHtml ? window.stripHtml(payload.new.message) : payload.new.message;
            const type = payload.new.type || 'general';
            if (type === 'reminder') {
                window.showCenterToast(`⏰ ${msg}`, 'fa-solid fa-stopwatch', 'text-purple-400');
                window.playSound('reminder');
            } else if (type === 'task') {
                window.showCenterToast(msg, 'fa-solid fa-clipboard-check', 'text-blue-400');
                window.playSound('task');
            } else if (type === 'message') {
                // DM toast — sound already played by message subscription
                window.showCenterToast(msg, 'fa-solid fa-comment', 'text-green-400');
            } else {
                window.showCenterToast(msg, 'fa-solid fa-bell', 'text-yellow-400');
            }
            if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
            // Animate bell icon
            window.animateBell();
        }).subscribe();

    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
};

// Bell animation — pulses until user clicks it
window.animateBell = function() {
    const bell = document.querySelector(".bell-wrapper i.ti-bell, [onclick*=\"openTopPanel('alerts')\"]");
    if (!bell) return;
    const target = bell.closest('.bell-wrapper') || bell;
    target.classList.add('bell-ring');
    target.addEventListener('click', () => target.classList.remove('bell-ring'), { once: true });
};

// Boot Sequence
;(async() => {
    const {data: {session}} = await sb.auth.getSession();
    if (!session) {
        if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
    } else {
        window.currentUser = session.user;
        if (typeof window.ensureProfile === 'function') await window.ensureProfile();
        if (typeof window.renderMainApp === 'function') window.renderMainApp();
        if (typeof window.startSubscriptions === 'function') window.startSubscriptions();
    }
})();
