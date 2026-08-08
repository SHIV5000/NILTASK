import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
let failed=false;
const check=(ok,msg)=>{console.log(`${ok?'✓':'✖'} ${msg}`);if(!ok)failed=true;};
const workspace=read('js/desktop-workspace-v8.js');
const workspaceCss=read('css/desktop-workspace-v8.css');
const composer=read('js/desktop-task-composer-v11.js');
const composerCss=read('css/desktop-task-composer-v11.css');
const pdf=read('js/desktop-task-pdf-v11.js');
const pdfClick=read('js/desktop-task-pdf-click-v11.js');
const loader=read('js/desktop-fast-task-hub-v4.js');
const tasks=read('js/tasks.js');
const mobile=read('js/mobile.js');
const native=read('js/native.js');

for(const [src,label] of [[workspace,'Workspace v8'],[composer,'Task Composer v11'],[pdf,'Task PDF v11'],[pdfClick,'Task PDF click owner v11']]){
  try{new Function(src);check(true,`${label} syntax is valid`);}catch(e){check(false,`${label} syntax invalid: ${e.message}`);}
}

[
 ['__NFA_DESKTOP_WORKSPACE_V8__','single Workspace v8 runtime guard'],
 ['navigateToMessage','universal message navigator'],
 ['ensureTargetContext','history context loader'],
 ['state.navSeq','single-flight navigation token'],
 ['openReplies: new Set()','Replies default collapsed'],
 ["out.push(['replies','Replies'])",'Task Message retains Replies control'],
 ['data-v8-task-pdf','Task Message retains Task Trail PDF control'],
 ['nfaDownloadTaskTrailPdf','Workspace exposes PDF owner for v11 to replace'],
 ['nfa-v8-task-pill','Task Message retains TASK pill'],
 ['setAvatar','message avatars hydrate from profile data'],
].forEach(([m,l])=>check(workspace.includes(m),l));

[
 ['#nfaConversationModeV8','Chat/Tasks toggle styles retained'],
 ['.nfa-v8-task-pill','TASK pill style retained'],
 ['#messagesContainer .reply-item','compact reply baseline retained'],
].forEach(([m,l])=>check(workspaceCss.includes(m),l));

[
 ['__NFA_DESKTOP_TASK_COMPOSER_V11__','single Composer v11 guard'],
 ['findComposerRoot','existing chat composer is discovered, not duplicated'],
 ["querySelector?.('#toolbar-container')",'existing chat formatting toolbar is required'],
 ["closest?.('#fileAttachment')",'existing chat paperclip input is intercepted in task mode'],
 ["closest('#sendBtn')",'existing chat Send button is the Task Reply submit owner'],
 ['window.quillEditor','existing Quill editor is reused'],
 ['submitTaskUpdate','Type + Send has direct UPDATE path'],
 ["action: 'UPDATE'",'text-only Send records UPDATE'],
 ["comment: RICH_PREFIX + rich",'UPDATE retains rich formatting safely'],
 ['submitTaskUpload','attachment Send has direct UPLOAD path'],
 ["storage.from('task-proofs').upload",'task attachment uploads to existing task-proofs bucket'],
 ["action: 'FILE'",'attachment Send records one FILE trail'],
 ['NOTE_PREFIX','text + attachment is stored as one FILE event with note'],
 ["actions.push('delegate','extension','submit')",'assignee special actions are Delegate, Extension, Submit'],
 ["actions.push('transfer')",'creator Transfer remains a special action'],
 ['openTaskDelegateAction','Delegate reuses existing owner inline'],
 ['openTaskTransferAction','Transfer reuses existing owner inline'],
 ['openTaskExtensionRequest','Extension reuses existing owner inline'],
 ["taskAction?.(state.taskId,mine.assignee_id,'submit'",'Submit reuses existing task action owner'],
 ['quarantineLegacyLayer','legacy dialog has explicit quarantine owner'],
 ["classList.add('nfa-v11-quarantined')",'legacy task layer is hidden/inert during Task Reply'],
 ["/^Replies\\b/i",'Replies click is separate from Reply mode'],
 ["/^Reply\\b/i",'Reply enters the single task composer'],
 ['decorateTaskReplies','Task Reply presentation has one enhancement pass'],
 ['nfa-v11-reply-file','task files render as attachment cards'],
 ['createSignedUrl(path,120)','image task files receive signed thumbnails'],
 ['openSecureFile?.(path)','task file cards use existing click-to-open owner'],
 ['compactReplyTools','emoji/reaction tools are moved into compact right slot'],
 ['nfa-v11-completed-task','completed task bubbles get read-only decoration'],
 ['Completed tasks are read-only.','completed task Reply is blocked for all users'],
 ['installReminderDedupe','task reminder client single-flight retained'],
 ['2500','rapid duplicate reminder guard retained'],
 ['installActivityTimeOwner','Activity timestamp normalization retained'],
 ['normalizeUtcTimestamp','timezone-less Activity timestamps are normalized'],
 ["window.THEME_LIST = [",'desktop remains two-theme controlled'],
].forEach(([m,l])=>check(composer.includes(m),l));

