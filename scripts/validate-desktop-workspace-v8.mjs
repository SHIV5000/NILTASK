import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8');
let failed=false;
const check=(ok,msg)=>{console.log(`${ok?'✓':'✖'} ${msg}`);if(!ok)failed=true;};
const js=read('js/desktop-workspace-v8.js');
const css=read('css/desktop-workspace-v8.css');
const loader=read('js/desktop-fast-task-hub-v4.js');
const mobile=read('js/mobile.js');
const native=read('js/native.js');
const tasks=read('js/tasks.js');
try{new Function(js);check(true,'Desktop Workspace v8 syntax is valid');}catch(e){check(false,`Desktop Workspace v8 syntax invalid: ${e.message}`);}
[
 ['__NFA_DESKTOP_WORKSPACE_V8__','single v8 runtime guard'],
 ['navigateToMessage','universal message navigator'],
 ['ensureTargetContext','history context loader'],
 [".lte('created_at'",'older-message context query'],
 [".gt('created_at'",'newer-message context query'],
 ['scrollAndHighlightOnce','single scroll/highlight owner'],
 ['state.navSeq','single-flight navigation token'],
 ['Loading sender…','non-Unknown temporary sender identity'],
 ['designation(message.sender_id','message designation hydration'],
 ['dataset.nfaReplyId','reply-level navigation identity'],
 ['openInlineTaskCreate','inline three-dot task creation'],
 ["closest('.rbac-create-task')",'capture owner for Create Task'],
 ['nfa-v8-lens-summary','Task Lens summary dashboard'],
 ["['all','All']",'Task Lens All filter'],
 ['installGroupSettingsOwner','group-name resolver'],
 ['installPasswordOwner','in-card password owner'],
 ['nfaTogglePasswordVisibility','password visibility control'],
 ['nfa-v8-stable-media','image-layout stabilization'],
 ['installReplyOwner','Replies have a consolidated desktop owner'],
 ['openReplies: new Set()','Replies default to collapsed state'],
 ["out.push(['replies','Replies'])",'Task Message exposes Replies instead of a duplicate timeline'],
 ['data-v8-task-reminder','converted Task Message keeps Reminder control'],
 ['data-v8-task-pdf','converted Task Message keeps Task Trail PDF control'],
 ['nfaDownloadTaskTrailPdf','Task Trail PDF download owner'],
 ['makePdf','Task Trail PDF is generated locally without a third-party runtime'],
 ['normalizeCreateTaskLabels','Create Ticket labels normalize to Create Task'],
 ['nfa-v8-task-pill','Task Message and Task Lens expose TASK pill'],
 ['installProfileOwner','profile save refresh owner'],
 ['ensureUsersLoaded?.(true)','profile refresh reloads authoritative user/avatar data'],
 ['setAvatar','message avatars hydrate from fresh profile data'],
 ['state.openReplies.add','task actions open the authoritative Replies trail'],
].forEach(([m,l])=>check(js.includes(m),l));
[
 ['#nfaConversationModeV8','Chat/Tasks toggle styles'],
 ['linear-gradient(180deg,#34c879','green 3D Chat control'],
 ['linear-gradient(180deg,#ff6868','red 3D Tasks control'],
 ['.nfa-v8-lens-summary','Task Lens summary styling'],
 ['font-size:11.5px','larger secondary Task/reply metadata'],
 ['nfaV8TargetPulse','single target highlight pulse'],
 ['.nfa-v8-password-section','password section stays in profile card'],
 ['font-family: Arial, Helvetica, sans-serif','desktop workspace uses Sans Serif family only'],
 ['--nfa-v8-bubble-bg','Task and inline action surfaces inherit message bubble background'],
 ['.nfa-v8-task-pill','TASK pill is styled'],
 ['box-shadow:0 3px 0','Task/assignee controls have a 3D press surface'],
 ['#messagesContainer .reply-item','Replies use compact desktop spacing'],
 ['.nfa-v8-person-name','assignee text sizing is explicitly styled'],
 ['.nfa-v8-inline-create-card label','Create Task labels are compact'],
].forEach(([m,l])=>check(css.includes(m),l));
check(tasks.includes('Original-message compilation is handled once by the database trail trigger.'),'authoritative task trails compile to original-message Replies');
check(tasks.includes("addTaskTrail(\n                taskId,\n                'UPDATE'"),'progress updates use authoritative task trail owner');
check(tasks.includes("addTaskTrail(\n                taskId,\n                'FILE'"),'file uploads use authoritative task trail owner');
check(!js.includes('Task timeline'),'duplicate Task timeline UI is removed');
check(!js.includes("out.push(['timeline'"),'duplicate Timeline action is removed');
check(loader.includes("import('./desktop-workspace-v8.js?v=1')"),'loader imports only Workspace v8');
check(loader.includes('./css/desktop-workspace-v8.css?v=1'),'loader installs Workspace v8 CSS');
check(!loader.includes('desktop-task-messages-v6.js'),'v6 runtime is retired from loader');
check(!loader.includes('hotfix-v7'),'v7 patch runtime is retired from loader');
check(!js.includes('setInterval('),'v8 adds no polling loop');
check(!js.includes('MutationObserver'),'v8 adds no MutationObserver');
check(!js.includes('Teacher'),'v8 never hardcodes Teacher into message identity');
check(!mobile.includes('desktop-workspace-v8'),'mobile runtime does not import v8');
check(!native.includes('desktop-workspace-v8'),'native bridge does not directly import v8');
if(failed){console.error('\nDesktop Workspace v8 validation failed.');process.exit(1);}
console.log('\nDesktop Workspace v8 replies-first validation passed.');
