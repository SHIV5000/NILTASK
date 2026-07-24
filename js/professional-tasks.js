// NILTASK professional Tasks presentation enhancer
// Existing task handlers and data operations remain authoritative.
(function(){
  'use strict';
  function ensureCss(){
    if(document.getElementById('nfa-professional-tasks-css')) return;
    const link=document.createElement('link');
    link.id='nfa-professional-tasks-css';
    link.rel='stylesheet';
    link.href='./css/professional-tasks.css?v=1';
    document.head.appendChild(link);
  }
  function labelWorkspace(){
    const panel=document.getElementById('rightSidebar');
    if(!panel) return;
    panel.classList.add('nfa-task-sidebar');
    if(!panel.querySelector('.nfa-task-workspace-label')){
      const label=document.createElement('div');
      label.className='nfa-task-workspace-label';
      label.innerHTML='<i class="ti ti-checkbox" aria-hidden="true"></i><span>Task Workspace</span>';
      panel.prepend(label);
    }
  }
  function markTaskElements(){
    document.querySelectorAll('#rightSidebar .jira-card, #rightSidebar .nt-task-card').forEach(card=>card.classList.add('nfa-task-card'));
    document.querySelectorAll('#rightSidebar .nt-task-person').forEach(person=>person.classList.add('nfa-assignee-card'));
    document.querySelectorAll('#rightSidebar .nt-task-section').forEach(section=>section.classList.add('nfa-task-detail-section'));
    document.getElementById('ntTaskActionLayer')?.classList.add('nfa-task-action-layer');
  }
  function bindTaskRail(){
    const button=document.querySelector('.nfa-rail-button[data-module="tasks"]');
    if(!button||button.dataset.nfaTaskBound) return;
    button.dataset.nfaTaskBound='1';
    button.addEventListener('click',()=>{
      const panel=document.getElementById('rightSidebar');
      panel?.classList.add('nfa-task-workspace-open');
      setTimeout(()=>window.loadTasksForPanel?.(),50);
    });
  }
  function run(){ensureCss();labelWorkspace();markTaskElements();bindTaskRail()}
  let pending=false;
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;run()})}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
