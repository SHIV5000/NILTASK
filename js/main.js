import { sb } from './shared.js';

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
                <!-- School Name 3D Badge -->
                <div style="margin:10px 10px 0;background:linear-gradient(135deg,var(--accent) 0%,color-mix(in srgb,var(--accent) 55%,#000) 100%);border-radius:13px;padding:12px 15px;text-align:center;box-shadow:0 5px 0 rgba(0,0,0,.22),0 8px 20px rgba(0,0,0,.15),inset 0 1px 0 rgba(255,255,255,.16);position:relative;overflow:hidden;transform:perspective(400px) rotateX(1.5deg);">
                    <div style="position:absolute;top:0;left:0;right:0;height:50%;background:rgba(255,255,255,.08);border-radius:13px 13px 0 0;"></div>
                    <div style="font-size:12px;font-weight:900;color:#fff;letter-spacing:1.5px;text-transform:uppercase;text-shadow:0 2px 4px rgba(0,0,0,.4),0 -1px 0 rgba(255,255,255,.18);position:relative;z-index:1;">${window.escapeHtml(window.currentSchoolName || 'MPGS TaskFlow')}</div>
                    <div style="font-size:8px;color:rgba(255,255,255,.6);letter-spacing:2px;text-transform:uppercase;margin-top:3px;position:relative;z-index:1;">✦ &nbsp; Powered by TaskFlow &nbsp; ✦</div>
                </div>
                <div class="p-4 flex justify-between items-center border-b" style="border-color:var(--border-color);">
                    <h2 class="text-xl font-bold tracking-tight flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-comments" style="color:var(--accent);"></i> Conversation
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="window.toggleTheme()" class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors" title="Toggle Theme" style="color:var(--text-secondary);">
                            <i id="themeToggleIcon" class="fa-solid ${window.currentTheme === 'light' ? 'fa-sun' : (window.currentTheme === 'dark' ? 'fa-moon' : 'fa-cloud-moon')} text-sm"></i>
                        </button>
                        <button onclick="window.logout()" class="w-8 h-8 rounded-full hover:bg-red-100 hover:text-red-600 flex items-center justify-center transition-colors" style="color:var(--text-secondary);">
                            <i class="fa-solid fa-arrow-right-from-bracket text-sm"></i>
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

                <div class="p-3 border-t flex flex-col gap-1.5" style="border-color:var(--border-color);background-color:var(--bg-body);">
                    <div class="flex items-center gap-2 w-full">
                        <div class="flex-1 text-[12px] font-bold flex items-center gap-2 border shadow-sm px-2 py-1.5 rounded-full justify-center min-w-0" style="color:var(--text-primary);border-color:var(--border-color);background-color:var(--bg-sidebar);">
                            <div id="sidebarAvatar" class="w-5 h-5 rounded-full text-white flex items-center justify-center text-[10px] flex-shrink-0 overflow-hidden" style="background-color:var(--accent);">
                                ${(window._userAvatarUrl || localStorage.getItem('mpgs_avatar_' + (window.currentUser?.id||''))) ? `<img src="${window._userAvatarUrl || localStorage.getItem('mpgs_avatar_' + (window.currentUser?.id||''))}" style="width:100%;height:100%;object-fit:cover;">` : userNameDisplay.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <span class="truncate" id="sidebarNameDisplay">${window.escapeHtml(userNameDisplay.toUpperCase())}</span>
                                <div style="font-size:9px;font-weight:700;color:var(--accent);letter-spacing:.06em;text-transform:uppercase;margin-top:1px;opacity:.85;">
                                    ${window.currentRoleName || ''}
                                </div>
                            </div>
                        </div>
                        <button onclick="window.openSettings()" title="Profile Settings"
                            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border hover:bg-gray-100 transition-colors"
                            style="color:var(--text-secondary);border-color:var(--border-color);background-color:var(--bg-sidebar);">
                            <i class="fa-solid fa-gear text-sm"></i>
                        </button>
                        <button onclick="window.openDashboard()" title="My Dashboard"
                            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border hover:bg-gray-100 transition-colors"
                            style="color:var(--text-secondary);border-color:var(--border-color);background-color:var(--bg-sidebar);">
                            <i class="fa-solid fa-chart-bar text-sm"></i>
                        </button>
                    </div>
                    <div class="text-[9px] font-bold tracking-wider uppercase text-center" style="color:var(--text-secondary);">VER 1.61.0</div>
                </div>
            </div>

            <div id="leftResizer" class="drag-resizer"></div>

            <!-- CHAT AREA -->
            <div class="flex-1 flex flex-col relative min-w-0 chat-area">
                <div class="p-4 border-b z-10 flex justify-between items-center shadow-sm backdrop-blur" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                    <div class="flex items-center gap-3">
                        <!-- Mobile hamburger (shown by CSS on mobile only) -->
                        <button id="mobileSidebarToggle" onclick="window.toggleMobileSidebar()"
                            style="display:none;background:none;border:none;cursor:pointer;padding:4px;color:var(--text-secondary);font-size:22px;line-height:1;">
                            <i class="fa-solid fa-bars"></i>
                        </button>
                        <i class="ti ti-layout-sidebar-left cursor-pointer pr-3 border-r" onclick="window.toggleLeftSidebar()" title="Toggle Sidebar" style="color:var(--text-secondary);border-color:var(--border-color);"></i>
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight" style="color:var(--text-primary);">Loading...</span>
                        <button id="groupSettingsBtn" onclick="window.openGroupSettings()" title="Group Settings"
                            class="ml-1 w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100 transition-colors hidden"
                            style="color:var(--text-secondary);">
                            <i class="fa-solid fa-sliders text-xs"></i>
                        </button>
                    </div>
                    <div class="flex items-center gap-4" style="color:var(--text-secondary);">
                        ${window.canSchedule?.() !== false ? `
                        <div class="topbar-icon-btn top-bar-icon" id="topBarScheduleBtn" onclick="window.openTopPanel('scheduled')" title="Scheduled Messages">
                            <i class="ti ti-clock text-xl"></i><span>Schedule</span>
                        </div>` : ''}
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.openTopPanel('reminders')" title="Reminders">
                            <i class="fa-solid fa-stopwatch text-[18px]"></i><span>Remind</span>
                        </div>
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.openTopPanel('bookmarks')" title="Bookmarks">
                            <i class="ti ti-bookmark text-xl"></i><span>Bookmarks</span>
                        </div>
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.openTopPanel('alerts')" title="Notifications">
                            <i class="ti ti-bell text-xl"></i><span>Alerts</span>
                        </div>
                        <div class="topbar-icon-btn top-bar-icon" onclick="window.openActivityFeed()" title="Activity Feed">
                            <i class="fa-solid fa-bolt text-[17px]"></i><span>Activity</span>
                        </div>
                        <div class="border-l pl-4 ml-1 flex gap-3" style="border-color:var(--border-color);">
                            <div class="topbar-icon-btn" onclick="window.toggleRightSidebar()" title="Toggle Task Panel">
                                <i class="ti ti-layout-sidebar-right text-xl"></i><span>Tasks</span>
                            </div>
                        </div>
                        <input type="text" id="messageSearchBar" placeholder="Search messages..." class="ui-input px-3 py-1 rounded-full text-sm w-40 outline-none ml-1">
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
                            ${window.canSchedule?.() !== false ? '<button onclick="window.showScheduleModal()" class="p-2 transition-colors" title="Schedule" style="color:var(--text-secondary);"><i class="ti ti-clock text-xl"></i></button>' : ''}
                            <button id="sendBtn" class="text-white rounded-lg shadow-md transition-colors h-[38px] w-[46px] flex items-center justify-center mb-0.5" style="background-color:var(--accent);"><i class="ti ti-send text-lg"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="rightResizer" class="drag-resizer"></div>

            <!-- RIGHT SIDEBAR -->
            <div id="rightSidebar" class="right-sidebar border-l flex-col z-20 shadow-sm" style="display:${rightDisplay};width:${rightWidth};background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="w-full h-full flex flex-col min-w-0">
                    <div id="rightSidebarFilters" class="border-b" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                        <!-- Hidden selects for backwards compat with tasks.js -->
                        <select id="taskFilter" class="hidden" onchange="window.loadTasksForPanel()">
                            <option value="all">All Tasks</option><option value="today">Today</option>
                            <option value="pending">Pending</option><option value="completed">Completed</option>
                            <option value="allotted_by_me">Allotted by Me</option><option value="allotted_to_me">Allotted to Me</option>
                            <option value="delegated">Delegated</option><option value="transferred">Transferred</option>
                            <option value="date_range">Date Range</option>
                        </select>
                        <select id="taskSort" class="hidden" onchange="window.loadTasksForPanel()">
                            <option value="deadline_asc">deadline_asc</option><option value="deadline_desc">deadline_desc</option>
                            <option value="created_desc">created_desc</option><option value="created_asc">created_asc</option>
                        </select>
                        <!-- Pill filter row -->
                        <div class="px-3 pt-2.5 pb-1">
                            <div class="text-[9px] font-black tracking-widest uppercase mb-1.5 flex items-center gap-1" style="color:var(--text-secondary);">
                                <i class="fa-solid fa-filter" style="font-size:8px;color:var(--accent);"></i> Filter
                            </div>
                            <div class="flex gap-1 flex-wrap pb-1">
                                <button class="filter-pill fp-active" data-filter="all" onclick="window.setTaskFilter('all')">All</button>
                                <button class="filter-pill" data-filter="today" onclick="window.setTaskFilter('today')">Today</button>
                                <button class="filter-pill" data-filter="pending" onclick="window.setTaskFilter('pending')">Pending</button>
                                <button class="filter-pill" data-filter="completed" onclick="window.setTaskFilter('completed')">Done</button>
                                <button class="filter-pill" data-filter="allotted_by_me" onclick="window.setTaskFilter('allotted_by_me')">By Me</button>
                                <button class="filter-pill" data-filter="allotted_to_me" onclick="window.setTaskFilter('allotted_to_me')">To Me</button>
                                <button class="filter-pill" data-filter="delegated" onclick="window.setTaskFilter('delegated')">Delegated</button>
                                <button class="filter-pill" data-filter="transferred" onclick="window.setTaskFilter('transferred')">Transferred</button>
                                <button class="filter-pill" data-filter="date_range" onclick="window.setTaskFilter('date_range')">Date Range</button>
                            </div>
                        </div>
                        <!-- Sort row -->
                        <div class="px-3 pb-2.5">
                            <div class="text-[9px] font-black tracking-widest uppercase mb-1.5" style="color:var(--text-secondary);">Sort by</div>
                            <div class="flex gap-1 flex-wrap">
                                <button class="filter-pill fp-active" data-sort="deadline_asc" onclick="window.setTaskSort('deadline_asc')" title="Deadline: Earliest"><i class="fa-solid fa-arrow-up text-[8px]"></i> Deadline ↑</button>
                                <button class="filter-pill" data-sort="deadline_desc" onclick="window.setTaskSort('deadline_desc')" title="Deadline: Latest"><i class="fa-solid fa-arrow-down text-[8px]"></i> Deadline ↓</button>
                                <button class="filter-pill" data-sort="created_desc" onclick="window.setTaskSort('created_desc')" title="Newest first">Newest</button>
                                <button class="filter-pill" data-sort="created_asc" onclick="window.setTaskSort('created_asc')" title="Oldest first">Oldest</button>
                            </div>
                        </div>
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

        <!-- Dashboard Modal -->
        <div id="dashboardModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50 p-4">
            <div class="rounded-2xl w-full max-w-2xl shadow-2xl border flex flex-col max-h-[90vh]" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="p-5 border-b flex items-center justify-between flex-shrink-0" style="border-color:var(--border-color);">
                    <h3 class="text-lg font-bold flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-chart-bar" style="color:var(--accent);"></i> My Dashboard
                    </h3>
                    <div class="flex items-center gap-2">
                        <button onclick="window.downloadDashboardPDF()" class="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-80 transition-opacity" style="background:var(--accent);color:#fff;" title="Download Progress Card">
                            <i class="fa-solid fa-download text-[10px]"></i> Download PDF
                        </button>
                        <button onclick="window.closeDashboard()" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors" style="color:var(--text-secondary);">
                            <i class="fa-solid fa-times text-sm"></i>
                        </button>
                    </div>
                </div>
                <!-- Period tabs -->
                <div class="flex gap-1 p-4 pb-0 flex-shrink-0">
                    ${['today','week','month','all'].map(p => `<button class="dash-tab px-3 py-1.5 rounded-lg text-xs font-bold border transition-all" data-period="${p}" onclick="window.loadDashboard('${p}')" style="border-color:var(--border-color);color:var(--text-secondary);background:var(--bg-body);">${p==='all'?'All Time':p.charAt(0).toUpperCase()+p.slice(1)}</button>`).join('')}
                </div>
                <div id="dashboardContent" class="flex-1 overflow-y-auto p-4"></div>
            </div>
        </div>

        <!-- Group Settings Modal — Name, Colour, Members, Admins -->
        <div id="groupSettingsModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl w-full max-w-sm mx-4 shadow-2xl border flex flex-col max-h-[90vh]" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <!-- Header -->
                <div class="p-5 border-b flex items-center justify-between flex-shrink-0" style="border-color:var(--border-color);">
                    <h3 class="text-base font-bold flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-users-gear" style="color:var(--accent);"></i> Group Settings
                    </h3>
                    <button onclick="window.closeGroupSettings()" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100" style="color:var(--text-secondary);">
                        <i class="fa-solid fa-times text-sm"></i>
                    </button>
                </div>
                <!-- Scrollable body -->
                <div class="flex-1 overflow-y-auto p-5">
                    <input type="hidden" id="groupSettingsId">
                    <!-- Display Name -->
                    <div class="mb-4">
                        <label class="text-[10px] font-black tracking-wider uppercase mb-1.5 block" style="color:var(--text-secondary);">Display Name</label>
                        <input type="text" id="groupSettingsName" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                    </div>
                    <!-- Avatar Colour -->
                    <div class="mb-4">
                        <label class="text-[10px] font-black tracking-wider uppercase mb-1.5 block" style="color:var(--text-secondary);">Avatar Colour</label>
                        <div class="flex gap-2 flex-wrap" id="groupColorPicker">
                            ${['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'].map(c =>
                                `<button type="button" onclick="window.selectGroupColor('${c}')" data-color="${c}"
                                    class="w-9 h-9 rounded-lg border-2 border-transparent hover:scale-110 transition-transform shadow-sm"
                                    style="background:${c};" title="${c}"></button>`
                            ).join('')}
                        </div>
                    </div>
                    <!-- Members & Admins -->
                    <div>
                        <div class="text-[10px] font-black tracking-wider uppercase mb-1.5 flex items-center justify-between" style="color:var(--text-secondary);">
                            <span>Members & Admins</span>
                            <span class="text-[9px] normal-case font-normal" style="color:var(--text-secondary);">☑ = Member &nbsp;★ = Admin</span>
                        </div>
                        <div id="groupMembersList" class="border rounded-xl overflow-hidden" style="border-color:var(--border-color);background-color:var(--bg-body);">
                            <p class="text-xs italic p-3" style="color:var(--text-secondary);">Loading members...</p>
                        </div>
                    </div>
                </div>
                <!-- Footer -->
                <div class="p-4 border-t flex gap-3 flex-shrink-0" style="border-color:var(--border-color);">
                    <button onclick="window.closeGroupSettings()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveGroupSettings()" class="flex-1 py-2.5 rounded-xl font-bold text-white" style="background-color:var(--accent);">Save</button>
                </div>
            </div>
        </div>

        <!-- Settings Modal -->
        <div id="settingsModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <div class="flex items-center justify-between mb-5">
                    <h3 class="text-lg font-bold flex items-center gap-2" style="color:var(--text-primary);">
                        <i class="fa-solid fa-gear" style="color:var(--accent);"></i> Profile Settings
                    </h3>
                    <button onclick="window.closeSettings()" class="w-7 h-7 rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors" style="color:var(--text-secondary);">
                        <i class="fa-solid fa-times text-sm"></i>
                    </button>
                </div>
                <!-- Photo -->
                <div class="flex flex-col items-center mb-5">
                    <div class="relative mb-3">
                        <img id="settingsPhotoPreview" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Profile" style="display:none;width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid var(--accent);">
                        <div id="settingsPhotoPlaceholder" class="w-18 h-18 rounded-full flex items-center justify-center text-white text-2xl font-bold" style="width:72px;height:72px;border-radius:50%;background:var(--accent);">${userNameDisplay.charAt(0).toUpperCase()}</div>
                    </div>
                    <label class="cursor-pointer text-xs font-bold px-3 py-1.5 rounded-full border transition-colors hover:opacity-80" style="color:var(--accent);border-color:var(--accent);">
                        <i class="fa-solid fa-camera text-[10px] mr-1"></i> Change Photo
                        <input type="file" id="settingsPhotoInput" class="hidden" accept="image/*" onchange="window.previewSettingsPhoto(this)">
                    </label>
                </div>
                <!-- Fields -->
                <div class="mb-3">
                    <label class="text-xs font-bold mb-1 block" style="color:var(--text-secondary);">Display Name</label>
                    <input type="text" id="settingsName" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                </div>
                <div class="mb-3">
                    <label class="text-xs font-bold mb-1 block" style="color:var(--text-secondary);">Designation</label>
                    <input type="text" id="settingsDesignation" placeholder="e.g. Physics Teacher, HOD Science" class="w-full p-2.5 rounded-xl border outline-none text-sm" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                </div>
                <div class="mb-5">
                    <label class="text-xs font-bold mb-1 block" style="color:var(--text-secondary);">Email (read-only)</label>
                    <input type="email" id="settingsEmail" disabled class="w-full p-2.5 rounded-xl border outline-none text-sm opacity-60" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">
                </div>
                <div class="flex gap-3">
                    <button onclick="window.closeSettings()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.saveSettings()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Save</button>
                </div>
            </div>
        </div>

        <!-- Forward Message Modal -->
        <div id="forwardModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm hidden items-center justify-center z-50">
            <div class="rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl border" style="background-color:var(--bg-sidebar);border-color:var(--border-color);">
                <h3 class="text-lg font-bold mb-1" style="color:var(--text-primary);">Forward Message</h3>
                <p class="text-xs mb-3" style="color:var(--text-secondary);">Select a department or staff member to forward to:</p>
                <div class="border p-3 rounded-xl mb-4 italic text-xs" id="forwardPreview" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-secondary);max-height:60px;overflow:hidden;"></div>
                <select id="forwardRoomSelect" class="w-full p-2.5 rounded-xl border outline-none text-sm mb-5" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);"></select>
                <div class="flex gap-3">
                    <button onclick="window.closeForwardModal()" class="flex-1 py-2.5 rounded-xl font-bold border hover:opacity-80" style="background-color:var(--bg-body);border-color:var(--border-color);color:var(--text-primary);">Cancel</button>
                    <button onclick="window.sendForwardedMessage()" class="flex-1 py-2.5 rounded-xl font-bold text-white shadow-md" style="background-color:var(--accent);">Forward</button>
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

    // ── Initialise mobile layout after render ────────────────
    window.initMobile();
};

