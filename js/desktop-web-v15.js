/* Noted For Action — WEB v15
 * Final desktop acceptance corrections:
 * - targeted reminder RPC is the single reminder/reply owner (no duplicate client reply)
 * - task FILE replies never expose the private storage path
 * - Chat / Tasks conversation switch lives in the fixed chat top bar
 * - task/message navigation uses the same visible target highlight
 * - visible WEB v15 marker
 */
(function(){
'use strict';
if(window.__NFA_WEB_V15__)return;
window.__NFA_WEB_V15__=true;
window.NFA_WEB_VERSION='WEB v15';

const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const sb=()=>window.sb,uid=()=>window.currentUser?.id||null,tid=()=>window.currentTenantId||null;
const filePathByButton=new WeakMap();
const reminderInflight=new Set(),reminderLast=new Map();
let messageObserver=null,installFrames=0;

function desktop(){return window.innerWidth>=769&&!window.IS_NATIVE&&!window.isMobileView?.()&&!window.matchMedia?.('(pointer: coarse)').matches}
if(!desktop())return;
function toast(message,error=false){if(typeof window.showCenterToast==='function')return window.showCenterToast(message,error?'fa-solid fa-circle-xmark':'fa-solid fa-circle-check',error?'text-red-500':'text-green-500');console[error?'error':'log']('[WEB v15]',message)}
function esc(v){return window.escapeHtml?window.escapeHtml(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

function installCss(){if($('#nfa-web-v15-css'))return;const s=document.createElement('style');s.id='nfa-web-v15-css';s.textContent=`
@media (min-width:769px) and (pointer:fine){
  #nfaConversationModeV8.nfa-v15-top-mode{position:static!important;top:auto!important;z-index:auto!important;margin:0 0 0 10px!important;padding:3px!important;gap:5px!important;border-radius:11px!important;box-shadow:none!important;backdrop-filter:none!important;flex:none!important}
  #nfaConversationModeV8.nfa-v15-top-mode button{min-width:72px!important;height:29px!important;font-size:10px!important;box-shadow:0 2px 0 rgba(0,0,0,.22),0 3px 7px rgba(15,23,42,.10)!important}
  #nfaConversationModeV8.nfa-v15-top-mode button.nfa-active{transform:translateY(1px)!important;box-shadow:0 1px 0 rgba(0,0,0,.28),inset 0 1px 3px rgba(255,255,255,.16)!important}
  .nfa-v15-file-reply{display:flex;flex-direction:column;gap:7px;min-width:0}
  .nfa-v15-file-prefix{font-size:11px;font-weight:750;color:var(--text-secondary,#667085)}
  .nfa-v15-file-label{font-size:10px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;color:#475467}
  .nfa-v15-file-card{width:min(380px,100%);display:flex;align-items:center;gap:10px;border:1px solid var(--border-color,#d8dee8);border-radius:12px;background:var(--bg-sidebar,#fff);padding:9px 11px;color:var(--text-primary,#172033);cursor:pointer;text-align:left;box-shadow:0 2px 7px rgba(15,23,42,.05)}
  .nfa-v15-file-icon{width:38px;height:38px;flex:none;display:grid;place-items:center;border-radius:10px;background:#eef2ff;color:#4f46e5;font-size:19px}
  .nfa-v15-file-copy{min-width:0;flex:1}.nfa-v15-file-copy strong{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nfa-v15-file-copy small{display:block;margin-top:3px;font-size:10px;color:var(--text-secondary,#667085)}
  .nfa-v15-file-note{font-size:12px;line-height:1.45;color:var(--text-primary,#344054)}
  @keyframes nfaUnifiedTargetV15{0%{outline:0 solid rgba(79,70,229,0);box-shadow:0 0 0 0 rgba(79,70,229,0)}18%{outline:3px solid rgba(79,70,229,.72);outline-offset:3px;box-shadow:0 0 0 7px rgba(79,70,229,.15)}70%{outline:2px solid rgba(79,70,229,.42);outline-offset:2px;box-shadow:0 0 0 4px rgba(79,70,229,.08)}100%{outline:0 solid rgba(79,70,229,0);box-shadow:0 0 0 0 rgba(79,70,229,0)}}
  .nfa-v8-nav-highlight,.glow-target,.message-highlight,.nfa-v15-target-highlight{animation:nfaUnifiedTargetV15 2.4s ease-out!important;border-radius:12px}
}
`;document.head.appendChild(s)}

function installBadge(){$('#nfaWebVersionV14')?.remove();$('#nfaWebVersionV13')?.remove();let b=$('#nfaWebVersionV15');if(!b){b=document.createElement('div');b.id='nfaWebVersionV15';document.body.appendChild(b)}b.textContent='WEB v15';b.style.cssText='position:fixed;top:7px;right:12px;z-index:12000;pointer-events:none;padding:3px 8px;border:1px solid rgba(79,70,229,.22);border-radius:999px;background:rgba(238,242,255,.97);color:#4338ca;font:800 10px/1.35 Inter,-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.035em;box-shadow:0 1px 4px rgba(15,23,42,.08)'}

function ensureTopModeSwitch(){const sw=$('#nfaConversationModeV8'),title=$('#roomTitleDisplay');if(!sw||!title)return false;const left=title.parentElement;if(!left)return false;if(sw.parentElement!==left)left.appendChild(sw);sw.classList.add('nfa-v15-top-mode');return true}

function parseTaskFile(raw){const text=String(raw||'').replace(/\u00a0/g,' ').trim();const marker=text.indexOf('|tasks/');if(marker<0)return null;const before=text.slice(0,marker).trim(),rest=text.slice(marker+1);const sep=rest.indexOf('|');const path=(sep>=0?rest.slice(0,sep):rest).trim();const note=(sep>=0?rest.slice(sep+1):'').trim();if(!path.startsWith('tasks/'))return null;const fileAt=before.toLowerCase().lastIndexOf('file uploaded');let prefix='',name='';if(fileAt>=0){prefix=before.slice(0,fileAt).replace(/[—–\-:\s]+$/,'').trim();name=before.slice(fileAt+'file uploaded'.length).replace(/^[\s—–:\-]+/,'').trim()}else{name=before.split(/[—–]/).pop().trim()}if(!name)name=path.split('/').pop()||'Attachment';return{prefix,name,path,note}}
function iconFor(name){const ext=String(name||'').split('.').pop().toLowerCase();if(['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext))return'fa-file-image';if(ext==='pdf')return'fa-file-pdf';if(['doc','docx','rtf'].includes(ext))return'fa-file-word';if(['xls','xlsx','csv'].includes(ext))return'fa-file-excel';if(['ppt','pptx'].includes(ext))return'fa-file-powerpoint';if(['zip','rar','7z'].includes(ext))return'fa-file-zipper';return'fa-file'}
async function openTaskFile(path){try{if(typeof window.openSecureFile==='function')return await window.openSecureFile(path);const {data,error}=await sb().storage.from('task-proofs').createSignedUrl(path,300);if(error||!data?.signedUrl)throw error||new Error('File unavailable');window.open(data.signedUrl,'_blank','noopener')}catch(e){toast(e?.message||'Could not open file.',true)}}
function decorateFileText(text){if(!text||text.dataset.nfaV15File==='1')return false;const parsed=parseTaskFile(text.textContent||'');text.dataset.nfaV15Checked='1';if(!parsed)return false;text.dataset.nfaV15File='1';text.replaceChildren();const wrap=document.createElement('div');wrap.className='nfa-v15-file-reply';if(parsed.prefix){const p=document.createElement('div');p.className='nfa-v15-file-prefix';p.textContent=parsed.prefix;wrap.appendChild(p)}const label=document.createElement('div');label.className='nfa-v15-file-label';label.textContent='File uploaded';wrap.appendChild(label);const btn=document.createElement('button');btn.type='button';btn.className='nfa-v15-file-card';btn.innerHTML=`<span class="nfa-v15-file-icon"><i class="fa-solid ${iconFor(parsed.name)}"></i></span><span class="nfa-v15-file-copy"><strong>${esc(parsed.name)}</strong><small>Attached file · Click to open</small></span><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>`;filePathByButton.set(btn,parsed.path);btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openTaskFile(filePathByButton.get(btn)||'')});wrap.appendChild(btn);if(parsed.note){const note=document.createElement('div');note.className='nfa-v15-file-note';note.textContent=parsed.note;wrap.appendChild(note)}text.appendChild(wrap);return true}
function decorateFiles(root=document){const list=[];if(root.matches?.('.reply-text'))list.push(root);root.querySelectorAll?.('#messagesContainer .reply-text,.reply-text').forEach(n=>list.push(n));list.forEach(decorateFileText)}
function installMessageObserver(){const box=$('#messagesContainer');if(!box||messageObserver)return false;messageObserver=new MutationObserver(muts=>{for(const m of muts){for(const n of m.addedNodes){if(n.nodeType===1)decorateFiles(n)}}ensureTopModeSwitch()});messageObserver.observe(box,{childList:true,subtree:true});decorateFiles(box);return true}
function wrapRenderOwner(name){const owner=window[name];if(typeof owner!=='function'||owner.__nfaV15File)return false;const wrapped=function(){const result=owner.apply(this,arguments);decorateFiles($('#messagesContainer')||document);ensureTopModeSwitch();return result};wrapped.__nfaV15File=true;wrapped.__nfaOriginal=owner;window[name]=wrapped;return true}

function installReminderOwner(){const owner=window.sendTaskReminder;if(typeof owner!=='function')return false;if(owner.__nfaV15Single)return true;const wrapped=async function(taskId,assigneeId){const task=String(taskId||''),assignee=String(assigneeId||''),key=task+':'+assignee;if(!task||!assignee||!tid()||!uid())return false;const now=Date.now();if(reminderInflight.has(key)||now-(reminderLast.get(key)||0)<3000)return false;reminderInflight.add(key);try{const {error}=await sb().rpc('send_task_reminder',{p_task_id:task,p_assignee_id:assignee,p_tenant_id:tid(),p_sender_id:uid()});if(error)throw error;reminderLast.set(key,Date.now());toast('Reminder sent.');try{await window.nfaRefreshTaskMessages?.(true)}catch{}try{await window.loadTasksForPanel?.()}catch{}return true}catch(e){toast(e?.message||'Reminder failed.',true);return false}finally{reminderInflight.delete(key)}};wrapped.__nfaV15Single=true;wrapped.__nfaOriginal=owner;window.sendTaskReminder=wrapped;return true}

function highlightMessage(messageId){const id=String(messageId||'').replace(/^row-/,'');if(!id)return;let tries=0;const tick=()=>{const row=document.getElementById('row-'+id)||document.querySelector(`[data-nfa-reply-id="${CSS.escape(id)}"]`);if(row){row.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});const h=row.querySelector?.('.bubble,.nfa-task-message-v8')||row;h.classList.remove('nfa-v15-target-highlight');void h.offsetWidth;h.classList.add('nfa-v15-target-highlight');setTimeout(()=>h.classList.remove('nfa-v15-target-highlight'),2600);return}if(++tries<28)setTimeout(tick,100)};tick()}
function installTaskOriginalOwner(){const owner=window.openTaskOriginalMessage;if(typeof owner!=='function'||owner.__nfaV15)return false;const wrapped=async function(taskId){try{const {data}=await sb().from('tasks').select('id,original_message_id').eq('tenant_id',tid()).eq('id',taskId).maybeSingle();if(data?.original_message_id&&typeof window.nfaNavigateToMessage==='function'){const ok=await window.nfaNavigateToMessage(data.original_message_id,{taskId:data.id});highlightMessage(data.original_message_id);return ok}}catch{}const result=await owner.apply(this,arguments);try{const {data}=await sb().from('tasks').select('original_message_id').eq('tenant_id',tid()).eq('id',taskId).maybeSingle();if(data?.original_message_id)highlightMessage(data.original_message_id)}catch{}return result};wrapped.__nfaV15=true;wrapped.__nfaOriginal=owner;window.openTaskOriginalMessage=wrapped;window.openOriginalTaskMessage=wrapped;return true}

function install(){if(!desktop())return;installCss();installBadge();ensureTopModeSwitch();installMessageObserver();wrapRenderOwner('renderMessages');wrapRenderOwner('nfaRefreshTaskMessages');installReminderOwner();installTaskOriginalOwner();installFrames++;if(installFrames<360&&(!$('#nfaConversationModeV8')||typeof window.sendTaskReminder!=='function'||typeof window.openTaskOriginalMessage!=='function'))requestAnimationFrame(install)}
requestAnimationFrame(install);
window.addEventListener('focus',()=>{ensureTopModeSwitch();decorateFiles($('#messagesContainer')||document)});
console.log('[NFA] WEB v15 active');
})();