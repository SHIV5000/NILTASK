/**
 * NILTASK Admin Priority Banner v208
 * Injects a complete Priority Banner section into desktop and mobile Admin Panel.
 */
import { sb } from './shared.js';

window.NILTASK_PRIORITY_BANNER_ADMIN_VERSION = 'v208';

const A = { users:[], selected:new Set(), history:[], mounted:false };

const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function css() {
  if (document.getElementById('apb208-css')) return;
  const s=document.createElement('style');s.id='apb208-css';s.textContent=`
   .apb208{background:var(--bg-sidebar);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;margin:0 0 24px;box-shadow:0 1px 4px rgba(0,0,0,.07)}
   .apb208-h{padding:14px 20px;background:linear-gradient(135deg,#4338ca,#6d28d9);color:#fff;display:flex;align-items:center;gap:11px}
   .apb208-hi{width:39px;height:39px;border-radius:12px;background:rgba(255,255,255,.18);display:grid;place-items:center}
   .apb208-h b{font-size:15px}.apb208-h small{display:block;font-size:10px;opacity:.8;margin-top:2px}
   .apb208-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:16px}
   .apb208-card{border:1px solid var(--border-color);border-radius:14px;padding:14px;background:var(--bg-body)}
   .apb208-label{display:block;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:var(--text-secondary);margin:0 0 5px}
   .apb208 input,.apb208 select,.apb208 textarea{width:100%;box-sizing:border-box;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-sidebar);color:var(--text-primary);padding:9px 10px;font:inherit;font-size:12px}
   .apb208 textarea{min-height:82px;resize:vertical}
   .apb208-row{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px}
   .apb208-users{max-height:180px;overflow:auto;border:1px solid var(--border-color);border-radius:10px;padding:7px;background:var(--bg-sidebar)}
   .apb208-user{display:flex;align-items:center;gap:8px;padding:7px;border-radius:8px;font-size:11px;color:var(--text-primary)}
   .apb208-user:hover{background:var(--bg-body)}
   .apb208-user input{width:auto}
   .apb208-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
   .apb208-btn{border:0;border-radius:10px;padding:9px 13px;font-size:11px;font-weight:900;cursor:pointer}
   .apb208-primary{background:var(--accent);color:#fff}.apb208-danger{background:#dc2626;color:#fff}.apb208-muted{background:var(--bg-sidebar);color:var(--text-primary);border:1px solid var(--border-color)}
   .apb208-item{padding:11px;border:1px solid var(--border-color);border-radius:12px;margin-bottom:9px;background:var(--bg-sidebar)}
   .apb208-itemtop{display:flex;gap:8px;align-items:flex-start}.apb208-itemtop b{flex:1;color:var(--text-primary);font-size:12px}.apb208-pill{font-size:8px;font-weight:900;padding:3px 6px;border-radius:999px;background:rgba(99,102,241,.12);color:var(--accent)}
   .apb208-meta{font-size:9px;color:var(--text-secondary);margin-top:5px}.apb208-stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:9px;font-weight:800;color:var(--text-secondary)}
   .apb208-mobile{margin:0 13px 14px}
   @media(max-width:768px){.apb208-grid{grid-template-columns:1fr;padding:11px}.apb208-row{grid-template-columns:1fr}.apb208{margin-bottom:14px}.apb208-h{padding:12px 14px}}
  `;document.head.appendChild(s);
}

function sectionHtml(cls='') {
 return `<section class="apb208 ${cls}" id="${cls?'apb208Mobile':'apb208Desktop'}">
  <div class="apb208-h"><div class="apb208-hi"><i class="fa-solid fa-bullhorn"></i></div><div><b>Priority Banner <span style="font-size:8px;opacity:.7">v208</span></b><small>Publish meetings, emergency notices and announcements</small></div></div>
  <div class="apb208-grid">
   <div class="apb208-card">
    <div class="apb208-row">
     <div><label class="apb208-label">Category</label><select data-apb="category"><option value="meeting">Meeting</option><option value="emergency">Emergency</option><option value="urgent">Urgent</option><option value="announcement">Announcement</option><option value="information">Information</option></select></div>
     <div><label class="apb208-label">Recipients</label><select data-apb="mode"><option value="all">Everyone</option><option value="users">Selected Users</option><option value="roles">Selected Roles</option><option value="departments">Selected Departments</option></select></div>
    </div>
    <div style="margin-bottom:10px"><label class="apb208-label">Title</label><input data-apb="title" maxlength="100" placeholder="e.g. Staff Meeting"></div>
    <div style="margin-bottom:10px"><label class="apb208-label">Message</label><textarea data-apb="message" maxlength="600" placeholder="Write the notice…"></textarea></div>
    <div class="apb208-row">
     <div><label class="apb208-label">Expiry</label><input data-apb="expires" type="datetime-local"></div>
     <div><label class="apb208-label">Acknowledgement</label><select data-apb="ack"><option value="true">Required</option><option value="false">Not required</option></select></div>
    </div>
    <div data-apb="targetWrap" style="display:none">
      <label class="apb208-label">Choose recipients</label>
      <div class="apb208-users" data-apb="targets"></div>
    </div>
    <div class="apb208-actions"><button class="apb208-btn apb208-muted" data-apb-action="preview">Preview</button><button class="apb208-btn apb208-primary" data-apb-action="publish"><i class="fa-solid fa-paper-plane"></i> Publish Banner</button></div>
   </div>
   <div class="apb208-card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><b style="font-size:13px;color:var(--text-primary)">Active & Recent</b><button class="apb208-btn apb208-muted" data-apb-action="refresh">Refresh</button></div>
    <div data-apb="history"><div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:11px"><i class="fa-solid fa-spinner fa-spin"></i> Loading…</div></div>
   </div>
  </div>
 </section>`;
}

