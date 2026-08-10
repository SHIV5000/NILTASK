/* Noted For Action — Mobile/Tablet Tasks owner v216
 * Purpose: one visible owner for the Tasks route.
 * - Stops the legacy mobile-tasks MutationObserver by marking the approved v214
 *   task list as the authoritative .nmt-screen.
 * - Bypasses the old mobile-tasks navigation post-render only for screen=tasks.
 * - Keeps #mStage hidden until the approved list is ready, preventing legacy flash.
 * - Shows PWA v216 beside the Tasks heading for field identification.
 */
(function(){
'use strict';
if(window.__NFA_MOBILE_TASK_OWNER_V216__)return;
window.__NFA_MOBILE_TASK_OWNER_V216__=true;
window.NFA_MOBILE_PWA_VERSION='v216';

const $=(s,r=document)=>r.querySelector(s);
const runtime=()=>window.IS_NATIVE===true||window.innerWidth<=768||(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches&&window.innerWidth<=1366);
let observer=null,patchTimer=null;

function markApprovedTasks(){
  const frame=$('#mStage > .mScr[data-screen="tasks"]');
  const approved=frame?.querySelector('.nfa-v214-task-screen');
  if(!approved)return false;

  // The old pre-paint guard exposes only nmt-owned task screens. Mark the approved
  // frame as owned so it is visible without requiring a legacy render first.
  if(!frame.classList.contains('nmt-owned'))frame.classList.add('nmt-owned');
  frame.dataset.nfaTaskOwner='v216';

  // mobile-tasks.js observer treats presence of .nmt-screen as "already owned" and
  // returns without repainting. Reuse that guard instead of fighting its observer.
  if(!approved.classList.contains('nmt-screen'))approved.classList.add('nmt-screen');
  approved.dataset.nfaTaskOwner='v216';

  const head=approved.querySelector('.nfa-v214-task-headline');
  if(head&&!head.querySelector('.nfa-pwa-version-v216')){
    const badge=document.createElement('span');
    badge.className='nfa-pwa-version-v216';
    badge.textContent='PWA v216';
    badge.style.cssText='display:inline-flex;align-items:center;margin-left:8px;padding:3px 7px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:10px;font-weight:900;letter-spacing:.02em;vertical-align:middle;';
    const title=head.querySelector('b');
    if(title)title.insertAdjacentElement('afterend',badge);else head.prepend(badge);
  }
  return true;
}

function waitApproved(stage,timeout=1800){
  return new Promise(resolve=>{
    if(markApprovedTasks())return resolve(true);
    const start=Date.now();
    const tick=()=>{
      if(markApprovedTasks())return resolve(true);
      if(Date.now()-start>=timeout)return resolve(false);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function patchNavigation(){
  const current=window._navTo;
  if(typeof current!=='function'||current.__nfaV216)return false;

  // mobile-tasks.js exposes the original navigator on its wrapper. Use that base
  // for Tasks so the wrapper cannot run renderMobileTasks() after normal navigation.
  const base=current.__nmtOriginal;
  if(typeof base!=='function')return false;

  const wrapped=async function(screen,params,replace=false){
    if(screen!=='tasks')return current(screen,params,replace);

    const stage=document.getElementById('mStage');
    if(stage)stage.style.setProperty('visibility','hidden','important');
    try{
      const result=await base(screen,params,replace);
      // v214 listens to DOM changes/focus and owns data/rendering of the approved list.
      try{window.dispatchEvent(new Event('focus'))}catch{}
      const ready=await waitApproved(stage,1800);
      if(!ready)console.warn('[NFA v216] approved Tasks list was not ready before timeout');
      return result;
    }finally{
      if(stage)stage.style.removeProperty('visibility');
    }
  };

  wrapped.__nfaV216=true;
  wrapped.__nfaV216Base=base;
  wrapped.__nfaV216Previous=current;
  window._navTo=wrapped;
  return true;
}

function start(){
  if(!runtime())return;
  const app=document.getElementById('mobileApp');
  if(!app)return setTimeout(start,200);

  markApprovedTasks();
  observer=new MutationObserver(()=>markApprovedTasks());
  observer.observe(document.getElementById('mStage')||app,{childList:true,subtree:true});

  let tries=0;
  patchTimer=setInterval(()=>{
    tries++;
    if(patchNavigation()||window._navTo?.__nfaV216||tries>80)clearInterval(patchTimer);
  },100);

  console.log('[NFA] Mobile/Tablet PWA v216 active — single Tasks owner');
}
start();
})();