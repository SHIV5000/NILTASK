import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://apfymygzwkzjhhgmtkaj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwZnlteWd6d2t6amhoZ210a2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjM5MTIsImV4cCI6MjA5NjQ5OTkxMn0.RiV6kDDeSq5ZIP68RGwtpLtqPALFloq23owoNm2aA-c';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.sb = sb;
window.APP_VER = 'v208.1';

try {
    const DARKISH = ['dark', 'sober-dark', 'midnight'];
    const t = localStorage.getItem('theme');
    if (t && t !== 'light' && t !== 'dark') {
        localStorage.setItem('theme', DARKISH.includes(t) ? 'dark' : 'light');
    }
    const at = localStorage.getItem('adminTheme');
    if (at && at !== 'light' && at !== 'dark') localStorage.removeItem('adminTheme');
} catch (e) {}

(async () => {
    try {
        const res = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json();
        const healedKey = 'ver_healed_v';
        if (v && v !== window.APP_VER && localStorage.getItem(healedKey) !== v) {
            localStorage.setItem(healedKey, v);
            try {
                const c = document.createElement('div');
                c.style.cssText = 'position:fixed;inset:0;z-index:2147483647;' +
                    'background:linear-gradient(160deg,#312e81 0%,#4f46e5 55%,#6d28d9 100%);';
                (document.body || document.documentElement).appendChild(c);
            } catch (e) {}
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k !== 'share-inbox').map(k => caches.delete(k)));
            const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
            await Promise.all(regs.map(r => r.unregister().catch(() => {})));
            location.reload(true);
        }
    } catch (e) {}
})();

window.isMobileView = function() {
    return window.innerWidth <= 768 ||
        (window.matchMedia?.('(pointer:coarse)')?.matches === true && window.innerWidth <= 1366);
};

window.currentUser = null;
window.currentRoom = 'general';
window.globalUsersCache = [];
window.quillEditor = null;
window.currentlyReplyingTo = null;
window.currentReminderId = null;
window.currentMessageId = null;
window.currentMessageTextRaw = '';

window.syncQuickTags = async function() {
    try {
        const tid = window.currentTenantId;
        if (!tid) return null;
        const { data, error } = await sb.from('quick_tags')
            .select('tags').eq('tenant_id', tid).maybeSingle();
        if (error) return null;
        if (data && Array.isArray(data.tags)) {
            localStorage.setItem('quickTags_' + tid, JSON.stringify(data.tags));
            window._quickTags = data.tags;
            return data.tags;
        }
    } catch (e) {}
    return null;
};

window.saveQuickTagsToDB = async function(tags) {
    try {
        const tid = window.currentTenantId;
        if (!tid) return false;
        const { error } = await sb.from('quick_tags')
            .upsert({ tenant_id: tid, tags, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
        return !error;
    } catch (e) { return false; }
};

window.toSentenceCase = function(str) { return str == null ? '' : String(str); };

window.getISTTime = function(dateStr) {
    if(!dateStr) return '';
    let d = new Date(dateStr);
    if(dateStr.indexOf('Z') === -1 && dateStr.indexOf('+') === -1) d = new Date(dateStr + 'Z');
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
};

window.getISTDate = function(dateStr) {
    if(!dateStr) return '';
    let d = new Date(dateStr);
    if(dateStr.indexOf('Z') === -1 && dateStr.indexOf('+') === -1) d = new Date(dateStr + 'Z');
    const str = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: '2-digit' });
    return str.replace(/\//g, '-').split(',')[0];
};

window.showCenterToast = function(msg, icon = 'fa-solid fa-check-circle', color = 'text-green-400') {
    const t = document.createElement('div');
    t.className = 'center-toast opacity-0';
    t.innerHTML = `<i class="${icon} ${color} text-4xl block mb-3"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.classList.remove('opacity-0'), 10);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 3000);
};

window.scrollToAndHighlight = function(id) {
    const el = document.getElementById(id);
    if(el) {
        el.scrollIntoView({behavior: 'smooth', block: 'center'});
        el.classList.add('highlight-active');
        setTimeout(() => el.classList.remove('highlight-active'), 4000);
    }
};

window.openSecureFile = async function(filePath) {
    window.showCenterToast('Requesting secure access...', 'fa-solid fa-spinner fa-spin', 'text-blue-500');
    const { data, error } = await sb.storage.from('task-proofs').createSignedUrl(filePath, 3600);
    if (error || !data) {
        window.showCenterToast('Failed to retrieve file securely.', 'fa-solid fa-times', 'text-red-500');
        return;
    }
    window.open(data.signedUrl, '_blank');
};

import('./priority-banner.js?v=208.1').catch(error => {
    console.error('[priority-banner] failed to load', error);
});

if (window.location.pathname.startsWith('/admin')) {
    import('./admin-priority-banner.js?v=208.1').catch(error => {
        console.error('[priority-banner-admin] failed to load', error);
    });
}
