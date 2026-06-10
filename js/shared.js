import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://apfymygzwkzjhhgmtkaj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwZnlteWd6d2t6amhoZ210a2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjM5MTIsImV4cCI6MjA5NjQ5OTkxMn0.RiV6kDDeSq5ZIP68RGwtpLtqPALFloq23owoNm2aA-c';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Define Global State
window.currentUser = null;
window.currentRoom = 'general';
window.globalUsersCache = [];
window.quillEditor = null;
window.currentlyReplyingTo = null;
window.currentReminderId = null;
window.currentMessageId = null; 
window.currentMessageTextRaw = '';

// Global Helpers
window.escapeHtml = function(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m] || m)); }
window.toSentenceCase = function(str) { if (!str) return ''; return str.toLowerCase().replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase()); }

window.getSnippet = function(htmlStr) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = htmlStr;
    let text = (tmp.textContent || tmp.innerText || "").replace(/['"\\]/g, "");
    return window.escapeHtml(text).substring(0, 60) + "...";
}

window.getISTTime = function(dateStr) {
    if(!dateStr) return '';
    let d = new Date(dateStr);
    if(dateStr.indexOf('Z') === -1 && dateStr.indexOf('+') === -1) d = new Date(dateStr + 'Z'); 
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
}

window.getISTDate = function(dateStr) {
    if(!dateStr) return '';
    let d = new Date(dateStr);
    if(dateStr.indexOf('Z') === -1 && dateStr.indexOf('+') === -1) d = new Date(dateStr + 'Z'); 
    const str = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit' });
    return str.replace(/\//g, '-').split(',')[0]; 
}

window.showCenterToast = function(msg, icon = 'fa-solid fa-check-circle', color = 'text-green-400') { 
    const t = document.createElement('div'); 
    t.className = 'center-toast opacity-0'; 
    t.innerHTML = `<i class="${icon} ${color} text-4xl block mb-3"></i> ${msg}`; 
    document.body.appendChild(t); 
    setTimeout(() => t.classList.remove('opacity-0'), 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3000); 
}

window.scrollToAndHighlight = function(id) {
    const el = document.getElementById(id);
    if(el) {
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
        el.classList.add('highlight-active');
        setTimeout(() => el.classList.remove('highlight-active'), 4000);
    }
}

window.openSecureFile = async function(filePath) {
    window.showCenterToast('Requesting secure access...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(filePath, 3600);
    if (error || !data) {
        console.error(error);
        window.showCenterToast('Failed to retrieve file securely.', 'fa-solid fa-times', 'text-red-500');
        return;
    }
    window.open(data.signedUrl, '_blank');
}

window.notifyUser = async function(userId, message) {
    await sb.from('notifications').insert({ user_id: userId, message: message, created_at: new Date().toISOString() });
}
