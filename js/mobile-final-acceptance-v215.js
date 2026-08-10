/* Noted For Action — Mobile + Tablet acceptance stability v215
 * Loaded after v214. Keeps only the safe task gesture/read-only guards.
 * IMPORTANT: this layer never restores/replaces the Tasks route DOM. v214 is the
 * sole approved Tasks-screen owner, so navigation can always leave Tasks cleanly.
 */
(function(){
'use strict';
if(window.__NFA_MOBILE_ACCEPTANCE_V215__)return;
window.__NFA_MOBILE_ACCEPTANCE_V215__=true;
window.NILTASK_MOBILE_STABILITY_VERSION='v215.1';
const $=(s,r=document)=>r.querySelector(s);
const runtime=()=>window.IS_NATIVE===true||window.innerWidth<=768||(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches&&window.innerWidth<=1366);

// v214 owns the approved Tasks list. Do NOT snapshot/restore #mStage here:
// doing so can race _navTo() and trap the user on Tasks.

// Keep task bubbles vertical-pan only. v214 owns the task long-press menu.
function ownTaskTouchMove(e){
  const row=e.target?.closest?.('.m-bubble-row[data-nfa-task-id]');
  if(!row)return;
  // CSS touch-action:pan-y is the primary swipe guard. Do not block ordinary taps
  // or vertical scrolling and do not interfere with global navigation.
  row.style.touchAction='pan-y';
}

// v214 intentionally shows the same composer in read-only mode. Prevent its
// one-time scrollIntoView call from moving the chat viewport; the composer stays
// bound to the bottom exactly like normal chat.
const originalScroll=Element.prototype.scrollIntoView;
if(!window.__NFA_V215_SCROLL_GUARD__){
  window.__NFA_V215_SCROLL_GUARD__=true;
  Element.prototype.scrollIntoView=function(){
    if(this.matches?.('.m-composer.nfa-readonly-task-v214'))return;
    return originalScroll.apply(this,arguments);
  };
}

function cleanReadonlyAria(){
  document.querySelectorAll('#mobileApp .m-ce[aria-disabled="true"]').forEach(ed=>{
    if(!ed.closest('.nfa-readonly-task-v214')&&ed.getAttribute('contenteditable')!=='false')ed.removeAttribute('aria-disabled');
  });
}

function start(){
  if(!runtime())return;
  const app=$('#mobileApp');if(!app)return setTimeout(start,220);
  // Passive pointer/touch assist only; no route/DOM replacement observer.
  app.addEventListener('touchstart',ownTaskTouchMove,{capture:true,passive:true});
  app.addEventListener('pointerdown',ownTaskTouchMove,{capture:true,passive:true});
  cleanReadonlyAria();
  console.log('[NFA] mobile/tablet acceptance stability v215.1 active — route-safe');
}
start();
})();