function mount() {
 css();
 const root=document.getElementById('adminRoot');
 if(root && !document.getElementById('apb208Desktop')){
   const shell=root.firstElementChild || root;
   const marker=shell.querySelector('.trial-banner')?.parentElement;
   if(marker) marker.insertAdjacentHTML('afterend',sectionHtml());
   else shell.insertAdjacentHTML('afterbegin',sectionHtml());
 }
 const mobile=document.querySelector('#adminMobile .ma-panel,#adminMobile .ma-body');
 if(mobile && !document.getElementById('apb208Mobile')){
   mobile.insertAdjacentHTML('afterbegin',sectionHtml('apb208-mobile'));
 }
 if(document.getElementById('apb208Desktop')||document.getElementById('apb208Mobile')){
   bind(); loadUsers(); loadHistory();
 }
}

function fields(container) {
 const q=n=>container.querySelector(`[data-apb="${n}"]`);
 return { category:q('category'),mode:q('mode'),title:q('title'),message:q('message'),expires:q('expires'),ack:q('ack'),targetWrap:q('targetWrap'),targets:q('targets'),history:q('history') };
}

function everySection(){return [...document.querySelectorAll('.apb208')];}

function bind(){
 everySection().forEach(sec=>{
  if(sec.dataset.bound)return;sec.dataset.bound='1';
  const f=fields(sec);
  f.mode.addEventListener('change',()=>{f.targetWrap.style.display=f.mode.value==='all'?'none':'block';renderTargets(sec)});
  sec.addEventListener('click',async e=>{
   const btn=e.target.closest('[data-apb-action]');if(!btn)return;
   const a=btn.dataset.apbAction;
   if(a==='publish') await publish(sec,btn);
   if(a==='refresh') await loadHistory();
   if(a==='preview') preview(sec);
   if(a==='withdraw') await withdraw(btn.dataset.id);
   if(a==='pending') await showPending(btn.dataset.id);
  });
 });
}

async function loadUsers(){
 if(A.users.length)return renderAllTargets();
 const {data,error}=await sb.from('profiles').select('id,full_name,email,department').eq('tenant_id',window.currentTenantId).order('full_name');
 if(error){console.warn('[priority-admin] profiles',error);return}
 const ids=(data||[]).map(x=>x.id);
 let roleMap={};
 if(ids.length){
  const {data:rr}=await sb.from('user_roles').select('user_id,role:roles(name,display_name)').eq('tenant_id',window.currentTenantId);
  (rr||[]).forEach(x=>roleMap[x.user_id]=x.role?.display_name||x.role?.name||'Staff');
 }
 A.users=(data||[]).map(x=>({...x,role:roleMap[x.id]||'Staff'}));
 renderAllTargets();
}

function renderAllTargets(){everySection().forEach(renderTargets)}
function renderTargets(sec){
 const f=fields(sec),mode=f.mode.value;
 if(mode==='all'){f.targets.innerHTML='';return}
 let rows=[];
 if(mode==='users') rows=A.users.map(u=>({id:u.id,label:u.full_name||u.email,sub:`${u.role}${u.department?' · '+u.department:''}`}));
 if(mode==='roles'){
  const vals=[...new Set(A.users.map(u=>u.role).filter(Boolean))];
  rows=vals.map(v=>({id:v,label:v,sub:'Role'}));
 }
 if(mode==='departments'){
  const vals=[...new Set(A.users.map(u=>u.department).filter(Boolean))];
  rows=vals.map(v=>({id:v,label:v,sub:'Department'}));
 }
 f.targets.innerHTML=rows.length?rows.map(x=>`<label class="apb208-user"><input type="checkbox" data-target="${esc(x.id)}"><span><b>${esc(x.label)}</b><small style="display:block;color:var(--text-secondary)">${esc(x.sub)}</small></span></label>`).join(''):'<div style="padding:14px;color:var(--text-secondary);font-size:11px">No options found.</div>';
}

