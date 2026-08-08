import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8');
let failed=false;
const check=(ok,msg)=>{console.log(`${ok?'✓':'✖'} ${msg}`);if(!ok)failed=true;};
const js=read('js/desktop-workspace-v8.js');
const css=read('css/desktop-workspace-v8.css');
const v9=read('js/desktop-task-composer-v9.js');
const v9css=read('css/desktop-task-composer-v9.css');
const loader=read('js/desktop-fast-task-hub-v4.js');
const mobile=read('js/mobile.js');
const native=read('js/native.js');
const tasks=read('js/tasks.js');
try{new Function(js);check(true,'Desktop Workspace v8 syntax is valid');}catch(e){check(false,`Desktop Workspace v8 syntax invalid: ${e.message}`);}
try{new Function(v9);check(true,'Desktop Task Composer v9 syntax is valid');}catch(e){check(false,`Desktop Task Composer v9 syntax invalid: ${e.message}`);}
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
].forEach(([m,l])=>check(css.includes(m),l));
[
 ['__NFA_DESKTOP_TASK_COMPOSER_V9__','single v9 task-composer guard'],
 ["closest('#messagesContainer .nfa-has-task-v8 .act-btn')",'Task Message Reply capture enters task mode'],
 ["/^Reply\\b/i",'Task Reply is the only task-mode entry; no Normal Reply branch'],
 ['Replying here is a formal task update.','task-mode Reply is explicitly a formal update'],
 ['availableActions','role/status action resolver lives in composer'],
 ['openTaskUpdateAction','existing Update owner is reused'],
 ['openTaskUploadAction','existing Upload owner is reused'],
 ['openTaskDelegateAction','existing Delegate owner is reused'],
 ['openTaskExtensionRequest','existing Extension owner is reused'],
 ['openTaskReturnAction','existing Return owner is reused'],
 ['openTaskTransferAction','existing Transfer owner is reused'],
 ['openTaskDeadlineAction','existing Deadline owner is reused'],
 ['openTaskCancelAction','existing Cancel owner is reused'],
 ['window.taskAction?.','existing direct task-action owner is reused'],
 ['nfaNavigateToMessage?.(messageId,{taskId})','post-action return uses universal navigator'],
 ['ensureRepliesOpen(messageId)','post-action Replies remain open'],
 ["window.THEME_LIST=[{id:'light'",'desktop theme list is explicitly two-theme'],
 ["{id:'dark',label:'Dark'",'Dark is the only alternate theme'],
 ['<svg class="nfa-v9-icon"','task/navigation controls use crisp SVG icons'],
 ['upgradeWorkspaceIcons','existing primary desktop icons are upgraded in place'],
].forEach(([m,l])=>check(v9.includes(m),l));
[
 ['#nfaTaskComposerV9','main chat task composer is styled'],
 ['.nfa-task-message-v8 .nfa-v8-action-strip','task-bubble action strip is removed from working UI'],
 ['.nfa-task-message-v8 .nfa-v8-person-actions','assignee action buttons are removed from task bubble'],
 ['.nfa-v9-composer-panel','existing task forms mount in main composer'],
 ['html[data-theme="dark"]','new desktop dark theme exists'],
 ['--bg-body:#0d1117','GitHub-like dark canvas'],
 ['--bg-sidebar:#010409','GitHub-like dark navigation surface'],
 ['--border-color:#30363d','GitHub-like dark borders'],
 ['--accent:#2f81f7','GitHub-like blue dark accent'],
 ['.nfa-v9-icon','SVG icon sizing is explicit'],
 ['box-shadow:0 3px 0','composer actions retain 3D press affordance'],
].forEach(([m,l])=>check(v9css.includes(m),l));
check(tasks.includes('Original-message compilation is handled once by the database trail trigger.'),'authoritative task trails compile to original-message Replies');
check(tasks.includes("addTaskTrail(\n                taskId,\n                'UPDATE'"),'progress updates use authoritative task trail owner');
check(tasks.includes("addTaskTrail(\n                taskId,\n                'FILE'"),'file uploads use authoritative task trail owner');
check(!js.includes('Task timeline'),'duplicate Task timeline UI is removed');
check(!js.includes("out.push(['timeline'"),'duplicate Timeline action is removed');
check(!v9.includes('Normal Reply'),'Task mode has no Normal Reply choice');
check(!v9.includes(".from('task_trails').insert"),'v9 does not duplicate task-trail mutation ownership');
check(!v9.includes(".from('messages').insert"),'v9 does not duplicate message/reply mutation ownership');
check(!v9.includes('setInterval('),'v9 adds no polling loop');
check(!v9.includes('MutationObserver'),'v9 adds no MutationObserver');
check(loader.includes("import('./desktop-workspace-v8.js?v=1')"),'loader starts Workspace v8');
check(loader.includes("import('./desktop-task-composer-v9.js?v=1')"),'loader starts Composer v9 after Workspace v8');
check(loader.includes('./css/desktop-task-composer-v9.css?v=1'),'loader installs Composer v9 / Dark CSS');
check(!loader.includes('desktop-task-messages-v6.js'),'v6 runtime remains retired');
check(!loader.includes('hotfix-v7'),'v7 patch runtime remains retired');
check(!js.includes('setInterval('),'v8 adds no polling loop');
check(!js.includes('MutationObserver'),'v8 adds no MutationObserver');
check(!js.includes('Teacher'),'v8 never hardcodes Teacher into message identity');
check(!mobile.includes('desktop-task-composer-v9'),'mobile runtime does not import v9');
check(!native.includes('desktop-task-composer-v9'),'native bridge does not directly import v9');
if(failed){console.error('\nDesktop Workspace v8 + Task Composer v9 validation failed.');process.exit(1);}
console.log('\nDesktop Workspace v8 + Task Composer v9 validation passed.');