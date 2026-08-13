/* Noted For Action — Desktop role parity v12.1
 * Full role/state controls in the existing Task Reply composer.
 * v12.1 is mutation-idempotent: it reconciles controls instead of deleting and
 * recreating them, eliminating the former observer-driven redraw/flicker loop.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_ROLE_PARITY_V12__) return;
  window.__NFA_DESKTOP_ROLE_PARITY_V12__ = true;
  window.NILTASK_DESKTOP_ROLE_PARITY_VERSION = 'v12.1';

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
        readOnly:String(task.status||'').toLowerCase()==='cancelled' ||
          (active.length>0 && active.every(a=>effectiveStatus(a)==='accepted'))
      };
      cache.set(taskId,{at:Date.now(),value});
      return value;
    } catch(e) {
      console.warn('[desktop role parity] state',e?.message||e);
      return null;
    }
  }

  function resolveTaskId() {
    const composerState=window.nfaTaskComposerV11State;
    if (composerState?.taskId) return String(composerState.taskId);
    const context=$('.nfa-v11-task-mode .nfa-v11-context-copy');
    if (!context) return '';
    const title=$('strong',context)?.textContent?.trim()||'';
    if (!title) return currentTaskId;
    const matches=$$('.nfa-task-message-v8[data-v8-task-message]').filter(section=>
      $('.nfa-v8-task-title',section)?.textContent?.trim()===title
    );
    if (matches.length===1) return matches[0].dataset.v8TaskMessage||'';
    const visible=matches.find(section=>{
      const r=section.getBoundingClientRect();
      return r.bottom>0 && r.top<window.innerHeight;
    });
    return visible?.dataset.v8TaskMessage || currentTaskId;
  }

  function actionRow() {
    return $('.nfa-v11-task-mode .nfa-v11-special-row');
  }
  function setText(el,text) {
    const span=el?.querySelector('span');
    if (span) {
      if (span.textContent !== text) span.textContent=text;
    } else if (el && el.textContent !== text) {
      el.textContent=text;
    }
  }
  function customButton(key,label) {
    const row=actionRow(); if(!row)return null;
    let b=row.querySelector(`[data-v12-action="${key}"]`);
    if(!b){
      b=document.createElement('button');
      b.type='button';
      b.dataset.v12Action=key;
      b.textContent=label;
      row.appendChild(b);
    } else if (b.textContent!==label) {
      b.textContent=label;
    }
    return b;
  }
  function reconcileButtons(wanted) {
    const row=actionRow(); if(!row)return;
    row.querySelectorAll('[data-v12-action]').forEach(button=>{
      if(!wanted.has(button.dataset.v12Action)) button.remove();
    });
    wanted.forEach((label,key)=>customButton(key,label));
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
    const signature=JSON.stringify(items.map(i=>[String(i.id),String(i.label)]));
    if(select.dataset.v12Items!==signature || select.dataset.v12Placeholder!==placeholder){
      const previous=select.value;
      select.replaceChildren();
      const empty=document.createElement('option');
      empty.value=''; empty.textContent=placeholder; select.appendChild(empty);
      items.forEach(item=>{
        const option=document.createElement('option');
        option.value=String(item.id); option.textContent=String(item.label); select.appendChild(option);
      });
      if(items.some(i=>String(i.id)===previous)) select.value=previous;
      else if(items.length===1) select.value=String(items[0].id);
      select.dataset.v12Items=signature;
      select.dataset.v12Placeholder=placeholder;
    }
    return select;
  }
  function reconcileSelect(kind, needed, items=[], placeholder='Select…') {
    const existing=actionRow()?.querySelector(`[data-v12-select-wrap="${kind}"]`);
    if(!needed){ existing?.remove(); return null; }
    return ensureSelect(kind,items,placeholder);
  }

  function renderRoleControls(state) {
    const row=actionRow(); if(!row||!state)return;

    const v11Ext=row.querySelector('[data-v11-special="extension"]');
    if(v11Ext)setText(v11Ext,'Request Extension');
    const v11Submit=row.querySelector('[data-v11-special="submit"]');
    if(v11Submit)setText(v11Submit,state.myStatus==='needs_review'?'Resubmit':'Submit');

    const wanted=new Map();
    if(!state.readOnly && state.mine){
      if(state.myStatus==='pending_ack'){
        wanted.set('ack','Acknowledge');
        if(!v11Ext)wanted.set('extension','Request Extension');
      } else if(state.myStatus==='acknowledged'){
        wanted.set('start','Start Work');
        if(!v11Ext)wanted.set('extension','Request Extension');
      }
    }
    if(!state.readOnly && state.creator){
      if(state.pending.length)wanted.set('remind','Remind Pending');
      wanted.set('deadline','Change Deadline');
      wanted.set('cancel','Cancel Task');
      if(state.submitted.length){
        wanted.set('approve','Approve');
        wanted.set('return','Return');
      }
      if(state.extensions.length){
        wanted.set('extApprove','Approve Extension');
        wanted.set('extDecline','Decline Extension');
      }
    }
    reconcileButtons(wanted);
    reconcileSelect(
      'review',
      !state.readOnly && state.creator && state.submitted.length>0,
      state.submitted.map(a=>({id:a.assignee_id,label:userName(a.assignee_id)})),
      'Select submitted assignee…'
    );
    reconcileSelect(
      'extension',
      !state.readOnly && state.creator && state.extensions.length>0,
      state.extensions.map(r=>({id:r.id,label:`${userName(r.assignee_id)} · ${String(r.requested_deadline||'').slice(0,10)}`})),
      'Select extension request…'
    );

    window.NFA_WebTaskComposerBridge?.applyAccess?.(state);
  }

  async function sync(force=false) {
    if(!isDesktop())return;
    const context=$('.nfa-v11-task-mode .nfa-v11-context-line');
    if(!context){
      currentTaskId=''; currentState=null;
      window.NFA_WebTaskComposerBridge?.clearAccess?.();
      return;
    }
    const resolved=resolveTaskId();
    if(resolved && resolved!==currentTaskId){currentTaskId=resolved;force=true;}
    if(!currentTaskId)return;
    const state=await getState(currentTaskId,force);
    if(!state||!$('.nfa-v11-task-mode .nfa-v11-context-line'))return;
    currentState=state;
    renderRoleControls(state);
  }
  function scheduleSync(force=false){
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>sync(force),60);
  }

  async function refreshAfterAction() {
    if(currentTaskId)cache.delete(currentTaskId);
    try{await window.nfaRefreshTaskMessages?.(true);}catch{}
    try{await window.loadTasksForPanel?.();}catch{}
    scheduleSync(true);
  }
  async function directTaskAction(action, assigneeId) {
    if(typeof window.taskAction!=='function')return toast('Task action is unavailable.',true);
    try{await window.taskAction(currentTaskId,assigneeId,action);await refreshAfterAction();}
    catch(e){toast(e?.message||'Task action failed',true);}
  }
  function bridgeLegacy(key, owner, args, placeholder) {
    const bridge=window.NFA_WebTaskComposerBridge;
    if(bridge?.startLegacyAction)return bridge.startLegacyAction({key,owner,args,placeholder});
    if(typeof owner==='function')owner.apply(window,args||[]);
    else toast('This task action is unavailable.',true);
  }

  async function handleRoleAction(button) {
    if(!currentState||!currentTaskId)return;
    const action=button.dataset.v12Action;
    if(action==='ack')return directTaskAction('ack',uid());
    if(action==='start')return directTaskAction('start',uid());
    if(action==='extension')return bridgeLegacy('extension',window.openTaskExtensionRequest,[currentTaskId,uid()],'Reason / details for extension…');
    if(action==='remind'){
      if(typeof window.remindAllTaskPending!=='function')return toast('Reminder action is unavailable.',true);
      try{await window.remindAllTaskPending(currentTaskId);await refreshAfterAction();}catch(e){toast(e?.message||'Reminder failed',true);}return;
    }
    if(action==='deadline')return bridgeLegacy('deadline',window.openTaskDeadlineAction,[currentTaskId],'Reason for changing the deadline…');
    if(action==='cancel')return bridgeLegacy('cancel',window.openTaskCancelAction,[currentTaskId],'Reason for cancelling this task…');
    if(action==='approve'||action==='return'){
      const target=$('[data-v12-select="review"]')?.value||currentState.submitted?.[0]?.assignee_id||'';
      if(!target)return toast('Select a submitted assignee.',true);
      if(action==='approve')return directTaskAction('accept',target);
      return bridgeLegacy('return',window.openTaskReturnAction,[currentTaskId,target],'Reason for returning this task…');
    }
    if(action==='extApprove'||action==='extDecline'){
      const request=$('[data-v12-select="extension"]')?.value||currentState.extensions?.[0]?.id||'';
      if(!request)return toast('Select an extension request.',true);
      if(action==='extApprove'){
        if(typeof window.respondTaskExtension!=='function')return toast('Extension action is unavailable.',true);
        try{await window.respondTaskExtension(request,true);await refreshAfterAction();}catch(e){toast(e?.message||'Extension decision failed',true);}return;
      }
      const bridge=window.NFA_WebTaskComposerBridge;
      if(bridge?.startDirectAction){
        return bridge.startDirectAction({
          key:'extDecline',
          placeholder:'Reason for declining this extension…',
          requireText:true,
          commit:async text=>{
            const {error}=await sb().rpc('respond_task_extension',{
              p_request_id:request,
              p_approve:false,
              p_decision_reason:text,
              p_tenant_id:tid()
            });
            if(error)throw error;
            toast('Extension declined.');
            await refreshAfterAction();
          }
        });
      }
      toast('Composer action bridge is unavailable.',true);
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
      .nfa-v11-special-row [data-v12-action="approve"],.nfa-v11-special-row [data-v12-action="extApprove"]{color:#15803d;border-color:rgba(21,128,61,.25)}
      .nfa-v11-special-row [data-v12-action="return"],.nfa-v11-special-row [data-v12-action="extDecline"]{color:#b45309;border-color:rgba(180,83,9,.25)}
    `;
    document.head.appendChild(style);
  }

  function relevantMutation(mutation) {
    const nodes=[...mutation.addedNodes,...mutation.removedNodes];
    return nodes.some(node=>node.nodeType===1 && (
      node.id==='nfaTaskComposerV11' ||
      node.matches?.('.nfa-v11-context-line') ||
      node.querySelector?.('#nfaTaskComposerV11,.nfa-v11-context-line')
    ));
  }
  function start() {
    if(!isDesktop())return;
    installCss();
    document.addEventListener('click',onClick,true);
    observer=new MutationObserver(mutations=>{
      if(mutations.some(relevantMutation))scheduleSync(true);
    });
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('focus',()=>scheduleSync(true));
    window.nfaDesktopRoleParityRefresh=()=>{if(currentTaskId)cache.delete(currentTaskId);scheduleSync(true);};
    scheduleSync(true);
    console.log('[NFA] desktop role parity v12.1 active');
  }

  start();
})();