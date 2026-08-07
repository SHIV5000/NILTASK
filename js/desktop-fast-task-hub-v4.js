/*
 * Compatibility loader: the old desktop Task Hub workflow is retired.
 * The existing import path remains stable, but now loads the approved
 * Task Message + Task Lens workspace instead.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_TASK_MESSAGE_LOADER_V6__) return;
  window.__NFA_DESKTOP_TASK_MESSAGE_LOADER_V6__ = true;

  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  if (
    window.IS_NATIVE ||
    window.innerWidth < 769 ||
    window.isMobileView?.() ||
    coarse
  ) return;

  if (!document.getElementById('nfa-desktop-task-messages-v6-css')) {
    const link = document.createElement('link');
    link.id = 'nfa-desktop-task-messages-v6-css';
    link.rel = 'stylesheet';
    link.href = './css/desktop-task-messages-v6.css?v=1';
    document.head.appendChild(link);
  }

  // The older Activity-dock controller previously interpreted Tasks as a reason
  // to release the right sidebar. In the Task-Message architecture, Tasks is a
  // central Task Lens, so restore the dock after the click when the user's saved
  // wide-screen preference says Activity should be visible.
  let railFrames = 0;
  const installLensActivityBridge = () => {
    const rail = document.getElementById('nfaDesktopRail');
    if (!rail) {
      railFrames += 1;
      if (railFrames < 240) requestAnimationFrame(installLensActivityBridge);
      return;
    }
    if (rail.dataset.nfaTaskLensActivityBridge === '1') return;
    rail.dataset.nfaTaskLensActivityBridge = '1';
    rail.addEventListener('click', event => {
      const action = event.target.closest('[data-nfa-action]')?.dataset?.nfaAction;
      if (action !== 'tasks' || window.innerWidth < 1180) return;
      const key = `nfa_activity_dock_visible_v1:${window.currentTenantId || 'tenant'}:${window.currentUser?.id || 'user'}`;
      let preferred = true;
      try { preferred = localStorage.getItem(key) !== '0'; } catch (_) {}
      if (!preferred) return;
      setTimeout(() => window.nfaSetActivityDockVisible?.(true), 0);
    }, true);
  };
  requestAnimationFrame(installLensActivityBridge);

  import('./desktop-task-messages-v6.js?v=1').catch(error => {
    console.error('[desktop-task-messages-v6] load failed', error);
  });
})();
