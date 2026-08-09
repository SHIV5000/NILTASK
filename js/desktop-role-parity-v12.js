/* NILTASK desktop role parity v12
 * Restores the full authoritative role/state task control set inside the
 * existing chat-native Task Reply composer without changing its one-composer UI.
 * Fine-pointer desktop only. Existing task mutation owners remain authoritative.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_ROLE_PARITY_V12__) return;
  window.__NFA_DESKTOP_ROLE_PARITY_V12__ = true;
  window.NILTASK_DESKTOP_ROLE_PARITY_VERSION = 'v12';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const sb = () => window.sb;
  const uid = () => window.currentUser?.id || null;
  const tid = () => window.currentTenantId || null;

  let currentTaskId = '';
  let currentState = null;
  let syncTimer = null;
  let observer = null;
  const cache = new Map();

  function isDesktop() {
    return window.innerWidth >= 769 && !window.IS_NATIVE &&
      !window.isMobileView?.() && !window.matchMedia?.('(pointer: coarse)').matches;
  }
  if (!isDesktop()) return;

  function toast(message, error=false) {
    if (typeof window.showCenterToast === 'function') {
      window.showCenterToast(
        message,
        error ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-info',
        error ? 'text-red-500' : 'text-blue-500'
      );
      return;
    }
    console[error ? 'error' : 'log']('[desktop role parity]', message);
  }

  function effectiveStatus(a) {
    if (!a) return '';
    if (a.status === 'pending_ack' && (a.state === 'acknowledged' || a.acked === true)) return 'acknowledged';
    return String(a.status || 'pending_ack').toLowerCase();
  }
  function closedStatus(status) {
    return ['accepted','cancelled','transferred'].includes(String(status || '').toLowerCase());
  }
  function userName(id) {
    const u=(window.globalUsersCache||[]).find(x=>x.id===id);
    return u?.full_name || u?.email?.split('@')[0] || 'Staff member';
  }

  async function getState(taskId, force=false) {
    if (!taskId || !sb() || !tid()) return null;
    const cached=cache.get(taskId);
    if (!force && cached && Date.now()-cached.at < 5000) return cached.value;
    try {
      const [{data:task,error:te},{data:assignments,error:ae},{data:extensions,error:ee}] = await Promise.all([
        sb().from('tasks').select('id,title,status,assigned_by,original_message_id').eq('tenant_id',tid()).eq('id',taskId).maybeSingle(),
        sb().from('task_assignees').select('assignee_id,status,state,acked').eq('tenant_id',tid()).eq('task_id',taskId),
        sb().from('task_extension_requests').select('id,assignee_id,requested_deadline,reason,status').eq('tenant_id',tid()).eq('task_id',taskId).eq('status','pending').order('created_at',{ascending:true})
      ]);
      if (te || !task) throw te || new Error('Task not found');
      if (ae) throw ae;
      if (ee) console.warn('[desktop role parity] extension lookup', ee.message || ee);
      const aa=assignments||[];
      const active=aa.filter(a=>!['transferred','cancelled'].includes(effectiveStatus(a)));
      const mine=active.find(a=>a.assignee_id===uid() && effectiveStatus(a)!=='accepted') || null;
      const value={
        task,
        assignments:aa,
        active,
        mine,
        myStatus:effectiveStatus(mine),
        creator:task.assigned_by===uid(),
        submitted:active.filter(a=>effectiveStatus(a)==='submitted'),
        pending:active.filter(a=>effectiveStatus(a)==='pending_ack'),
        extensions:extensions||[],
        readOnly:String(task.status||'').toLowerCase()==='cancelled' || (active.length>0 && active.every(a=>effectiveStatus(a)==='accepted'))
      };
      cache.set(taskId,{at:Date.now(),value});
      return value;
    } catch(e) {
      console.warn('[desktop role parity] state',e?.message||e);
      return null;
    }
  }

  function resolveTaskId() {
    const context=$('.nfa-v11-task-mode .nfa-v11-context-copy');
    if (!context) return '';
    const title=$('strong',context)?.textContent?.trim()||'';
    if (!title) return currentTaskId;
    const matches=$$('.nfa-task-message-v8[data-v8-task-message]').filter(section=>
      $('.nfa-v8-task-title',section)?.textContent?.trim()===title
    );
    if (matches.length===1) return matches[0].dataset.v8TaskMessage||'';
    if (matches.length>1) {
      const visible=matches.find(section=>{
        const r=section.getBoundingClientRect();
        return r.bottom>0 && r.top<window.innerHeight;
      });
      if (visible) return visible.dataset.v8TaskMessage||'';
    }
    return currentTaskId;
  }

  function actionRow() {
    return $('.nfa-v11-task-mode .nfa-v11-special-row');
  }
  function specialHost() {
    return $('.nfa-v11-task-mode [data-v11-special-panel]');
  }
  function setText(el,text) {
    const span=el?.querySelector('span');
    if (span) span.textContent=text;
    else if (el) el.textContent=text;
  }
  function customButton(key,label) {
    const row=actionRow(); if(!row)return null;
    let b=row.querySelector(`[data-v12-action="${key}"]`);
    if(!b){
      b=document.createElement('button');
      b.type='button';
      b.dataset.v12Action=key;
      row.appendChild(b);
    }
    b.textContent=label;
    return b;
  }
  function removeCustom(...keys) {
    const row=actionRow(); if(!row)return;
    keys.forEach(key=>row.querySelector(`[data-v12-action="${key}"]`)?.remove());
  }
  function ensureSelect(kind, items, placeholder) {
    const row=actionRow(); if(!row)return null;
    let label=row.querySelector(`[data-v12-select-wrap="${kind}"]`);
    if(!label){
      label=document.createElement('label');
      label.className='nfa-v11-target';
      label.dataset.v12SelectWrap=kind;
      label.innerHTML=`<span>For</span><select data-v12-select="${kind}"></select>`;
      row.appendChild(label);
    }
    const select=$('select',label);
    const before=select.value;
    select.innerHTML=`<option value="">${placeholder}</option>`+items.map(i=>`<option value="${i.id}">${i.label}</option>`).join('');
    if(items.some(i=>i.id===before))select.value=before;
    else if(items.length===1)select.value=items[0].id;
    return select;
  }
  function removeSelect(kind){actionRow()?.querySelector(`[data-v12-select-wrap="${kind}"]`)?.remove();}

  function cleanLegacyLayer() {
    const layer=$('#ntTaskActionLayer');
    if(!layer)return;
    layer.classList.remove('nt-open');
    layer.setAttribute('aria-hidden','true');
    try{layer.inert=true;}catch{}
    layer.style.setProperty('display','none','important');
    layer.style.setProperty('visibility','hidden','important');
    layer.style.setProperty('pointer-events','none','important');
    document.body.style.overflow='';
  }
  function adoptLegacyPanel(attempt=0) {
    const layer=$('#ntTaskActionLayer');
    const panel=layer?.querySelector('.nt-action-panel');
    const host=specialHost();
    cleanLegacyLayer();
    if(!panel||!host){
      if(attempt<16)requestAnimationFrame(()=>adoptLegacyPanel(attempt+1));
      return;
    }
    panel.classList.add('nfa-v11-inline-panel');
    panel.setAttribute('role','region');
    panel.setAttribute('aria-modal','false');
    host.hidden=false;
    host.replaceChildren(panel);
    panel.querySelectorAll('i').forEach(i=>i.style.display='none');
    requestAnimationFrame(()=>panel.querySelector('textarea,input,select,[contenteditable="true"]')?.focus?.({preventScroll:true}));
    panel.querySelector('.nt-action-footer button:last-child')?.addEventListener('click',()=>setTimeout(refreshAfterAction,900),{once:true});
  }
  function openInline(owner,args) {
    if(typeof owner!=='function')return toast('This task action is unavailable.',true);
    try{owner.apply(window,args||[]);adoptLegacyPanel();}
    catch(e){toast(e?.message||'Task action failed',true);}
  }

  async function refreshAfterAction() {
    if(currentTaskId)cache.delete(currentTaskId);
    try{await window.nfaRefreshTaskMessages?.(true);}catch{}
    try{await window.loadTasksForPanel?.();}catch{}
    setTimeout(sync,120);
  }

  function renderRoleControls(state) {
    const row=actionRow(); if(!row||!state)return;

    // Relabel Composer v11 controls to the authoritative role wording.
    const v11Ext=row.querySelector('[data-v11-special="extension"]');
    if(v11Ext)setText(v11Ext,'Request Extension');
    const v11Submit=row.querySelector('[data-v11-special="submit"]');
    if(v11Submit)setText(v11Submit,state.myStatus==='needs_review'?'Resubmit':'Submit');

    removeCustom('ack','start','remind','deadline','cancel','approve','return','extApprove','extDecline');
    removeSelect('review');removeSelect('extension');

    if(state.readOnly)return;

    if(state.mine){
      if(state.myStatus==='pending_ack'){
        customButton('ack','Acknowledge');
        if(!v11Ext)customButton('extension','Request Extension');
      }else if(state.myStatus==='acknowledged'){
        customButton('start','Start Work');
        if(!v11Ext)customButton('extension','Request Extension');
      }
    }

    if(state.creator){
      if(state.pending.length)customButton('remind','Remind Pending');
      customButton('deadline','Change Deadline');
      customButton('cancel','Cancel Task');

      if(state.submitted.length){
        ensureSelect('review',state.submitted.map(a=>({id:a.assignee_id,label:userName(a.assignee_id)})),'Select submitted assignee…');
        customButton('approve','Approve');
        customButton('return','Return');
      }
      if(state.extensions.length){
        ensureSelect('extension',state.extensions.map(r=>({id:r.id,label:`${userName(r.assignee_id)} · ${String(r.requested_deadline||'').slice(0,10)}`})),'Select extension request…');
        customButton('extApprove','Approve Extension');
        customButton('extDecline','Decline Extension');
      }
    }
  }

  async function sync() {
    if(!isDesktop())return;
    const context=$('.nfa-v11-task-mode .nfa-v11-context-line');
    if(!context){currentTaskId='';currentState=null;return;}
    const resolved=resolveTaskId();
    if(resolved)currentTaskId=resolved;
    if(!currentTaskId)return;
    const state=await getState(currentTaskId);
    if(!state||!$('.nfa-v11-task-mode .nfa-v11-context-line'))return;
    currentState=state;
    renderRoleControls(state);
  }
  function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(sync,80);}

  async function directTaskAction(action, assigneeId) {
    if(typeof window.taskAction!=='function')return toast('Task action is unavailable.',true);
    try{
      await window.taskAction(currentTaskId,assigneeId,action);
      await refreshAfterAction();
    }catch(e){toast(e?.message||'Task action failed',true);}
  }

  async function decideExtension(requestId, approve) {
    if(!requestId)return toast('Select an extension request.',true);
    if(approve){
      if(typeof window.respondTaskExtension==='function'){
        try{await window.respondTaskExtension(requestId,true);await refreshAfterAction();return;}catch(e){return toast(e?.message||'Extension decision failed',true);}
      }
    }
    const host=specialHost();if(!host)return;
    host.hidden=false;
    host.innerHTML=`<div class="nt-action-panel nfa-v11-inline-panel" role="region"><div class="nt-action-panel-header"><div class="nt-action-panel-title">Decline Extension</div></div><div class="nt-action-panel-body"><div class="nt-action-field"><label class="nt-action-label">Reason</label><textarea class="nt-action-input" data-v12-decline-reason placeholder="Reason for declining this extension request…"></textarea></div></div><div class="nt-action-footer"><button type="button" class="nt-task-button nt-task-button-secondary" data-v12-inline-cancel>Cancel</button><button type="button" class="nt-task-button nt-task-button-primary" data-v12-inline-decline>Decline</button></div></div>`;
    $('[data-v12-inline-cancel]',host)?.addEventListener('click',()=>{host.hidden=true;host.replaceChildren();},{once:true});
    $('[data-v12-inline-decline]',host)?.addEventListener('click',async()=>{
      const reason=$('[data-v12-decline-reason]',host)?.value?.trim()||'';
      if(!reason)return toast('Decline reason is required.',true);
      try{
        const {error}=await sb().rpc('respond_task_extension',{p_request_id:requestId,p_approve:false,p_decision_reason:reason,p_tenant_id:tid()});
        if(error)throw error;
        host.hidden=true;host.replaceChildren();toast('Extension declined.');await refreshAfterAction();
      }catch(e){toast(e?.message||'Extension decision failed',true);}
    });
  }

  async function handleRoleAction(button) {
    if(!currentState||!currentTaskId)return;
    const action=button.dataset.v12Action;
    if(action==='ack')return directTaskAction('ack',uid());
    if(action==='start')return directTaskAction('start',uid());
    if(action==='extension')return openInline(window.openTaskExtensionRequest,[currentTaskId,uid()]);
    if(action==='remind'){
      if(typeof window.remindAllTaskPending!=='function')return toast('Reminder action is unavailable.',true);
      try{await window.remindAllTaskPending(currentTaskId);await refreshAfterAction();}catch(e){toast(e?.message||'Reminder failed',true);}return;
    }
    if(action==='deadline')return openInline(window.openTaskDeadlineAction,[currentTaskId]);
    if(action==='cancel')return openInline(window.openTaskCancelAction,[currentTaskId]);
    if(action==='approve'||action==='return'){
      const target=$('[data-v12-select="review"]')?.value||currentState.submitted?.[0]?.assignee_id||'';
      if(!target)return toast('Select a submitted assignee.',true);
      if(action==='approve')return directTaskAction('accept',target);
      return openInline(window.openTaskReturnAction,[currentTaskId,target]);
    }
    if(action==='extApprove'||action==='extDecline'){
      const request=$('[data-v12-select="extension"]')?.value||currentState.extensions?.[0]?.id||'';
      return decideExtension(request,action==='extApprove');
    }
  }

  function onClick(e) {
    const b=e.target?.closest?.('[data-v12-action]');
    if(!b)return;
    e.preventDefault();e.stopPropagation();
    handleRoleAction(b);
  }

  function installCss() {
    if($('#nfa-desktop-role-parity-v12-css'))return;
    const style=document.createElement('style');
    style.id='nfa-desktop-role-parity-v12-css';
    style.textContent=`
      .nfa-v11-special-row [data-v12-action]{white-space:nowrap}
      .nfa-v11-special-row [data-v12-action="cancel"]{color:#b91c1c;border-color:rgba(185,28,28,.25)}
      .nfa-v11-special-row [data-v12-action="approve"],
      .nfa-v11-special-row [data-v12-action="extApprove"]{color:#15803d;border-color:rgba(21,128,61,.25)}
      .nfa-v11-special-row [data-v12-action="return"],
      .nfa-v11-special-row [data-v12-action="extDecline"]{color:#b45309;border-color:rgba(180,83,9,.25)}
    `;
    document.head.appendChild(style);
  }

  function start() {
    if(!isDesktop())return;
    installCss();
    document.addEventListener('click',onClick,true);
    observer=new MutationObserver(scheduleSync);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('focus',scheduleSync);
    scheduleSync();
    console.log('[NFA] desktop role parity v12 active');
  }

  start();
})();