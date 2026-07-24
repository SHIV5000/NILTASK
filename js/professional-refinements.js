// NILTASK professional refinements
// Presentation hooks only. Existing application handlers remain authoritative.
(function () {
  'use strict';

  function ensureTaskEnhancer() {
    if (document.getElementById('nfa-professional-tasks-js')) return;
    const script = document.createElement('script');
    script.id = 'nfa-professional-tasks-js';
    script.src = './js/professional-tasks.js?v=1';
    script.defer = true;
    document.head.appendChild(script);
  }

  function markDuplicateSchoolName() {
    const header = document.getElementById('leftSidebar')?.firstElementChild;
    const branded = document.getElementById('nfaSchoolName');
    if (!header || !branded) return;
    const name = branded.textContent?.trim();
    if (!name) return;
    [...header.querySelectorAll('div')].forEach((el) => {
      if (el !== branded && el.textContent?.trim() === name) {
        el.classList.add('nfa-legacy-school-name');
        el.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function markPanels() {
    const activityHeading = [...document.querySelectorAll('div,span,h1,h2,h3')]
      .find((el) => el.textContent?.trim() === 'Activity Feed');
    const activityPanel = activityHeading?.closest('[class*="fixed"], [class*="absolute"], aside, section') || activityHeading?.parentElement?.parentElement;
    activityPanel?.classList.add('nfa-activity-panel');

    document.querySelectorAll('.nfa-activity-panel button').forEach((button) => {
      if (button.textContent?.trim() === 'Open') button.classList.add('nfa-activity-open');
    });

    document.querySelectorAll('#rightSidebar .jira-card').forEach((card) => card.classList.add('nfa-refined-task-card'));
    document.querySelectorAll('#chatShellContainer .bubble').forEach((bubble) => bubble.classList.add('nfa-refined-message'));
  }

  function run() {
    ensureTaskEnhancer();
    markDuplicateSchoolName();
    markPanels();
  }

  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      run();
    });
  };

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, { once: true });
  else schedule();
})();
