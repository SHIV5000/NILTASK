/* Noted For Action — Mobile + Tablet acceptance stability v215
 * Loaded after v214. Keeps the approved Tasks list from being overwritten by
 * the legacy mobile-tasks observer and makes task-bubble gesture ownership final.
 */
(function(){
'use strict';
if(window.__NFA_MOBILE_ACCEPTANCE_V215__)return;
window.__NFA_MOBILE_ACCEPTANCE_V215__=true;
window.NILTASK_MOBILE_STABILITY_VERSION='v215';
const $=(s,r=document)=>r.querySelector(s);
const runtime=()=>window.IS_NATIVE===true||window.innerWidth<=768||(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches&&window.innerWidth<=1366);
const screen=()=>$('#mStage > .mScr')?.dataset?.screen||'';
let snapshot='',timer=null,observer=null;

function keepTasks(){
  if(screen()!=='tasks')return;
  const frame=$('#mStage > .mScr');if(!frame)return;
  const approved=frame.querySelector('.nfa-v214-task-screen');
  if(approved){snapshot=frame.innerHTML;return;}
  if(snapshot){
    frame.innerHTML=snapshot;
    frame.dataset.nfaV214Sig='';
    window.dispatchEvent(new Event('focus'));
  }
}
function schedule(){clearTimeout(timer);timer=setTimeout(keepTasks,0)}

// v214's window-capture touchstart runs before this handler and records its
// long-press timer. Stopping propagation here prevents legacy mobile.js handlers
// farther down the event path from starting swipe-to-reply or a second long-press menu.
function ownTaskTouch(e){
  if(e.target?.closest?.('.m-bubble-row[data-nfa-task-id]'))e.stopImmediatePropagation();
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
  window.addEventListener('touchstart',ownTaskTouch,{capture:true,passive:true});
  observer=new MutationObserver(()=>{schedule();cleanReadonlyAria()});
  observer.observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['class','contenteditable']});
  keepTasks();cleanReadonlyAria();
  console.log('[NFA] mobile/tablet acceptance stability v215 active');
}
start();
})();