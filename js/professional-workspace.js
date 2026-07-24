// True NILTASK module workspace. Existing task renderer/actions remain authoritative.
(function(){
  'use strict';
  const state={mode:'messages',originalTaskParent:null,originalTaskNext:null,selectedTaskId:null};
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];

  function loadCss(){if(q('#nfa-workspace-css'))return;const l=document.createElement('link');l.id='nfa-workspace-css';l.rel='stylesheet';l.href='./css/professional-workspace.css?v=2';document.head.appendChild(l)}

  function ensureWorkspace(){
    loadCss();
    const chat=q('.chat-area'); if(!chat)return null;
    let ws=q('#nfaTasksWorkspace');
    if(!ws){
      ws=document.createElement('section');ws.id='nfaTasksWorkspace';ws.className='nfa-module-workspace';ws.setAttribute('aria-label','All Tasks workspace');
      ws.innerHTML=`
        <header class="nfa-workspace-header">
          <div class="nfa-workspace-mark"><i class="ti ti-checkbox"></i></div>
          <div><div class="nfa-workspace-title">All Tasks</div><div class="nfa-workspace-subtitle">Search and manage tasks across every permitted group</div></div>
          <div class="nfa-workspace-actions">
            <button type="button" title="Create task" aria-label="Create task" onclick="window.openTaskModal?.(null,'')"><i class="ti ti-plus"></i></button>
            <button type="button" title="Refresh" aria-label="Refresh tasks" onclick="window.loadTasksForPanel?.()"><i class="ti ti-refresh"></i></button>
            <button type="button" title="More" aria-label="More task options"><i class="ti ti-dots"></i></button>
          </div>
        </header>
        <div class="nfa-workspace-banner"><div><strong>Global task workspace</strong><br><span>Filter by creator, assignee, group, status, or due date</span></div><b id="nfaVisibleTaskCount">0 visible</b></div>
        <div class="nfa-workspace-toolbar">
          <button class="nfa-workspace-tab" data-nfa-open="messages">Messages</button>
          <button class="nfa-workspace-tab is-active">All Tasks</button>
          <button class="nfa-workspace-tab" data-nfa-open="activity">Activity</button>
          <button class="nfa-workspace-tab" data-nfa-open="notifications">Notifications</button>
          <button class="nfa-workspace-tab" data-nfa-open="schedule">Schedule</button>
        </div>
        <div class="nfa-workspace-body" id="nfaTasksWorkspaceBody"></div>`;
      chat.appendChild(ws);
      ws.addEventListener('click',onWorkspaceClick,true);
    }
    return ws;
  }

  function ensureTaskNav(){
    const left=q('#leftSidebar');if(!left)return null;
    let nav=q('#nfaTaskNav');
    if(!nav){nav=document.createElement('div');nav.id='nfaTaskNav';nav.className='nfa-task-nav';nav.innerHTML=`
      <input class="nfa-task-nav-search" id="nfaTaskSearch" placeholder="Search tasks, people, groups">
      <div class="nfa-task-nav-title">Task views</div>
      <button data-filter="all" class="is-active"><i class="ti ti-layout-grid"></i>All permitted tasks</button>
      <button data-filter="allotted_to_me"><i class="ti ti-user-check"></i>Assigned to me</button>
      <button data-filter="allotted_by_me"><i class="ti ti-user-plus"></i>Created by me</button>
      <button data-filter="pending"><i class="ti ti-clock"></i>Pending</button>
      <button data-filter="completed"><i class="ti ti-circle-check"></i>Completed</button>
      <button data-filter="delegated"><i class="ti ti-users"></i>Delegated</button>
      <button data-filter="transferred"><i class="ti ti-arrows-exchange"></i>Transferred</button>
      <div class="nfa-task-nav-title">Sort</div>
      <button data-sort="deadline_asc"><i class="ti ti-calendar-up"></i>Deadline first</button>
      <button data-sort="created_desc"><i class="ti ti-sort-descending"></i>Newest first</button>`;
      const chats=q('#chatsList',left);chats?.parentElement?.insertBefore(nav,chats);
      nav.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.filter){const f=q('#taskFilter');if(f){f.value=b.dataset.filter;f.dispatchEvent(new Event('change',{bubbles:true}))}qa('[data-filter]',nav).forEach(x=>x.classList.toggle('is-active',x===b));setTimeout(syncTasks,120)}if(b.dataset.sort){const s=q('#taskSort');if(s){s.value=b.dataset.sort;s.dispatchEvent(new Event('change',{bubbles:true}))}setTimeout(syncTasks,120)}});
      q('#nfaTaskSearch',nav).addEventListener('input',applyTextSearch);
    }
    return nav;
  }

  function contextEmpty(){return `<div class="nfa-task-context-empty"><div><i class="ti ti-checkbox"></i><h3>No task selected</h3><p>Select a task card to view assignees, lifecycle, evidence, review controls, delegation and transfer actions.</p></div></div>`}
  function ensureContext(){const right=q('#rightSidebar');if(!right)return null;let host=q('#nfaTaskContext',right);if(!host){host=document.createElement('div');host.id='nfaTaskContext';host.className='nfa-task-context';host.innerHTML=contextEmpty();right.appendChild(host)}return host}

  function moveTaskPanelToWorkspace(){const panel=q('#tasksPanel'),body=q('#nfaTasksWorkspaceBody');if(!panel||!body)return false;if(!state.originalTaskParent){state.originalTaskParent=panel.parentElement;state.originalTaskNext=panel.nextSibling}body.appendChild(panel);panel.style.display='grid';return true}
  function restoreTaskPanel(){const panel=q('#tasksPanel');if(panel&&state.originalTaskParent){state.originalTaskParent.insertBefore(panel,state.originalTaskNext||null);panel.style.removeProperty('display')}}

  function hideLegacyRight(showContext){const right=q('#rightSidebar');if(!right)return;[...right.children].forEach(ch=>{if(ch.id==='nfaTaskContext')ch.style.display=showContext?'flex':'none';else ch.style.display=showContext?'none':''})}

  function setRail(key){qa('.nfa-rail-button').forEach(b=>{const active=b.dataset.module===key;b.classList.toggle('is-active',active);active?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')})}

  async function showTasks(taskId){
    state.mode='tasks';document.documentElement.classList.add('nfa-tasks-mode');
    const ws=ensureWorkspace(),nav=ensureTaskNav(),context=ensureContext();if(!ws)return;
    ws.classList.add('is-active');nav?.classList.add('is-active');hideLegacyRight(true);moveTaskPanelToWorkspace();setRail('tasks');
    await window.loadTasksForPanel?.();syncTasks();
    if(taskId)setTimeout(()=>selectTask(taskId),100);
    else if(context&&!state.selectedTaskId)context.innerHTML=contextEmpty();
  }

  function showMessages(){
    state.mode='messages';document.documentElement.classList.remove('nfa-tasks-mode');q('#nfaTasksWorkspace')?.classList.remove('is-active');q('#nfaTaskNav')?.classList.remove('is-active');restoreTaskPanel();hideLegacyRight(false);setRail('messages');
    window.closeActivityFeed?.();
  }

  function stripIds(root){qa('[id]',root).forEach(el=>el.removeAttribute('id'))}
  function selectTask(taskId){
    const card=q(`[data-task-id="${CSS.escape(String(taskId))}"]`,q('#nfaTasksWorkspace')||document);if(!card)return false;
    state.selectedTaskId=String(taskId);qa('.nfa-selected-task').forEach(x=>x.classList.remove('nfa-selected-task'));card.classList.add('nfa-selected-task');
    const title=q('.nt-task-title',card)?.textContent?.trim()||'Task details';const sub=q('.nt-task-subtitle',card)?.textContent?.trim()||'';const details=q(`#nt-task-details-${CSS.escape(String(taskId))}`,card);const host=ensureContext();if(!host)return false;
    const clone=details?.cloneNode(true)||document.createElement('div');clone.classList.add('nt-open');stripIds(clone);
    host.innerHTML=`<div class="nfa-task-context-head"><div><h2></h2><p></p></div><button class="nfa-task-context-close" aria-label="Close task details"><i class="ti ti-x"></i></button></div><div class="nfa-task-context-scroll"></div>`;
    q('h2',host).textContent=title;q('p',host).textContent=sub;q('.nfa-task-context-scroll',host).appendChild(clone);q('.nfa-task-context-close',host).onclick=()=>{state.selectedTaskId=null;qa('.nfa-selected-task').forEach(x=>x.classList.remove('nfa-selected-task'));host.innerHTML=contextEmpty()};
    return true;
  }

  function onWorkspaceClick(e){
    const open=e.target.closest('[data-nfa-open]');if(open){const m=open.dataset.nfaOpen;if(m==='messages')showMessages();else if(m==='activity')window.openActivityFeed?.();else if(m==='notifications')window.openTopPanel?.('alerts');else if(m==='schedule')window.openTopPanel?.('scheduled');return}
    const card=e.target.closest('[data-task-id]');if(!card)return;const id=card.dataset.taskId;if(!id)return;
    const detailToggle=e.target.closest('[onclick*="toggleTaskDetails"]');if(detailToggle){e.preventDefault();e.stopPropagation();selectTask(id);return}
    if(!e.target.closest('button,a,input,select,textarea'))selectTask(id);
  }

  function applyTextSearch(){const term=(q('#nfaTaskSearch')?.value||'').toLowerCase().trim();qa('#nfaTasksWorkspace #tasksPanel [data-task-id]').forEach(card=>{card.style.display=!term||card.textContent.toLowerCase().includes(term)?'':'none'});updateCount()}
  function updateCount(){const cards=qa('#nfaTasksWorkspace #tasksPanel [data-task-id]').filter(c=>c.style.display!=='none');const el=q('#nfaVisibleTaskCount');if(el)el.textContent=`${cards.length} visible`}
  function syncTasks(){if(state.mode!=='tasks')return;moveTaskPanelToWorkspace();qa('#nfaTasksWorkspace #tasksPanel [data-task-id]').forEach(card=>{card.setAttribute('role','button');card.tabIndex=0;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectTask(card.dataset.taskId)}}});applyTextSearch();if(state.selectedTaskId)selectTask(state.selectedTaskId)}

  function patchNotificationEntry(){const original=window.openTaskFromNotification;if(typeof original==='function'&&!original.__nfaPatched){const wrapped=async id=>{await showTasks(id);return true};wrapped.__nfaPatched=true;window.openTaskFromNotification=wrapped}}

  function patchRail(){const task=q('.nfa-rail-button[data-module="tasks"]'),messages=q('.nfa-rail-button[data-module="messages"]');if(task&&!task.dataset.nfaWorkspace){task.dataset.nfaWorkspace='1';task.onclick=e=>{e.preventDefault();showTasks()}}if(messages&&!messages.dataset.nfaWorkspace){messages.dataset.nfaWorkspace='1';messages.onclick=e=>{e.preventDefault();showMessages()}}}

  function boot(){ensureWorkspace();ensureTaskNav();ensureContext();patchRail();patchNotificationEntry();syncTasks()}
  window.nfaShowTasks=showTasks;window.nfaShowMessages=showMessages;window.nfaSelectTask=selectTask;
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;boot()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