function payload(sec){
 const f=fields(sec);
 return {
  category:f.category.value,title:f.title.value.trim(),message:f.message.value.trim(),
  requires_ack:f.ack.value==='true',expires_at:f.expires.value?new Date(f.expires.value).toISOString():null,
  recipient_mode:f.mode.value,
  recipient_values:[...f.targets.querySelectorAll('[data-target]:checked')].map(x=>x.dataset.target)
 };
}

function preview(sec){
 const p=payload(sec);if(!p.title||!p.message)return alert('Enter title and message first.');
 const colour={emergency:'#b91c1c',urgent:'#c2410c',meeting:'#1d4ed8',announcement:'#6d28d9',information:'#047857'}[p.category];
 alert(`${p.category.toUpperCase()}\n\n${p.title}\n${p.message}\n\nBanner colour: ${colour}`);
}

async function publish(sec,btn){
 const p=payload(sec);
 if(!p.title||!p.message)return alert('Title and message are required.');
 if(p.recipient_mode!=='all'&&!p.recipient_values.length)return alert('Select at least one recipient.');
 if(!p.expires_at)return alert('Choose an expiry date and time.');
 if(new Date(p.expires_at)<=new Date())return alert('Expiry must be in the future.');
 const estimated=p.recipient_mode==='all'?A.users.length:p.recipient_values.length;
 if(!confirm(`Publish this ${p.category.toUpperCase()} banner to approximately ${estimated} recipient(s)?`))return;
 btn.disabled=true;btn.textContent='Publishing…';
 const {data,error}=await sb.rpc('publish_priority_banner',{
  p_category:p.category,p_title:p.title,p_message:p.message,p_requires_ack:p.requires_ack,
  p_expires_at:p.expires_at,p_recipient_mode:p.recipient_mode,p_recipient_values:p.recipient_values
 });
 btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Publish Banner';
 if(error)return alert(error.message||'Publish failed');
 sec.querySelector('[data-apb="title"]').value='';sec.querySelector('[data-apb="message"]').value='';
 alert('Priority Banner published.');
 await loadHistory();
}

async function loadHistory(){
 const {data,error}=await sb.rpc('admin_priority_banner_dashboard');
 if(error){console.warn('[priority-admin] dashboard',error);return}
 A.history=data||[];
 everySection().forEach(sec=>{
  const host=fields(sec).history;
  host.innerHTML=A.history.length?A.history.map(b=>`
   <article class="apb208-item">
    <div class="apb208-itemtop"><b>${esc(b.title)}</b><span class="apb208-pill">${esc(b.category)}</span></div>
    <div class="apb208-meta">${esc(b.message)}</div>
    <div class="apb208-stats"><span>Recipients: ${b.recipient_count}</span><span>Acknowledged: ${b.ack_count}</span><span>Pending: ${b.pending_count}</span><span>Status: ${esc(b.status)}</span></div>
    <div class="apb208-actions">
      ${b.pending_count?`<button class="apb208-btn apb208-muted" data-apb-action="pending" data-id="${b.id}">View Pending</button>`:''}
      ${b.status==='active'?`<button class="apb208-btn apb208-danger" data-apb-action="withdraw" data-id="${b.id}">Withdraw</button>`:''}
    </div>
   </article>`).join(''):'<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:11px">No banners yet.</div>';
 });
}

async function withdraw(id){
 if(!confirm('Withdraw this banner from all recipients?'))return;
 const {error}=await sb.rpc('withdraw_priority_banner',{p_banner_id:id});
 if(error)return alert(error.message);
 await loadHistory();
}

async function showPending(id){
 const {data,error}=await sb.rpc('priority_banner_pending_users',{p_banner_id:id});
 if(error)return alert(error.message);
 const text=(data||[]).map(x=>`${x.full_name||x.email} — ${x.department||'No department'}`).join('\n');
 alert(text||'Everyone has acknowledged.');
}

function boot(){
 const ob=new MutationObserver(mount);ob.observe(document.body,{childList:true,subtree:true});
 mount();setTimeout(mount,700);setInterval(()=>{if(document.getElementById('adminRoot'))mount()},3000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
