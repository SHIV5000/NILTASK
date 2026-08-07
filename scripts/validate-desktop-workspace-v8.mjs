import fs from 'node:fs';
const read = p => fs.readFileSync(p,'utf8');
let failed=false;
const check=(ok,msg)=>{console.log(`${ok?'✓':'✖'} ${msg}`);if(!ok)failed=true;};
const js=read('js/desktop-workspace-v8.js');
const css=read('css/desktop-workspace-v8.css');
const loader=read('js/desktop-fast-task-hub-v4.js');
const mobile=read('js/mobile.js');
const native=read('js/native.js');
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
].forEach(([m,l])=>check(js.includes(m),l));
[
 ['#nfaConversationModeV8','Chat/Tasks toggle styles'],
 ['linear-gradient(180deg,#34c879','green 3D Chat control'],
 ['linear-gradient(180deg,#ff6868','red 3D Tasks control'],
 ['.nfa-v8-lens-summary','Task Lens summary styling'],
 ['font-size:11.5px','larger secondary Task Lens/trail text'],
 ['nfaV8TargetPulse','single target highlight pulse'],
 ['.nfa-v8-password-section','password section stays in profile card'],
].forEach(([m,l])=>check(css.includes(m),l));
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
console.log('\nDesktop Workspace v8 validation passed.');