// ── MOBILE LAYOUT ──────────────────────────────────────────
// Uses setProperty('important') to beat dynamic inline styles
window.initMobile = function() {
    const isMobile = window.innerWidth <= 768;
    const leftSB  = document.getElementById('leftSidebar');
    const rightSB = document.getElementById('rightSidebar');
    const leftR   = document.getElementById('leftResizer');
    const rightR  = document.getElementById('rightResizer');
    if (!leftSB) return;

    if (isMobile) {
        // ── RIGHT SIDEBAR: completely hidden ─────────────────
        if (rightSB) { rightSB.style.setProperty('display','none','important'); }
        if (rightR)  { rightR.style.setProperty('display','none','important'); }
        if (leftR)   { leftR.style.setProperty('display','none','important'); }

        // ── LEFT SIDEBAR: fixed overlay off-screen left ──────
        leftSB.style.setProperty('position','fixed','important');
        leftSB.style.setProperty('top','0','important');
        leftSB.style.setProperty('bottom','0','important');
        leftSB.style.setProperty('left','-100vw','important');
        leftSB.style.setProperty('height','100%','important');
        leftSB.style.setProperty('width','82vw','important');
        leftSB.style.setProperty('max-width','320px','important');
        leftSB.style.setProperty('z-index','300','important');
        leftSB.style.setProperty('transition','left 0.28s cubic-bezier(.4,0,.2,1)','important');
        leftSB.style.setProperty('box-shadow','4px 0 24px rgba(0,0,0,.2)','important');
        leftSB.style.setProperty('overflow-y','auto','important');

        // ── OVERLAY backdrop ─────────────────────────────────
        if (!document.getElementById('mobileOverlay')) {
            const ov = document.createElement('div');
            ov.id = 'mobileOverlay';
            Object.assign(ov.style, {
                display:'none', position:'fixed', inset:'0',
                background:'rgba(0,0,0,.5)', zIndex:'299',
                backdropFilter:'blur(2px)', transition:'opacity .25s'
            });
            ov.onclick = () => window.closeMobileSidebar();
            document.body.appendChild(ov);
        }

        // ── TOP BAR: show hamburger, hide text labels ────────
        const ham = document.getElementById('mobileSidebarToggle');
        if (ham) ham.style.setProperty('display','flex','important');
        document.querySelectorAll('.topbar-icon-btn span').forEach(s => {
            s.style.setProperty('display','none','important');
        });

        // ── HIDE school badge 3D tilt (looks bad on narrow) ──
        const badge = document.querySelector('.school-badge-area');
        if (badge) badge.style.setProperty('transform','none','important');

    } else {
        // ── DESKTOP: restore defaults ─────────────────────────
        if (rightSB) rightSB.style.removeProperty('display');
        leftSB.style.removeProperty('position');
        leftSB.style.removeProperty('left');
        leftSB.style.removeProperty('transition');
    }
};

