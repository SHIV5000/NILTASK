import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://apfymygzwkzjhhgmtkaj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwZnlteWd6d2t6amhoZ210a2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjM5MTIsImV4cCI6MjA5NjQ5OTkxMn0.RiV6kDDeSq5ZIP68RGwtpLtqPALFloq23owoNm2aA-c';
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Single source of truth for the running build — stamped onto every warn/error
// log row so the Live Log Monitor can tell which version a remote device runs.
window.APP_VER = 'v92';

// Retire the green 'ocean-teal' theme entirely — it tinted the whole UI (and the
// safe-area gutter) green. Reset anyone still on it BEFORE ui-core reads the value.
// Collapse to the two professional indigo themes (Light + Dark). Any retired
// theme migrates to the nearest of the two BEFORE ui-core reads the value, so a
// saved 'midnight'/'ocean-teal'/etc never resurfaces.
try {
    const DARKISH = ['dark', 'sober-dark', 'midnight'];
    const t = localStorage.getItem('theme');
    if (t && t !== 'light' && t !== 'dark') {
        localStorage.setItem('theme', DARKISH.includes(t) ? 'dark' : 'light');
    }
    const at = localStorage.getItem('adminTheme');
    if (at && at !== 'light' && at !== 'dark') localStorage.removeItem('adminTheme');
} catch (e) {}

// ── Stale-build self-healing ────────────────────────────────────────────────
// Android's installed PWA can keep serving an old cached build for a full extra
// launch (stale-while-revalidate) — or indefinitely if a SW install ever failed.
// Compare the RUNNING build against the server's version.json (cache-bypassed);
// on mismatch, purge caches and reload once. iOS was updating fine; this makes
// Android converge on every deploy too.
(async () => {
    try {
        const res = await fetch('/version.json?ts=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = await res.json();
        // DURABLE loop-breaker: only ever heal ONCE per target version, persisted in
        // localStorage (survives relaunches — unlike the old sessionStorage guard).
        // If a device already attempted to heal to version v and STILL boots mismatched
        // (stubborn HTTP-cached shell), we must NOT reload again — that infinite
        // reload loop was causing the session churn AND a green flash on every launch
        // (each reload briefly shows the old cached paint before the new build loads).
        const healedKey = 'ver_healed_v';
        if (v && v !== window.APP_VER && localStorage.getItem(healedKey) !== v) {
            localStorage.setItem(healedKey, v);   // one attempt per version, forever
            // Paint a full-screen indigo cover BEFORE reloading so the convergence
            // reload shows the brand splash colour, never a blink of the old (green)
            // build during unload. Matches the #bootSplash gradient in index.html.
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
    } catch (e) { /* offline — run with what we have */ }
})();

// Single source of truth for "is this a mobile-app device?".
// CRITICAL: main.js guards (`window.isMobileView?.()`) referenced this WITHOUT it
// ever being defined — always undefined/falsy — so the web realtime handler ran
// alongside the mobile one and DOUBLE-counted notifications (bell showed 2 for 1
// message). Also treats touch-first TABLETS (coarse pointer, up to 1366px) as
// mobile so tablets get the mobile app experience.
window.isMobileView = function() {
    return window.innerWidth <= 768 ||
        (window.matchMedia?.('(pointer:coarse)')?.matches === true && window.innerWidth <= 1366);
};

// Define Global State
window.currentUser = null;
window.currentRoom = 'general'; 
window.globalUsersCache = [];
window.quillEditor = null;
window.currentlyReplyingTo = null;
window.currentReminderId = null;
window.currentMessageId = null; 
window.currentMessageTextRaw = '';

// ─── QUICK TAGS (tenant-shared, DB-backed) ────────────────────────
// Quick-reply tags are configured by the principal in the Admin panel and
// must reach every staff member on every device. They live in the DB table
// public.quick_tags (tenant_id → tags jsonb) and are mirrored into
// localStorage('quickTags_<tenant>') so the existing pickers (web + mobile)
// read them synchronously. Call on login to refresh the local copy.
window.syncQuickTags = async function() {
    try {
        const tid = window.currentTenantId;
        if (!tid) return null;
        const { data, error } = await sb.from('quick_tags')
            .select('tags').eq('tenant_id', tid).maybeSingle();
        if (error) return null;                 // table missing / RLS — keep local defaults
        if (data && Array.isArray(data.tags)) {
            localStorage.setItem('quickTags_' + tid, JSON.stringify(data.tags));
            window._quickTags = data.tags;
            return data.tags;
        }
    } catch (e) { /* non-fatal — fall back to localStorage/defaults */ }
    return null;
};
// Persist the tenant's tag list to the DB (called from the Admin panel).
window.saveQuickTagsToDB = async function(tags) {
    try {
        const tid = window.currentTenantId;
        if (!tid) return false;
        const { error } = await sb.from('quick_tags')
            .upsert({ tenant_id: tid, tags, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' });
        return !error;
    } catch (e) { return false; }
};

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
    return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
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
        window.showCenterToast('Failed to retrieve file securely.', 'fa-solid fa-times', 'text-red-500');
        return;
    }
    window.open(data.signedUrl, '_blank');
}
