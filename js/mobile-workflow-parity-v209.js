/**
 * NILTASK mobile/tablet workflow parity v209.
 * Additive production layer: keeps the proven mobile runtime/data model, but makes
 * chat the task working surface (one composer, inline task replies, five-tab nav).
 */
(function () {
  'use strict';

  if (window.__NFA_WORKFLOW_PARITY_V209) return;
  window.__NFA_WORKFLOW_PARITY_V209 = true;
  window.NILTASK_MOBILE_WORKFLOW_VERSION = 'v209';

  const VERSION = 'v209';
  const taskByMessage = new Map();
  const taskById = new Map();
  const expandedThreads = new Set();
  const activityRead = new Set();
  let taskMode = null;
  let scanTimer = null;
  let activityTimer = null;
  let badgeTimer = null;
  let currentTaskFile = null;
  let currentTaskFileUrl = null;
  let observer = null;
  let activityRendering = false;

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const sb = () => window.sb;
  const uid = () => window.currentUser?.id || null;
  const tid = () => window.currentTenantId || null;
  const users = () => window.globalUsersCache || [];
  const nowIso = () => new Date().toISOString();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const strip = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g,' ').trim();
  };
  const snip = (s,n=80) => { s=strip(s); return s.length>n?s.slice(0,n-1)+'…':s; };
  const toast = (m, type='ok') => {
    if (typeof window._mobToast === 'function') return window._mobToast(m, type);
    console[type==='err'?'error':'log']('[NFA v209]',m);
  };
  const normTs = (ts) => {
    if (typeof ts !== 'string') return ts;
    return (ts.includes('Z') || /[+-]\d\d:?\d\d$/.test(ts)) ? ts.replace(' ','T') : ts.replace(' ','T')+'Z';
  };
  const ago = (ts) => {
    if (!ts) return '';
    const d=(Date.now()-new Date(normTs(ts)).getTime())/1000;
    if (d<60) return 'just now'; if (d<3600) return Math.floor(d/60)+'m ago';
    if (d<86400) return Math.floor(d/3600)+'h ago'; if (d<604800) return Math.floor(d/86400)+'d ago';
    return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',timeZone:'Asia/Kolkata'}).format(new Date(normTs(ts)));
  };
  const fmtDate = (ts) => ts ? new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(new Date(normTs(ts))) : '';
  const uname = (id) => {
    const u = users().find(x=>x.id===id);
    return u ? (u.full_name || u.email?.split('@')[0] || 'User') : 'User';
  };
  const isMobileShell = () => !!document.getElementById('mobileApp');
  const stageScreen = () => document.querySelector('#mStage > .mScr')?.dataset?.screen || '';
  const tenantKey = (suffix) => `${tid()||'none'}_${suffix}`;
  const bookmarkKey = () => tenantKey(`tf_bookmarks_${uid()||'none'}`);
  const activityReadKey = () => tenantKey(`nfa_activity_read_${uid()||'none'}`);
  const activityBaselineKey = () => tenantKey(`nfa_activity_baseline_${uid()||'none'}`);

  function safeJson(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }
  function readBookmarks() { return safeJson(localStorage.getItem(bookmarkKey()) || '[]', []); }
  function writeBookmarks(v) { try { localStorage.setItem(bookmarkKey(), JSON.stringify(v.slice(0,100))); } catch {} }

  function loadActivityRead() {
    activityRead.clear();
    const arr = safeJson(localStorage.getItem(activityReadKey()) || '[]', []);
    arr.forEach(k=>activityRead.add(String(k)));
  }
  function saveActivityRead() {
    try { localStorage.setItem(activityReadKey(), JSON.stringify(Array.from(activityRead).slice(-1200))); } catch {}
  }
  function ensureActivityBaseline() {
    let v = 0;
    try { v = Number(localStorage.getItem(activityBaselineKey()) || 0); } catch {}
    if (!v) {
      v = Date.now();
      try { localStorage.setItem(activityBaselineKey(), String(v)); } catch {}
    }
    return v;
  }

  function injectCss() {
    if ($('#nfa-workflow-v209-css')) return;
    const st=document.createElement('style'); st.id='nfa-workflow-v209-css';
    st.textContent=`
      /* NILTASK mobile/tablet workflow parity ${VERSION} */
      .nfa-task-bubble{border-left:4px solid var(--accent,#6366f1)!important;background:color-mix(in srgb,var(--accent,#6366f1) 6%,var(--card-bg,#fff))!important;}
      .nfa-task-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;padding-top:7px;border-top:1px dashed color-mix(in srgb,var(--accent,#6366f1) 22%,transparent);}
      .nfa-task-pill{font-size:9px;font-weight:900;padding:3px 7px;border-radius:999px;background:rgba(99,102,241,.10);color:var(--accent,#6366f1);}
      .nfa-task-pill.done{background:rgba(22,163,74,.12);color:#15803d}.nfa-task-pill.warn{background:rgba(245,158,11,.13);color:#b45309}
      .nfa-task-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:7px;}
      .nfa-task-link{border:0;background:none;padding:2px 0;color:var(--accent,#6366f1);font-size:12px;font-weight:800;cursor:pointer;}
      .nfa-task-bookmark.on{color:#d97706}.nfa-hide-legacy-thread{display:none!important;}
      .nfa-inline-thread{display:none;margin:2px 12px 10px 40px;padding-left:9px;border-left:2px solid color-mix(in srgb,var(--accent,#6366f1) 28%,transparent);}
      .nfa-inline-thread.open{display:block}.nfa-inline-loading{font-size:11px;color:var(--text-secondary,#6b7280);padding:8px 2px}
      .nfa-inline-reply{display:flex;gap:6px;align-items:flex-start;margin:6px 0}.nfa-inline-avatar{width:22px;height:22px;border-radius:50%;background:var(--accent,#6366f1);color:#fff;display:grid;place-items:center;font-size:8px;font-weight:900;flex:0 0 auto}
      .nfa-inline-card{min-width:0;flex:1;border:1px solid var(--border-color,#e5e7eb);border-radius:11px;background:var(--card-bg,#fff);padding:7px 9px}.nfa-inline-head{font-size:9px;font-weight:800;color:var(--text-secondary,#667085);margin-bottom:3px}.nfa-inline-text{font-size:12px;line-height:1.45;word-break:break-word}.nfa-inline-text strong{font-weight:850}
      .nfa-attach-card{display:flex;align-items:center;gap:8px;margin-top:6px;padding:7px 8px;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--bg-sidebar,#f8fafc);cursor:pointer;max-width:100%;}
      .nfa-attach-ic{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent,#6366f1) 10%,transparent);font-size:16px;flex:0 0 auto}.nfa-attach-thumb{width:42px;height:42px;border-radius:8px;object-fit:cover;border:1px solid var(--border-color,#e5e7eb);background:var(--bg-sidebar,#f8fafc)}
      .nfa-attach-copy{flex:1;min-width:0}.nfa-attach-copy b{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nfa-attach-copy span{font-size:9px;color:var(--text-secondary,#667085)}
      .m-composer.nfa-task-mode{flex-wrap:wrap;border-top:2px solid color-mix(in srgb,var(--accent,#6366f1) 35%,transparent)}
      .nfa-task-context{flex:0 0 100%;min-width:0;padding:3px 2px 7px;border-bottom:1px solid var(--border-color,#e5e7eb);margin-bottom:2px}.nfa-task-context-head{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:900;color:var(--accent,#6366f1)}.nfa-task-context-head span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.nfa-task-context-head button{border:0;background:none;color:var(--text-secondary,#667085);font-size:17px;}
      .nfa-task-actionbar{display:flex;gap:5px;overflow-x:auto;padding:6px 0 1px;scrollbar-width:none}.nfa-task-actionbar::-webkit-scrollbar{display:none}.nfa-task-chip{white-space:nowrap;border:1px solid color-mix(in srgb,var(--accent,#6366f1) 38%,transparent);background:var(--card-bg,#fff);color:var(--accent,#6366f1);border-radius:999px;padding:6px 9px;font-size:9px;font-weight:900}.nfa-task-chip.on{background:var(--accent,#6366f1);color:#fff}
      .nfa-task-extra{display:none;gap:6px;margin-top:6px}.nfa-task-extra.on{display:flex}.nfa-task-extra select,.nfa-task-extra input{min-width:0;flex:1;border:1px solid var(--border-color,#d0d5dd);border-radius:9px;padding:7px 8px;background:var(--bg-body,#fff);color:var(--text-primary,#111);font-size:10px}
      .nfa-selected-file{display:none;flex:0 0 100%;align-items:center;gap:7px;padding:6px 9px;margin-top:2px;border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--bg-body,#fff);font-size:10px}.nfa-selected-file.on{display:flex}.nfa-selected-file .name{min-width:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nfa-selected-file button{border:0;background:none;color:var(--text-secondary,#667085)}
      .nfa-chat-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px 1px}.nfa-chat-tools b{font-size:17px}.nfa-quick-btn{border:1px solid var(--border-color,#e5e7eb);border-radius:10px;background:var(--card-bg,#fff);color:var(--text-primary,#111);padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}
      .nfa-settings-shortcuts{margin:10px 16px 16px;padding:12px;border:1px solid var(--border-color,#e5e7eb);border-radius:14px;background:var(--card-bg,#fff)}.nfa-settings-shortcuts h3{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary,#667085);margin:0 0 8px}.nfa-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.nfa-settings-grid button{min-height:46px;border:1px solid var(--border-color,#e5e7eb);border-radius:11px;background:var(--bg-sidebar,#f8fafc);color:var(--text-primary,#111);font-size:11px;font-weight:800}
      .nfa-activity{height:100%;overflow-y:auto;background:var(--bg-body,#f6f7fb);padding-bottom:86px}.nfa-activity-head{position:sticky;top:0;z-index:4;display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px;background:var(--bg-body,#fff);border-bottom:1px solid var(--border-color,#e5e7eb)}.nfa-activity-head b{font-size:18px}.nfa-activity-head small{color:var(--text-secondary,#667085);font-weight:700}.nfa-afilters{display:flex;gap:6px;overflow-x:auto;padding:9px 10px;position:sticky;top:53px;z-index:3;background:var(--bg-body,#f6f7fb)}.nfa-afilters button{white-space:nowrap;border:1px solid var(--border-color,#d0d5dd);border-radius:999px;background:var(--card-bg,#fff);padding:6px 9px;font-size:9px;font-weight:850;color:var(--text-secondary,#475467)}.nfa-afilters button.on{background:var(--accent,#6366f1);color:#fff;border-color:var(--accent,#6366f1)}
      .nfa-afeed{padding:3px 10px 30px}.nfa-acard{position:relative;display:flex;gap:9px;align-items:flex-start;margin-bottom:8px;padding:11px;border:1px solid var(--border-color,#e1e6ef);border-radius:14px;background:var(--card-bg,#fff);cursor:pointer}.nfa-acard.unread{border-left:4px solid #2563eb;background:color-mix(in srgb,#2563eb 6%,var(--card-bg,#fff))}.nfa-aic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--bg-sidebar,#f1f5f9);font-size:15px;flex:0 0 auto}.nfa-abody{flex:1;min-width:0}.nfa-atitle{font-size:12px;font-weight:850;line-height:1.35}.nfa-adesc{font-size:10px;color:var(--text-secondary,#667085);margin-top:3px;line-height:1.4}.nfa-ameta{font-size:9px;color:var(--text-secondary,#98a2b3);margin-top:4px}.nfa-unread{font-size:7px;background:#2563eb;color:#fff;border-radius:999px;padding:3px 6px;font-weight:900;flex:0 0 auto}.nfa-empty{text-align:center;color:var(--text-secondary,#667085);padding:42px 20px;font-size:13px}
      #mnActBadge.nfa-number{display:flex!important;align-items:center!important;justify-content:center!important;position:absolute!important;top:1px!important;right:8px!important;left:auto!important;margin:0!important;min-width:18px!important;height:18px!important;padding:0 4px!important;border-radius:9px!important;background:#dc2626!important;color:#fff!important;border:2px solid var(--bg-sidebar,#fff)!important;font-size:8px!important;font-weight:900!important;}
      .nfa-task-focus .m-bubble{animation:nfaFocus 2.4s ease-out}@keyframes nfaFocus{0%,35%{box-shadow:0 0 0 3px var(--accent,#6366f1)}100%{box-shadow:none}}
      html[data-theme="dark"] .nfa-inline-card,html[data-theme="dark"] .nfa-quick-btn,html[data-theme="dark"] .nfa-settings-shortcuts,html[data-theme="dark"] .nfa-task-chip{background:#1e1e1e;border-color:#333}
      html[data-theme="dark"] .nfa-activity,html[data-theme="dark"] .nfa-afilters{background:#090a0d}html[data-theme="dark"] .nfa-acard{background:#15161b;border-color:#292b33}
    `;
    document.head.appendChild(st);
  }

  function fileKind(name='', type='') {
    const n=name.toLowerCase(), t=type.toLowerCase();
    if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(n)) return {icon:'🖼️',label:'Image',image:true};
    if (t==='application/pdf'||/\.pdf$/.test(n)) return {icon:'📕',label:'PDF'};
    if (/\.(doc|docx|rtf)$/.test(n)) return {icon:'📘',label:'Word document'};
    if (/\.(xls|xlsx|csv)$/.test(n)) return {icon:'📗',label:'Spreadsheet'};
    if (/\.(ppt|pptx)$/.test(n)) return {icon:'📙',label:'Presentation'};
    if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return {icon:'🗜️',label:'Archive'};
    if (t.startsWith('audio/')||/\.(mp3|wav|m4a|aac|ogg)$/.test(n)) return {icon:'🎵',label:'Audio'};
    if (t.startsWith('video/')||/\.(mp4|mov|avi|mkv|webm)$/.test(n)) return {icon:'🎬',label:'Video'};
    return {icon:'📎',label:'File'};
  }
  async function hydrateAttachmentThumbs(root=document) {
    const imgs=$$('img[data-nfa-imgpath]:not([data-nfa-hydrated])',root);
    for (const img of imgs) {
      img.dataset.nfaHydrated='1';
      try {
        const {data,error}=await sb().storage.from('task-proofs').createSignedUrl(img.dataset.nfaImgpath,3600);
        if (!error && data?.signedUrl) img.src=data.signedUrl;
      } catch {}
    }
  }
  async function openStoragePath(path) {
    if (!path) return;
    try {
      if (typeof window.openSecureFile === 'function') return await window.openSecureFile(path);
      const {data,error}=await sb().storage.from('task-proofs').createSignedUrl(path,3600);
      if (error||!data?.signedUrl) throw error||new Error('Could not sign file');
      window.open(data.signedUrl,'_blank','noopener');
    } catch(e) { toast('Could not open file: '+(e?.message||'unknown error'),'err'); }
  }

  function taskSummaryStatus(task, assignees=[]) {
    const active=assignees.filter(a=>!['transferred','cancelled'].includes(a.status));
    if (active.length && active.every(a=>a.status==='accepted')) return 'Completed';
    if (active.some(a=>a.status==='submitted')) return 'Pending Review';
    if (active.some(a=>['in_progress','needs_review','acknowledged'].includes(a.status))) return 'In Progress';
    if (active.some(a=>a.status==='pending_ack')) return 'Pending';
    const s=String(task.status||'').toLowerCase();
    if (s==='accepted'||s==='completed') return 'Completed';
    if (s==='cancelled') return 'Cancelled';
    return s ? s.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) : 'Pending';
  }
  function taskStatusClass(label) { return /complete|accepted/i.test(label)?'done':/pending|overdue|cancel/i.test(label)?'warn':''; }

  async function getTaskByMessage(messageId, force=false) {
    if (!messageId||!sb()||!tid()) return null;
    if (!force && taskByMessage.has(messageId)) return taskByMessage.get(messageId);
    try {
      const {data,error}=await sb().from('tasks').select('id,title,priority,deadline,require_proof,assigned_by,status,original_message_id,created_at')
        .eq('tenant_id',tid()).eq('original_message_id',messageId).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) { taskByMessage.set(messageId,null); return null; }
      const {data:aa}=await sb().from('task_assignees').select('assignee_id,status,state,acked').eq('tenant_id',tid()).eq('task_id',data.id);
      data.assignees=aa||[];
      taskByMessage.set(messageId,data); taskById.set(data.id,data); return data;
    } catch(e) { console.warn('[NFA v209] task lookup',e?.message||e); return null; }
  }
  async function getTask(taskId, force=false) {
    if (!taskId) return null;
    if (!force && taskById.has(taskId)) return taskById.get(taskId);
    try {
      const {data,error}=await sb().from('tasks').select('id,title,priority,deadline,require_proof,assigned_by,status,original_message_id,created_at')
        .eq('tenant_id',tid()).eq('id',taskId).maybeSingle();
      if (error||!data) throw error||new Error('Task not found');
      const {data:aa}=await sb().from('task_assignees').select('assignee_id,status,state,acked').eq('tenant_id',tid()).eq('task_id',taskId);
      data.assignees=aa||[]; taskById.set(taskId,data); if(data.original_message_id)taskByMessage.set(String(data.original_message_id),data); return data;
    } catch(e){ toast('Task not found','err'); return null; }
  }

  function roomFromRow(row) {
    const frame=row.closest('.mScr');
    const screen=frame?.dataset?.screen||'';
    const legacy=row.querySelector('.m-thread-link');
    let room=legacy?.dataset?.room||'';
    let name=legacy?.dataset?.rname||$('.m-htitle',frame)?.textContent?.trim()||'';
    let color=legacy?.dataset?.rcol||'';
    if (!room) {
      const composer=$('.m-sendbtn[data-room]',frame);
      room=composer?.dataset?.room||'';
      if (!name) name=composer?.dataset?.name||'';
    }
    let other='';
    if (room.startsWith('dm_')) other=room.replace(/^dm_/,'').split('_').find(x=>x!==uid())||'';
    return {screen,room,name,color,uid:other};
  }

  function isBookmarked(messageId) { return readBookmarks().some(b=>String(b.msgId)===String(messageId)); }
  function toggleBookmark(messageId,row) {
    let bms=readBookmarks(); const idx=bms.findIndex(b=>String(b.msgId)===String(messageId));
    if (idx>=0) { bms.splice(idx,1); writeBookmarks(bms); toast('Bookmark removed'); }
    else {
      const c=roomFromRow(row), text=row.querySelector('.m-btext')?.textContent?.trim()||'Task message';
      bms.unshift({msgId:messageId,text,room:c.room,rname:c.name,rcol:c.color,uid:c.uid,time:'just now',createdAt:nowIso()}); writeBookmarks(bms); toast('🔖 Bookmarked!');
    }
    decorateOneTask(row,true); refreshActivityBadgeSoon();
  }

  async function childCount(messageId) {
    const legacy=$(`#row-${CSS.escape(String(messageId))} .m-thread-link`);
    const n=Number(legacy?.dataset?.n||0); if (n) return n;
    try {
      const {count}=await sb().from('messages').select('id',{count:'exact',head:true}).eq('tenant_id',tid()).eq('parent_message_id',messageId).is('deleted_at',null);
      return count||0;
    } catch { return 0; }
  }

  async function decorateOneTask(row, force=false) {
    if (!row || !row.id?.startsWith('row-')) return;
    const mid=row.id.slice(4);
    const task=await getTaskByMessage(mid,force);
    if (!task) return;
    const bubble=$('.m-bubble',row); if (!bubble) return;
    row.dataset.nfaTaskId=task.id;
    bubble.classList.add('nfa-task-bubble');
    $('.m-thread-link',bubble)?.classList.add('nfa-hide-legacy-thread');
    const status=taskSummaryStatus(task,task.assignees||[]), count=await childCount(mid);
    let meta=$('.nfa-task-meta',bubble);
    if (!meta) { meta=document.createElement('div'); meta.className='nfa-task-meta'; bubble.appendChild(meta); }
    meta.innerHTML=`<span class="nfa-task-pill">TASK</span><span class="nfa-task-pill ${taskStatusClass(status)}">${esc(status)}</span>${task.deadline?`<span class="nfa-task-pill warn">Due ${esc(fmtDate(task.deadline))}</span>`:''}${task.priority?`<span class="nfa-task-pill">${esc(String(task.priority).toUpperCase())}</span>`:''}${task.require_proof?'<span class="nfa-task-pill">Proof required</span>':''}`;
    let actions=$('.nfa-task-actions',bubble);
    if (!actions){actions=document.createElement('div');actions.className='nfa-task-actions';bubble.appendChild(actions);}
    actions.innerHTML=`<button class="nfa-task-link" data-nfa-task-reply="${task.id}" data-mid="${mid}">↩ Reply</button><button class="nfa-task-link" data-nfa-toggle-replies="${task.id}" data-mid="${mid}">${expandedThreads.has(task.id)?'▾':'▸'} Replies (${count})</button><button class="nfa-task-link nfa-task-bookmark ${isBookmarked(mid)?'on':''}" data-nfa-bookmark="${mid}">🔖 ${isBookmarked(mid)?'Saved':'Bookmark'}</button>`;
    let thread=row.nextElementSibling;
    if (!thread || !thread.classList.contains('nfa-inline-thread')) {
      thread=document.createElement('div');thread.className='nfa-inline-thread';thread.dataset.taskId=task.id;thread.dataset.mid=mid;row.insertAdjacentElement('afterend',thread);
    }
    thread.classList.toggle('open',expandedThreads.has(task.id));
    if (expandedThreads.has(task.id)) loadInlineReplies(task,thread);
  }

  async function scanTaskBubbles(force=false) {
    if (!isMobileShell()||!['groupChat','dm'].includes(stageScreen())) return;
    const rows=$$('#mStage .m-bubble-row[id^="row-"]');
    for (const row of rows) {
      if (row.closest('.nfa-inline-thread')) continue;
      if (!force && row.dataset.nfaTaskId) continue;
      await decorateOneTask(row,force);
    }
  }
  function scheduleScan(force=false) { clearTimeout(scanTimer); scanTimer=setTimeout(()=>scanTaskBubbles(force),180); }

  function parseTaskFileText(text) {
    const plain=strip(text);
    const m=plain.match(/File uploaded\s*[—-]\s*([^|]+)\|([^|\s]+)(?:\|([\s\S]*))?/i);
    if (!m) return null;
    return {name:m[1].trim(),path:m[2].trim(),note:(m[3]||'').trim()};
  }
  async function loadInlineReplies(task,container) {
    if (!container||container.dataset.loading==='1') return;
    container.dataset.loading='1';
    container.innerHTML='<div class="nfa-inline-loading">Loading replies…</div>';
    try {
      const {data,error}=await sb().from('messages').select('id,text,sender_id,created_at').eq('tenant_id',tid()).eq('parent_message_id',task.original_message_id).is('deleted_at',null).order('created_at',{ascending:true});
      if (error) throw error;
      const rows=(data||[]).map(r=>{
        const f=parseTaskFileText(r.text); const initial=esc((uname(r.sender_id)||'?').slice(0,1).toUpperCase());
        let body='';
        if (f) {
          const k=fileKind(f.name), visual=k.image?`<img class="nfa-attach-thumb" data-nfa-imgpath="${esc(f.path)}" alt="">`:`<span class="nfa-attach-ic">${k.icon}</span>`;
          body=`${f.note?`<div class="nfa-inline-text">${esc(f.note)}</div>`:''}<div class="nfa-attach-card" data-nfa-open-path="${esc(f.path)}">${visual}<span class="nfa-attach-copy"><b>${esc(f.name)}</b><span>${k.label} · Tap to open</span></span><span>↗</span></div>`;
        } else {
          body=`<div class="nfa-inline-text">${safeTaskReplyHtml(r.text)}</div>`;
        }
        return `<div class="nfa-inline-reply"><span class="nfa-inline-avatar">${initial}</span><div class="nfa-inline-card"><div class="nfa-inline-head">${esc(uname(r.sender_id))} · ${esc(ago(r.created_at))}</div>${body}</div></div>`;
      }).join('');
      container.innerHTML=rows||'<div class="nfa-inline-loading">No replies yet.</div>';
      hydrateAttachmentThumbs(container);
    } catch(e) { container.innerHTML='<div class="nfa-inline-loading">Could not load replies.</div>'; }
    finally { container.dataset.loading='0'; }
  }

  function safeTaskReplyHtml(html) {
    const tmp=document.createElement('template'); tmp.innerHTML=html||'';
    const allowed=new Set(['DIV','P','BR','STRONG','B','EM','I','U','UL','OL','LI','SPAN','A']);
    const walk=(node)=>{
      [...node.children].forEach(el=>{
        if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
        [...el.attributes].forEach(a=>{
          const ok=(el.tagName==='A'&&a.name==='href')||(el.tagName==='SPAN'&&a.name==='data-uid');
          if(!ok) el.removeAttribute(a.name);
        });
        if(el.tagName==='A'){
          const h=el.getAttribute('href')||'';
          if(!/^(https?:\/\/|https:\/\/secure-file\.local\/|https:\/\/link-pill\.local\/)/i.test(h)) el.removeAttribute('href');
        }
        walk(el);
      });
    }; walk(tmp.content); return tmp.innerHTML;
  }

  async function openTaskInChat(taskId, focus=true) {
    const task=await getTask(taskId,true); if(!task?.original_message_id)return toast('Original task message not found','err');
    try {
      const {data:m,error}=await sb().from('messages').select('id,room_id').eq('tenant_id',tid()).eq('id',task.original_message_id).maybeSingle();
      if(error||!m)throw error||new Error('Message missing');
      const room=String(m.room_id||'');
      if(room.startsWith('dm_')){
        const other=room.replace(/^dm_/,'').split('_').find(x=>x!==uid())||'';
        await window._navTo?.('dm',{uid:other,name:uname(other),room,scrollTo:m.id});
      }else{
        let name=localStorage.getItem(tenantKey('dept_name_'+room))||room;
        let color=localStorage.getItem(tenantKey('dept_color_'+room))||'#6366f1';
        const homeEl=document.querySelector(`[data-room="${CSS.escape(room)}"][data-name]`); if(homeEl){name=homeEl.dataset.name||name;color=homeEl.dataset.color||color;}
        await window._navTo?.('groupChat',{room,name,color,scrollTo:m.id});
      }
      setTimeout(async()=>{await scanTaskBubbles(true);if(focus){const row=$(`#row-${CSS.escape(String(m.id))}`);if(row){row.classList.add('nfa-task-focus');row.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>row.classList.remove('nfa-task-focus'),2600);}}},450);
    }catch(e){toast('Could not open original task message','err');}
  }
  window.NFA_openTaskInChat = openTaskInChat;

  function clearTaskFile(revoke=true) {
    if(revoke&&currentTaskFileUrl)URL.revokeObjectURL(currentTaskFileUrl);
    currentTaskFile=null;currentTaskFileUrl=null;
    const chip=$('.nfa-selected-file'); if(chip){chip.classList.remove('on');chip.innerHTML='';}
  }
  function selectTaskFile() {
    const input=document.createElement('input');input.type='file';input.accept='*/*';
    input.onchange=()=>{
      const f=input.files?.[0];if(!f)return;clearTaskFile(true);currentTaskFile=f;currentTaskFileUrl=URL.createObjectURL(f);
      if(taskMode)taskMode.special=null;renderTaskContext();
      const chip=$('.nfa-selected-file');if(chip){const k=fileKind(f.name,f.type);chip.innerHTML=`<span>${k.icon}</span><span class="name">${esc(f.name)}</span><button type="button" data-nfa-clear-task-file>×</button>`;chip.classList.add('on');}
      taskMode?.editor?.focus();
    };input.click();
  }

  async function taskModeData(task) {
    const assignees=task.assignees||[];
    let extensions=[];
    if(task.assigned_by===uid()){
      try{const {data}=await sb().from('task_extension_requests').select('id,assignee_id,requested_deadline,reason,status').eq('tenant_id',tid()).eq('task_id',task.id).eq('status','pending').order('created_at',{ascending:true});extensions=data||[];}catch{}
    }
    return {assignees,extensions};
  }
  async function enterTaskMode(taskId,messageId) {
    const task=await getTask(taskId,true);if(!task)return;
    const row=$(`#row-${CSS.escape(String(messageId))}`);if(!row)return;
    const composer=row.closest('.mFlex')?.querySelector('.m-composer')||$('#mStage .m-composer');
    const editor=composer?.querySelector('.m-ce');if(!composer||!editor)return toast('Chat composer not found','err');
    exitTaskMode(false);
    const extra=await taskModeData(task);
    taskMode={task,messageId,composer,editor,special:null,extra};
    composer.classList.add('nfa-task-mode');
    const ctx=document.createElement('div');ctx.className='nfa-task-context';composer.prepend(ctx);
    const file=document.createElement('div');file.className='nfa-selected-file';composer.appendChild(file);
    editor.dataset.nfaOldPlaceholder=editor.getAttribute('data-placeholder')||'';
    editor.setAttribute('data-placeholder','Reply / update this task…');
    renderTaskContext();editor.focus();
  }
  function exitTaskMode(clearEditor=false) {
    if(!taskMode)return;
    const {composer,editor}=taskMode;
    composer?.classList.remove('nfa-task-mode');
    $('.nfa-task-context',composer)?.remove();$('.nfa-selected-file',composer)?.remove();
    if(editor){editor.setAttribute('data-placeholder',editor.dataset.nfaOldPlaceholder||'Message…');delete editor.dataset.nfaOldPlaceholder;if(clearEditor)editor.innerHTML='';}
    clearTaskFile(true);taskMode=null;
  }

  function staffOptions(exclude=[]) {
    return users().filter(u=>!exclude.includes(u.id)).slice().sort((a,b)=>(a.full_name||a.email||'').localeCompare(b.full_name||b.email||'')).map(u=>`<option value="${u.id}">${esc(u.full_name||u.email)}</option>`).join('');
  }
  function actionDefs() {
    if(!taskMode)return[];
    const t=taskMode.task, me=(t.assignees||[]).find(a=>a.assignee_id===uid()&&!['accepted','transferred','cancelled'].includes(a.status));
    const creator=t.assigned_by===uid(), defs=[];
    if(me){
      if(me.status==='pending_ack')defs.push(['ack','Acknowledge']);
      if(['in_progress','needs_review','acknowledged'].includes(me.status)){defs.push(['delegate','Delegate'],['transfer','Transfer'],['extension','Extension'],['submit','Submit']);}
    }
    if(creator){
      if((t.assignees||[]).some(a=>a.status==='submitted'))defs.push(['accept','Accept'],['return','Return']);
      if((t.assignees||[]).some(a=>!['accepted','transferred','cancelled'].includes(a.status)))defs.push(['remind','Remind'],['deadline','Deadline'],['cancel','Cancel']);
      if(taskMode.extra?.extensions?.length)defs.push(['extApprove','Approve Ext'],['extDecline','Decline Ext']);
    }
    return defs;
  }
  function renderTaskContext() {
    if(!taskMode)return;
    const ctx=$('.nfa-task-context',taskMode.composer);if(!ctx)return;
    const defs=actionDefs();
    const chips=defs.map(([k,l])=>`<button class="nfa-task-chip ${taskMode.special===k?'on':''}" data-nfa-special="${k}">${esc(l)}</button>`).join('');
    let extra=''; const s=taskMode.special,t=taskMode.task,aa=t.assignees||[];
    if(s==='delegate'||s==='transfer') extra=`<div class="nfa-task-extra on"><select id="nfaTaskPerson"><option value="">Select staff member…</option>${staffOptions([uid()])}</select></div>`;
    else if(s==='extension'||s==='deadline') extra=`<div class="nfa-task-extra on"><input id="nfaTaskDate" type="date"></div>`;
    else if(['accept','return','remind'].includes(s)){
      const eligible=s==='accept'||s==='return'?aa.filter(a=>a.status==='submitted'):aa.filter(a=>!['accepted','transferred','cancelled'].includes(a.status));
      extra=`<div class="nfa-task-extra on"><select id="nfaTaskAssignee"><option value="">Select assignee…</option>${eligible.map(a=>`<option value="${a.assignee_id}">${esc(uname(a.assignee_id))}</option>`).join('')}</select></div>`;
    } else if(s==='extApprove'||s==='extDecline'){
      const ex=taskMode.extra?.extensions||[];extra=`<div class="nfa-task-extra on"><select id="nfaExtReq"><option value="">Select request…</option>${ex.map(r=>`<option value="${r.id}">${esc(uname(r.assignee_id))} · ${esc(fmtDate(r.requested_deadline))}</option>`).join('')}</select></div>`;
    }
    ctx.innerHTML=`<div class="nfa-task-context-head"><span>↩ Task reply · ${esc(t.title||'Task')}</span><button type="button" data-nfa-exit-task>×</button></div>${defs.length?`<div class="nfa-task-actionbar">${chips}</div>`:''}${extra}`;
    let ph='Reply / update this task…';
    if(s==='delegate')ph='Add delegation instructions…';else if(s==='transfer')ph='Add transfer reason…';else if(s==='extension')ph='Reason / details for extension…';else if(s==='submit')ph='Optional submission note…';else if(s==='return')ph='Reason for returning this task…';else if(s==='cancel')ph='Reason for cancelling this task…';else if(s==='extApprove'||s==='extDecline')ph='Optional decision note…';
    taskMode.editor.setAttribute('data-placeholder',ph);
  }

  async function addTrail(task,action,comment) {
    const {data,error}=await sb().from('task_trails').insert({task_id:task.id,user_id:uid(),tenant_id:tid(),action,comment:comment||''}).select('id').single();
    if(error)throw error;return data;
  }
  async function patchTrailReply(task,trailId,label,richHtml,file) {
    if(!trailId||!task.original_message_id)return;
    const body=safeTaskReplyHtml(richHtml||'');
    const fileHtml=file?`<p><a href="https://secure-file.local/${esc(file.path)}">📎 ${esc(file.name)}</a></p>`:'';
    const html=`<div data-task-event="1" data-task-id="${task.id}" data-task-trail-id="${trailId}"><p>📋 <strong>${esc(task.title||'Task')}</strong></p><p><strong>${esc(label)}</strong>${body?` — ${body}`:''}</p>${fileHtml}</div>`;
    for(let i=0;i<8;i++){
      await new Promise(r=>setTimeout(r,180));
      try{
        const {data}=await sb().from('messages').select('id,sender_id,text').eq('tenant_id',tid()).eq('parent_message_id',task.original_message_id).order('created_at',{ascending:false}).limit(12);
        const m=(data||[]).find(x=>String(x.text||'').includes(`data-task-trail-id="${trailId}"`));
        if(m){await sb().from('messages').update({text:html}).eq('id',m.id).eq('sender_id',uid()).eq('tenant_id',tid());return;}
      }catch{}
    }
  }

  async function submitTaskComposer() {
    if(!taskMode)return;
    const t=taskMode.task, s=taskMode.special, editor=taskMode.editor;
    const rich=(editor.innerHTML||'').trim(), plain=strip(rich);
    try{
      if(s==='ack'){
        const {error}=await sb().from('task_assignees').update({status:'in_progress',state:'in_progress',acked:true}).eq('tenant_id',tid()).eq('task_id',t.id).eq('assignee_id',uid());if(error)throw error;
        await addTrail(t,'ACKNOWLEDGE','Acknowledged the task');toast('Task acknowledged ✓');
      } else if(s==='delegate'){
        const to=$('#nfaTaskPerson')?.value;if(!to)throw new Error('Select a staff member');
        const {data:exists}=await sb().from('task_assignees').select('assignee_id').eq('tenant_id',tid()).eq('task_id',t.id).eq('assignee_id',to).maybeSingle();
        if(!exists){const {error}=await sb().from('task_assignees').insert({task_id:t.id,assignee_id:to,tenant_id:tid(),status:'pending_ack',state:'pending'});if(error)throw error;}
        await addTrail(t,'DELEGATE',`Delegated to ${uname(to)}${plain?' — '+plain:''}`);toast('Task delegated ✓');
      } else if(s==='transfer'){
        const to=$('#nfaTaskPerson')?.value;if(!to)throw new Error('Select a staff member');if(!plain)throw new Error('Transfer reason is required');
        const me=(t.assignees||[]).find(a=>a.assignee_id===uid()&&!['accepted','transferred','cancelled'].includes(a.status));
        if(me){await sb().from('task_assignees').delete().eq('tenant_id',tid()).eq('task_id',t.id).eq('assignee_id',uid());}
        const {data:exists}=await sb().from('task_assignees').select('assignee_id').eq('tenant_id',tid()).eq('task_id',t.id).eq('assignee_id',to).maybeSingle();
        if(!exists){const {error}=await sb().from('task_assignees').insert({task_id:t.id,assignee_id:to,tenant_id:tid(),status:'pending_ack',state:'pending'});if(error)throw error;}
        await addTrail(t,'TRANSFER',`Transferred to ${uname(to)} — ${plain}`);toast('Task transferred ✓');
      } else if(s==='extension'){
        const date=$('#nfaTaskDate')?.value;if(!date)throw new Error('Select requested deadline');if(!plain)throw new Error('Reason is required');
        const {error}=await sb().rpc('request_task_extension',{p_task_id:t.id,p_requested_deadline:date,p_reason:plain,p_tenant_id:tid()});if(error)throw error;toast('Extension requested ✓');
      } else if(s==='submit'){
        if(t.require_proof){const {count}=await sb().from('task_trails').select('id',{count:'exact',head:true}).eq('tenant_id',tid()).eq('task_id',t.id).eq('user_id',uid()).eq('action','FILE');if(!count)throw new Error('Proof required — attach a file before submitting');}
        const {error}=await sb().from('task_assignees').update({status:'submitted',state:'submitted'}).eq('tenant_id',tid()).eq('task_id',t.id).eq('assignee_id',uid());if(error)throw error;
        await addTrail(t,'SUBMIT',plain||'Submitted for review');toast('Submitted for review ✓');
      } else if(s==='accept'||s==='return'){
        const who=$('#nfaTaskAssignee')?.value;if(!who)throw new Error('Select an assignee');if(s==='return'&&!plain)throw new Error('Return reason is required');
        const st=s==='accept'?'accepted':'needs_review';const {error}=await sb().from('task_assignees').update({status:st,state:st}).eq('tenant_id',tid()).eq('task_id',t.id).eq('assignee_id',who);if(error)throw error;
        await addTrail(t,s==='accept'?'ACCEPT':'RETURN',s==='accept'?`Completion accepted for ${uname(who)}`:`Returned to ${uname(who)} — ${plain}`);
        if(s==='accept'){const {data:all}=await sb().from('task_assignees').select('status').eq('tenant_id',tid()).eq('task_id',t.id);if((all||[]).filter(a=>!['transferred','cancelled'].includes(a.status)).every(a=>a.status==='accepted'))await sb().from('tasks').update({status:'accepted'}).eq('tenant_id',tid()).eq('id',t.id);}
        toast(s==='accept'?'Completion accepted ✓':'Returned for changes ✓');
      } else if(s==='remind'){
        const who=$('#nfaTaskAssignee')?.value;if(!who)throw new Error('Select an assignee');
        const {error}=await sb().rpc('send_task_reminder',{p_task_id:t.id,p_assignee_id:who,p_tenant_id:tid(),p_sender_id:uid()});if(error)throw error;toast('Reminder sent ✓');
      } else if(s==='deadline'){
        const date=$('#nfaTaskDate')?.value;if(!date)throw new Error('Select a deadline');const {error}=await sb().from('tasks').update({deadline:date}).eq('tenant_id',tid()).eq('id',t.id);if(error)throw error;await addTrail(t,'DEADLINE',`Deadline changed to ${fmtDate(date)}`);toast('Deadline updated ✓');
      } else if(s==='cancel'){
        if(!plain)throw new Error('Cancellation reason is required');await sb().from('tasks').update({status:'cancelled'}).eq('tenant_id',tid()).eq('id',t.id);try{await sb().from('task_assignees').update({status:'cancelled',state:'cancelled'}).eq('tenant_id',tid()).eq('task_id',t.id);}catch{}await addTrail(t,'CANCEL',plain);toast('Task cancelled');
      } else if(s==='extApprove'||s==='extDecline'){
        const rid=$('#nfaExtReq')?.value;if(!rid)throw new Error('Select an extension request');const {error}=await sb().rpc('respond_task_extension',{p_request_id:rid,p_approve:s==='extApprove',p_decision_reason:plain||null,p_tenant_id:tid()});if(error)throw error;toast(s==='extApprove'?'Extension approved ✓':'Extension declined');
      } else if(currentTaskFile){
        const f=currentTaskFile,safeName=(f.name||'file').replace(/[^a-zA-Z0-9.\-_]/g,'_'),path=`tasks/${t.id}/${Date.now()}_${safeName}`;
        toast('Uploading…');const {error}=await sb().storage.from('task-proofs').upload(path,f);if(error)throw error;
        const tr=await addTrail(t,'FILE',`${f.name}|${path}${plain?'|'+plain:''}`);await patchTrailReply(t,tr?.id,'File uploaded',rich,{name:f.name,path});toast('File uploaded ✓');
      } else {
        if(!plain)throw new Error('Write an update first');const tr=await addTrail(t,'UPDATE',plain);await patchTrailReply(t,tr?.id,'Progress update',rich,null);toast('Update posted ✓');
      }
      const wasExpanded=expandedThreads.has(t.id); const mid=taskMode.messageId; exitTaskMode(true);
      taskById.delete(t.id);taskByMessage.delete(String(mid));
      setTimeout(async()=>{await decorateOneTask($(`#row-${CSS.escape(String(mid))}`),true);if(wasExpanded){const c=$(`.nfa-inline-thread[data-task-id="${CSS.escape(String(t.id))}"]`);if(c){expandedThreads.add(t.id);c.classList.add('open');await loadInlineReplies(await getTask(t.id,true),c);}}refreshActivityBadgeSoon();},420);
    }catch(e){toast(e?.message||'Task action failed','err');}
  }

  async function saveConvertedTask(sheetButton) {
    const messageId=sheetButton.dataset.msgid;const title=$('#ctTitle')?.value?.trim(),deadline=$('#ctDeadline')?.value||null,priority=$('#ctPriority')?.value||'normal';const requireProof=!!$('#ctRequireProof')?.checked;
    const aids=$$('.ctAssignee:checked').map(x=>x.value);if(!title)return toast('Title required','err');if(!aids.length)return toast('Pick at least one assignee','err');
    try{
      const {data:task,error}=await sb().from('tasks').insert({title,deadline,priority,require_proof:requireProof,status:'pending',created_at:nowIso(),original_message_id:messageId,assigned_by:uid(),tenant_id:tid()}).select().single();if(error||!task)throw error||new Error('Task not created');
      const {error:ae}=await sb().from('task_assignees').insert(aids.map(a=>({task_id:task.id,assignee_id:a,tenant_id:tid(),status:'pending_ack',state:'pending'})));if(ae)throw ae;
      await addTrail(task,'CREATE','Task created');window._closeSheet?.();toast('✅ Task created!');taskByMessage.delete(String(messageId));taskById.delete(task.id);setTimeout(()=>scheduleScan(true),350);
    }catch(e){toast('Failed to create task: '+(e?.message||'unknown error'),'err');}
  }

  function enhanceCreateTaskSheet() {
    const btn=$('[data-action="ctSaveTask"]');if(!btn)return;
    const title=$('.m-sheet-title');if(title&&/convert to task/i.test(title.textContent||''))title.textContent='Create Task';
    if(!$('#ctRequireProof')){
      const wrap=document.createElement('label');wrap.style.cssText='display:flex;align-items:center;gap:8px;padding:4px 2px 2px;font-size:13px;font-weight:700;color:var(--text-secondary);';wrap.innerHTML='<input id="ctRequireProof" type="checkbox" style="accent-color:#6366f1;"> Require proof / file before submit';
      btn.parentElement?.insertBefore(wrap,btn);
    }
  }

  function patchNav() {
    const nav=$('#mNav');if(!nav)return;
    const home=$('#mnt-home'),tasks=$('#mnt-tasks'),act=$('#mnt-activity'),marks=$('#mnt-marks'),more=$('#mnt-more');
    if(home){home.onclick=()=>window._navTo?.('home');const l=$('.mn-lbl',home);if(l)l.textContent='Chat';const i=$('i',home);if(i)i.className='fa-solid fa-comments';}
    if(tasks){tasks.onclick=()=>window._navTo?.('tasks');const l=$('.mn-lbl',tasks);if(l)l.textContent='Tasks';}
    if(act){act.onclick=()=>window._navTo?.('activity');const l=$('.mn-lbl',act);if(l)l.textContent='Activity';const i=$('i',act);if(i)i.className='fa-solid fa-bell';}
    if(marks){marks.onclick=()=>window._navTo?.('remind');const l=$('.mn-lbl',marks);if(l)l.textContent='Reminders';const i=$('i',marks);if(i)i.className='fa-solid fa-clock';marks.id='mnt-reminders';}
    const settings=$('#mnt-more')||$('#mnt-settings');
    if(settings){settings.id='mnt-settings';settings.onclick=()=>window._navTo?.('settings');const l=$('.mn-lbl',settings);if(l)l.textContent='Settings';const i=$('i',settings);if(i)i.className='fa-solid fa-gear';}
    patchActiveTab();
  }
  function patchActiveTab() {
    const scr=stageScreen();const active=['groupChat','dm','thread','home'].includes(scr)?'home':scr==='tasks'?'tasks':scr==='activity'?'activity':['remind','remindEdit'].includes(scr)?'reminders':['settings','dashboard','marks','scheduled','groupMgmt'].includes(scr)?'settings':'';
    $$('#mNav .mn-btn').forEach(b=>b.classList.toggle('active',b.id===`mnt-${active}`));
  }

  function enhanceHome() {
    if(stageScreen()!=='home')return;const root=$('#mStage > .mScr .mScr-inner');if(!root||$('.nfa-chat-tools',root))return;
    const tools=document.createElement('div');tools.className='nfa-chat-tools';tools.innerHTML='<b>Chats</b><button class="nfa-quick-btn" data-nfa-nav="marks">🔖 Bookmarks</button>';root.prepend(tools);
  }
  function enhanceSettings() {
    if(stageScreen()!=='settings')return;const root=$('#mStage > .mScr .mScr-inner');if(!root||$('.nfa-settings-shortcuts',root))return;
    const box=document.createElement('div');box.className='nfa-settings-shortcuts';
    const canSched=window.canSchedule?.()??false, canGroup=(window.canManageGroups?.()??false)||(window.canSeeGroupGear?.()??false);
    box.innerHTML=`<h3>Workspace</h3><div class="nfa-settings-grid"><button data-nfa-nav="dashboard">📊 Dashboard</button><button data-nfa-nav="marks">🔖 Bookmarks</button>${canSched?'<button data-nfa-nav="scheduled">🕐 Scheduled</button>':''}${canGroup?'<button data-nfa-nav="groupMgmt">👥 Manage Groups</button>':''}</div>`;
    const firstSection=$('.m-sl',root);if(firstSection)firstSection.before(box);else root.appendChild(box);
  }
  function patchTaskFilters() {
    if(stageScreen()!=='tasks')return;
    $$('select option','#mStage').forEach(o=>{
      const t=(o.textContent||'').trim().toLowerCase();
      if(t==='all tasks'||t==='all')o.textContent='All';
      else if(t==='created by me'||t==='by me')o.textContent='Allotted by Me';
      else if(t==='assigned to me'||t==='for me')o.textContent='Allotted to Me';
      else if(t==='done')o.textContent='Completed';
      else if(t==='overdue'||t==='today'||t==='delegated'||t==='transferred')o.hidden=true;
    });
  }

  async function collectActivity() {
    if(!sb()||!uid()||!tid())return[];const base=ensureActivityBaseline();loadActivityRead();const out=[];
    const [mr,tr,nr,rr]=await Promise.allSettled([
      sb().from('messages').select('id,room_id,parent_message_id,text,sender_id,created_at').eq('tenant_id',tid()).is('deleted_at',null).order('created_at',{ascending:false}).limit(100),
      sb().from('task_trails').select('id,task_id,user_id,action,comment,created_at').eq('tenant_id',tid()).order('created_at',{ascending:false}).limit(100),
      sb().from('notifications').select('id,type,message,message_id,task_id,is_read,created_at').eq('user_id',uid()).eq('tenant_id',tid()).order('created_at',{ascending:false}).limit(80),
      sb().from('reminders').select('id,message_id,reminder_time,triggered,messages(text,room_id)').eq('user_id',uid()).eq('tenant_id',tid()).order('reminder_time',{ascending:false}).limit(50)
    ]);
    const messages=mr.value?.data||[], trails=tr.value?.data||[], notifs=nr.value?.data||[], reminders=rr.value?.data||[];
    const taskIds=[...new Set(trails.map(x=>x.task_id).filter(Boolean))];const taskMap={};
    if(taskIds.length){try{const {data}=await sb().from('tasks').select('id,title,original_message_id').eq('tenant_id',tid()).in('id',taskIds);(data||[]).forEach(t=>taskMap[t.id]=t);}catch{}}
    const roomName=(room)=>{if(!room)return'';if(room.startsWith('dm_')){const other=room.replace(/^dm_/,'').split('_').find(x=>x!==uid());return uname(other);}return localStorage.getItem(tenantKey('dept_name_'+room))||room;};
    messages.forEach(m=>{
      if(String(m.text||'').includes('data-task-event="1"'))return;
      const incoming=m.sender_id!==uid(), key='msg:'+m.id, ts=new Date(normTs(m.created_at)).getTime();
      const unread=incoming&&ts>base&&!activityRead.has(key);out.push({key,cat:'messages',icon:incoming?'💬':'↗️',title:incoming?'Message received':'Message sent',desc:`${incoming?uname(m.sender_id):'You'} · ${snip(m.text,70)}`,meta:`${roomName(m.room_id)} · ${ago(m.created_at)}`,created_at:m.created_at,unread,room:m.room_id,messageId:m.parent_message_id||m.id});
    });
    trails.forEach(t=>{
      const task=taskMap[t.task_id]||{},incoming=t.user_id!==uid(),key='trail:'+t.id,ts=new Date(normTs(t.created_at)).getTime(),a=String(t.action||'UPDATE').toUpperCase();
      const icon=a==='FILE'?'📎':a.includes('EXTENSION')?'📅':a==='ACCEPT'?'✅':a==='RETURN'?'↩️':a==='TRANSFER'?'🔁':a==='DELEGATE'?'👤':'📋';
      const title=a==='FILE'?'File uploaded':`Task ${a.replace(/_/g,' ').toLowerCase()}`;
      const unread=incoming&&ts>base&&!activityRead.has(key);out.push({key,cat:a==='FILE'?'uploads':'tasks',icon,title,desc:`${task.title||'Task'}${t.comment?' · '+snip(t.comment,65):''}`,meta:`${uname(t.user_id)} · ${ago(t.created_at)}`,created_at:t.created_at,unread,taskId:t.task_id,messageId:task.original_message_id});
    });
    notifs.filter(n=>['reaction','system'].includes(String(n.type||'').toLowerCase())).forEach(n=>{const key='notif:'+n.id,unread=!n.is_read&&!activityRead.has(key);out.push({key,cat:'messages',icon:n.type==='reaction'?'❤️':'🔔',title:n.type==='reaction'?'Reaction':'Notification',desc:n.message||'',meta:ago(n.created_at),created_at:n.created_at,unread,messageId:n.message_id,taskId:n.task_id,notifId:n.id});});
    reminders.forEach(r=>{const key='rem:'+r.id;out.push({key,cat:'reminders',icon:'⏰',title:r.triggered?'Reminder completed':'Reminder',desc:snip(r.messages?.text||'Message reminder',70),meta:`${r.triggered?'Triggered':'Scheduled'} · ${fmtDate(r.reminder_time)}`,created_at:r.reminder_time,unread:false,messageId:r.message_id,room:r.messages?.room_id});});
    readBookmarks().forEach((b,i)=>{const key='bookmark:'+String(b.msgId||i);out.push({key,cat:'bookmarks',icon:'🔖',title:'Bookmarked message',desc:snip(b.text||'Bookmarked message',70),meta:`${b.rname||b.room||'Chat'}${b.createdAt?' · '+ago(b.createdAt):''}`,created_at:b.createdAt||new Date(base-1000).toISOString(),unread:false,messageId:b.msgId,room:b.room});});
    out.sort((a,b)=>new Date(normTs(b.created_at)).getTime()-new Date(normTs(a.created_at)).getTime());return out.slice(0,180);
  }

  async function renderActivity(force=false) {
    if(stageScreen()!=='activity'||activityRendering)return;const frame=$('#mStage > .mScr');if(!frame)return;if(frame.dataset.nfaActivity==='1'&&!force)return;
    activityRendering=true;frame.dataset.nfaActivity='1';const filter=window.__nfaActivityFilter||'all';
    try{
      const items=await collectActivity();if(stageScreen()!=='activity')return;const shown=filter==='all'?items:items.filter(x=>x.cat===filter);
      frame.innerHTML=`<div class="nfa-activity"><div class="nfa-activity-head"><b>🔔 Activity Feed</b><small>${items.filter(x=>x.unread).length} unread</small></div><div class="nfa-afilters">${[['all','All'],['messages','Messages'],['tasks','Tasks'],['uploads','Uploads'],['reminders','Reminders'],['bookmarks','Bookmarks']].map(([k,l])=>`<button class="${filter===k?'on':''}" data-nfa-afilter="${k}">${l}</button>`).join('')}</div><div class="nfa-afeed">${shown.length?shown.map(it=>`<div class="nfa-acard ${it.unread?'unread':''}" data-nfa-activity-key="${esc(it.key)}" data-mid="${esc(it.messageId||'')}" data-task="${esc(it.taskId||'')}" data-room="${esc(it.room||'')}" data-notif="${esc(it.notifId||'')}"><div class="nfa-aic">${it.icon}</div><div class="nfa-abody"><div class="nfa-atitle">${esc(it.title)}</div><div class="nfa-adesc">${esc(it.desc)}</div><div class="nfa-ameta">${esc(it.meta)}</div></div>${it.unread?'<span class="nfa-unread">UNREAD</span>':''}</div>`).join(''):'<div class="nfa-empty">No activity matches this filter.</div>'}</div></div>`;
      refreshActivityBadgeFromItems(items);
    }catch(e){console.warn('[NFA v209] activity',e);}
    finally{activityRendering=false;}
  }
  function refreshActivityBadgeFromItems(items) {
    const count=(items||[]).filter(x=>x.unread).length;const b=$('#mnActBadge');if(!b)return;
    if(count){b.textContent=count>99?'99+':String(count);b.classList.add('nfa-number');b.style.display='flex';}else{b.classList.remove('nfa-number');b.style.display='none';}
  }
  async function refreshActivityBadge() { try{refreshActivityBadgeFromItems(await collectActivity());}catch{} }
  function refreshActivityBadgeSoon(){clearTimeout(badgeTimer);badgeTimer=setTimeout(refreshActivityBadge,500);}

  async function markActivityCard(card) {
    const key=card.dataset.nfaActivityKey;if(key){activityRead.add(key);saveActivityRead();card.classList.remove('unread');$('.nfa-unread',card)?.remove();}
    const nid=card.dataset.notif;if(nid){try{await sb().from('notifications').update({is_read:true}).eq('id',nid).eq('user_id',uid());}catch{}}
    refreshActivityBadgeSoon();
    const task=card.dataset.task,mid=card.dataset.mid,room=card.dataset.room;
    if(task)return openTaskInChat(task);
    if(mid){
      if(typeof window._goToMessage==='function')return window._goToMessage(mid,room||undefined);
      try{const {data}=await sb().from('messages').select('room_id').eq('id',mid).maybeSingle();const r=room||data?.room_id;if(!r)return;if(r.startsWith('dm_')){const o=r.replace(/^dm_/,'').split('_').find(x=>x!==uid());return window._navTo?.('dm',{uid:o,name:uname(o),room:r,scrollTo:mid});}const name=localStorage.getItem(tenantKey('dept_name_'+r))||r;return window._navTo?.('groupChat',{room:r,name,color:'#6366f1',scrollTo:mid});}catch{}
    }
  }

  function addCreatedAtToBookmarkLater(messageId) {
    setTimeout(()=>{const bms=readBookmarks();const b=bms.find(x=>String(x.msgId)===String(messageId));if(b&&!b.createdAt){b.createdAt=nowIso();writeBookmarks(bms);refreshActivityBadgeSoon();}},120);
  }

  async function handleCaptureClick(e) {
    const open=e.target.closest('[data-nfa-open-path]');if(open){e.preventDefault();e.stopImmediatePropagation();return openStoragePath(open.dataset.nfaOpenPath);}
    const nav=e.target.closest('[data-nfa-nav]');if(nav){e.preventDefault();e.stopImmediatePropagation();return window._navTo?.(nav.dataset.nfaNav);}
    const af=e.target.closest('[data-nfa-afilter]');if(af){e.preventDefault();e.stopImmediatePropagation();window.__nfaActivityFilter=af.dataset.nfaAfilter;const frame=$('#mStage > .mScr');if(frame)frame.dataset.nfaActivity='0';return renderActivity(true);}
    const ac=e.target.closest('[data-nfa-activity-key]');if(ac){e.preventDefault();e.stopImmediatePropagation();return markActivityCard(ac);}
    const reply=e.target.closest('[data-nfa-task-reply]');if(reply){e.preventDefault();e.stopImmediatePropagation();return enterTaskMode(reply.dataset.nfaTaskReply,reply.dataset.mid);}
    const tog=e.target.closest('[data-nfa-toggle-replies]');if(tog){e.preventDefault();e.stopImmediatePropagation();const t=await getTask(tog.dataset.nfaToggleReplies);if(!t)return;const on=!expandedThreads.has(t.id);if(on)expandedThreads.add(t.id);else expandedThreads.delete(t.id);const row=$(`#row-${CSS.escape(String(tog.dataset.mid))}`);await decorateOneTask(row,true);return;}
    const bm=e.target.closest('[data-nfa-bookmark]');if(bm){e.preventDefault();e.stopImmediatePropagation();return toggleBookmark(bm.dataset.nfaBookmark,bm.closest('.m-bubble-row'));}
    if(e.target.closest('[data-nfa-clear-task-file]')){e.preventDefault();e.stopImmediatePropagation();clearTaskFile(true);renderTaskContext();return;}
    if(e.target.closest('[data-nfa-exit-task]')){e.preventDefault();e.stopImmediatePropagation();exitTaskMode(false);return;}
    const special=e.target.closest('[data-nfa-special]');if(special){e.preventDefault();e.stopImmediatePropagation();if(!taskMode)return;taskMode.special=taskMode.special===special.dataset.nfaSpecial?null:special.dataset.nfaSpecial;clearTaskFile(true);renderTaskContext();return;}

    const save=e.target.closest('[data-action="ctSaveTask"]');if(save){e.preventDefault();e.stopImmediatePropagation();return saveConvertedTask(save);}
    const legacyOpen=e.target.closest('[data-action="taskDetail"],[data-nmt-action="open-detail"]');if(legacyOpen){const taskId=legacyOpen.dataset.id||legacyOpen.dataset.task||legacyOpen.closest('[data-task-id]')?.dataset?.taskId;if(taskId){e.preventDefault();e.stopImmediatePropagation();return openTaskInChat(taskId);}}
    const ca=e.target.closest('[data-caction="attach"]');if(ca&&taskMode&&taskMode.composer?.contains(ca)){e.preventDefault();e.stopImmediatePropagation();return selectTaskFile();}
    const send=e.target.closest('.m-sendbtn');if(send&&taskMode&&taskMode.composer?.contains(send)){e.preventDefault();e.stopImmediatePropagation();return submitTaskComposer();}
    const bookmarkMsg=e.target.closest('[data-action="bookmarkMsg"]');if(bookmarkMsg)addCreatedAtToBookmarkLater(bookmarkMsg.dataset.id);
  }

  function enhanceSheetLabels() {
    const convert=$('[data-action="convertTask"]');if(convert&&/Convert to Task/i.test(convert.textContent||'')){convert.innerHTML='<i class="fa-solid fa-list-check" style="color:#16a34a;"></i> Create Task';}
    enhanceCreateTaskSheet();
  }

  function enhanceAll() {
    if(!isMobileShell())return;
    patchNav();patchActiveTab();enhanceSheetLabels();
    const scr=stageScreen();
    if(scr==='home')enhanceHome();if(scr==='settings')enhanceSettings();if(scr==='tasks')patchTaskFilters();if(['groupChat','dm'].includes(scr))scheduleScan(false);if(scr==='activity')renderActivity(false);
  }

  function start() {
    if(!isMobileShell()){setTimeout(start,350);return;}
    injectCss();ensureActivityBaseline();loadActivityRead();patchNav();enhanceAll();
    document.addEventListener('click',handleCaptureClick,true);
    observer=new MutationObserver(()=>{clearTimeout(activityTimer);activityTimer=setTimeout(enhanceAll,80);});observer.observe(document.getElementById('mobileApp'),{childList:true,subtree:true});
    refreshActivityBadge();setInterval(()=>{refreshActivityBadge();if(stageScreen()==='activity'){const f=$('#mStage > .mScr');if(f)f.dataset.nfaActivity='0';renderActivity(true);}if(['groupChat','dm'].includes(stageScreen()))scheduleScan(true);},15000);
    window.addEventListener('focus',()=>{enhanceAll();refreshActivityBadgeSoon();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){enhanceAll();refreshActivityBadgeSoon();}});
    console.log('[NFA] mobile workflow parity '+VERSION+' active');
  }

  start();
})();