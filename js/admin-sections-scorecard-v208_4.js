/**
 * NILTASK Admin Sections + Fair Scorecard v208.4
 * Enhances the restored single-page Admin without replacing its working modules.
 */
import { sb } from './shared.js';

window.NILTASK_ADMIN_SECTIONS_VERSION = 'v208.4';

const X = { attempts: 0, installed: false, originalScorecard: null };
const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const SECTIONS = [
  { id:'staff', label:'Staff', icon:'fa-users', body:()=>document.getElementById('section-staff'), card:()=>document.getElementById('section-staff')?.parentElement },
  { id:'groups', label:'Departments', icon:'fa-building', body:()=>document.getElementById('section-groups'), card:()=>document.getElementById('section-groups')?.parentElement },
  { id:'roles', label:'Roles', icon:'fa-shield-halved', body:()=>document.getElementById('section-roles'), card:()=>document.getElementById('section-roles')?.parentElement },
  { id:'tags', label:'Quick Tags', icon:'fa-tags', body:()=>document.getElementById('section-tags'), card:()=>document.getElementById('section-tags')?.parentElement },
  { id:'scorecard', label:'Scorecard', icon:'fa-chart-line', body:()=>document.getElementById('section-scorecard'), card:()=>document.getElementById('section-scorecard')?.parentElement },
  { id:'banner', label:'Alert Broadcast', icon:'fa-bullhorn', body:()=>document.querySelector('#apb208Desktop .apb208-grid'), card:()=>document.getElementById('apb208Desktop') }
];

function injectCss(){
  if(document.getElementById('admin-sections-v2084-css')) return;
  const s=document.createElement('style');
  s.id='admin-sections-v2084-css';
  s.textContent=`
    .asv208-nav{position:sticky;top:8px;z-index:80;display:flex;gap:7px;align-items:center;overflow-x:auto;padding:9px;margin:0 0 18px;border:1px solid var(--border-color);border-radius:14px;background:color-mix(in srgb,var(--bg-sidebar) 94%,transparent);backdrop-filter:blur(12px);box-shadow:0 7px 22px rgba(15,23,42,.08)}
    .asv208-nav button{flex:0 0 auto;border:1px solid var(--border-color);border-radius:10px;padding:8px 11px;background:var(--bg-body);color:var(--text-secondary);font-size:10px;font-weight:850;cursor:pointer;white-space:nowrap}
    .asv208-nav button:hover,.asv208-nav button.on{border-color:var(--accent);background:var(--accent);color:#fff}
    .asv208-nav .asv208-collapse{margin-left:auto}
    .asv208-collapsed{display:none!important}
    .section-hdr,.apb208-h{cursor:pointer;user-select:none}
    .apb208-h{justify-content:flex-start}.apb208-h .asv208-banner-chevron{margin-left:auto;color:rgba(255,255,255,.85);transition:transform .2s}
    .asv208-formula{margin:0;padding:12px 20px;border-bottom:1px solid var(--border-color);background:linear-gradient(90deg,rgba(79,70,229,.08),rgba(139,92,246,.05));font-size:10px;color:var(--text-secondary);line-height:1.65}
    .asv208-formula b{color:var(--text-primary)}
    .asv208-pill{display:inline-flex;margin:2px 4px 2px 0;padding:3px 7px;border-radius:999px;background:var(--bg-sidebar);border:1px solid var(--border-color);font-size:8px;font-weight:850;color:var(--text-secondary)}
    .asv208-score{font-size:13px;font-weight:900}.asv208-score small{display:block;margin-top:2px;font-size:7px;font-weight:700;color:var(--text-secondary)}
    @media(max-width:768px){.asv208-nav{position:relative;top:auto;margin:0 13px 12px}.asv208-nav button{padding:8px 9px}.asv208-nav .asv208-collapse{margin-left:0}}
  `;
  document.head.appendChild(s);
}

