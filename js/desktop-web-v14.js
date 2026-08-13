/* Noted For Action — WEB v14
 * Desktop acceptance layer:
 * - one text composer for task actions (same interaction model as mobile)
 * - only structured fields such as date/staff remain inline above the composer
 * - Send confirms the selected task action
 * - no legacy action panel paint/focus
 * - no-role task viewers see ONLY TO READ in a disabled composer
 * - visible WEB v14 build badge
 */
(function () {
  'use strict';

  if (window.__NFA_WEB_V14__) return;
  window.__NFA_WEB_V14__ = true;
  window.NFA_WEB_VERSION = 'WEB v14';

  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const sb = () => window.sb;
  const uid = () => window.currentUser?.id || null;
  const tid = () => window.currentTenantId || null;
  let activeAction = null;
  let readOnlyActive = false;
  let readOnlyUiState = null;

  function isDesktop() {
    return window.innerWidth >= 769 && !window.IS_NATIVE &&
      !window.isMobileView?.() && !window.matchMedia?.('(pointer: coarse)').matches;
  }
  if (!isDesktop()) return;

  function toast(message,error=false) {
    if (typeof window.showCenterToast==='function') {
      window.showCenterToast(
        message,
        error?'fa-solid fa-circle-xmark':'fa-solid fa-circle-info',
        error?'text-red-500':'text-blue-500'
      );
    } else console[error?'error':'log']('[WEB v14]',message);
  }
  function composerState(){return window.nfaTaskComposerV11State||null;}
  function composerRoot(){return composerState()?.composerRoot||$('#nfaTaskComposerV11')?.parentElement||null;}
  function host(){return $('#nfaTaskComposerV11 [data-v11-special-panel]');}
  function editor(){return window.quillEditor?.root||null;}
  function plainText(){
    const root=editor(); if(!root)return'';
    const node=document.createElement('div');node.innerHTML=root.innerHTML||'';
    return String(node.innerText||node.textContent||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  }
  function releaseEditorSelection(){
    try{
      const ae=document.activeElement;
      if(ae?.closest?.('.ql-editor')||ae?.classList?.contains('ql-editor'))ae.blur?.();
    }catch{}
    try{window.getSelection?.()?.removeAllRanges?.();}catch{}
  }
  function setPlaceholder(text){const root=editor();if(root)root.dataset.placeholder=text||'Write a task update…';}
  function clearEditor(){
    const root=editor();if(!root?.isConnected)return;
    try{window.quillEditor?.setText?.('','silent');}
    catch{root.innerHTML='<p><br></p>';}
  }
  function quarantineLayer(){
    const layer=$('#ntTaskActionLayer');if(!layer)return;
    layer.classList.remove('nt-open');
    layer.setAttribute('aria-hidden','true');
    try{layer.inert=true;}catch{}
    layer.style.setProperty('display','none','important');
    layer.style.setProperty('visibility','hidden','important');
    layer.style.setProperty('opacity','0','important');
    layer.style.setProperty('pointer-events','none','important');
    document.body.style.overflow='';
  }

  function clearPendingFileForAction(){
    const state=composerState();
    if(state)state.pendingFile=null;
    const input=$('#fileAttachment');if(input)input.value='';
    const slot=$('#nfaTaskComposerV11 [data-v11-file-slot]');if(slot){slot.hidden=true;slot.replaceChildren();}
  }

  function clearAction(options={}){
    const {keepPlaceholder=false}=options;
    const current=activeAction;
    activeAction=null;
    const h=host()||current?.host;
    if(h){h.hidden=true;h.replaceChildren();}
    composerRoot()?.classList.remove('nfa-v14-action-active');
    if(!keepPlaceholder && !readOnlyActive)setPlaceholder('Write a task update…');
    quarantineLayer();
  }

  function fieldIsComposerText(field){
    if(field?.querySelector?.('textarea'))return true;
    const label=(field?.querySelector?.('label')?.textContent||'').trim();
    return /reason|comment|feedback|note|instruction|details|message/i.test(label) &&
      !!field?.querySelector?.('input:not([type="date"]):not([type="file"]),textarea');
  }
  function injectComposerText(panel,text){
    panel?.querySelectorAll?.('.nt-action-field').forEach(field=>{
      if(!fieldIsComposerText(field))return;
      const control=field.querySelector('textarea,input');
      if(control)control.value=text;
    });
  }
  function actionTitle(panel,key){
    return panel?.querySelector?.('.nt-action-panel-title')?.textContent?.trim() ||
      ({deadline:'Change Deadline',cancel:'Cancel Task',return:'Return for Changes',delegate:'Delegate Task',transfer:'Transfer Task',extension:'Request Extension'})[key] || 'Task action';
  }
  function moveStructuredFields(panel,target,key){
    const body=panel?.querySelector?.('.nt-action-panel-body');
    if(!body||!target)return;
    const hint=document.createElement('div');
    hint.className='nfa-v14-action-hint';
    hint.innerHTML=`<strong>${actionTitle(panel,key)}</strong><span>Use the main composer for reason/comment · press Send to confirm</span><button type="button" data-v14-cancel-action aria-label="Cancel action">×</button>`;
    target.appendChild(hint);
    [...body.children].forEach(child=>{
      if(child.classList?.contains('nt-action-field') && fieldIsComposerText(child)){
        child.hidden=true;
        child.style.display='none';
        return;
      }
      target.appendChild(child);
    });
  }

  function startLegacyAction({key,owner,args=[],placeholder='Add details…'}){
    if(readOnlyActive)return toast('This task is only to read.',true);
    if(typeof owner!=='function')return toast('This task action is unavailable.',true);
    clearAction({keepPlaceholder:true});
    clearPendingFileForAction();
    releaseEditorSelection();
    try{owner.apply(window,args);}catch(error){return toast(error?.message||'Task action failed',true);}
    quarantineLayer();
    const panel=$('#ntTaskActionLayer .nt-action-panel');
    const primary=$('#ntTaskActionPrimary');
    const target=host();
    if(!panel||!primary||!target)return toast('Task action could not be prepared.',true);
    target.hidden=false;
    target.replaceChildren();
    moveStructuredFields(panel,target,key);
    activeAction={kind:'legacy',key,panel,primary,host:target};
    composerRoot()?.classList.add('nfa-v14-action-active');
    setPlaceholder(placeholder);
    quarantineLayer();
  }

  function startDirectAction({key,placeholder='Add details…',requireText=false,commit}){
    if(readOnlyActive)return toast('This task is only to read.',true);
    if(typeof commit!=='function')return;
    clearAction({keepPlaceholder:true});
    clearPendingFileForAction();
    releaseEditorSelection();
    const target=host();if(!target)return toast('Task composer is unavailable.',true);
    target.hidden=false;target.replaceChildren();
    const hint=document.createElement('div');
    hint.className='nfa-v14-action-hint';
    hint.innerHTML=`<strong>${key==='extDecline'?'Decline Extension':'Task action'}</strong><span>Use the main composer below · press Send to confirm</span><button type="button" data-v14-cancel-action aria-label="Cancel action">×</button>`;
    target.appendChild(hint);
    activeAction={kind:'direct',key,host:target,requireText:Boolean(requireText),commit};
    composerRoot()?.classList.add('nfa-v14-action-active');
    setPlaceholder(placeholder);
  }

  async function commitAction(){
    const action=activeAction;if(!action)return false;
    const text=plainText();
    if(action.requireText&&!text){toast('Reason is required.',true);return true;}
    const state=composerState();
    const send=$('#sendBtn');const previous=send?.innerHTML||'';
    if(state?.busy)return true;
    if(state)state.busy=true;
    if(send){send.disabled=true;send.innerHTML='<i class="ti ti-loader fa-spin text-lg"></i>';}
    try{
      if(action.kind==='legacy'){
        injectComposerText(action.panel,text);
        if(state)state.pendingCommit=true;
        await action.primary.onclick?.call(action.primary);
        // Composer v11 resets pendingCommit when the hidden authoritative action
        // closes successfully. If it remains true, validation failed and the user
        // must be allowed to correct the date/person/reason without losing state.
        if(state?.pendingCommit){state.pendingCommit=false;return true;}
        clearAction();clearEditor();
      }else{
        await action.commit(text);
        clearAction();clearEditor();
        try{await window.nfaRefreshTaskMessages?.(true);}catch{}
        try{await window.loadMessages?.();}catch{}
        window.nfaDesktopRoleParityRefresh?.();
      }
    }catch(error){
      if(state)state.pendingCommit=false;
      toast(error?.message||'Task action failed.',true);
    }finally{
      if(state)state.busy=false;
      if(send){send.disabled=readOnlyActive;send.innerHTML=previous||'<i class="ti ti-send text-lg"></i>';}
      quarantineLayer();
    }
    return true;
  }

  function activeAssignmentForCurrentUser(state){
    return (state?.assignees||[]).find(a=>a.assignee_id===uid() && !['accepted','transferred','cancelled'].includes(String(a.status||'').toLowerCase()))||null;
  }
  function transferSource(state){
    const selected=$('#nfaTaskComposerV11 [data-v11-target]')?.value;
    if(selected)return selected;
    if(state?.targetAssigneeId)return state.targetAssigneeId;
    return (state?.assignees||[]).find(a=>!['accepted','transferred','cancelled'].includes(String(a.status||'').toLowerCase()))?.assignee_id||'';
  }

  function interceptV11Special(event){
    const button=event.target?.closest?.('#nfaTaskComposerV11 [data-v11-special]');
    if(!button)return false;
    const key=button.dataset.v11Special;
    if(!['delegate','transfer','extension'].includes(key))return false;
    const state=composerState();if(!state?.taskId)return false;
    event.preventDefault();event.stopImmediatePropagation();
    if(key==='delegate'){
      const mine=activeAssignmentForCurrentUser(state);
      startLegacyAction({key,owner:window.openTaskDelegateAction,args:[state.taskId,mine?.assignee_id||uid()],placeholder:'Add delegation instructions…'});
    }else if(key==='transfer'){
      const from=transferSource(state);
      if(!from)return toast('Select the assignment to transfer.',true);
      startLegacyAction({key,owner:window.openTaskTransferAction,args:[state.taskId,from],placeholder:'Add transfer reason…'});
    }else{
      startLegacyAction({key,owner:window.openTaskExtensionRequest,args:[state.taskId,uid()],placeholder:'Reason / details for extension…'});
    }
    return true;
  }

  function saveUiDisabledState(){
    const root=editor(),send=$('#sendBtn'),file=$('#fileAttachment');
    return {
      contenteditable:root?.getAttribute('contenteditable'),
      sendDisabled:!!send?.disabled,
      fileDisabled:!!file?.disabled,
      toolbar:$$('#toolbar-container button,#toolbar-container select').map(el=>[el,!!el.disabled])
    };
  }
  function applyAccess(roleState){
    if(!$('#nfaTaskComposerV11'))return;
    const noRole=!roleState?.creator&&!roleState?.mine;
    const locked=Boolean(roleState?.readOnly||noRole);
    if(!locked){clearAccess();return;}
    if(readOnlyActive)return;
    readOnlyActive=true;
    clearAction({keepPlaceholder:true});
    releaseEditorSelection();
    const root=editor(),send=$('#sendBtn'),file=$('#fileAttachment'),cr=composerRoot();
    readOnlyUiState=saveUiDisabledState();
    if(root){
      root.setAttribute('contenteditable','false');
      root.setAttribute('aria-readonly','true');
      root.innerHTML='<p>ONLY TO READ</p>';
      root.dataset.placeholder='ONLY TO READ';
    }
    if(send)send.disabled=true;if(file)file.disabled=true;
    readOnlyUiState?.toolbar?.forEach(([el])=>{el.disabled=true;});
    cr?.classList.add('nfa-v14-readonly');
  }
  function clearAccess(){
    if(!readOnlyActive)return;
    const root=editor(),send=$('#sendBtn'),file=$('#fileAttachment'),cr=composerRoot();
    const stillTask=!!$('#nfaTaskComposerV11')&&!!cr?.classList.contains('nfa-v11-task-mode');
    if(root){
      if(readOnlyUiState?.contenteditable==null)root.setAttribute('contenteditable','true');
      else root.setAttribute('contenteditable',readOnlyUiState.contenteditable);
      root.removeAttribute('aria-readonly');
      if(stillTask && String(root.textContent||'').trim()==='ONLY TO READ')root.innerHTML='<p><br></p>';
      if(stillTask)root.dataset.placeholder='Write a task update…';
    }
    if(send)send.disabled=readOnlyUiState?.sendDisabled||false;
    if(file)file.disabled=readOnlyUiState?.fileDisabled||false;
    readOnlyUiState?.toolbar?.forEach(([el,disabled])=>{if(el?.isConnected)el.disabled=disabled;});
    cr?.classList.remove('nfa-v14-readonly');
    readOnlyActive=false;readOnlyUiState=null;
  }

  function installBadge(){
    $('#nfaWebVersionV13')?.remove();
    let badge=$('#nfaWebVersionV14');
    if(!badge){badge=document.createElement('div');badge.id='nfaWebVersionV14';document.body.appendChild(badge);}
    badge.textContent='WEB v14';
    badge.style.cssText='position:fixed;top:7px;right:12px;z-index:12000;pointer-events:none;padding:3px 8px;border:1px solid rgba(79,70,229,.22);border-radius:999px;background:rgba(238,242,255,.96);color:#4338ca;font:800 10px/1.35 Inter,-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.035em;box-shadow:0 1px 4px rgba(15,23,42,.08)';
  }
  function installCss(){
    if($('#nfa-web-v14-css'))return;
    const style=document.createElement('style');style.id='nfa-web-v14-css';style.textContent=`
      #nfaTaskComposerV11 .nfa-v14-action-hint{display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid rgba(79,70,229,.18);border-radius:10px;background:rgba(238,242,255,.7);color:#475467;font-size:11px}
      #nfaTaskComposerV11 .nfa-v14-action-hint strong{color:#312e81;white-space:nowrap}#nfaTaskComposerV11 .nfa-v14-action-hint span{flex:1;min-width:0}#nfaTaskComposerV11 .nfa-v14-action-hint button{border:0;background:transparent;color:#667085;font-size:18px;cursor:pointer}
      #nfaTaskComposerV11 [data-v11-special-panel]:not([hidden]){display:flex;flex-direction:column;gap:8px;padding-top:7px}
      #nfaTaskComposerV11 [data-v11-special-panel]>.nt-action-field{margin:0;display:flex;align-items:center;gap:8px}#nfaTaskComposerV11 [data-v11-special-panel]>.nt-action-field .nt-action-label{min-width:110px;margin:0;font-size:11px}#nfaTaskComposerV11 [data-v11-special-panel]>.nt-action-field .nt-action-input{min-height:38px}
      .nfa-v14-readonly .ql-editor{color:#667085!important;font-weight:800!important;background:#f8fafc!important;cursor:not-allowed!important}.nfa-v14-readonly #sendBtn{opacity:.45!important;cursor:not-allowed!important}
      body:has(.nfa-v11-task-mode) #ntTaskActionLayer{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}
    `;document.head.appendChild(style);
  }

  function onWindowClick(event){
    if(!isDesktop())return;
    const exit=event.target?.closest?.('#nfaTaskComposerV11 [data-v11-exit]');
    if(exit){clearAccess();clearAction();return;}
    if(interceptV11Special(event))return;
    if(event.target?.closest?.('#nfaTaskComposerV11 [data-v14-cancel-action]')){
      event.preventDefault();event.stopImmediatePropagation();clearAction();return;
    }
    if(activeAction&&event.target?.closest?.('#sendBtn')){
      event.preventDefault();event.stopImmediatePropagation();commitAction();return;
    }
    if(readOnlyActive&&event.target?.closest?.('#sendBtn,#fileAttachment,#toolbar-container button,#toolbar-container select')){
      event.preventDefault();event.stopImmediatePropagation();toast('ONLY TO READ',true);
    }
  }

  window.NFA_WebTaskComposerBridge={
    startLegacyAction,
    startDirectAction,
    applyAccess,
    clearAccess,
    clearAction,
    commitAction,
    version:'v14'
  };

  installCss();installBadge();quarantineLayer();
  window.addEventListener('click',onWindowClick,true);
  window.addEventListener('focus',()=>{installBadge();quarantineLayer();});
  console.log('[NFA] WEB v14 active');
})();