// ── Mobile sidebar open / close ────────────────────────────
window.toggleMobileSidebar = function() {
    const isOpen = document.getElementById('leftSidebar')
                           ?.style.getPropertyValue('left') === '0px';
    if (isOpen) window.closeMobileSidebar();
    else        window.openMobileSidebar();
};

window.openMobileSidebar = function() {
    const leftSB = document.getElementById('leftSidebar');
    const ov     = document.getElementById('mobileOverlay');
    if (!leftSB) return;
    leftSB.style.setProperty('left','0','important');
    if (ov) { ov.style.display = 'block'; requestAnimationFrame(() => { ov.style.opacity='1'; }); }
};

window.closeMobileSidebar = function() {
    const leftSB = document.getElementById('leftSidebar');
    const ov     = document.getElementById('mobileOverlay');
    if (!leftSB) return;
    leftSB.style.setProperty('left','-100vw','important');
    if (ov) { ov.style.opacity='0'; setTimeout(() => { ov.style.display='none'; }, 280); }
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

        // Check for stored group display name
        const storedName = localStorage.getItem('dept_name_' + g) || displayName;
        const storedColor = localStorage.getItem('dept_color_' + g) || bgColor;
        html += `<div class="channel-item group/dept p-2.5 mx-2 mb-1 rounded-xl cursor-pointer flex items-center gap-3 transition-colors border"
            style="background-color:${isCurrent ? 'var(--bg-body)' : 'transparent'};border-color:${isCurrent ? 'var(--border-color)' : 'transparent'};font-weight:${isCurrent ? 'bold' : 'normal'};"
            data-room="${g}" data-name="${storedName}">
            <div class="relative flex-shrink-0">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shadow-sm"
                    style="background:${storedColor};">${initials}</div>
                ${unread > 0 ? `<span class="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full" style="background:#22c55e;"></span>
                    <span class="absolute -top-1 -right-1 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style="background:#22c55e;">${unread > 9 ? '9+' : unread}</span>` : ''}
            </div>
            <span class="flex-1 truncate tracking-wide text-sm" style="color:var(--text-primary);">${storedName}</span>
            <button onclick="event.stopPropagation();window.openGroupSettings('${g}')"
                class="opacity-0 group-hover/dept:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 flex-shrink-0"
                style="color:var(--text-secondary);" title="Group Settings">
                <i class="fa-solid fa-gear text-[10px]"></i>
            </button>
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

    // Update top bar room title now that we have user data
    const titleSpanEl = document.getElementById('roomTitleDisplay');
    if (titleSpanEl) titleSpanEl.innerText = window.getRoomDisplayName ? window.getRoomDisplayName(window.currentRoom) : window.currentRoom;

    const chatsListEl = document.getElementById('chatsList');
    if (chatsListEl) {
        chatsListEl.innerHTML = html;
        // Apply group gear visibility by role after rendering
        if (typeof window.applyGroupGearRBAC === 'function') window.applyGroupGearRBAC();
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
            if (incomingRoom === window.currentRoom) {
                if (typeof window.loadMessages === 'function') window.loadMessages();
                if (p.new.sender_id !== window.currentUser.id) window.playSound('message');
            } else {
                window.unreadCounts = window.unreadCounts || {};
                window.unreadCounts[incomingRoom] = (window.unreadCounts[incomingRoom] || 0) + 1;
                if (typeof window.loadChatsList === 'function') window.loadChatsList();
                if (incomingRoom.startsWith('dm_') && incomingRoom.includes(window.currentUser.id) && p.new.sender_id !== window.currentUser.id) {
                    window.playSound('message');
                }
            }
            // Refresh activity feed if open
            if (window._activityFeedOpen && typeof window.refreshActivityFeed === 'function') window.refreshActivityFeed();
        }).subscribe();

    // Reactions real-time via BROADCAST — works instantly, zero schema requirements.
    // No reactions table needed. All connected users receive the reaction immediately.
    if (window._reactionsBroadcast) {
        try { window._reactionsBroadcast.unsubscribe(); } catch(e) {}
    }
    window._reactionsBroadcast = sb.channel('mpgs-reactions-v1');
    window._reactionsBroadcast
        // Handle reaction ADD from other users
        .on('broadcast', { event: 'reaction' }, (payload) => {
            const p = payload.payload;
            if (p && p.user_id !== window.currentUser.id) {
                if (typeof window.applyReactionDOM === 'function') {
                    window.applyReactionDOM(p.message_id, p.value, p.type);
                }
            }
        })
        // Handle reaction REMOVE from other users (toggle off)
        .on('broadcast', { event: 'reaction_remove' }, (payload) => {
            const p = payload.payload;
            if (p && p.user_id !== window.currentUser.id) {
                const footer = document.getElementById('footer-' + p.message_id);
                if (!footer) return;
                const chip = footer.querySelector(`[data-emoji="${p.value}"]`);
                const tag  = footer.querySelector(`[data-tag="${p.value}"]`);
                if (chip) chip.remove();
                if (tag)  tag.remove();
            }
        })
        .subscribe();

    // Scheduled messages: notify sender when status changes to 'sent'
    let scheduledSubscription = null;
    if (scheduledSubscription) scheduledSubscription.unsubscribe();
    scheduledSubscription = sb.channel('scheduled-changes')
        .on('postgres_changes', {event:'UPDATE', schema:'public', table:'scheduled_messages'}, (p) => {
            // Check sender_id manually since Supabase RT filter on UPDATE is unreliable
            if (p.new.status === 'sent' && p.new.sender_id === window.currentUser.id) {
                const msg = window.stripHtml ? window.stripHtml(p.new.message_text) : p.new.message_text;
                const preview = msg.substring(0, 60);
                window.showCenterToast(`📨 Scheduled: ${preview}`, 'fa-solid fa-clock', 'text-blue-400');
                window.playSound('message');
                // Insert into notifications table so it appears in bell icon
                if (typeof window.notifyUser === 'function') {
                    window.notifyUser(window.currentUser.id, `📨 Scheduled message sent: ${preview}`, null, 'task');
                }
                // Refresh badge
                if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
                // Also reload messages if the scheduled message is for current room
                if (p.new.room_id === window.currentRoom && typeof window.loadMessages === 'function') {
                    window.loadMessages();
                }
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
            // Refresh activity feed if open
            if (window._activityFeedOpen && typeof window.refreshActivityFeed === 'function') window.refreshActivityFeed();
        }).subscribe();

    if (notificationSubscription) notificationSubscription.unsubscribe();
    notificationSubscription = sb.channel('notifications-changes')
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'notifications',
            filter: `user_id=eq.${window.currentUser.id}`
        }, (payload) => {
            const n = payload.new;
            const msg = window.stripHtml ? window.stripHtml(n.message) : n.message;
            const type = n.type || 'general';

            // ── Every notification type: toast + sound + badge + bell animation
            const toastConfig = {
                reminder: { icon:'fa-solid fa-stopwatch',       color:'text-purple-400', sound:'reminder' },
                task:     { icon:'fa-solid fa-clipboard-check', color:'text-blue-400',   sound:'task'     },
                message:  { icon:'fa-solid fa-comment',         color:'text-green-400',  sound:'message'  },
                reply:    { icon:'fa-solid fa-reply',           color:'text-indigo-400', sound:'message'  },
                reaction: { icon:'fa-solid fa-heart',           color:'text-pink-400',   sound:'message'  },
                general:  { icon:'fa-solid fa-bell',            color:'text-yellow-400', sound:'task'     }
            };
            const cfg = toastConfig[type] || toastConfig.general;
            window.showCenterToast(msg.substring(0, 100), cfg.icon, cfg.color);
            window.playSound(cfg.sound);
            if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
            window.animateBell?.();
        }).subscribe();

    if (typeof window.refreshNotificationBadge === 'function') window.refreshNotificationBadge();
};