function setSectionOpen(id, open, scroll=false){
  const def=SECTIONS.find(x=>x.id===id); if(!def) return;
  const body=def.body(); const card=def.card(); if(!body||!card) return;
  body.classList.toggle('asv208-collapsed', !open);
  if(id==='banner'){
    const ch=card.querySelector('.asv208-banner-chevron'); if(ch) ch.style.transform=open?'rotate(0deg)':'rotate(180deg)';
  } else {
    const ch=document.getElementById('chevron-'+id); if(ch) ch.style.transform=open?'rotate(0deg)':'rotate(180deg)';
  }
  document.querySelectorAll('#asv208Nav [data-open-section]').forEach(b=>b.classList.toggle('on',open&&b.dataset.openSection===id));
  if(open&&scroll) setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'start'}),40);
}

function collapseAll(){ SECTIONS.forEach(s=>setSectionOpen(s.id,false)); }
function openOnly(id){ collapseAll(); setSectionOpen(id,true,true); }

function installNavigation(){
  const root=document.getElementById('adminRoot');
  const shell=root?.firstElementChild; if(!shell||document.getElementById('asv208Nav')) return;
  const trial=shell.querySelector('#trialBanner,.trial-banner');
  const stats=trial?.nextElementSibling;
  const nav=document.createElement('nav'); nav.id='asv208Nav'; nav.className='asv208-nav';
  nav.innerHTML=SECTIONS.map(s=>`<button type="button" data-open-section="${s.id}"><i class="fa-solid ${s.icon}"></i> ${s.label}</button>`).join('')+
    `<button type="button" class="asv208-collapse" data-collapse-all><i class="fa-solid fa-angles-up"></i> Collapse All</button>`;
  (stats||trial)?.insertAdjacentElement('afterend',nav);
  nav.addEventListener('click',e=>{
    const b=e.target.closest('[data-open-section]'); if(b) openOnly(b.dataset.openSection);
    if(e.target.closest('[data-collapse-all]')) collapseAll();
  });
}

function installHeaderHandlers(){
  SECTIONS.forEach(def=>{
    const card=def.card(),body=def.body(); if(!card||!body) return;
    const header=def.id==='banner'?card.querySelector('.apb208-h'):card.querySelector(':scope > .section-hdr');
    if(!header||header.dataset.asv208Bound) return;
    header.dataset.asv208Bound='1';
    if(def.id==='banner'&&!header.querySelector('.asv208-banner-chevron')) header.insertAdjacentHTML('beforeend','<i class="fa-solid fa-chevron-up asv208-banner-chevron"></i>');
    header.onclick=e=>{e.preventDefault();e.stopPropagation();const closed=body.classList.contains('asv208-collapsed');setSectionOpen(def.id,closed,false)};
  });
}

function initialCollapse(){ SECTIONS.forEach(s=>setSectionOpen(s.id,false)); }

