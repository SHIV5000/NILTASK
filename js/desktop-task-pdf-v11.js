/* Noted For Action — Desktop Task Trail PDF v11
 * Professional local PDF: summary, assignee table, chronological trail table.
 * Desktop-only. No third-party PDF runtime and no database mutation.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_TASK_PDF_V11__) return;
  window.__NFA_DESKTOP_TASK_PDF_V11__ = true;

  const RICH_PREFIX='[NFA_RICH]';
  const NOTE_PREFIX='[NFA_NOTE]';
  let installFrames=0;

  function isDesktop(){return window.innerWidth>=769&&!window.IS_NATIVE&&!window.isMobileView?.()&&!window.matchMedia?.('(pointer: coarse)').matches;}
  if(!isDesktop()) return;
  function cleanId(value){const id=String(value==null?'':value).trim();return id&&id!=='null'&&id!=='undefined'?id:'';}
  function toast(message,icon='fa-solid fa-circle-info',colour='text-blue-500'){window.showCenterToast?.(message,icon,colour);}
  function effectiveStatus(a){if(!a)return'pending_ack';if(a.status==='pending_ack'&&(a.state==='acknowledged'||a.acked===true))return'acknowledged';return String(a.status||'pending_ack').toLowerCase();}
  function statusLabel(status){return({pending_ack:'Awaiting',acknowledged:'Acknowledged',in_progress:'In Progress',submitted:'Review Required',needs_review:'Changes Required',accepted:'Completed',transferred:'Transferred',cancelled:'Cancelled'})[status]||String(status||'—');}
  function taskState(assignees){const statuses=(assignees||[]).map(effectiveStatus).filter(s=>!['cancelled','transferred'].includes(s));if(!statuses.length)return'No Active Assignees';if(statuses.every(s=>s==='accepted'))return'Completed';if(statuses.every(s=>s==='submitted'))return'Review Required';if(statuses.some(s=>s==='needs_review'))return'Changes Required';if(statuses.some(s=>s==='submitted'))return'Mixed Progress';if(statuses.some(s=>s==='in_progress'))return'In Progress';if(statuses.some(s=>s==='acknowledged'))return'Acknowledged';return'Awaiting';}
  function normalizeTimestamp(value){if(typeof value!=='string')return value;const t=value.trim();if(!t)return value;if(/[zZ]$/.test(t)||/[+-]\d\d:?\d\d$/.test(t))return t;return t.replace(' ','T')+'Z';}
  function plainHtml(html){const node=document.createElement('div');node.innerHTML=String(html||'');return String(node.innerText||node.textContent||'').replace(/\s+/g,' ').trim();}
  function stripTrail(comment){const raw=String(comment||'');if(raw.startsWith(RICH_PREFIX))return plainHtml(raw.slice(RICH_PREFIX.length));if(raw.includes(`|${NOTE_PREFIX}`)){const marker=raw.indexOf(`|${NOTE_PREFIX}`);const before=raw.slice(0,marker);const note=raw.slice(marker+NOTE_PREFIX.length+1);const name=before.split('|')[0]||'Attachment';const noteText=plainHtml(note);return noteText?`${name} — ${noteText}`:name;}if(/^[^|]+\|tasks\//i.test(raw))return raw.split('|')[0];return plainHtml(raw)||raw||'—';}
  function displayName(userId,profileMap){const p=profileMap.get(userId)||(window.globalUsersCache||[]).find(u=>u.id===userId);return p?.full_name||p?.email?.split('@')[0]||(userId===window.currentUser?.id?'You':'Staff member');}
  function formatDate(value,withTime=false){if(!value)return'—';try{return new Date(normalizeTimestamp(value)).toLocaleString('en-IN',withTime?{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}:{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'});}catch(_){return String(value);}}
  function pdfEsc(value){return String(value==null?'':value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]+/g,' ');}
  function wrap(value,width,fontSize=9){const text=String(value==null?'':value).replace(/\s+/g,' ').trim()||'—';const max=Math.max(4,Math.floor(width/(fontSize*.54)));const words=text.split(' '),lines=[];let line='';for(const word of words){if(!line){line=word;continue;}if((line+' '+word).length<=max)line+=' '+word;else{lines.push(line);line=word;}}if(line)lines.push(line);return lines.length?lines:['—'];}

  function buildPdf(task,assignees,trails,profiles){
    const W=595,H=842,M=34,contentW=W-M*2;
    const pages=[];let cmds=[],top=38;
    const C={navy:[.10,.16,.30],indigo:[.31,.27,.90],ink:[.10,.13,.20],muted:[.40,.45,.53],line:[.86,.88,.92],soft:[.96,.97,.99],white:[1,1,1],green:[.10,.48,.31]};
    const colour=c=>`${c[0]} ${c[1]} ${c[2]}`;
    const y=t=>H-t;
    const fill=(x,t,w,h,c)=>cmds.push(`${colour(c)} rg ${x} ${H-t-h} ${w} ${h} re f`);
    const stroke=(x,t,w,h,c=C.line)=>cmds.push(`${colour(c)} RG .7 w ${x} ${H-t-h} ${w} ${h} re S`);
    const text=(s,x,t,size=9,c=C.ink,font='F1')=>cmds.push(`${colour(c)} rg BT /${font} ${size} Tf ${x} ${y(t)-size} Td (${pdfEsc(s)}) Tj ET`);
    const line=(x1,t1,x2,t2,c=C.line)=>cmds.push(`${colour(c)} RG .8 w ${x1} ${y(t1)} m ${x2} ${y(t2)} l S`);
    const beginPage=()=>{if(cmds.length)pages.push(cmds.join('\n'));cmds=[];top=38;fill(0,0,W,24,C.navy);text('NOTED FOR ACTION',M,7,9,C.white,'F2');text('TASK TRAIL REPORT',W-M-108,7,8,C.white,'F2');top=39;};
    const need=h=>{if(top+h>H-48)beginPage();};
    const section=label=>{need(28);text(label,M,top,10,C.navy,'F2');top+=16;line(M,top,W-M,top);top+=9;};
    const header=(cols,labels)=>{need(25);fill(M,top,contentW,22,C.navy);let x=M;cols.forEach((w,i)=>{text(labels[i],x+6,top+6,8,C.white,'F2');x+=w;});top+=22;};
    const row=(cols,cells,opts={})=>{const wrapped=cells.map((cell,i)=>wrap(cell,cols[i]-12,opts.fontSize||8.2));const rowH=Math.max(23,Math.max(...wrapped.map(lines=>lines.length))*10+8);need(rowH);if(opts.alt)fill(M,top,contentW,rowH,C.soft);let x=M;cols.forEach((w,i)=>{stroke(x,top,w,rowH,C.line);wrapped[i].forEach((ln,j)=>text(ln,x+6,top+6+j*10,opts.fontSize||8.2,opts.firstMuted&&i===0?C.muted:C.ink,i===0&&opts.firstBold?'F2':'F1'));x+=w;});top+=rowH;};

    beginPage();
    text('Professional Task Trail',M,top,18,C.navy,'F2');top+=25;
    text(task.title||'Task',M,top,11,C.ink,'F2');top+=18;
    const generated=new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
    text(`Generated ${generated} IST`,M,top,8,C.muted);top+=20;

    section('TASK SUMMARY');
    const summary=[['Status',taskState(assignees)],['Created by',displayName(task.assigned_by,profiles)],['Deadline',task.deadline?formatDate(task.deadline,false):'No deadline'],['Priority',String(task.priority||'Normal')],['Task ID',String(task.id||'')]];
    summary.forEach((r,i)=>row([105,contentW-105],r,{alt:i%2===1,fontSize:8.5,firstBold:true}));
    top+=14;

    section('ASSIGNEES');
    header([34,275,218],['#','Assignee','Status']);
    const assigneeRows=assignees.length?assignees:[null];
    assigneeRows.forEach((a,i)=>row([34,275,218],a?[String(i+1),displayName(a.assignee_id,profiles),statusLabel(effectiveStatus(a))]:['—','No assignees','—'],{alt:i%2===1,fontSize:8.3}));
    top+=14;

    section('TASK TRAIL');
    const cols=[28,93,115,105,186],labels=['#','Date / Time','Person','Action','Details'];
    header(cols,labels);
    const ordered=[...(trails||[])].sort((a,b)=>new Date(normalizeTimestamp(a.created_at))-new Date(normalizeTimestamp(b.created_at)));
    if(!ordered.length)row(cols,['—','—','—','—','No task activity recorded.'],{fontSize:8.1});
    ordered.forEach((event,i)=>{
      if(top>H-92){beginPage();section('TASK TRAIL — CONTINUED');header(cols,labels);}
      row(cols,[String(i+1),formatDate(event.created_at,true),displayName(event.user_id,profiles),String(event.action||'UPDATE').replaceAll('_',' '),stripTrail(event.comment||'')],{alt:i%2===1,fontSize:7.8});
    });
    if(cmds.length)pages.push(cmds.join('\n'));

    const generatedDate=new Date().toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric'});
    pages.forEach((p,i)=>{pages[i]=p+`\n${colour(C.muted)} rg BT /F1 7 Tf ${M} 20 Td (${pdfEsc(`Generated ${generatedDate} IST`)}) Tj ET BT /F1 7 Tf ${W-M-62} 20 Td (${pdfEsc(`Page ${i+1} of ${pages.length}`)}) Tj ET`;});

    const objects={};let next=1;const catalog=next++,pagesObj=next++,font=next++,fontBold=next++;const pageIds=[];
    pages.forEach(stream=>{const page=next++,content=next++;pageIds.push(page);objects[content]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;objects[page]=`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${content} 0 R >>`;});
    objects[font]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[fontBold]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    objects[pagesObj]=`<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    objects[catalog]=`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    let pdf='%PDF-1.4\n',offsets=[0];for(let id=1;id<next;id++){offsets[id]=pdf.length;pdf+=`${id} 0 obj\n${objects[id]}\nendobj\n`;}
    const xref=pdf.length;pdf+=`xref\n0 ${next}\n0000000000 65535 f \n`;for(let id=1;id<next;id++)pdf+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';pdf+=`trailer\n<< /Size ${next} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf],{type:'application/pdf'});
  }

  async function download(taskId){
    const sb=window.sb,tid=window.currentTenantId,id=cleanId(taskId);if(!sb||!tid||!id)return;
    toast('Preparing professional Task Trail PDF…','fa-solid fa-file-pdf','text-blue-500');
    try{
      const [taskRes,assigneeRes,trailRes]=await Promise.all([
        sb.from('tasks').select('*').eq('tenant_id',tid).eq('id',id).maybeSingle(),
        sb.from('task_assignees').select('*').eq('tenant_id',tid).eq('task_id',id),
        sb.from('task_trails').select('*').eq('tenant_id',tid).eq('task_id',id).order('created_at',{ascending:true})
      ]);
      if(taskRes.error||!taskRes.data)throw taskRes.error||new Error('Task not found');if(assigneeRes.error)throw assigneeRes.error;if(trailRes.error)throw trailRes.error;
      const ids=[taskRes.data.assigned_by,...(assigneeRes.data||[]).map(a=>a.assignee_id),...(trailRes.data||[]).map(t=>t.user_id)].filter(Boolean);
      let profileRows=[];if(ids.length){const p=await sb.from('profiles').select('id,full_name,email,designation').eq('tenant_id',tid).in('id',[...new Set(ids)]);profileRows=p.data||[];}
      const profileMap=new Map(profileRows.map(p=>[p.id,p]));
      const blob=buildPdf(taskRes.data,assigneeRes.data||[],trailRes.data||[],profileMap);const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Task_Trail_${String(taskRes.data.title||'Task').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,70)}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(error){console.error('[desktop-task-pdf-v11] PDF failed',error);toast(error?.message||'Task Trail PDF could not be generated.','fa-solid fa-circle-xmark','text-red-500');}
  }

  function install(){const owner=window.nfaDownloadTaskTrailPdf;if(typeof owner!=='function')return false;if(owner.__nfaV11Professional)return true;const wrapped=function(taskId){return download(taskId);};wrapped.__nfaV11Professional=true;wrapped.__nfaOriginal=owner;window.nfaDownloadTaskTrailPdf=wrapped;return true;}
  function boot(){if(install())return;installFrames+=1;if(installFrames<360)requestAnimationFrame(boot);}
  requestAnimationFrame(boot);
})();