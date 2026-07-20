/**
 * NILTASK Priority Banner v208
 * Fixed top banner for meeting, emergency, urgent, announcement and information.
 */
import { sb } from './shared.js';

window.NILTASK_PRIORITY_BANNER_VERSION = 'v208';

const PB = {
    rows: [],
    current: null,
    channel: null,
    started: false,
    loading: false
};

const TYPE = {
    emergency:   { icon:'fa-triangle-exclamation', label:'Emergency',   bg:'#b91c1c', fg:'#fff' },
    urgent:      { icon:'fa-bell',                 label:'Urgent',      bg:'#c2410c', fg:'#fff' },
    meeting:     { icon:'fa-users',                label:'Meeting',     bg:'#1d4ed8', fg:'#fff' },
    announcement:{ icon:'fa-bullhorn',             label:'Announcement',bg:'#6d28d9', fg:'#fff' },
    information: { icon:'fa-circle-info',          label:'Information', bg:'#047857', fg:'#fff' }
};

function esc(v) {
    return String(v ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function ist(ts) {
    try {
        return new Date(ts).toLocaleString('en-IN', {
            timeZone:'Asia/Kolkata',
            day:'2-digit', month:'short', year:'numeric',
            hour:'2-digit', minute:'2-digit', hour12:true
        });
    } catch { return ''; }
}

function installCss() {
    if (document.getElementById('pb-v208-css')) return;
    const st = document.createElement('style');
    st.id = 'pb-v208-css';
    st.textContent = `
      #priorityBannerHost{
        position:fixed;left:0;right:0;top:0;z-index:2147483000;
        pointer-events:none;font-family:Inter,system-ui,sans-serif;
      }
      .pb208{
        pointer-events:auto;display:grid;grid-template-columns:auto minmax(0,1fr) auto;
        gap:12px;align-items:center;margin:8px auto 0;padding:11px 13px;
        width:min(1120px,calc(100% - 18px));border-radius:16px;color:#fff;
        box-shadow:0 12px 34px rgba(15,23,42,.24),inset 0 1px rgba(255,255,255,.18);
        border:1px solid rgba(255,255,255,.22);animation:pbIn .2s ease-out;
      }
      .pb208-ic{
        width:42px;height:42px;border-radius:13px;display:grid;place-items:center;
        background:rgba(255,255,255,.18);font-size:18px;flex:none;
      }
      .pb208-copy{min-width:0}
      .pb208-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      .pb208-kind{font-size:9px;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
      .pb208-v{font-size:8px;font-weight:900;padding:2px 5px;border-radius:999px;background:rgba(255,255,255,.18)}
      .pb208-title{font-size:14px;font-weight:950;line-height:1.3;margin-top:2px}
      .pb208-msg{font-size:11px;line-height:1.45;margin-top:3px;opacity:.94;white-space:pre-wrap}
      .pb208-meta{font-size:8.5px;margin-top:5px;opacity:.78}
      .pb208-actions{display:flex;align-items:center;gap:7px}
      .pb208-btn{
        min-height:38px;border:0;border-radius:11px;padding:8px 13px;cursor:pointer;
        color:#111827;background:#fff;font-size:10px;font-weight:950;white-space:nowrap;
      }
      .pb208-more{
        display:inline-flex;align-items:center;justify-content:center;min-width:25px;height:25px;
        border-radius:999px;background:rgba(255,255,255,.18);font-size:9px;font-weight:950;
      }
      body.pb208-visible{padding-top:86px!important}
      #mobileApp.pb208-mobile-offset{padding-top:78px!important;box-sizing:border-box}
      @keyframes pbIn{from{transform:translateY(-12px);opacity:0}to{transform:none;opacity:1}}
      @media(max-width:700px){
        .pb208{grid-template-columns:auto minmax(0,1fr);gap:9px;padding:10px;width:calc(100% - 12px);margin-top:5px;border-radius:14px}
        .pb208-ic{width:37px;height:37px;border-radius:11px;font-size:15px}
        .pb208-actions{grid-column:1/-1;justify-content:flex-end;margin-top:-2px}
        .pb208-btn{min-height:34px;padding:7px 11px}
        .pb208-title{font-size:12.5px}
        .pb208-msg{font-size:10px}
        body.pb208-visible{padding-top:121px!important}
        #mobileApp.pb208-mobile-offset{padding-top:112px!important}
      }
    `;
    document.head.appendChild(st);
}

function clearHost() {
    document.getElementById('priorityBannerHost')?.remove();
    document.body.classList.remove('pb208-visible');
    document.getElementById('mobileApp')?.classList.remove('pb208-mobile-offset');
}

function chooseCurrent(rows) {
    const priority = { emergency:0, urgent:1, meeting:2, announcement:3, information:4 };
    return [...rows].sort((a,b) => {
        const pa = priority[a.category] ?? 9, pb = priority[b.category] ?? 9;
        return pa - pb || new Date(b.created_at) - new Date(a.created_at);
    })[0] || null;
}

function render() {
    clearHost();
    PB.current = chooseCurrent(PB.rows);
    if (!PB.current) return;

    const b = PB.current;
    const t = TYPE[b.category] || TYPE.information;
    const host = document.createElement('div');
    host.id = 'priorityBannerHost';
    host.innerHTML = `
      <section class="pb208" style="background:${t.bg}" role="status" aria-live="assertive">
        <div class="pb208-ic"><i class="fa-solid ${t.icon}"></i></div>
        <div class="pb208-copy">
          <div class="pb208-top">
            <span class="pb208-kind">${esc(t.label)}</span>
            <span class="pb208-v">v208</span>
            ${PB.rows.length > 1 ? `<span class="pb208-more">+${PB.rows.length-1}</span>` : ''}
          </div>
          <div class="pb208-title">${esc(b.title)}</div>
          <div class="pb208-msg">${esc(b.message)}</div>
          <div class="pb208-meta">Sent by ${esc(b.sender_name || 'School Admin')} · ${esc(ist(b.created_at))} IST</div>
        </div>
        <div class="pb208-actions">
          ${b.requires_ack
            ? `<button class="pb208-btn" data-pb-ack="${esc(b.banner_id)}">ACKNOWLEDGE</button>`
            : `<button class="pb208-btn" data-pb-dismiss="${esc(b.banner_id)}">DISMISS</button>`}
        </div>
      </section>`;
    document.body.appendChild(host);
    document.body.classList.add('pb208-visible');
    document.getElementById('mobileApp')?.classList.add('pb208-mobile-offset');
}

async function load() {
    if (PB.loading || !window.currentUser?.id || !window.currentTenantId) return;
    PB.loading = true;
    try {
        const { data, error } = await sb.rpc('get_my_active_priority_banners');
        if (error) {
            console.warn('[priority-banner] load failed', error);
            return;
        }
        PB.rows = Array.isArray(data) ? data : [];
        render();
    } finally {
        PB.loading = false;
    }
}

async function acknowledge(id) {
    const button = document.querySelector(`[data-pb-ack="${CSS.escape(id)}"]`);
    if (button) {
        button.disabled = true;
        button.textContent = 'SAVING…';
    }
    const { error } = await sb.rpc('acknowledge_priority_banner', { p_banner_id:id });
    if (error) {
        window.showCenterToast?.(error.message || 'Acknowledgement failed', 'fa-solid fa-triangle-exclamation', 'text-red-400');
        if (button) { button.disabled = false; button.textContent = 'ACKNOWLEDGE'; }
        return;
    }
    PB.rows = PB.rows.filter(x => x.banner_id !== id);
    render();
    window.showCenterToast?.('Notice acknowledged', 'fa-solid fa-check-circle', 'text-green-400');
}

async function dismiss(id) {
    await sb.rpc('acknowledge_priority_banner', { p_banner_id:id });
    PB.rows = PB.rows.filter(x => x.banner_id !== id);
    render();
}

function subscribe() {
    if (PB.channel || !window.currentTenantId || !window.currentUser?.id) return;
    PB.channel = sb.channel('priority-banner-v208-' + window.currentUser.id)
      .on('postgres_changes', {
          event:'*', schema:'public', table:'priority_banners',
          filter:`tenant_id=eq.${window.currentTenantId}`
      }, () => load())
      .on('postgres_changes', {
          event:'*', schema:'public', table:'priority_banner_recipients',
          filter:`user_id=eq.${window.currentUser.id}`
      }, () => load())
      .subscribe();
}

async function boot() {
    if (PB.started) return;
    if (!window.currentUser?.id || !window.currentTenantId) {
        setTimeout(boot, 350);
        return;
    }
    PB.started = true;
    installCss();
    document.addEventListener('click', e => {
        const ack = e.target.closest('[data-pb-ack]');
        if (ack) acknowledge(ack.dataset.pbAck);
        const dis = e.target.closest('[data-pb-dismiss]');
        if (dis) dismiss(dis.dataset.pbDismiss);
    });
    await load();
    subscribe();
    setInterval(load, 30000);
}

window.refreshPriorityBanners = load;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
else boot();