function grade(score, provisional){
  if(score==null) return 'N/A';
  const g=score>=90?'A+':score>=80?'A':score>=65?'B':score>=50?'C':'D';
  return provisional?'P-'+g:g;
}
function profile(r){
  if(r.eligible===0){
    if(r.communication_score==null) return 'Not Assessed';
    return r.communication_score>=85?'Strong Communicator':r.communication_score>=65?'Reliable Communicator':'Communication Needs Attention';
  }
  if((r.task_score??0)>=80&&(r.communication_score??100)>=80) return 'Strong All-Round Performer';
  if((r.task_score??0)>=80&&(r.communication_score??100)<65) return 'Effective Executor — Communication Attention';
  if((r.task_score??100)<65&&(r.communication_score??0)>=80) return 'Strong Communicator — Task Attention';
  return (r.overall_score??0)>=65?'Reliable Contributor':'Needs Support';
}
function calculate(r){
  const total=Number(r.tasks_total||0), transferred=Number(r.tasks_transferred||0), eligible=Math.max(0,total-transferred);
  const on=Number(r.tasks_on_time||0), late=Number(r.tasks_delayed||0), completed=Math.min(eligible,on+late), pending=Math.min(eligible,Number(r.tasks_pending||0));
  const rate=(a,b)=>b>0?Math.round(a/b*100):null;
  const completion=rate(completed,eligible), timeliness=rate(on,completed), responsibility=eligible?Math.max(0,Math.round((1-pending/eligible)*100)):null;
  const taskScore=eligible?Math.round((completion||0)*.45+(timeliness||0)*.35+(responsibility||0)*.20):null;
  const received=Number(r.msgs_received||0), acknowledged=Number(r.acknowledged||0), communication=rate(acknowledged,received);
  let overall=null, assessment='Not Assessed', provisional=false, weighting='';
  if(eligible===0){overall=communication;assessment=communication==null?'Not Assessed':'Communication Only';weighting='100% Communication';}
  else if(eligible<=2){provisional=true;assessment='Provisional';overall=communication==null?taskScore:Math.round(taskScore*.40+communication*.60);weighting=communication==null?'Task only':'40% Task + 60% Communication';}
  else {assessment='Official';overall=communication==null?taskScore:Math.round(taskScore*.70+communication*.30);weighting=communication==null?'Task only':'70% Task + 30% Communication';}
  const out={...r,eligible,completed,completion_rate:completion,timeliness_rate:timeliness,responsibility_rate:responsibility,task_score:taskScore,communication_score:communication,overall_score:overall,assessment,weighting,provisional};
  out.grade=grade(overall,provisional); out.profile=profile(out); out.score=overall;
  return out;
}

function prepareScorecardUI(){
  const body=document.getElementById('section-scorecard'); if(!body) return;
  const section=body.parentElement;
  if(!section.querySelector('.asv208-formula')){
    const toolbar=body.querySelector(':scope > div');
    const formula=document.createElement('div'); formula.className='asv208-formula';
    formula.innerHTML=`<b>Approved fair-performance model</b><br>
      <span class="asv208-pill">Task Score: 45% Completion</span><span class="asv208-pill">35% Timeliness</span><span class="asv208-pill">20% Responsibility</span><br>
      <span class="asv208-pill">0 tasks: 100% Communication</span><span class="asv208-pill">1–2 tasks: 40% Task + 60% Communication — Provisional</span><span class="asv208-pill">3+ tasks: 70% Task + 30% Communication — Official</span><br>
      Transferred-away tasks are excluded from eligible task load. Delegation does not automatically add or deduct points.`;
    toolbar?.insertAdjacentElement('beforebegin',formula);
  }
  const headers=section.querySelectorAll('thead th');
  const labels=['Staff Member','Role','Eligible','Completed','On Time','Pending','Transferred','Task Score','Communication','Overall','Assessment','Grade','Profile','Card'];
  headers.forEach((h,i)=>{if(labels[i])h.textContent=labels[i]});
  const note=document.getElementById('scorecardNote'); if(note) note.textContent='Scores follow the approved dual-track formula and show the weighting used for every staff member.';
}

function gradeStyle(g){
  const key=String(g||'N/A').replace('P-','');
  return ({'A+':['#dcfce7','#15803d'],'A':['#dbeafe','#1d4ed8'],'B':['#fef9c3','#854d0e'],'C':['#ffedd5','#c2410c'],'D':['#fee2e2','#b91c1c']}[key]||['#f1f5f9','#64748b']);
}

