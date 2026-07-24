// NILTASK professional refinements
// Presentation hooks only. Existing application handlers remain authoritative.
(function () {
  'use strict';

  function ensureAsset(id, tag, attrs) {
    if (document.getElementById(id)) return;
    const el = document.createElement(tag);
    el.id = id;
    Object.entries(attrs).forEach(([key, value]) => { el[key] = value; });
    document.head.appendChild(el);
  }

  function ensurePresentationLayers() {
    ensureAsset('nfa-professional-tasks-css', 'link', { rel: 'stylesheet', href: './css/professional-tasks.css?v=2' });
    ensureAsset('nfa-professional-tasks-js', 'script', { src: './js/professional-tasks.js?v=2', defer: true });
    ensureAsset('nfa-professional-modules-css', 'link', { rel: 'stylesheet', href: './css/professional-modules.css?v=1' });
    ensureAsset('nfa-professional-modules-js', 'script', { src: './js/professional-modules.js?v=1', defer: true });
    ensureAsset('nfa-professional-workspace-css', 'link', { rel: 'stylesheet', href: './css/professional-workspace.css?v=2' });
    ensureAsset('nfa-professional-workspace-js', 'script', { src: './js/professional-workspace.js?v=2', defer: true });
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
    ensurePresentationLayers();
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