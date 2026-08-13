import fs from 'node:fs';
import vm from 'node:vm';

const failures = [];
const passes = [];
const read = path => fs.readFileSync(path, 'utf8');
const check = (condition, label) => condition ? passes.push(label) : failures.push(label);
const contains = (source, needle, label) => check(source.includes(needle), `${label} — expected ${JSON.stringify(needle)}`);
const excludes = (source, needle, label) => check(!source.includes(needle), `${label} — forbidden ${JSON.stringify(needle)}`);

const service = read('js/core/chat-parity-service.js');
const entry = read('js/activity-v208.js');
const sw = read('sw.js');

try {
  new vm.Script(service, { filename:'js/core/chat-parity-service.js' });
  passes.push('Chat parity classic script parses');
} catch (error) {
  failures.push(`Chat parity syntax error: ${error.message}`);
}

contains(service, "const VERSION = 'v2';", 'Chat parity version is v2');
contains(service, "const OWNER = 'cross-platform-chat-parity';", 'Chat parity has one named realtime owner');
contains(service, '`niltask-chat-parity-${STATE.tenantId}`', 'Chat parity uses a tenant-scoped shared topic');
contains(service, ".on('broadcast', { event:'typing' }", 'Shared topic receives typing');
contains(service, "event: 'typing'", 'Shared topic sends typing');
contains(service, "document.getElementById('mTypingArea')", 'Mobile typing bar is rendered');
contains(service, "document.getElementById('webTypingBar')", 'Desktop typing bar is rendered');
contains(service, "payload.uid === STATE.userId", 'Typing ignores own-user echo');
contains(service, 'payload.tenant_id !== STATE.tenantId', 'Typing enforces tenant identity');

contains(service, "event:'INSERT', schema:'public', table:'reactions'", 'Reaction INSERT reconciliation remains present');
contains(service, "event:'DELETE', schema:'public', table:'reactions'", 'Reaction DELETE reconciliation remains present');
contains(service, "type: reaction.type === 'emoji' ? 'emoji' : 'tag'", 'Non-emoji reactions normalize to text tags');
contains(service, 'window.NFA_fetchReactions', 'Reaction rendering uses canonical database reconciliation');
contains(service, 'patchMobileReaction(id, list);', 'Canonical reactions patch mobile bubbles');
contains(service, 'row.id = `row-${reply.id}`;', 'Desktop reply rows receive stable message IDs');
contains(service, 'footer.id = `footer-${reply.id}`;', 'Desktop reply rows receive reaction footers');
contains(service, "window._showReactionPicker('${attr(reply.id)}', this)", 'Desktop reply rows expose reaction controls');
contains(service, 'if (footer.innerHTML !== desired)', 'Reply decoration is mutation-idempotent');
excludes(service, 'CSS.escape', 'Reply decoration has no CSS.escape dependency');

contains(service, "#mMsgArea,#mDMArea,#mThreadArea", 'Offline cache covers group, DM and thread screens');
contains(service, "context.kind === 'thread'", 'Thread parent and reply rows are cached');
contains(service, 'niltask_mobile_html_cache:', 'Offline cache is identity scoped');
contains(service, 'if (!navigator.onLine) restoreMobileArea(area);', 'Offline cache restores only while offline');
contains(service, "STATE.mobileObserver.observe(mobileApp", 'Mobile cache observer is feature scoped');
contains(service, "STATE.desktopObserver.observe(shell", 'Reply observer is feature scoped');
excludes(service, 'document.body', 'Chat parity creates no body-wide observer');

contains(entry, "js/core/chat-parity-service.js?v=2", 'Runtime entrypoint loads ChatParity v2');
contains(entry, "script[data-nfa-chat-parity]", 'Runtime entrypoint prevents duplicate loading');
contains(sw, "const CACHE = 'taskflow-v217';", 'PWA cache generation is v217');
contains(sw, "'/js/core/chat-parity-service.js?v=2'", 'PWA precaches exact ChatParity URL');

if (failures.length) {
  console.error(`\nChat parity validation FAILED (${failures.length}):`);
  failures.forEach(failure => console.error(`  - ${failure}`));
  console.error(`\nPassed checks: ${passes.length}`);
  process.exit(1);
}

console.log(`Chat parity validation passed: ${passes.length} checks.`);
