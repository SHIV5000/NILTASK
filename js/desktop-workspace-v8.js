/* Noted For Action — Desktop Workspace v8
 * Consolidated chat-first desktop controller.
 * Canonical model: message bubble = task surface, task events = Replies,
 * Task Lens = tracker, Activity = right-side change feed.
 * Fine-pointer desktop only. Existing task mutation/database owners are reused.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_WORKSPACE_V8__) return;
  window.__NFA_DESKTOP_WORKSPACE_V8__ = true;

  const state = {
    tasks: [], byId: new Map(), byMessage: new Map(), loadedAt: 0, loading: null,
    openTaskId: '', roomMode: 'chat', lensFilter: 'all',
    renderOwner: null, loadOwner: null, renderMainOwner: null,
    createOwner: null, closeCreateOwner: null, saveCreateOwner: null,
    createCard: null, createMessageId: '',
    actionPanel: null, actionTaskId: '', closeActionOwner: null,
    groupSettingsOwner: null, profileOwner: null, replyOwner: null,
    openReplies: new Set(),
    navSeq: 0, navKey: '', navPromise: null, navStartedAt: 0,
    installFrames: 0,
  };

  const RICH_PREFIX = '[NFA_RICH]';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

  function isDesktop() {
    return window.innerWidth >= 769 && !window.IS_NATIVE &&
      !window.isMobileView?.() && !window.matchMedia?.('(pointer: coarse)').matches;
  }
  if (!isDesktop()) return;

  function client() { return window.sb || null; }
  function cleanId(value) {
    const id = String(value == null ? '' : value).trim();
    return id && id !== 'null' && id !== 'undefined' ? id : '';
  }
  function esc(value) {
    if (window.escapeHtml) return window.escapeHtml(String(value == null ? '' : value));
    return String(value == null ? '' : value)
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }
  function toast(message, icon='fa-solid fa-circle-info', className='text-blue-500') {
    window.showCenterToast?.(message, icon, className);
  }

  function profileFor(userId, explicit) {
    const cached = (window.globalUsersCache || []).find(user => user.id === userId) || null;
    if (cached && explicit) return { ...explicit, ...cached };
    return cached || explicit || null;
  }
  function displayName(userId, explicit) {
    const p = profileFor(userId, explicit);
    if (userId === window.currentUser?.id) {
      return p?.full_name || window.currentUser?.user_metadata?.full_name ||
        window.currentUser?.email?.split('@')[0] || 'You';
    }
    return p?.full_name || p?.email?.split('@')[0] || 'Loading sender…';
  }
  function designation(userId, explicit) {
    const p = profileFor(userId, explicit);
    const raw = userId === window.currentUser?.id
      ? (p?.designation || window.currentDesignation || '')
      : (p?.designation || '');
    return String(raw || '').trim();
  }
  function avatarUrl(userId, explicit) {
    const p = profileFor(userId, explicit);
    if (userId === window.currentUser?.id) {
      return window._userAvatarUrl ||
        localStorage.getItem('mpgs_avatar_' + userId) ||
        p?.avatar_url || '';
    }
    return p?.avatar_url || '';
  }
  function userName(userId) {
    return displayName(userId, null).replace('Loading sender…', 'Staff member');
  }
  function setAvatar(node, userId, explicit) {
    if (!node) return;
    const url = avatarUrl(userId, explicit);
    const initial = (displayName(userId, explicit) || '?').charAt(0).toUpperCase();
    node.replaceChildren();
    node.style.backgroundImage = '';
    node.style.backgroundSize = '';
    node.style.backgroundPosition = '';
    node.style.color = '';
    if (url) {
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.src = url;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;';
      img.addEventListener('error', () => {
        img.remove();
        node.textContent = initial;
      }, { once: true });
      node.appendChild(img);
    } else {
      node.textContent = initial;
    }
  }

  function stabilizeMessageMedia(root=document) {
    root.querySelectorAll?.('#messagesContainer .b-text img, #messagesContainer .reply-text img').forEach(img => {
      img.decoding = 'async';
      if (!img.loading) img.loading = 'lazy';
      img.classList.add('nfa-v8-stable-media');
    });
  }

  function repliesByRoot(messages) {
    const all = Array.isArray(messages) ? messages : [];
    const byId = new Map(all.map(message => [String(message.id), message]));
    const out = new Map();
    all.filter(message => message.parent_message_id).forEach(reply => {
      let rootId = String(reply.parent_message_id);
      const visited = new Set();
      while (byId.has(rootId) && byId.get(rootId)?.parent_message_id) {
        if (visited.has(rootId)) break;
        visited.add(rootId);
        rootId = String(byId.get(rootId).parent_message_id);
      }
      if (!out.has(rootId)) out.set(rootId, []);
      out.get(rootId).push(reply);
    });
    out.forEach(list => list.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)));
    return out;
  }

  function hydrateMessageIdentities(messages = window._roomMsgs || []) {
    const all = Array.isArray(messages) ? messages : [];
    const top = all.filter(message => !message.parent_message_id);
    const replies = repliesByRoot(all);

    top.forEach(message => {
      const row = document.getElementById(`row-${message.id}`);
      if (!row) return;
      row.dataset.nfaMessageId = String(message.id);

      const nameNode = row.querySelector('.b-name');
      if (nameNode) {
        const name = displayName(message.sender_id, message.profiles);
        const desig = designation(message.sender_id, message.profiles);
        nameNode.innerHTML = `${esc(name)}${desig ? ` <span class="b-role">· ${esc(desig)}</span>` : ''}`;
      }
      setAvatar(row.querySelector('.b-avatar'), message.sender_id, message.profiles);

      const replyList = replies.get(String(message.id)) || [];
      const replyNodes = row.querySelectorAll('.reply-item');
      replyNodes.forEach((node, index) => {
        const reply = replyList[index];
        if (!reply) return;
        node.dataset.nfaReplyId = String(reply.id);
        const rn = node.querySelector('.reply-name');
        const rr = node.querySelector('.reply-role');
        if (rn) rn.textContent = displayName(reply.sender_id, reply.profiles);
        if (rr) {
          const d = designation(reply.sender_id, reply.profiles);
          rr.textContent = d;
          rr.style.display = d ? '' : 'none';
        }
      });

      const wrap = document.getElementById(`rw-${message.id}`);
      if (wrap) wrap.style.display = state.openReplies.has(String(message.id)) ? 'flex' : 'none';
    });
    stabilizeMessageMedia();
  }

  function effectiveStatus(a) {
    if (!a) return 'pending_ack';
    if (a.status === 'pending_ack' && (a.state === 'acknowledged' || a.acked === true)) return 'acknowledged';
    return String(a.status || 'pending_ack').toLowerCase();
  }
  function isClosedStatus(status) { return status === 'transferred' || status === 'cancelled'; }
  function taskState(task) {
    const statuses = (task.assignees || []).map(effectiveStatus).filter(s => !isClosedStatus(s));
    if (!statuses.length) return 'empty';
    if (statuses.every(s => s === 'accepted')) return 'accepted';
    if (statuses.every(s => s === 'submitted')) return 'submitted';
    if (statuses.every(s => s === 'pending_ack')) return 'pending_ack';
    if (statuses.some(s => s === 'needs_review')) return 'needs_review';
    if (statuses.some(s => s === 'submitted')) return 'mixed';
    if (statuses.some(s => s === 'in_progress')) return 'in_progress';
    if (statuses.some(s => s === 'acknowledged')) return 'acknowledged';
    return statuses.length === 1 ? statuses[0] : 'mixed';
  }
  function taskStats(task) {
    const stats = { awaiting:0, working:0, review:0, done:0 };
    (task.assignees || []).forEach(a => {
      const s = effectiveStatus(a);
      if (isClosedStatus(s)) return;
      if (s === 'pending_ack') stats.awaiting += 1;
      else if (s === 'submitted') stats.review += 1;
      else if (s === 'accepted') stats.done += 1;
      else stats.working += 1;
    });
    return stats;
  }
  function statusLabel(status) {
    return ({
      pending_ack:'Awaiting', acknowledged:'Acknowledged', in_progress:'In Progress',
      submitted:'Review Required', needs_review:'Changes Required', accepted:'Completed',
      transferred:'Transferred', cancelled:'Cancelled', mixed:'Mixed Progress', empty:'No Active Assignees'
    })[status] || 'In Progress';
  }
  function statusStyle(status) {
    return ({
      pending_ack:['#fff7ed','#c2410c','#fb923c'], acknowledged:['#eff6ff','#1d4ed8','#60a5fa'],
      in_progress:['#eef2ff','#4338ca','#818cf8'], submitted:['#fdf4ff','#a21caf','#d946ef'],
      needs_review:['#fef2f2','#b91c1c','#ef4444'], accepted:['#f0fdf4','#166534','#22c55e'],
      mixed:['#faf5ff','#7e22ce','#a855f7'], empty:['#f8fafc','#64748b','#cbd5e1']
    })[status] || ['#faf5ff','#7e22ce','#a855f7'];
  }
  function deadlineText(task) {
    if (!task?.deadline) return 'No deadline';
    try {
      return window.getISTDate ? window.getISTDate(task.deadline) :
        new Date(task.deadline).toLocaleDateString('en-IN',{day:'2-digit',month:'short'});
    } catch (_) { return String(task.deadline); }
  }
  function isOverdue(task) {
    if (!task?.deadline || taskState(task) === 'accepted') return false;
    const d = new Date(task.deadline);
    if (Number.isNaN(d.getTime())) return false;
    d.setHours(23,59,59,999);
    return d < new Date();
  }
  function currentAssignment(task) {
    return (task.assignees || []).find(a =>
      a.assignee_id === window.currentUser?.id && !isClosedStatus(effectiveStatus(a))
    ) || null;
  }
  function isCreator(task) { return task.assigned_by === window.currentUser?.id; }

  function decodeTrail(comment) {
    const value = String(comment || '');
    if (!value.startsWith(RICH_PREFIX)) return esc(value);
    const template = document.createElement('template');
    template.innerHTML = value.slice(RICH_PREFIX.length);
    const allowed = new Set(['P','DIV','BR','STRONG','B','EM','I','U','UL','OL','LI']);
    const walk = node => [...node.childNodes].forEach(child => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (!allowed.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        return;
      }
      [...child.attributes].forEach(attr => child.removeAttribute(attr.name));
      walk(child);
    });
    walk(template.content);
    return template.innerHTML;
  }
  function plainTrail(comment) {
    const value = String(comment || '');
    const html = value.startsWith(RICH_PREFIX) ? decodeTrail(value) : esc(value);
    const div = document.createElement('div');
    div.innerHTML = html;
    let text = (div.textContent || '').trim();
    if (/^[^|]+\|tasks\//.test(text)) text = text.split('|')[0];
    return text;
  }

  async function loadTaskData(force=false) {
    const sb = client(), tid = window.currentTenantId, uid = window.currentUser?.id;
    if (!sb || !tid || !uid) return [];
    if (!force && state.tasks.length && Date.now() - state.loadedAt < 5000) return state.tasks;
    if (state.loading) return state.loading;

    state.loading = (async () => {
      const { data: rawTasks, error } = await sb.from('tasks').select('*').eq('tenant_id',tid)
        .order('created_at',{ascending:false}).limit(300);
      if (error) throw error;

      const ids = (rawTasks || []).map(t => t.id).filter(Boolean);
      let assignees=[], trails=[];
      if (ids.length) {
        const [aRes,tRes] = await Promise.all([
          sb.from('task_assignees').select('*').eq('tenant_id',tid).in('task_id',ids),
          sb.from('task_trails').select('*').eq('tenant_id',tid).in('task_id',ids)
            .order('created_at',{ascending:false}).limit(1200),
        ]);
        if (aRes.error) throw aRes.error;
        if (tRes.error) throw tRes.error;
        assignees=aRes.data||[];
        trails=tRes.data||[];
      }
      const aMap=new Map(), tMap=new Map();
      assignees.forEach(a => {
        if(!aMap.has(a.task_id)) aMap.set(a.task_id,[]);
        aMap.get(a.task_id).push(a);
      });
      trails.forEach(t => {
        if(!tMap.has(t.task_id)) tMap.set(t.task_id,[]);
        tMap.get(t.task_id).push(t);
      });

      const tasks=(rawTasks||[])
        .map(t => ({...t,assignees:aMap.get(t.id)||[],trails:tMap.get(t.id)||[]}))
        .filter(t => t.assigned_by===uid || t.assignees.some(a=>a.assignee_id===uid));

      state.tasks=tasks;
      state.byId=new Map(tasks.map(t=>[String(t.id),t]));
      state.byMessage=new Map(tasks.filter(t=>t.original_message_id).map(t=>[String(t.original_message_id),t]));
      state.loadedAt=Date.now();
      return tasks;
    })().catch(error => {
      console.error('[desktop-workspace-v8] task load failed',error);
      return state.tasks;
    }).finally(() => { state.loading=null; });

    return state.loading;
  }

  function actionButtons(task) {
    const out=[], mine=currentAssignment(task), s=effectiveStatus(mine);
    if (mine) {
      if (s==='pending_ack') out.push(['ack','Acknowledge']);
      if (s==='acknowledged') out.push(['start','Start Work']);
      if (s==='in_progress'||s==='needs_review') {
        out.push(['update','Update'],['upload','Upload'],['delegate','Delegate'],
          ['extension','Extension'],['submit',s==='needs_review'?'Resubmit':'Submit']);
      }
    }
    if (isCreator(task)) {
      if ((task.assignees||[]).some(a=>effectiveStatus(a)==='pending_ack')) out.push(['remind','Remind']);
      out.push(['deadline','Deadline']);
      if ((task.assignees||[]).some(a=>!isClosedStatus(effectiveStatus(a))&&effectiveStatus(a)!=='accepted')) {
        out.push(['transfer','Transfer']);
      }
      if (taskState(task)!=='accepted') out.push(['cancel','Cancel']);
    }
    out.push(['replies','Replies']);
    return out;
  }

  function peopleHtml(task) {
    const creator=isCreator(task);
    return (task.assignees||[]).filter(a=>!isClosedStatus(effectiveStatus(a))).map(a=>{
      const s=effectiveStatus(a), name=userName(a.assignee_id), d=designation(a.assignee_id,null), controls=[];
      if (creator&&s==='submitted') {
        controls.push(
          `<button data-v8-direct="accept" data-task-id="${esc(task.id)}" data-assignee-id="${esc(a.assignee_id)}">Approve</button>`,
          `<button data-v8-action="return" data-task-id="${esc(task.id)}" data-assignee-id="${esc(a.assignee_id)}">Return</button>`
        );
      }
      if (creator&&s==='pending_ack') {
        controls.push(`<button data-v8-direct="remind-one" data-task-id="${esc(task.id)}" data-assignee-id="${esc(a.assignee_id)}">Remind</button>`);
      }
      if (creator&&!['accepted','cancelled','transferred'].includes(s)) {
        controls.push(`<button data-v8-action="transfer" data-task-id="${esc(task.id)}" data-assignee-id="${esc(a.assignee_id)}">Transfer</button>`);
      }
      return `<div class="nfa-v8-person">
        <span class="nfa-v8-avatar">${esc(name.charAt(0).toUpperCase())}</span>
        <span class="nfa-v8-person-name">${esc(name)}${d?` · ${esc(d)}`:''}</span>
        <span class="nfa-v8-person-state">${esc(statusLabel(s))}</span>
      </div>${controls.length?`<div class="nfa-v8-person-actions">${controls.join('')}</div>`:''}`;
    }).join('') || '<div class="nfa-v8-muted">No active assignees.</div>';
  }

  function taskMessageHtml(task) {
    const s=taskState(task), stats=taskStats(task), st=statusStyle(s), open=state.openTaskId===String(task.id);
    return `<section class="nfa-task-message-v8 ${open?'nfa-open':''} ${s==='accepted'?'nfa-completed':''}" data-v8-task-message="${esc(task.id)}">
      <button class="nfa-v8-task-summary" data-v8-toggle-task="${esc(task.id)}" aria-expanded="${open}">
        <div class="nfa-v8-task-summary-top">
          <div>
            <div class="nfa-v8-task-kicker"><span class="nfa-v8-task-pill">TASK</span></div>
            <div class="nfa-v8-task-title">${esc(task.title||'Task')}</div>
            <div class="nfa-v8-task-meta">Due ${esc(deadlineText(task))} · ${esc(String(task.priority||'Normal'))} priority · ${(task.assignees||[]).length} assignee(s)</div>
          </div>
          <span class="nfa-v8-status" style="background:${st[0]};color:${st[1]};border-color:${st[2]};">${esc(statusLabel(s))}</span>
        </div>
        <div class="nfa-v8-stats">
          <div><b>${stats.awaiting}</b><span>Awaiting</span></div>
          <div><b>${stats.working}</b><span>Working</span></div>
          <div><b>${stats.review}</b><span>Review</span></div>
          <div><b>${stats.done}</b><span>Done</span></div>
        </div>
      </button>
      <div class="nfa-v8-task-expanded">
        <div class="nfa-v8-action-strip">${actionButtons(task).map(([k,l]) =>
          `<button class="${k==='cancel'?'nfa-danger':''}" data-v8-action="${k}" data-task-id="${esc(task.id)}">${esc(l)}</button>`
        ).join('')}</div>
        <div class="nfa-v8-reply-hint"><i class="ti ti-message-2"></i> Updates, files and task events appear in Replies.</div>
        <div class="nfa-v8-task-section"><div class="nfa-v8-section-title">Assignees</div>${peopleHtml(task)}</div>
        <div class="nfa-v8-inline-action-host" data-v8-action-host="${esc(task.id)}"></div>
      </div>
    </section>`;
  }

  function pdfSafe(value) {
    return String(value || '').normalize('NFKD')
      .replace(/[^\x20-\x7E]/g,'?')
      .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }
  function wrapPdfText(text, width=88) {
    const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
    if (!words.length) return [''];
    const lines=[]; let line='';
    words.forEach(word => {
      if (!line) line=word;
      else if ((line+' '+word).length<=width) line+=' '+word;
      else { lines.push(line); line=word; }
    });
    if (line) lines.push(line);
    return lines;
  }
  function makePdf(lines) {
    const pageSize=48, pages=[];
    for(let i=0;i<lines.length;i+=pageSize) pages.push(lines.slice(i,i+pageSize));
    if(!pages.length) pages.push(['No task activity.']);

    const objects={};
    objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
    objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    const kids=[];
    pages.forEach((page,index)=>{
      const pageObj=4+index*2, contentObj=pageObj+1;
      kids.push(`${pageObj} 0 R`);
      const commands=['BT','/F1 10 Tf','45 800 Td','13 TL'];
      page.forEach((line,i)=>{
        commands.push(`(${pdfSafe(line)}) Tj`);
        if(i<page.length-1) commands.push('T*');
      });
      commands.push('ET');
      const stream=commands.join('\n');
      objects[pageObj]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
      objects[contentObj]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;

    const max=Math.max(...Object.keys(objects).map(Number));
    let pdf='%PDF-1.4\n';
    const offsets=[0];
    for(let i=1;i<=max;i++){
      offsets[i]=pdf.length;
      pdf+=`${i} 0 obj\n${objects[i]||'<< >>'}\nendobj\n`;
    }
    const xref=pdf.length;
    pdf+=`xref\n0 ${max+1}\n0000000000 65535 f \n`;
    for(let i=1;i<=max;i++) pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    pdf+=`trailer\n<< /Size ${max+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf],{type:'application/pdf'});
  }
  function downloadTaskTrailPdf(taskId) {
    const task=state.byId.get(String(taskId));
    if(!task) return toast('Task is not available.','fa-solid fa-circle-exclamation','text-yellow-500');
    const lines=[];
    lines.push('NOTED FOR ACTION - TASK TRAIL');
    lines.push('');
    lines.push(`Task: ${task.title||'Task'}`);
    lines.push(`Status: ${statusLabel(taskState(task))}`);
    lines.push(`Created by: ${userName(task.assigned_by)}`);
    lines.push(`Due: ${deadlineText(task)}`);
    lines.push(`Priority: ${String(task.priority||'Normal')}`);
    lines.push('');
    lines.push('Assignees:');
    (task.assignees||[]).forEach(a => lines.push(`- ${userName(a.assignee_id)} - ${statusLabel(effectiveStatus(a))}`));
    lines.push('');
    lines.push('Task trail:');
    const events=[...(task.trails||[])].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    events.forEach((event,index)=>{
      let when='';
      try { when=event.created_at?new Date(event.created_at).toLocaleString('en-IN'):''; } catch(_){}
      const head=`${index+1}. ${when} - ${userName(event.user_id)} - ${String(event.action||'UPDATE').replaceAll('_',' ')}`;
      lines.push(...wrapPdfText(head));
      const comment=plainTrail(event.comment||'');
      if(comment) lines.push(...wrapPdfText('   '+comment));
    });
    const blob=makePdf(lines);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`${String(task.title||'task').replace(/[^a-z0-9_-]+/gi,'_').slice(0,50)}_task_trail.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  window.nfaDownloadTaskTrailPdf=downloadTaskTrailPdf;

  function ensureConversationMode() {
    const messages=document.getElementById('messagesContainer'), shell=document.getElementById('chatShellContainer');
    if (!messages||!shell) return false;
    let sw=document.getElementById('nfaConversationModeV8');
    if (!sw) {
      sw=document.createElement('div');
      sw.id='nfaConversationModeV8';
      sw.setAttribute('role','tablist');
      sw.innerHTML='<button data-v8-room-mode="chat">Chat</button><button data-v8-room-mode="tasks">Tasks</button>';
      messages.insertBefore(sw,shell);
      sw.addEventListener('click',e=>{
        const b=e.target.closest('[data-v8-room-mode]');
        if(!b) return;
        state.roomMode=b.dataset.v8RoomMode==='tasks'?'tasks':'chat';
        applyRoomMode();
      });
    }
    let empty=document.getElementById('nfaConversationTaskEmptyV8');
    if(!empty){
      empty=document.createElement('div');
      empty.id='nfaConversationTaskEmptyV8';
      empty.textContent='No task messages in this conversation.';
      shell.appendChild(empty);
    }
    return true;
  }

  function applyRoomMode() {
    const messages=document.getElementById('messagesContainer'), sw=document.getElementById('nfaConversationModeV8');
    if(!messages||!sw) return;
    sw.querySelectorAll('[data-v8-room-mode]').forEach(b=>
      b.classList.toggle('nfa-active',b.dataset.v8RoomMode===state.roomMode)
    );
    const taskCount=messages.querySelectorAll('.row-sent.nfa-has-task-v8,.row-rcvd.nfa-has-task-v8').length;
    const taskBtn=sw.querySelector('[data-v8-room-mode="tasks"]');
    if(taskBtn) taskBtn.textContent=`Tasks ${taskCount}`;
    messages.classList.toggle('nfa-v8-conversation-tasks',state.roomMode==='tasks');
    messages.classList.toggle('nfa-v8-no-room-tasks',state.roomMode==='tasks'&&taskCount===0);
  }

  function lockConvertedMessageChrome(task,messageId,row) {
    const bubble=row?.querySelector('.bubble');
    if(!bubble) return;
    const menu=bubble.querySelector('.menu-wrap');
    if(menu){
      const dot=menu.querySelector('.dot-btn');
      const dropdown=menu.querySelector('.bubble-dropdown');
      if(dot){dot.style.display='none';dot.disabled=true;dot.dataset.nfaV8TaskHidden='1';}
      if(dropdown) dropdown.style.display='none';
      let actions=menu.querySelector('.nfa-v8-task-header-actions');
      if(!actions){
        actions=document.createElement('div');
        actions.className='nfa-v8-task-header-actions';
        menu.appendChild(actions);
      }
      actions.innerHTML=`
        <button type="button" data-v8-task-reminder="${esc(messageId)}" title="Reminder" aria-label="Reminder"><i class="ti ti-bell"></i></button>
        <button type="button" data-v8-task-pdf="${esc(task.id)}" title="Download Task Trail PDF" aria-label="Download Task Trail PDF"><i class="fa-solid fa-file-pdf"></i></button>`;
    }
  }

  function resetConvertedMessageChrome() {
    document.querySelectorAll('.nfa-v8-task-header-actions').forEach(node=>node.remove());
    document.querySelectorAll('.dot-btn[data-nfa-v8-task-hidden="1"]').forEach(dot=>{
      dot.style.removeProperty('display');
      dot.disabled=false;
      delete dot.dataset.nfaV8TaskHidden;
    });
    document.querySelectorAll('.bubble-dropdown').forEach(dd=>dd.style.removeProperty('display'));
  }

  function decorateCurrentConversation() {
    if (!isDesktop()) return;
    ensureConversationMode();
    resetConvertedMessageChrome();
    document.querySelectorAll('#messagesContainer .row-sent,#messagesContainer .row-rcvd')
      .forEach(r=>r.classList.remove('nfa-has-task-v8'));
    document.querySelectorAll('.nfa-task-message-v8').forEach(n=>n.remove());

    state.byMessage.forEach((task,messageId)=>{
      const row=document.getElementById(`row-${messageId}`);
      const bubble=row?.querySelector('.bubble');
      if(!row||!bubble) return;
      row.classList.add('nfa-has-task-v8');

      const wrap=document.createElement('div');
      wrap.innerHTML=taskMessageHtml(task);
      const node=wrap.firstElementChild;
      node.style.setProperty('--nfa-v8-bubble-bg',getComputedStyle(bubble).backgroundColor||'var(--bg-sidebar,#fff)');
      const footer=bubble.querySelector('.b-footer');
      if(footer) footer.before(node);
      else bubble.appendChild(node);

      lockConvertedMessageChrome(task,messageId,row);
    });
    bindTaskEvents();
    hydrateMessageIdentities(window._roomMsgs||[]);
    applyRoomMode();
  }

  function toggleTaskReplies(task) {
    const mid=cleanId(task?.original_message_id);
    if(!mid) return false;
    const wrap=document.getElementById(`rw-${mid}`);
    if(!wrap){
      toast('No task replies yet.','fa-solid fa-message','text-slate-500');
      return false;
    }
    const open=!state.openReplies.has(mid);
    if(open) state.openReplies.add(mid);
    else state.openReplies.delete(mid);
    wrap.style.display=open?'flex':'none';
    if(open) requestAnimationFrame(()=>wrap.scrollIntoView({behavior:'smooth',block:'nearest'}));
    return true;
  }

  function bindTaskEvents() {
    document.querySelectorAll('[data-v8-toggle-task]').forEach(b=>b.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      const id=cleanId(b.dataset.v8ToggleTask);
      state.openTaskId=state.openTaskId===id?'':id;
      decorateCurrentConversation();
    });
    document.querySelectorAll('[data-v8-action]').forEach(b=>b.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      runTaskAction(b.dataset.v8Action,b.dataset.taskId,b.dataset.assigneeId||'');
    });
    document.querySelectorAll('[data-v8-direct]').forEach(b=>b.onclick=e=>{
      e.preventDefault(); e.stopPropagation();
      runDirect(b.dataset.v8Direct,b.dataset.taskId,b.dataset.assigneeId||'');
    });
    document.querySelectorAll('[data-v8-task-reminder]').forEach(b=>b.onclick=e=>{
      e.preventDefault();e.stopPropagation();
      const messageId=cleanId(b.dataset.v8TaskReminder);
      const row=document.getElementById(`row-${messageId}`);
      const snippet=row?.querySelector('.b-text')?.textContent?.trim()||'Task reminder';
      window.showReminderModal?.(messageId,snippet);
    });
    document.querySelectorAll('[data-v8-task-pdf]').forEach(b=>b.onclick=e=>{
      e.preventDefault();e.stopPropagation();
      downloadTaskTrailPdf(b.dataset.v8TaskPdf);
    });
  }

  function restoreActionPanel() {
    const layer=document.getElementById('ntTaskActionLayer');
    const panel=state.actionPanel||document.querySelector('.nfa-v8-inline-panel');
    if(panel&&layer&&panel.parentElement!==layer){
      panel.classList.remove('nfa-v8-inline-panel');
      panel.setAttribute('role','dialog');
      panel.setAttribute('aria-modal','true');
      layer.appendChild(panel);
    }
    layer?.classList.remove('nfa-v8-inline-layer');
    state.actionPanel=null;
    state.actionTaskId='';
    document.body.style.overflow='';
  }

  function mountActionPanel(taskId, attempt=0) {
    const id=cleanId(taskId);
    const layer=document.getElementById('ntTaskActionLayer');
    const panel=layer?.querySelector('.nt-action-panel')||state.actionPanel;
    const host=document.querySelector(`[data-v8-action-host="${CSS.escape(id)}"]`);
    if(!id||!layer||!panel||!host||!layer.classList.contains('nt-open')){
      if(attempt<8) requestAnimationFrame(()=>mountActionPanel(id,attempt+1));
      return false;
    }
    restoreActionPanel();
    state.actionTaskId=id;
    state.actionPanel=panel;
    layer.classList.add('nfa-v8-inline-layer');
    panel.classList.add('nfa-v8-inline-panel');
    panel.setAttribute('role','region');
    panel.setAttribute('aria-modal','false');
    host.replaceChildren(panel);
    document.body.style.overflow='';
    requestAnimationFrame(()=>panel.querySelector('textarea,input,select,[contenteditable="true"]')?.focus?.({preventScroll:true}));
    return true;
  }

  function invokePanel(name,taskId,assigneeId) {
    const owner=window[name];
    if(typeof owner!=='function') return false;
    const args=assigneeId?[taskId,assigneeId]:[taskId];
    const result=owner.apply(window,args);
    requestAnimationFrame(()=>mountActionPanel(taskId));
    Promise.resolve(result).finally(()=>requestAnimationFrame(()=>mountActionPanel(taskId)));
    return result;
  }

  async function runDirect(kind,taskId,assigneeId){
    try{
      const task=state.byId.get(String(taskId));
      if(task?.original_message_id) state.openReplies.add(String(task.original_message_id));
      if(kind==='accept') await window.taskAction?.(taskId,assigneeId,'accept');
      if(kind==='remind-one') await window.sendTaskReminder?.(taskId,assigneeId);
      await refreshTasks(true);
    }catch(e){
      console.error('[desktop-workspace-v8] direct action failed',e);
    }
  }

  async function directTaskAction(taskId,assigneeId,action,proof=false){
    try{
      const task=state.byId.get(String(taskId));
      if(task?.original_message_id) state.openReplies.add(String(task.original_message_id));
      await window.taskAction?.(taskId,assigneeId,action,proof);
      await refreshTasks(true);
    }catch(e){
      console.error('[desktop-workspace-v8] task action failed',e);
    }
  }

  function runTaskAction(action,taskId,assigneeId){
    const task=state.byId.get(String(taskId));
    if(!task) return;
    if(action==='replies') return toggleTaskReplies(task);
    const mine=currentAssignment(task);
    const mineId=mine?.assignee_id||window.currentUser?.id||'';
    if(task.original_message_id) state.openReplies.add(String(task.original_message_id));
    if(action==='ack') return directTaskAction(taskId,mineId,'ack');
    if(action==='start') return directTaskAction(taskId,mineId,'start');
    if(action==='submit') return directTaskAction(taskId,mineId,'submit',Boolean(task.require_proof));
    if(action==='update') return invokePanel('openTaskUpdateAction',taskId,mineId);
    if(action==='upload') return invokePanel('openTaskUploadAction',taskId,mineId);
    if(action==='delegate') return invokePanel('openTaskDelegateAction',taskId,mineId);
    if(action==='extension') return invokePanel('openTaskExtensionRequest',taskId,mineId);
    if(action==='return') return invokePanel('openTaskReturnAction',taskId,assigneeId);
    if(action==='transfer') return invokePanel('openTaskTransferAction',taskId,assigneeId||mineId);
    if(action==='deadline') return invokePanel('openTaskDeadlineAction',taskId,'');
    if(action==='cancel') return invokePanel('openTaskCancelAction',taskId,'');
    if(action==='remind') return remindPending(task);
  }

  async function remindPending(task){
    if(task.original_message_id) state.openReplies.add(String(task.original_message_id));
    for(const a of (task.assignees||[]).filter(x=>effectiveStatus(x)==='pending_ack')) {
      await window.sendTaskReminder?.(task.id,a.assignee_id);
    }
    await refreshTasks(true);
  }

  function normalizeCreateTaskLabels(card) {
    if(!card) return;
    const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const text=node.nodeValue||'';
      if(/create\s+ticket/i.test(text)) node.nodeValue=text.replace(/create\s+ticket/ig,'Create Task');
    });
    card.classList.add('nfa-v8-create-task-card');
  }

  function restoreCreateCard() {
    const modal=document.getElementById('taskModal');
    const card=state.createCard||document.querySelector('.nfa-v8-inline-create-card');
    if(card&&modal&&card.parentElement!==modal){
      card.classList.remove('nfa-v8-inline-create-card','nfa-v8-create-task-card');
      modal.appendChild(card);
    }
    document.querySelectorAll('.nfa-v8-create-host').forEach(h=>h.remove());
    state.createCard=null;
    state.createMessageId='';
    document.body.style.overflow='';
  }

  async function openInlineTaskCreate(messageId,messageText) {
    const id=cleanId(messageId);
    if(!id) return false;
    const existing=state.byMessage.get(id);
    if(existing){
      state.openTaskId=String(existing.id);
      decorateCurrentConversation();
      return true;
    }
    restoreActionPanel();
    restoreCreateCard();

    const owner=state.createOwner||window.openTaskModal;
    if(typeof owner!=='function') return false;
    const result=await owner.call(window,id,messageText||'');
    const modal=document.getElementById('taskModal');
    if(!modal||modal.classList.contains('hidden')) return result;

    const row=document.getElementById(`row-${id}`);
    const bubble=row?.querySelector('.bubble');
    if(!bubble) return result;
    const card=modal.firstElementChild;
    if(!card) return result;

    normalizeCreateTaskLabels(card);
    const host=document.createElement('div');
    host.className='nfa-v8-create-host';
    host.dataset.v8CreateHost=id;
    host.style.setProperty('--nfa-v8-bubble-bg',getComputedStyle(bubble).backgroundColor||'var(--bg-sidebar,#fff)');
    const footer=bubble.querySelector('.b-footer');
    if(footer) footer.before(host);
    else bubble.appendChild(host);

    state.createMessageId=id;
    state.createCard=card;
    card.classList.add('nfa-v8-inline-create-card');
    host.appendChild(card);
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow='';
    requestAnimationFrame(()=>document.getElementById('taskTitle')?.focus?.({preventScroll:true}));
    return result;
  }

  function installCreateOwners() {
    if(!state.createOwner&&typeof window.openTaskModal==='function') state.createOwner=window.openTaskModal;
    if(!state.closeCreateOwner&&typeof window.closeTaskModal==='function') state.closeCreateOwner=window.closeTaskModal;
    if(!state.saveCreateOwner&&typeof window.saveTaskMultiAssignee==='function') state.saveCreateOwner=window.saveTaskMultiAssignee;
    if(!state.createOwner||!state.closeCreateOwner||!state.saveCreateOwner) return false;

    if(!window.openTaskModal.__nfaV8){
      const fn=function(messageId,messageText){
        const id=cleanId(messageId);
        if(id&&document.getElementById(`row-${id}`)) return openInlineTaskCreate(id,messageText);
        return state.createOwner.apply(this,arguments);
      };
      fn.__nfaV8=true;
      window.openTaskModal=fn;
    }
    if(!window.closeTaskModal.__nfaV8){
      const fn=function(){
        restoreCreateCard();
        const r=state.closeCreateOwner.apply(this,arguments);
        requestAnimationFrame(()=>refreshTasks(true));
        return r;
      };
      fn.__nfaV8=true;
      window.closeTaskModal=fn;
    }
    if(!window.saveTaskMultiAssignee.__nfaV8){
      const fn=async function(){
        const r=await state.saveCreateOwner.apply(this,arguments);
        state.loadedAt=0;
        await refreshTasks(true);
        return r;
      };
      fn.__nfaV8=true;
      window.saveTaskMultiAssignee=fn;
    }
    return true;
  }

  async function refreshTasks(force=true){
    await loadTaskData(force);
    decorateCurrentConversation();
    if(document.getElementById('nfaTaskLensV8')?.classList.contains('nfa-open')) renderLens();
  }

  function summaryCounts(){
    const c={total:state.tasks.length,pending:0,working:0,review:0,overdue:0,completed:0};
    state.tasks.forEach(t=>{
      const s=taskState(t);
      if(s==='accepted') c.completed++;
      else if(s==='submitted') c.review++;
      else if(s==='pending_ack'||s==='acknowledged') c.pending++;
      else c.working++;
      if(isOverdue(t)) c.overdue++;
    });
    return c;
  }
  function needsMyAction(task){
    const mine=currentAssignment(task);
    if(mine&&['pending_ack','acknowledged','in_progress','needs_review'].includes(effectiveStatus(mine))) return true;
    if(isCreator(task)&&(task.assignees||[]).some(a=>effectiveStatus(a)==='submitted')) return true;
    return false;
  }
  function lensTasks(){
    const uid=window.currentUser?.id;
    return state.tasks.filter(t=>{
      if(state.lensFilter==='all') return true;
      if(state.lensFilter==='needs') return needsMyAction(t);
      if(state.lensFilter==='to-me') return (t.assignees||[]).some(a=>a.assignee_id===uid&&!isClosedStatus(effectiveStatus(a)));
      if(state.lensFilter==='by-me') return isCreator(t);
      if(state.lensFilter==='due') return isOverdue(t);
      if(state.lensFilter==='completed') return taskState(t)==='accepted';
      return true;
    });
  }
  function ensureLens(){
    const host=document.querySelector('.chat-area');
    if(!host) return null;
    host.classList.add('nfa-v8-lens-host');
    let lens=document.getElementById('nfaTaskLensV8');
    if(!lens){
      lens=document.createElement('section');
      lens.id='nfaTaskLensV8';
      lens.innerHTML='<header class="nfa-v8-lens-head"><div><h2>Task Lens</h2><p>Track what needs attention across conversations</p></div><button data-v8-close-lens>Back to Chat</button></header><div class="nfa-v8-lens-summary"></div><div class="nfa-v8-lens-filters"></div><div class="nfa-v8-lens-list"></div>';
      host.appendChild(lens);
      lens.addEventListener('click',e=>{
        if(e.target.closest('[data-v8-close-lens]')) return closeLens();
        const f=e.target.closest('[data-v8-lens-filter]');
        if(f){state.lensFilter=f.dataset.v8LensFilter;renderLens();return;}
        const card=e.target.closest('[data-v8-lens-task]');
        if(card) openTaskFromLens(card.dataset.v8LensTask);
      });
    }
    return lens;
  }
  function renderLens(){
    const lens=ensureLens();
    if(!lens) return;
    const c=summaryCounts();
    lens.querySelector('.nfa-v8-lens-summary').innerHTML=
      `<div><b>${c.total}</b><span>All</span></div><div><b>${c.pending}</b><span>Pending</span></div><div><b>${c.working}</b><span>Working</span></div><div><b>${c.review}</b><span>Review</span></div><div><b>${c.overdue}</b><span>Overdue</span></div><div><b>${c.completed}</b><span>Completed</span></div>`;
    const filters=[['all','All'],['needs','Needs My Action'],['to-me','Assigned to Me'],['by-me','Assigned by Me'],['due','Due / Overdue'],['completed','Completed']];
    lens.querySelector('.nfa-v8-lens-filters').innerHTML=filters.map(([k,l])=>
      `<button class="${state.lensFilter===k?'nfa-active':''}" data-v8-lens-filter="${k}">${l}</button>`
    ).join('');

    const tasks=lensTasks();
    lens.querySelector('.nfa-v8-lens-list').innerHTML=tasks.length?tasks.map(t=>{
      const s=taskState(t),st=statusStyle(s);
      return `<article class="nfa-v8-lens-card" data-v8-lens-task="${esc(t.id)}">
        <div>
          <div class="nfa-v8-lens-source"><span class="nfa-v8-task-pill">TASK</span><span>${t.original_message_id?'Original conversation':'Task record'}</span></div>
          <div class="nfa-v8-lens-title">${esc(t.title||'Task')}</div>
          <div class="nfa-v8-lens-meta">Created by ${esc(userName(t.assigned_by))} · Due ${esc(deadlineText(t))} · ${(t.assignees||[]).length} assignee(s)</div>
        </div>
        <span class="nfa-v8-status" style="background:${st[0]};color:${st[1]};border-color:${st[2]};">${esc(statusLabel(s))}</span>
      </article>`;
    }).join(''):'<div class="nfa-v8-lens-empty">No tasks in this filter.</div>';
  }
  async function openLens(filter='all'){
    state.lensFilter=filter||'all';
    await loadTaskData(false);
    renderLens();
    ensureLens()?.classList.add('nfa-open');
    setRailActive('tasks');
  }
  function closeLens(){
    document.getElementById('nfaTaskLensV8')?.classList.remove('nfa-open');
    setRailActive('chat');
  }
  function setRailActive(action){
    const rail=document.getElementById('nfaDesktopRail');
    rail?.querySelectorAll('.nfa-rail-button[data-nfa-action]').forEach(b=>{
      if(b.dataset.nfaAction==='activity'&&document.getElementById('activityFeedPanel')) return;
      b.classList.toggle('nfa-active',b.dataset.nfaAction===action);
    });
  }

  async function markNotifOnce(notifId){
    const id=cleanId(notifId);
    if(!id) return;
    try{await window.markNotifRead?.(id);}catch(_){}
  }
  async function fetchMessageInfo(messageId){
    const sb=client(),id=cleanId(messageId);
    if(!sb||!id) return null;
    const {data}=await sb.from('messages')
      .select('id,room_id,created_at,parent_message_id')
      .eq('tenant_id',window.currentTenantId)
      .eq('id',id).maybeSingle();
    return data||null;
  }
  async function resolveRoomName(roomId){
    if(!roomId) return '';
    if(roomId.startsWith('dm_')){
      const raw=roomId.slice(3);
      const u=(window.globalUsersCache||[]).find(x=>x.id!==window.currentUser?.id&&raw.includes(x.id));
      return u?.full_name||u?.email?.split('@')[0]||'Direct Message';
    }
    const tid=window.currentTenantId||'';
    const keys=[`${tid}_dept_name_${roomId}`,`dept_name_${roomId}`];
    for(const k of keys){
      const v=localStorage.getItem(k);
      if(v&&v!==roomId) return v;
    }
    try{
      const {data}=await client()?.from('room_settings').select('name')
        .eq('tenant_id',tid).eq('room_id',roomId).maybeSingle();
      if(data?.name){
        keys.forEach(k=>{try{localStorage.setItem(k,data.name);}catch(_){}});
        return data.name;
      }
    }catch(_){}
    return String(roomId).replace(/^grp_/,'').replace(/_[a-z0-9]{6,}$/i,'')
      .replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }
  async function switchRoomForNavigation(roomId,seq){
    if(!roomId||roomId===window.currentRoom) return;
    window.currentRoom=roomId;
    try{localStorage.setItem('mpgs_current_room',roomId);}catch(_){}
    const title=document.getElementById('roomTitleDisplay');
    if(title) title.textContent=await resolveRoomName(roomId);
    if(seq!==state.navSeq) return;
    window.loadChatsList?.();
  }
  async function ensureTargetContext(info,seq){
    const id=String(info.id), parentId=cleanId(info.parent_message_id);
    const existing=document.getElementById(`row-${parentId||id}`)||
      document.querySelector(`[data-nfa-reply-id="${CSS.escape(id)}"]`);
    if(existing) return;
    const sb=client();
    if(!sb||seq!==state.navSeq) return;

    const exactIds=[id,parentId].filter(Boolean);
    let exact=[];
    if(exactIds.length){
      const {data}=await sb.from('messages').select('*')
        .eq('tenant_id',window.currentTenantId).in('id',exactIds);
      exact=data||[];
    }
    const anchor=exact.find(m=>String(m.id)===parentId)||exact.find(m=>String(m.id)===id)||info;
    const before=await sb.from('messages').select('*').eq('tenant_id',window.currentTenantId)
      .eq('room_id',info.room_id).is('deleted_at',null).lte('created_at',anchor.created_at)
      .order('created_at',{ascending:false}).limit(24);
    const after=await sb.from('messages').select('*').eq('tenant_id',window.currentTenantId)
      .eq('room_id',info.room_id).is('deleted_at',null).gt('created_at',anchor.created_at)
      .order('created_at',{ascending:true}).limit(24);
    if(seq!==state.navSeq) return;

    const map=new Map();
    [...(window._roomMsgs||[]),...exact,...(before.data||[]),...(after.data||[])].forEach(m=>{
      if(m?.id) map.set(String(m.id),m);
    });
    const users=new Map((window.globalUsersCache||[]).map(u=>[u.id,u]));
    const merged=[...map.values()]
      .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at))
      .map(m=>({...m,profiles:{...(m.profiles||{}),...(users.get(m.sender_id)||{})}}));
    window._roomMsgs=merged;
    window._oldestMsgTs=merged[0]?.created_at||null;
    window._allMsgsLoaded=false;
    window._prevRenderedIds=merged.map(m=>m.id).join(',');
    state.renderOwner?.call(window,merged);
    hydrateMessageIdentities(merged);
    await loadTaskData(false);
    decorateCurrentConversation();
  }
  function renderedTarget(info){
    const id=String(info.id), parentId=cleanId(info.parent_message_id);
    if(parentId){
      state.openReplies.add(parentId);
      const wrap=document.getElementById(`rw-${parentId}`);
      if(wrap) wrap.style.display='flex';
      const reply=document.querySelector(`[data-nfa-reply-id="${CSS.escape(id)}"]`);
      if(reply) return reply;
    }
    return document.getElementById(`row-${parentId||id}`);
  }
  async function settleMedia(container){
    const pending=[...container.querySelectorAll('.b-text img,.reply-text img')]
      .filter(img=>!img.complete).slice(0,30);
    if(!pending.length) return;
    await Promise.race([
      Promise.allSettled(pending.map(img=>img.decode?img.decode().catch(()=>{}):
        new Promise(r=>{
          img.addEventListener('load',r,{once:true});
          img.addEventListener('error',r,{once:true});
        })
      )),
      sleep(450)
    ]);
  }
  function scrollAndHighlightOnce(target){
    const container=document.getElementById('messagesContainer');
    if(!container||!target) return false;
    document.querySelectorAll('.nfa-v8-nav-highlight').forEach(n=>n.classList.remove('nfa-v8-nav-highlight'));
    const c=container.getBoundingClientRect(),t=target.getBoundingClientRect();
    const top=Math.max(0,Math.min(
      container.scrollHeight-container.clientHeight,
      container.scrollTop+(t.top-c.top)-(container.clientHeight-t.height)/2
    ));
    container.scrollTo({top,behavior:'smooth'});
    const h=target.classList.contains('bubble')?target:(target.querySelector?.('.bubble')||target);
    h.classList.add('nfa-v8-nav-highlight');
    h.addEventListener('animationend',()=>h.classList.remove('nfa-v8-nav-highlight'),{once:true});
    return true;
  }
  async function navigateToMessage(messageId,options={}){
    const id=cleanId(messageId);
    if(!id){
      toast('No message linked to this item.','fa-solid fa-info-circle','text-yellow-500');
      return false;
    }
    const key=`${id}:${cleanId(options.roomId)}:${cleanId(options.taskId)}`;
    if(state.navPromise&&state.navKey===key&&Date.now()-state.navStartedAt<1200) return state.navPromise;
    const seq=++state.navSeq;
    state.navKey=key;
    state.navStartedAt=Date.now();

    state.navPromise=(async()=>{
      await markNotifOnce(options.notifId);
      let info=await fetchMessageInfo(id);
      if(seq!==state.navSeq) return false;
      if(!info){
        toast('Message is no longer available.','fa-solid fa-circle-exclamation','text-yellow-500');
        return false;
      }
      if(options.roomId&&!info.room_id) info.room_id=options.roomId;
      closeLens();
      if(options.taskId){
        state.openTaskId=String(options.taskId);
        await loadTaskData(false);
      }
      await switchRoomForNavigation(info.room_id,seq);
      if(seq!==state.navSeq) return false;

      let target=renderedTarget(info);
      if(!target){
        window.pendingScrollId='__NFA_V8_NAV__';
        await window.loadMessages?.();
        await sleep(125);
        if(seq!==state.navSeq) return false;
        window.pendingScrollId=null;
        hydrateMessageIdentities(window._roomMsgs||[]);
        await loadTaskData(false);
        decorateCurrentConversation();
        await ensureTargetContext(info,seq);
        await nextFrame();
        await nextFrame();
        target=renderedTarget(info);
      }
      if(!target){
        toast('Message could not be rendered.','fa-solid fa-circle-exclamation','text-yellow-500');
        return false;
      }
      const container=document.getElementById('messagesContainer');
      if(container) await settleMedia(container);
      if(seq!==state.navSeq) return false;
      return scrollAndHighlightOnce(target);
    })().finally(()=>{
      if(seq===state.navSeq){
        state.navPromise=null;
        state.navKey='';
      }
    });
    return state.navPromise;
  }

  async function openTaskFromLens(taskId,notifId){
    await loadTaskData(false);
    const task=state.byId.get(String(taskId));
    if(!task) return false;
    if(!task.original_message_id){
      toast('This legacy task has no linked original message.','fa-solid fa-message','text-orange-500');
      return false;
    }
    state.openTaskId=String(task.id);
    state.roomMode='chat';
    return navigateToMessage(task.original_message_id,{notifId,taskId:task.id});
  }

  function installNavigationOwners(){
    window.nfaNavigateToMessage=navigateToMessage;
    window.goToMessage=function(messageId,notifId,roomId){
      return navigateToMessage(messageId,{notifId,roomId});
    };
    window.scrollToAndHighlight=function(elementId){
      const id=String(elementId||'').replace(/^row-/,'');
      return id?navigateToMessage(id,{}):false;
    };
    window.goToTask=function(taskId,notifId){return openTaskFromLens(taskId,notifId);};
    window.goToTaskNotif=function(taskId,notifId){return openTaskFromLens(taskId,notifId);};
    window._goToTaskNotif=window.goToTaskNotif;
  }

  function installReplyOwner(){
    const owner=window.toggleReplies;
    if(typeof owner!=='function') return false;
    if(owner.__nfaV8) return true;
    state.replyOwner=owner;
    const fn=function(id){
      const wrapId=String(id||'');
      const messageId=wrapId.replace(/^rw-/,'');
      const el=document.getElementById(wrapId);
      if(!el) return;
      const open=!state.openReplies.has(messageId);
      if(open) state.openReplies.add(messageId);
      else state.openReplies.delete(messageId);
      el.style.display=open?'flex':'none';
    };
    fn.__nfaV8=true;
    window.toggleReplies=fn;
    return true;
  }

  function installMessageOwners(){
    const render=window.renderMessages,load=window.loadMessages;
    if(typeof render!=='function'||typeof load!=='function') return false;
    if(!render.__nfaV8){
      state.renderOwner=render;
      const fn=function(messages){
        const r=render.apply(this,arguments);
        hydrateMessageIdentities(messages||window._roomMsgs||[]);
        loadTaskData(false).then(decorateCurrentConversation);
        return r;
      };
      fn.__nfaV8=true;
      window.renderMessages=fn;
    } else if(!state.renderOwner) state.renderOwner=render;
    if(!load.__nfaV8){
      state.loadOwner=load;
      const fn=async function(){
        const r=await load.apply(this,arguments);
        hydrateMessageIdentities(window._roomMsgs||[]);
        await loadTaskData(false);
        decorateCurrentConversation();
        return r;
      };
      fn.__nfaV8=true;
      window.loadMessages=fn;
    }
    return true;
  }

  function installActionClose(){
    const close=window.closeTaskActionLayer;
    if(typeof close!=='function') return false;
    if(!state.closeActionOwner) state.closeActionOwner=close;
    if(!close.__nfaV8){
      const fn=function(){
        restoreActionPanel();
        const r=state.closeActionOwner.apply(this,arguments);
        requestAnimationFrame(()=>refreshTasks(true));
        return r;
      };
      fn.__nfaV8=true;
      window.closeTaskActionLayer=fn;
    }
    return true;
  }

  async function resolveGroupName(gid){return resolveRoomName(gid);}
  function installGroupSettingsOwner(){
    const owner=window.openGroupSettings;
    if(typeof owner!=='function') return false;
    if(owner.__nfaV8) return true;
    if(!state.groupSettingsOwner) state.groupSettingsOwner=owner;
    const fn=async function(groupId){
      const gid=groupId||window.currentRoom;
      if(!gid||gid.startsWith('dm_')) return state.groupSettingsOwner.apply(this,arguments);
      const name=await resolveGroupName(gid);
      if(name){
        try{
          localStorage.setItem('dept_name_'+gid,name);
          if(window.currentTenantId) localStorage.setItem(window.currentTenantId+'_dept_name_'+gid,name);
        }catch(_){}
      }
      const r=await state.groupSettingsOwner.call(this,gid);
      const input=document.getElementById('groupSettingsName');
      if(input&&(!input.value||input.value===gid||/^grp_/i.test(input.value))) input.value=name;
      return r;
    };
    fn.__nfaV8=true;
    window.openGroupSettings=fn;
    return true;
  }

  function installPasswordOwner(){
    if(typeof window.saveNewPassword!=='function') return false;
    if(window.openChangePassword?.__nfaV8) return true;
    window.nfaTogglePasswordVisibility=function(id){
      const input=document.getElementById(id);
      if(!input) return;
      input.type=input.type==='password'?'text':'password';
    };
    const fn=function(){
      const modal=document.getElementById('settingsModal');
      const card=modal?.firstElementChild;
      if(!card) return;
      let section=document.getElementById('changePwdSection');
      if(section){
        section.style.display=section.style.display==='none'?'block':'none';
        return;
      }
      section=document.createElement('section');
      section.id='changePwdSection';
      section.className='nfa-v8-password-section';
      section.innerHTML='<h4>Change Password</h4><label>New Password</label><div class="nfa-v8-password-field"><input id="newPwdInput" type="password" autocomplete="new-password" placeholder="Min 8 characters"><button type="button" onclick="window.nfaTogglePasswordVisibility(\'newPwdInput\')"><i class="fa-solid fa-eye"></i></button></div><label>Confirm New Password</label><div class="nfa-v8-password-field"><input id="confirmPwdInput" type="password" autocomplete="new-password" placeholder="Repeat new password"><button type="button" onclick="window.nfaTogglePasswordVisibility(\'confirmPwdInput\')"><i class="fa-solid fa-eye"></i></button></div><div id="pwdChangeErr" class="nfa-v8-password-error"></div><button id="savePwdBtn" class="nfa-v8-password-save" type="button" onclick="window.saveNewPassword()"><i class="fa-solid fa-lock"></i> Update Password</button>';
      const link=document.getElementById('pwdChangeLink');
      if(link&&link.parentElement===card) card.insertBefore(section,link);
      else card.appendChild(section);
    };
    fn.__nfaV8=true;
    window.openChangePassword=fn;
    const link=document.getElementById('pwdChangeLink');
    if(link) link.onclick=fn;
    return true;
  }

  function installProfileOwner(){
    const owner=window.saveSettings;
    if(typeof owner!=='function') return false;
    if(owner.__nfaV8) return true;
    state.profileOwner=owner;
    const fn=async function(){
      const r=await state.profileOwner.apply(this,arguments);
      try{
        await window.ensureUsersLoaded?.(true);
        const current=(window.globalUsersCache||[]).find(u=>u.id===window.currentUser?.id);
        if(current?.avatar_url){
          window._userAvatarUrl=current.avatar_url;
          try{localStorage.setItem('mpgs_avatar_'+current.id,current.avatar_url);}catch(_){}
        }
        const byId=new Map((window.globalUsersCache||[]).map(u=>[u.id,u]));
        window._roomMsgs=(window._roomMsgs||[]).map(m=>({
          ...m,
          profiles:{...(m.profiles||{}),...(byId.get(m.sender_id)||{})}
        }));
        hydrateMessageIdentities(window._roomMsgs||[]);
      }catch(error){
        console.warn('[desktop-workspace-v8] profile refresh failed',error);
      }
      return r;
    };
    fn.__nfaV8=true;
    window.saveSettings=fn;
    return true;
  }

  function retireTaskHub(){
    const right=document.getElementById('rightSidebar');
    if(!right) return false;
    right.classList.add('nfa-v8-task-hub-retired');
    right.closest('.nfa-speed-shell')?.classList.remove('nfa-task-hub-expanded');
    right.classList.remove('nfa-task-hub-expanded','nfa-task-focused','nfa-task-create-mode');
    if(window.innerWidth<1180&&!document.getElementById('activityFeedPanel')){
      right.style.setProperty('display','none','important');
    }
    return true;
  }

  function installRenderMainOwner(){
    const owner=window.renderMainApp;
    if(typeof owner!=='function') return false;
    if(owner.__nfaV8) return true;
    state.renderMainOwner=owner;
    const fn=async function(){
      const r=await owner.apply(this,arguments);
      requestAnimationFrame(mountUi);
      return r;
    };
    fn.__nfaV8=true;
    window.renderMainApp=fn;
    return true;
  }

  function installGlobalCapture(){
    if(document.documentElement.dataset.nfaV8Capture==='1') return;
    document.documentElement.dataset.nfaV8Capture='1';
    document.addEventListener('click',event=>{
      if(!isDesktop()) return;
      const create=event.target.closest('.rbac-create-task');
      if(create){
        const row=create.closest('.row-sent,.row-rcvd');
        const id=cleanId(row?.id?.replace(/^row-/,''));
        if(id){
          event.preventDefault();
          event.stopImmediatePropagation();
          window.closeDropdowns?.();
          const text=row.querySelector('.b-text')?.textContent?.trim()||'';
          openInlineTaskCreate(id,text);
        }
        return;
      }
      const rail=event.target.closest('#nfaDesktopRail [data-nfa-action="tasks"]');
      if(rail){
        event.preventDefault();
        event.stopImmediatePropagation();
        openLens('all');
      }
    },true);
  }

  function mountUi(){
    if(!isDesktop()) return;
    retireTaskHub();
    ensureConversationMode();
    ensureLens();
    hydrateMessageIdentities(window._roomMsgs||[]);
    loadTaskData(false).then(()=>{
      decorateCurrentConversation();
      if(document.getElementById('nfaTaskLensV8')?.classList.contains('nfa-open')) renderLens();
    });
    installPasswordOwner();
    installProfileOwner();
  }

  function installWhenReady(){
    if(!isDesktop()) return;
    installNavigationOwners();
    installGlobalCapture();
    const ready=[
      installMessageOwners(),
      installReplyOwner(),
      installCreateOwners(),
      installActionClose(),
      installGroupSettingsOwner(),
      installPasswordOwner(),
      installProfileOwner(),
      installRenderMainOwner()
    ].every(Boolean);
    mountUi();
    if(ready) return;
    state.installFrames+=1;
    if(state.installFrames<300) requestAnimationFrame(installWhenReady);
  }

  window.nfaOpenTaskLens=openLens;
  window.nfaCloseTaskLens=closeLens;
  window.nfaOpenTaskMessage=openTaskFromLens;
  window.nfaRefreshTaskMessages=refreshTasks;
  requestAnimationFrame(installWhenReady);
})();