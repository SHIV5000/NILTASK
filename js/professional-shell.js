// NILTASK professional shell enhancer
// Visual-only DOM enhancement. Existing handlers, permissions and data flows remain unchanged.
(function () {
  'use strict';

  const MODULES = [
    { selector: '[onclick*="openTopPanel(\'scheduled\')"]', key: 'schedule', label: 'Schedule', icon: 'ti-calendar-time' },
    { selector: '[onclick*="openTopPanel(\'reminders\')"]', key: 'reminders', label: 'Reminders', icon: 'ti-alarm' },
    { selector: '[onclick*="openTopPanel(\'bookmarks\')"]', key: 'bookmarks', label: 'Bookmarks', icon: 'ti-bookmark' },
    { selector: '[onclick*="openActivityFeed"]', key: 'activity', label: 'Activity', icon: 'ti-activity' },
    { selector: '[onclick*="toggleRightSidebar"]', key: 'tasks', label: 'Tasks', icon: 'ti-checkbox' }
  ];

  function enhanceSchoolBrand() {
    const left = document.getElementById('leftSidebar');
    if (!left) return;

    const schoolName = window.currentSchoolName || 'My School';
    const candidates = [...left.querySelectorAll('div')].filter((el) =>
      el.textContent?.trim() === schoolName && !el.dataset.niltaskSchoolBrand
    );

    const school = candidates[0];
    if (school) {
      school.dataset.niltaskSchoolBrand = '1';
      school.classList.add('nfa-school-name');
      school.parentElement?.classList.add('nfa-school-brand');
      school.setAttribute('title', schoolName);
    }

    const appLabel = [...left.querySelectorAll('div')].find((el) =>
      el.textContent?.trim() === 'Noted For Action' && !el.dataset.niltaskProductLabel
    );
    if (appLabel) {
      appLabel.dataset.niltaskProductLabel = '1';
      appLabel.classList.add('nfa-product-label');
    }
  }

  function enhanceModuleButtons() {
    MODULES.forEach((module) => {
      document.querySelectorAll(module.selector).forEach((button) => {
        button.classList.add('nfa-module-button');
        button.dataset.module = module.key;
        button.setAttribute('aria-label', module.label);

        const icon = button.querySelector('i');
        if (icon) {
          [...icon.classList]
            .filter((c) => c === 'fa-solid' || c.startsWith('fa-') || c.startsWith('ti-'))
            .forEach((c) => icon.classList.remove(c));
          icon.classList.add('ti', module.icon);
        }

        const label = button.querySelector('span');
        if (label) label.textContent = module.label;
      });
    });
  }

  function enhanceShell() {
    document.documentElement.classList.add('nfa-professional-ui');
    document.getElementById('root')?.classList.add('nfa-app-root');
    document.getElementById('leftSidebar')?.classList.add('nfa-left-sidebar');
    document.getElementById('rightSidebar')?.classList.add('nfa-task-sidebar');
    document.querySelector('.chat-area')?.classList.add('nfa-chat-area');
    document.getElementById('messagesContainer')?.classList.add('nfa-messages');
    document.getElementById('tasksPanel')?.classList.add('nfa-task-panel');
    enhanceSchoolBrand();
    enhanceModuleButtons();
  }

  let scheduled = false;
  function scheduleEnhance() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceShell();
    });
  }

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  } else {
    scheduleEnhance();
  }
})();