async function fairLoadScorecard(){
  if(window.isMobileView?.()) return X.originalScorecard?.();
  const tbody=document.getElementById('scorecardBody'),note=document.getElementById('scorecardNote'); if(!tbody)return;
  tbody.innerHTML='<tr><td colspan="14" style="text-align:center;padding:28px;color:var(--text-secondary)"><i class="fa-solid fa-spinner fa-spin"></i> Calculating fair scores…</td></tr>';
  const sel=document.getElementById('scMonth')?.value||'this_month',today=new Date(); let from,to=today.toISOString().slice(0,10);
  if(sel==='this_month') from=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10);
  else if(sel==='last_month'){from=new Date(today.getFullYear(),today.getMonth()-1,1).toISOString().slice(0,10);to=new Date(today.getFullYear(),today.getMonth(),0).toISOString().slice(0,10)}
  else if(sel==='this_quarter') from=new Date(today.getFullYear(),Math.floor(today.getMonth()/3)*3,1).toISOString().slice(0,10);
  else from=new Date(today.getFullYear(),0,1).toISOString().slice(0,10);
  const {data,error}=await sb.rpc('get_staff_scorecard',{p_tenant_id:window.currentTenantId,p_from:from,p_to:to});
  if(error){tbody.innerHTML=`<tr><td colspan="14" style="text-align:center;padding:24px;color:#dc2626">Error: ${esc(error.message)}</td></tr>`;return}
  const rows=(Array.isArray(data)?data:JSON.parse(data||'[]')).map(calculate);
  if(!rows.length){tbody.innerHTML='<tr><td colspan="14" style="text-align:center;padding:30px;color:var(--text-secondary)">No staff performance data for this period.</td></tr>';return}
  tbody.innerHTML=rows.map(r=>{
    const [bg,fg]=gradeStyle(r.grade);
    return `<tr>
      <td><b>${esc(r.staff_name||'—')}</b><div style="font-size:10px;color:var(--text-secondary)">${esc(r.email||'')}</div></td>
      <td>${esc(r.role||'')}</td><td style="text-align:center;font-weight:800">${r.eligible}</td><td style="text-align:center;color:#16a34a;font-weight:800">${r.completed}</td><td style="text-align:center">${r.tasks_on_time||0}</td><td style="text-align:center;color:#dc2626">${r.tasks_pending||0}</td><td style="text-align:center">${r.tasks_transferred||0}</td>
      <td style="text-align:center"><div class="asv208-score">${r.task_score==null?'—':r.task_score+'%'}<small>${r.completion_rate??'—'} / ${r.timeliness_rate??'—'} / ${r.responsibility_rate??'—'}</small></div></td>
      <td style="text-align:center"><div class="asv208-score">${r.communication_score==null?'—':r.communication_score+'%'}<small>${r.acknowledged||0}/${r.msgs_received||0} acknowledged</small></div></td>
      <td style="text-align:center"><div class="asv208-score">${r.overall_score==null?'—':r.overall_score+'%'}<small>${esc(r.weighting)}</small></div></td>
      <td style="text-align:center">${esc(r.assessment)}</td><td style="text-align:center"><span style="background:${bg};color:${fg};padding:4px 9px;border-radius:999px;font-weight:900">${esc(r.grade)}</span></td><td style="font-size:10px">${esc(r.profile)}</td>
      <td style="text-align:center"><button class="btn-outline btn-sm" onclick='window.downloadStaffScorecard(${JSON.stringify(r).replace(/'/g,"&#39;")})'><i class="fa-solid fa-download"></i></button></td>
    </tr>`;
  }).join('');
  if(note)note.style.display='block'; window.showCenterToast?.('Scorecard generated using approved formula');
}

function overrideScorecard(){
  if(typeof window.loadScorecard!=='function') return false;
  if(!X.originalScorecard) X.originalScorecard=window.loadScorecard;
  window.loadScorecard=fairLoadScorecard;
  prepareScorecardUI();
  return true;
}

function install(){
  if(window.isMobileView?.()) return false;
  if(!document.getElementById('section-staff')||!document.getElementById('apb208Desktop')) return false;
  injectCss(); installNavigation(); installHeaderHandlers(); prepareScorecardUI(); overrideScorecard(); initialCollapse();
  X.installed=true; return true;
}

async function boot(){
  while(X.attempts++<60){if(install())return;await new Promise(r=>setTimeout(r,250))}
  console.warn('[admin-sections-v208.4] Admin sections did not become ready.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();