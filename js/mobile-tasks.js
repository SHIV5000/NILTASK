/*
 * Noted For Action — legacy mobile Tasks compatibility shim (PWA v216)
 * ---------------------------------------------------------------------
 * The old Mobile Task UI v208 used to wrap window._navTo and run a
 * MutationObserver that continuously re-rendered its own .nmt-screen.
 * That renderer conflicts with the approved chat-first Tasks owner v214 and
 * caused the production Tasks tab to flicker/refresh continuously.
 *
 * As of PWA v216 this module intentionally DOES NOT render Tasks, observe
 * #mStage, replace navigation, or open the legacy Task Detail workplace.
 *
 * Task/business ownership now is:
 *   - mobile-workflow-parity-v209.js : chat/task workflow + original-message nav
 *   - mobile-role-parity-v210.js     : role/state capability parity
 *   - mobile-final-acceptance-v214.js: approved Tasks summary/filter/list UI
 *   - mobile-task-owner-v216.js      : route ownership + visible version marker
 *
 * These tiny globals are retained only so any older cached UI fragment that
 * calls them fails safely instead of throwing while the new owner takes over.
 */

window.NILTASK_TASK_UI_VERSION = 'retired-v216';
window.NILTASK_LEGACY_MOBILE_TASKS_RETIRED = true;

window.nmtSetTaskFilter = function(value) {
    try {
        localStorage.setItem('nmt_task_filter', value || 'all');
    } catch (e) {}
    try {
        window.dispatchEvent(new CustomEvent('nfa:tasks-filter-compat', {
            detail: { value: value || 'all' }
        }));
    } catch (e) {}
};

window.nmtSetTaskSort = function(value) {
    try {
        localStorage.setItem('nmt_task_sort', value || 'created_desc');
    } catch (e) {}
};

console.log('[NFA] legacy mobile Tasks renderer retired — PWA v216');