// Bell animation — pulses until user clicks it


// ─── FILTER/SORT PILL HELPERS ─────────────────────────────────────────────
window.setTaskFilter = function(val) {
    const sel = document.getElementById('taskFilter');
    if (sel) sel.value = val;
    document.querySelectorAll('.filter-pill[data-filter]').forEach(p => p.classList.toggle('fp-active', p.dataset.filter === val));
    const dr = document.getElementById('dateRangeFilter');
    if (dr) { if (val === 'date_range') dr.classList.remove('hidden'); else dr.classList.add('hidden'); }
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};
window.setTaskSort = function(val) {
    const sel = document.getElementById('taskSort');
    if (sel) sel.value = val;
    document.querySelectorAll('.filter-pill[data-sort]').forEach(p => p.classList.toggle('fp-active', p.dataset.sort === val));
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
};

// ─── SCROLL ARROWS ─────────────────────────────────────────────────────────
window.initScrollArrows = function() {
    const mc = document.getElementById('messagesContainer');
    if (!mc || document.getElementById('scrollTopBtn')) return;
    mc.style.position = 'relative';
    const btnTop = document.createElement('button');
    btnTop.id = 'scrollTopBtn';
    btnTop.className = 'chat-scroll-btn';
    btnTop.style.cssText = 'bottom:72px;display:none;background:var(--bg-sidebar);color:var(--text-secondary);';
    btnTop.innerHTML = '<i class="fa-solid fa-chevron-up text-xs"></i>';
    btnTop.title = 'Scroll to top';
    btnTop.onclick = () => mc.scrollTo({top:0,behavior:'smooth'});
    const btnBot = document.createElement('button');
    btnBot.id = 'scrollBotBtn';
    btnBot.className = 'chat-scroll-btn';
    btnBot.style.cssText = 'bottom:32px;display:none;background:var(--accent);color:#fff;border-color:var(--accent);';
    btnBot.innerHTML = '<i class="fa-solid fa-chevron-down text-xs"></i>';
    btnBot.title = 'Scroll to bottom';
    btnBot.onclick = () => mc.scrollTo({top:mc.scrollHeight,behavior:'smooth'});
    mc.appendChild(btnTop);
    mc.appendChild(btnBot);
    mc.addEventListener('scroll', () => {
        const atTop = mc.scrollTop < 120;
        const atBot = mc.scrollHeight - mc.scrollTop - mc.clientHeight < 120;
        btnTop.style.display = atTop ? 'none' : 'flex';
        btnBot.style.display = atBot ? 'none' : 'flex';
    });
};

