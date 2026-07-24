// NILTASK professional shell enhancer
// Presentation layer only. Existing handlers, permissions and data flows remain authoritative.
(function () {
  'use strict';

  const SHELL_CSS = `
    @media (min-width:769px){
      #nfaNavigationRail{width:76px;min-width:76px;height:100%;display:flex;flex-direction:column;align-items:center;padding:16px 10px 14px;gap:12px;background:linear-gradient(180deg,#1f2437 0%,#252b42 100%);border-right:1px solid rgba(255,255,255,.055);box-shadow:8px 0 28px rgba(31,36,55,.08);z-index:35}
      .nfa-rail-logo{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;color:#fff;font-size:21px;font-weight:700;background:linear-gradient(135deg,#5a57d8,#8275f1);box-shadow:0 12px 28px rgba(90,87,216,.36),inset 0 1px 0 rgba(255,255,255,.25)}
      .nfa-rail-items{display:flex;flex-direction:column;align-items:center;gap:7px;width:100%}
      .nfa-rail-spacer{flex:1}
      .nfa-rail-button{width:54px;min-height:52px;border:0;border-radius:14px;background:transparent;color:#b8bfd3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;transition:.18s ease}
      .nfa-rail-button i{font-size:20px;line-height:1}
      .nfa-rail-button span{font-size:9px;font-weight:700;letter-spacing:.01em}
      .nfa-rail-button:hover{color:#fff;background:rgba(255,255,255,.08);transform:translateY(-1px)}
      .nfa-rail-button.is-active{color:#fff;background:linear-gradient(135deg,#5a57d8,#756aeb);box-shadow:0 10px 23px rgba(90,87,216,.28)}
      #leftSidebar.nfa-left-sidebar{border-radius:0!important;background:rgba(255,255,255,.98)!important;box-shadow:4px 0 24px rgba(31,36,55,.035)!important}
      .nfa-left-sidebar>div:first-child{padding:15px 14px 11px!important;background:linear-gradient(180deg,#fff 0%,#fafaff 100%)!important}
      .nfa-product-label{font-size:9px!important;letter-spacing:.17em!important;color:#5a57d8!important;margin-bottom:7px!important}
      .nfa-school-name{display:block!important;width:100%!important;padding:12px 14px!important;margin:0 0 11px!important;font-size:17px!important;border-radius:15px!important;color:#fff!important;background:linear-gradient(145deg,#6662e4 0%,#514ecb 52%,#413eae 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 -3px 0 rgba(34,31,112,.3),0 12px 24px rgba(70,67,180,.23)!important;text-shadow:0 2px 3px rgba(25,23,90,.34)!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nfa-conversation-list{padding:7px 8px 12px!important}
      .nfa-conversation-list .channel-item,.nfa-conversation-list>[class*="cursor"]{border-radius:13px!important;margin:3px 0!important;transition:.16s ease!important}
      .nfa-conversation-list .channel-item:hover,.nfa-conversation-list>[class*="cursor"]:hover{background:#f0f1ff!important;transform:translateX(2px)}
      .nfa-sidebar-search-wrap{padding:9px 10px!important;background:#fafbfe!important}
      .nfa-sidebar-search{border-radius:12px!important;background:#f5f6fa!important;border:1px solid #e6e9f1!important}
      .nfa-user-strip{background:linear-gradient(180deg,#fbfbfe,#f6f7fb)!important;padding:10px 11px!important}
      .nfa-chat-area>div:first-child{min-height:70px;padding:12px 18px!important;background:rgba(255,255,255,.96)!important;box-shadow:0 5px 20px rgba(31,36,55,.045)!important}
      #roomTitleDisplay{font-size:18px!important;font-weight:700!important;letter-spacing:-.015em!important}
      #messagesContainer.nfa-messages{padding:22px 24px!important;background-color:#f7f8fc!important;background-image:radial-gradient(circle at 1px 1px,rgba(90,87,216,.055) 1px,transparent 0)!important;background-size:24px 24px!important}
      .nfa-chat-area>div:last-child{background:rgba(255,255,255,.97)!important;box-shadow:0 -5px 18px rgba(31,36,55,.035)!important}
      #rightSidebar.nfa-task-sidebar{background:rgba(255,255,255,.985)!important;box-shadow:-7px 0 28px rgba(31,36,55,.045)!important}
      #rightSidebar .jira-card{margin:10px!important;border-radius:16px!important}
      .nfa-legacy-module-button{display:none!important}
      .topbar-icon-btn{border-radius:11px!important;padding:6px 8px!important}
      .topbar-icon-btn span{font-size:9px!important}
      .bubble{border-radius:17px!important;box-shadow:0 8px 24px rgba(31,36,55,.065)!important}
    }
    @media (max-width:1120px) and (min-width:769px){#nfaNavigationRail{width:68px;min-width:68px}.nfa-rail-button{width:48px}.nfa-rail-button span{display:none}}
    @media (max-width:768px){#nfaNavigationRail{display:none!important}}
  `;

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

  function ensureShellStyles(){
    if(document.getElementById('nfa-visible-shell-style')) return;
    const style=document.createElement('style');
    style.id='nfa-visible-shell-style';
    style.textContent=SHELL_CSS;
    document.head.appendChild(style);
  }

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

    rail.appendChild(createRailButton({key:'settings',label:'Settings',icon:'ti-settings',action:()=>window.openSettings?.()}));
    appRow.insertBefore(rail, left);
    setActiveRail('messages');
  }

  function enhanceSchoolBrand() {
    const left = document.getElementById('leftSidebar');
    const header = left?.firstElementChild;
    if (!left || !header) return;

    const schoolName = window.currentSchoolName || 'My School';
    let school = document.getElementById('nfaSchoolName');
    if (!school) {
      school = document.createElement('div');
      school.id = 'nfaSchoolName';
      school.className = 'nfa-school-name';
      const productLabel = [...header.querySelectorAll('div')].find((el) => el.textContent?.trim() === 'Noted For Action');
      if (productLabel?.nextSibling) header.insertBefore(school, productLabel.nextSibling);
      else header.prepend(school);
    }
    school.textContent = schoolName;
    school.title = schoolName;

    const appLabel = [...header.querySelectorAll('div')].find((el) => el.textContent?.trim() === 'Noted For Action');
    if (appLabel) appLabel.classList.add('nfa-product-label');
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
        button.classList.add('nfa-module-button', 'nfa-legacy-module-button');
        button.dataset.module = module.key;
        button.setAttribute('aria-label', module.label);
        const icon = button.querySelector('i');
        if (icon) {
          [...icon.classList].filter((c) => c === 'fa-solid' || c.startsWith('fa-') || c.startsWith('ti-')).forEach((c) => icon.classList.remove(c));
          icon.classList.add('ti', module.icon);
        }
        const label = button.querySelector('span');
        if (label) label.textContent = module.label;
      });
    });
  }

  function enhanceShell() {
    ensureShellStyles();
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
    requestAnimationFrame(() => { scheduled = false; enhanceShell(); });
  }

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', scheduleEnhance, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleEnhance, { once: true });
  else scheduleEnhance();
})();