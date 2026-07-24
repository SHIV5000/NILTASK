// NILTASK professional shell enhancer
// Presentation layer only. Existing handlers, permissions and data flows remain authoritative.
(function () {
  'use strict';

  const MODULES = [
    { selector: '[onclick*="openTopPanel(\'scheduled\')"]', key: 'schedule', label: 'Schedule', icon: 'ti-calendar-time' },
    { selector: '[onclick*="openTopPanel(\'reminders\')"]', key: 'reminders', label: 'Reminders', icon: 'ti-alarm' },
    { selector: '[onclick*="openTopPanel(\'bookmarks\')"]', key: 'bookmarks', label: 'Bookmarks', icon: 'ti-bookmark' },
    { selector: '[onclick*="openActivityFeed"]', key: 'activity', label: 'Activity', icon: 'ti-activity' },
    { selector: '[onclick*="toggleRightSidebar"]', key: 'tasks', label: 'Tasks', icon: 'ti-checkbox' }
  ];

  const RAIL_ITEMS = [
    { key: 'messages', label: 'Messages', icon: 'ti-messages', action: showMessages },
    { key: 'tasks', label: 'Tasks', icon: 'ti-checkbox', action: () => window.toggleRightSidebar?.() },
    { key: 'activity', label: 'Activity', icon: 'ti-activity', action: () => window.openActivityFeed?.() },
    { key: 'notifications', label: 'Notifications', icon: 'ti-bell', action: () => window.openTopPanel?.('alerts') },
    { key: 'schedule', label: 'Schedule', icon: 'ti-calendar-time', action: () => window.openTopPanel?.('scheduled') }
  ];

  function showMessages() {
    window.closeActivityFeed?.();
    const left = document.getElementById('leftSidebar');
    if (left && getComputedStyle(left).display === 'none') window.toggleLeftSidebar?.();
    document.getElementById('messagesContainer')?.focus?.({ preventScroll: true });
    setActiveRail('messages');
  }

  function setActiveRail(key) {
    document.querySelectorAll('.nfa-rail-button').forEach((button) => {
      const active = button.dataset.module === key;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function createRailButton(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nfa-rail-button';
    button.dataset.module = item.key;
    button.setAttribute('aria-label', item.label);
    button.title = item.label;
    button.innerHTML = `<i class="ti ${item.icon}" aria-hidden="true"></i><span>${item.label}</span>`;
    button.addEventListener('click', () => {
      item.action();
      setActiveRail(item.key);
    });
    return button;
  }

  function ensureNavigationRail() {
    if (window.innerWidth <= 768) return;
    const left = document.getElementById('leftSidebar');
    const appRow = left?.parentElement;
    if (!left || !appRow || document.getElementById('nfaNavigationRail')) return;

    const rail = document.createElement('nav');
    rail.id = 'nfaNavigationRail';
    rail.className = 'nfa-navigation-rail';
    rail.setAttribute('aria-label', 'Main modules');

    const logo = document.createElement('div');
    logo.className = 'nfa-rail-logo';
    logo.textContent = 'N';
    logo.title = 'NILTASK';
    rail.appendChild(logo);

    const items = document.createElement('div');
    items.className = 'nfa-rail-items';
    RAIL_ITEMS.forEach((item) => items.appendChild(createRailButton(item)));
    rail.appendChild(items);

    const spacer = document.createElement('div');
    spacer.className = 'nfa-rail-spacer';
    rail.appendChild(spacer);

    const settings = createRailButton({
      key: 'settings', label: 'Settings', icon: 'ti-settings', action: () => window.openSettings?.()
    });
    rail.appendChild(settings);

    appRow.insertBefore(rail, left);
    setActiveRail('messages');
  }

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

  function enhanceConversationPanel() {
    const left = document.getElementById('leftSidebar');
    if (!left) return;
    left.querySelector('#chatsList')?.classList.add('nfa-conversation-list');
    left.querySelector('#sidebarSearchWrap')?.classList.add('nfa-sidebar-search-wrap');
    left.querySelector('#sidebarSearch')?.classList.add('nfa-sidebar-search');
    [...left.children].at(-1)?.classList.add('nfa-user-strip');
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
    ensureNavigationRail();
    enhanceSchoolBrand();
    enhanceConversationPanel();
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

  window.addEventListener('resize', scheduleEnhance, { passive: true });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  } else {
    scheduleEnhance();
  }
})();