// ─── ROOM DISPLAY NAME RESOLVER ────────────────────────────────────────────
window.getRoomDisplayName = function(roomId) {
    if (!roomId) return 'Chat';
    if (roomId.startsWith('dm_')) {
        if (!window.globalUsersCache?.length) return 'Direct Message';
        const withoutPrefix = roomId.replace('dm_', '');
        const other = window.globalUsersCache.find(u => u.id !== window.currentUser?.id && withoutPrefix.includes(u.id));
        if (other) return window.toSentenceCase?.(other.full_name || other.email?.split('@')[0]) || 'Direct Message';
        return 'Direct Message';
    }
    return roomId.charAt(0).toUpperCase() + roomId.slice(1);
};

// Boot Sequence
;(async() => {
    const {data: {session}} = await sb.auth.getSession();
    if (!session) {
        // No stored session — show login screen
        if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
        return;
    }

    // Session exists — must load tenant context before rendering anything
    window.currentUser = session.user;

    if (typeof window.loadTenantContext === 'function') {
        const loaded = await window.loadTenantContext();
        if (!loaded) {
            // Stored session but no school setup — go to signup to complete
            if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
            window.showCenterToast(
                'Please complete your school registration first.',
                'fa-solid fa-school', 'text-yellow-400'
            );
            setTimeout(() => { window.location.href = './signup.html'; }, 2000);
            return;
        }
    }

    // Route by role
    // ?mode=chat lets principal bypass admin panel and access chat directly
    const chatMode = new URLSearchParams(window.location.search).get('mode') === 'chat';
    if (window.currentPermissions?.admin_panel && !chatMode) {
        window.location.href = '/admin.html';
        return;
    }
    if (typeof window.renderMainApp === 'function') window.renderMainApp();
    if (typeof window.startSubscriptions === 'function') window.startSubscriptions();
    if (typeof window.initScrollArrows === 'function') window.initScrollArrows();
    // Apply RBAC after render — hides/shows elements by role + feature flags
    if (typeof window.applyRBAC === 'function') window.applyRBAC();

    // Re-apply mobile layout on orientation change
    window.addEventListener('resize', () => {
        if (typeof window.initMobile === 'function') window.initMobile();
    }, { passive: true });
})();
