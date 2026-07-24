// Mount existing Activity Feed logic in the approved centre-workspace architecture.
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const state={originalOpen:null,originalClose:null,panelParent:null,panelNext:null};
function setRail(key){qa('.nfa-rail-button').forEach(b=>b.classList.toggle('is-active',b.dataset.module===key))}
function ensureWorkspace(){
 const chat=q('.chat-area');if(!chat)return null;
 let ws=q('#nfaActivityWorkspace');
 if(!ws){ws=document.createElement('section');ws.id='nfaActivityWorkspace';ws.innerHTML=`
  <header class="nfa-activity-head"><div class="nfa-activity-mark"><i class="ti ti-activity"></i></div><div><h1>Activity</h1><p>Organisation activity across messages, tasks, reminders and reviews</p></div><div class="nfa-activity-head-actions"><button data-nfa-activity-refresh><i class="ti ti-refresh"></i> Refresh</button><button data-nfa-activity-clear>Clear all</button></div></header>
  <div class="nfa-activity-tabs"><button data-nfa-module="messages">Messages</button><button data-nfa-module="tasks">All Tasks</button><button class="is-active">Activity</button><button data-nfa-module="notifications">Notifications</button><button data-nfa-module="schedule">Schedule</button></div>
  <div id="nfaActivityHost"></div>`;
  chat.appendChild(ws);
  ws.addEventListener('click',e=>{const module=e.target.closest('[data-nfa-module]')?.dataset.nfaModule;if(module==='messages')window.nfaShowMessages?.();if(module==='tasks')window.nfaShowTasks?.();if(module==='notifications')window.openTopPanel?.('alerts');if(module==='schedule')window.openTopPanel?.('scheduled');if(e.target.closest('[data-nfa-activity-refresh]'))window._loadActivityFeed?.();if(e.target.closest('[data-nfa-activity-clear]'))window._clearAllActivity?.()});
 }
 return ws;
}
function ensureRightContext(){const right=q('#rightSidebar');if(!right)return;right.innerHTML=`<div class="nfa-activity-context"><div><i class="ti ti-activity"></i><h3>Activity details</h3><p>Select an activity item to open its related message, task, reminder or notification.</p></div></div>`}
function hideOtherWorkspaces(){q('#nfaTasksWorkspace')?.classList.remove('is-active');q('#nfaProTasksWorkspace')?.classList.remove('is-active')}
async function showActivity(){
 const ws=ensureWorkspace();if(!ws)return false;
 document.documentElement.classList.remove('nfa-tasks-mode','nfa-pro-tasks-mode');document.documentElement.classList.add('nfa-activity-mode');hideOtherWorkspaces();ws.classList.add('is-active');setRail('activity');ensureRightContext();
 if(state.originalOpen){if(!q('#activityFeedPanel'))await state.originalOpen();}
 const panel=q('#activityFeedPanel'),host=q('#nfaActivityHost');
 if(panel&&host){if(!state.panelParent){state.panelParent=panel.parentElement;state.panelNext=panel.nextSibling}host.appendChild(panel);panel.style.display='flex';window._activityFeedOpen=true;await window._loadActivityFeed?.();}
 return true;
}
function closeActivityWorkspace(){document.documentElement.classList.remove('nfa-activity-mode');q('#nfaActivityWorkspace')?.classList.remove('is-active');const panel=q('#activityFeedPanel');if(panel&&state.panelParent)state.panelParent.insertBefore(panel,state.panelNext||null)}
function patch(){
 if(typeof window.openActivityFeed==='function'&&!window.openActivityFeed.__nfaCentre){state.originalOpen=window.openActivityFeed;const w=()=>showActivity();w.__nfaCentre=true;window.openActivityFeed=w}
 if(typeof window.closeActivityFeed==='function'&&!window.closeActivityFeed.__nfaCentre){state.originalClose=window.closeActivityFeed;const w=()=>{closeActivityWorkspace();return state.originalClose?.()};w.__nfaCentre=true;window.closeActivityFeed=w}
 const rail=q('.nfa-rail-button[data-module="activity"]');if(rail){rail.onclick=e=>{e.preventDefault();e.stopPropagation();showActivity()}}
}
function boot(){ensureWorkspace();patch()}
window.nfaShowActivity=showActivity;window.nfaCloseActivity=closeActivityWorkspace;
let pending=false;const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;boot()})};new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
