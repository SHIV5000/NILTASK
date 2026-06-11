import { sb } from './shared.js';

// STATE PERSISTENCE ENGINE (UI)
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