check(!composer.includes('openTaskUpdateAction'),'Task Reply does not invoke legacy Update dialog owner');
check(!composer.includes('openTaskUploadAction'),'Task Reply does not invoke legacy Upload dialog owner');
check(!composer.includes('openTaskDeadlineAction'),'Deadline is not a Task Reply special action');
check(!composer.includes('openTaskCancelAction'),'Cancel is not a Task Reply special action');
check(!composer.includes('openTaskReturnAction'),'Return is not a Task Reply special action');
check(!composer.includes(".from('messages').insert"),'Composer v11 does not duplicate message/reply insert ownership');
check(!composer.includes('setInterval('),'Composer v11 adds no polling loop');
check(!composer.includes('MutationObserver'),'Composer v11 adds no MutationObserver');

[
 ['.nfa-task-message-v8 .nfa-v8-action-strip','legacy task-bubble mutation strip remains hidden'],
 ['#ntTaskActionLayer.nfa-v11-quarantined','legacy dialog layer cannot become visible'],
 ['.nfa-v11-task-mode #toolbar-container','chat formatting toolbar remains visible in Task Reply'],
 ['.nfa-v11-task-mode .ql-container','chat Quill editor remains visible in Task Reply'],
 ['.nfa-v11-task-mode #sendBtn','chat Send remains visible in Task Reply'],
 ['button[title="Emoji"]','chat Emoji control remains visible in Task Reply'],
 ['button[title="Attach File"]','chat paperclip remains visible in Task Reply'],
 ['.nfa-v11-pending-file','selected task attachment has composer preview'],
 ['.nfa-v11-reply-tools','reply emoji/reaction is right-aligned'],
 ['.nfa-v11-reply-file','task reply file attachment card is styled'],
 ['.nfa-v11-file-icon img','image task replies support thumbnails'],
 ['opacity:.90!important','completed task bubble is exactly 90% opacity'],
 ['pointer-events:none!important','completed mutation controls are disabled'],
 ['html[data-theme="dark"]','dark desktop theme retained'],
].forEach(([m,l])=>check(composerCss.includes(m),l));

[
 ['__NFA_DESKTOP_TASK_PDF_V11__','single professional PDF guard'],
 ['Professional Task Trail','professional PDF title'],
 ["section('TASK SUMMARY')",'PDF has Task Summary table'],
 ["section('ASSIGNEES')",'PDF has Assignees table'],
 ["section('TASK TRAIL')",'PDF has chronological Task Trail table'],
 ["TASK TRAIL — CONTINUED",'long trail repeats tabular section on new pages'],
 ['Page ${i+1} of ${pages.length}','PDF has page numbering'],
 ['/BaseFont /Helvetica-Bold','PDF has professional heading typography'],
 [".from('task_trails')",'PDF reads authoritative task trail'],
].forEach(([m,l])=>check(pdf.includes(m),l));
check(!pdf.includes(".insert("),'professional PDF is read-only');
check(!pdf.includes('setInterval('),'professional PDF adds no polling');
[
 ['__NFA_DESKTOP_TASK_PDF_CLICK_V11__','single PDF click capture guard'],
 ["closest?.('[data-v8-task-pdf]')",'PDF button is captured before legacy target handler'],
 ['stopImmediatePropagation','legacy line-dump PDF handler is suppressed'],
 ['nfaDownloadTaskTrailPdf?.(taskId)','captured PDF click routes to professional owner'],
].forEach(([m,l])=>check(pdfClick.includes(m),l));

check(tasks.includes("addTaskTrail(\n                taskId,\n                'UPDATE'"),'existing task UPDATE owner remains available elsewhere');
check(tasks.includes("addTaskTrail(\n                taskId,\n                'FILE'"),'existing task FILE owner remains available elsewhere');
check(loader.includes("import('./desktop-workspace-v8.js?v=1')"),'loader starts Workspace v8');
check(loader.includes("import('./desktop-task-composer-v11.js?v=1')"),'loader starts Composer v11');
check(loader.includes("import('./desktop-task-pdf-v11.js?v=1')"),'loader starts professional PDF v11');
check(loader.includes("import('./desktop-task-pdf-click-v11.js?v=1')"),'loader starts PDF click owner after professional PDF');
check(loader.includes('./css/desktop-task-composer-v11.css?v=1'),'loader installs Composer v11 CSS');
check(!loader.includes('desktop-task-composer-v10'),'Composer v10 is retired from loader');
check(!loader.includes('desktop-task-composer-v9'),'Composer v9 remains retired from loader');
check(!mobile.includes('desktop-task-composer-v11'),'mobile runtime does not import Composer v11');
check(!native.includes('desktop-task-composer-v11'),'native bridge does not directly import Composer v11');

if(failed){console.error('\nDesktop Workspace v8 + Task Composer v11 validation failed.');process.exit(1);}
console.log('\nDesktop Workspace v8 + chat-native Task Composer v11 validation passed.');