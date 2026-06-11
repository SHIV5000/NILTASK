import { sb } from './shared.js';
import './tasks.js';

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
        <div class="min-h-screen w-full flex items-center justify-center" style="background-color: var(--bg-body);">
            <div class="modal-content p-10 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden bg-white">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold tracking-tight text-[var(--text-primary)]">MPGS TaskFlow</h1>
                    <p class="text-sm mt-2 text-[var(--text-secondary)]">Enterprise Communication Portal</p>
                </div>
                <div class="space-y-4">
                    <input id="email" placeholder="Email Address" class="ui-input w-full px-4 py-3 rounded-xl border">
                    <div class="relative">
                        <input id="password" type="password" placeholder="Password (Min 6 chars)" class="ui-input w-full px-4 py-3 rounded-xl border pr-10">
                        <i class="fa-solid fa-eye absolute right-4 top-4 text-gray-400 cursor-pointer hover:text-gray-600" id="togglePassword"></i>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button id="loginBtn" class="flex-1 py-3 px-4 rounded-xl bg-[var(--accent)] text-white font-medium shadow-md transition-colors">Login</button>
                        <button id="signupBtn" class="flex-1 py-3 px-4 rounded-xl border border-[var(--accent)] text-[var(--accent)] font-medium shadow-sm transition-colors">Sign Up</button>
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
}

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
        <div class="flex h-full w-full" style="background-color: var(--bg-body);">
            <div id="leftSidebar" class="left-sidebar flex-col border-r z-20 shadow-sm border-[var(--border-color)]" style="display: ${leftDisplay}; width: ${leftWidth}; background-color: var(--bg-sidebar);">
                <div class="p-4 flex justify-between items-center border-b border-[var(--border-color)]">
                    <h2 class="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
                        <i class="fa-solid fa-comments text-[var(--accent)]"></i> Chats
                    </h2>
                    <div class="flex gap-2">
                        <button onclick="window.toggleTheme()" class="w-8 h-8 rounded-full hover:bg-[var(--border-color)] text-[var(--text-secondary)] flex items-center justify-center transition-colors"><i class="fa-solid fa-moon text-sm"></i></button>
                        <button onclick="window.logout()" class="w-8 h-8 rounded-full hover:bg-red-100 text-[var(--text-secondary)] hover:text-red-600 flex items-center justify-center transition-colors"><i class="fa-solid fa-sign-out-alt text-sm"></i></button>
                    </div>
                </div>
                <div class="p-3"><input type="text" id="globalSearch" placeholder="Search chats" class="ui-input w-full p-2 rounded-xl text-sm"></div>
                <div id="chatsList" class="flex-1 overflow-y-auto px-2 pb-4"></div>
                <div class="p-3 border-t border-[var(--border-color)] flex flex-col items-center justify-center gap-1.5" style="background: var(--bg-body);">
                    <div class="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-2 border border-[var(--border-color)] shadow-sm px-3 py-1.5 rounded-full w-full justify-center">
                        <div class="w-5 h-5 rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[10px]">${userNameDisplay.charAt(0).toUpperCase()}</div>
                        ${window.escapeHtml(userNameDisplay.toUpperCase())}
                    </div>
                    <div class="text-[9px] font-bold tracking-wider text-[var(--text-secondary)] uppercase mt-1">v1.34.0 - UI Uniformity</div>
                </div>
            </div>

            <div id="leftResizer" class="drag-resizer"></div>

            <div class="flex-1 flex flex-col relative min-w-0 chat-area">
                <div class="p-4 border-b z-10 flex justify-between items-center shadow-sm backdrop-blur border-[var(--border-color)]" style="background-color: var(--bg-sidebar);">
                    <div class="flex items-center gap-3">
                        <i class="ti ti-layout-sidebar-left cursor-pointer hover:text-[var(--accent)] text-xl text-[var(--text-secondary)] pr-3 border-r border-[var(--border-color)]" onclick="window.toggleLeftSidebar()"></i>
                        <span id="roomTitleDisplay" class="text-lg font-bold tracking-tight text-[var(--text-primary)]"># ${window.currentRoom}</span>
                    </div>
                    <div class="flex items-center gap-4 text-xl text-[var(--text-secondary)]">
                        <i class="ti ti-clock cursor-pointer hover:text-[var(--accent)]" onclick="window.openTopPanel('scheduled')"></i>
                        <i class="ti ti-bookmark cursor-pointer hover:text-[var(--accent)]" onclick="window.openTopPanel('bookmarks')"></i>
                        <i class="ti ti-bell cursor-pointer hover:text-[var(--accent)]" onclick="window.openTopPanel('alerts')"></i>
                        <div class="border-l border-[var(--border-color)] pl-4 ml-1 flex gap-3"><i class="ti ti-layout-sidebar-right cursor-pointer hover:text-[var(--accent)]" onclick="window.toggleRightSidebar()"></i></div>
                        <input type="text" id="messageSearchBar" placeholder="Search..." class="ui-input px-3 py-1 rounded-full text-sm w-48">
                    </div>
                </div>
                
                <div id="messagesContainer" class="flex-1 overflow-y-auto p-6 flex flex-col items-center min-w-0">
                    <div class="chat-shell w-full max-w-full bg-transparent border-none" id="chatShellContainer"></div>
                </div>
                
                <div class="flex flex-col relative border-t border-[var(--border-color)] p-3 px-5 z-20" style="background-color: var(--bg-sidebar);">
                    <div id="replyBanner" class="hidden mx-0 mt-0 mb-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl flex justify-between items-center text-xs text-indigo-900">
                        <div class="flex items-center gap-2 overflow-hidden">
                            <i class="fa-solid fa-reply"></i>
                            <span class="font-bold">Replying to:</span>
                            <span id="replyBannerText" class="italic truncate text-indigo-500 max-w-[200px]"></span>
                        </div>
                        <i class="fa-solid fa-times cursor-pointer p-1 hover:text-red-500" onclick="window.cancelReply()"></i>
                    </div>

                    <div class="w-full border border-[var(--border-color)] rounded-xl flex flex-col shadow-sm focus-within:border-[var(--accent)] transition-colors relative" style="background-color: var(--bg-body);">
                        <div id="inputEmojiPicker" class="absolute bottom-full left-0 mb-2 hidden bg-[var(--bg-sidebar)] border border-[var(--border-color)] shadow-2xl rounded-xl p-3 z-50">
                           <div class="text-[10px] font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Insert Emoji</div>
                           <div class="flex flex-wrap gap-1">
                               ${['👍','❤️','😂','😮','😢','🙏','🎉','🔥','✅','👀'].map(e => `<span class="cursor-pointer hover:bg-[var(--bg-body)] p-1.5 rounded-lg text-xl" onclick="window.insertEmoji('${e}')">${e}</span>`).join('')}
                           </div>
                        </div>
                        <div id="toolbar-container" class="border-b border-[var(--border-color)] rounded-t-xl"></div>
                        <div class="flex items-end gap-2 p-1.5 px-2">
                            <button onclick="window.toggleInputEmojiPicker()" class="p-2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"><i class="ti ti-mood-smile text-xl"></i></button>
                            <button onclick="document.getElementById('fileAttachment').click()" class="p-2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"><i class="ti ti-paperclip text-xl"></i></button>
                            <input type="file" id="fileAttachment" class="hidden">
                            <div class="flex-1 min-w-0 bg-transparent py-1"><div id="richEditor" class="w-full text-[var(--text-primary)]"></div></div>
                            <button onclick="window.showScheduleModal()" class="p-2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"><i class="ti ti-clock text-xl"></i></button>
                            <button id="sendBtn" class="bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent-hover)] transition-colors h-[38px] w-[46px] flex items-center justify-center mb-0.5"><i class="ti ti-send text-lg"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="rightResizer" class="drag-resizer"></div>

            <div id="rightSidebar" class="right-sidebar border-l flex-col z-20 shadow-sm border-[var(--border-color)]" style="display: ${rightDisplay}; width: ${rightWidth}; background-color: var(--bg-sidebar);">
                <div class="w-full h-full flex flex-col min-w-0"> 
                    <div class="p-3 border-b border-[var(--border-color)] flex flex-col gap-2">
                        <h3 class="font-bold text-[var(--text-primary)] flex items-center gap-2"><i class="fa-solid fa-filter text-[var(--accent)]"></i> Task Filters</h3>
                        <select id="taskFilter" onchange="window.toggleDateFilter()" class="text-xs px-2 py-2 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] bg-[var(--bg-body)] outline-none cursor-pointer w-full transition-all">
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
                    <div id="dateRangeFilter" class="hidden px-3 pt-2 pb-3 border-b border-[var(--border-color)] flex gap-2 items-center">
                        <input type="date" id="filterStartDate" onchange="window.loadTasksForPanel()" class="ui-input text-xs px-2 py-1.5 rounded w-full">
                        <span class="text-[10px] font-bold text-[var(--text-secondary)]">TO</span>
                        <input type="date" id="filterEndDate" onchange="window.loadTasksForPanel()" class="ui-input text-xs px-2 py-1.5 rounded w-full">
                    </div>
                    <div id="tasksPanel" class="flex-1 overflow-y-auto p-4 bg-[var(--bg-body)]"></div>
                </div>
            </div>
        </div>

        <div id="fileRenameModal" class="fixed inset-0 modal-overlay hidden items-center justify-center z-50">
            <div class="modal-content p-6 w-full max-w-sm mx-4 rounded-2xl">
                <h3 class="text-xl font-bold mb-4 text-[var(--text-primary)]">Rename Attachment</h3>
                <input type="text" id="newFileNameInput" class="ui-input w-full p-3 rounded-xl mb-6">
                <div class="flex gap-3">
                    <button onclick="window.cancelFileRename()" class="flex-1 py-2.5 rounded-xl font-bold bg-[var(--bg-body)] text-[var(--text-primary)] hover:opacity-80 transition-opacity">Cancel</button>
                    <button onclick="window.confirmFileRename()" class="flex-1 py-2.5 rounded-xl font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors">Upload</button>
                </div>
            </div>
        </div>
        
        `;
    
    window.quillEditor = new Quill('#richEditor', { 
        theme: 'snow', placeholder: 'Type a message...', modules: { toolbar: { container: [['bold','italic','underline','strike'], [{ 'color': ['#800000', '#006400', '#00008b'] }], [{'list': 'ordered'}, {'list': 'bullet'}], ['clean']] } } 
    });
    const toolbar = document.querySelector('.ql-toolbar');
    document.getElementById('toolbar-container').appendChild(toolbar);

    window.quillEditor.root.addEventListener('keydown', (e) => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); window.sendMessage(); } });
    document.getElementById('sendBtn').onclick = window.sendMessage;
    
    // File flow
    document.getElementById('fileAttachment').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        window.pendingFileUpload = file;
        document.getElementById('newFileNameInput').value = file.name.substring(0, file.name.lastIndexOf('.'));
        document.getElementById('fileRenameModal').classList.remove('hidden');
        document.getElementById('fileRenameModal').classList.add('flex');
    });
    
    document.addEventListener('click', e => {
        if (!e.target.closest('.menu-wrap')) window.closeDropdowns();
        const ep = document.getElementById('inputEmojiPicker');
        if (ep && !e.target.closest('#inputEmojiPicker') && !e.target.closest('[onclick="window.toggleInputEmojiPicker()"]')) ep.classList.add('hidden');
    });

    window.initResizers();
    if (typeof window.loadChatsList === 'function') window.loadChatsList(); 
    window.loadMessages(); 
    if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel(); 
};

window.cancelFileRename = function() {
    window.pendingFileUpload = null;
    document.getElementById('fileAttachment').value = '';
    document.getElementById('fileRenameModal').classList.add('hidden');
    document.getElementById('fileRenameModal').classList.remove('flex');
}

window.confirmFileRename = async function() {
    if (!window.pendingFileUpload) return;
    const file = window.pendingFileUpload;
    window.pendingFileUpload = null;
    document.getElementById('fileRenameModal').classList.add('hidden');
    document.getElementById('fileRenameModal').classList.remove('flex');

    const lastDot = file.name.lastIndexOf('.');
    const ext = lastDot !== -1 ? file.name.substring(lastDot) : '';
    const newName = document.getElementById('newFileNameInput').value.trim() || file.name.substring(0, lastDot);
    const finalName = newName + ext;
    
    window.showCenterToast('Uploading...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const filePath = `chat/${Date.now()}_${finalName.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const { error } = await sb.storage.from('task-proofs').upload(filePath, file);
    if(error) { window.showCenterToast('Upload failed', 'fa-solid fa-times', 'text-red-500'); return; }
    
    window.quillEditor.insertText(window.quillEditor.getLength(), `📁 Attached: ${finalName}\n`, 'link', `https://secure-file.local/${filePath}`);
    window.showCenterToast('Attached!');
    document.getElementById('fileAttachment').value = ''; 
}

window.toggleTaskTrail = function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    // Direct display manipulation (no CSS classes to fight with)
    if (el.style.display === 'none') {
        el.style.setProperty('display', 'block', 'important');
    } else {
        el.style.setProperty('display', 'none', 'important');
    }
};
window.toggleTrail = window.toggleTaskTrail;

// [All other standard functions: sendMessage, loadMessages, etc. remain unchanged]
