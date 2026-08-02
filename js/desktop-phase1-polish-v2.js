/*
 * Noted For Action — desktop Phase 1 visual and navigation polish v2.
 *
 * Keeps the legacy right-panel / action-drawer task workflow. This layer:
 * - shows the authenticated role in message bubbles, including replies;
 * - moves Reminders from the top bar to the NFA rail;
 * - adds a reversible full-workspace Task Hub view;
 * - modernises scroll controls, dropdowns and task-card separation through CSS.
 *
 * No polling loop, MutationObserver, database owner or task renderer is added.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_PHASE1_POLISH_V2__) return;
  window.__NFA_DESKTOP_PHASE1_POLISH_V2__ = true;

  const state = {
    renderMessagesOwner: null,
    sendMessageOwner: null,
    renderMainOwner: null,
    installFrames: 0
  };

  function isDesktop() {
    return window.innerWidth >= 769 &&
      !window.IS_NATIVE &&
      !window.isMobileView?.() &&
      !window.matchMedia?.('(pointer: coarse)').matches;
  }

  if (!isDesktop()) return;

  function humanRole(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function cachedUser(userId) {
    return (window.globalUsersCache || []).find(user => user.id === userId) || null;
  }

  function actualRoleLabel(userId, profile) {
    if (userId && userId === window.currentUser?.id) {
      return humanRole(
        window.currentRoleName ||
        window.currentRole ||
        window.currentDesignation ||
        profile?.role ||
        profile?.designation
      );
    }

    const cached = cachedUser(userId);
    return humanRole(
      cached?.role_display_name ||
      cached?.role_name ||
      cached?.role ||
      profile?.role ||
      cached?.designation ||
      profile?.designation
    );
  }

  function installMessageRoleOwners() {
    const renderOwner = window.renderMessages;
    if (typeof renderOwner === 'function' && !renderOwner.__nfaActualRoleWrapped) {
      state.renderMessagesOwner = renderOwner;

      const wrappedRender = function (messages) {
        const currentRole = actualRoleLabel(window.currentUser?.id, null);
        const previousDesignation = window.currentDesignation;
        const enriched = (Array.isArray(messages) ? messages : []).map(message => {
          const role = actualRoleLabel(message?.sender_id, message?.profiles);
          if (!role) return message;
          return {
            ...message,
            profiles: {
              ...(message?.profiles || {}),
              designation: role,
              role
            }
          };
        });

        if (currentRole) window.currentDesignation = currentRole;
        try {
          return renderOwner.apply(this, [enriched, ...Array.prototype.slice.call(arguments, 1)]);
        } finally {
          window.currentDesignation = previousDesignation;
        }
      };

      wrappedRender.__nfaActualRoleWrapped = true;
      wrappedRender.__nfaActualRoleOwner = renderOwner;
      window.renderMessages = wrappedRender;
    }

    const sendOwner = window.sendMessage;
    if (typeof sendOwner === 'function' && !sendOwner.__nfaActualRoleWrapped) {
      state.sendMessageOwner = sendOwner;

      const wrappedSend = async function () {
        const previousDesignation = window.currentDesignation;
        const currentRole = actualRoleLabel(window.currentUser?.id, null);
        if (currentRole) window.currentDesignation = currentRole;
        try {
          return await sendOwner.apply(this, arguments);
        } finally {
          window.currentDesignation = previousDesignation;
        }
      };

      wrappedSend.__nfaActualRoleWrapped = true;
      wrappedSend.__nfaActualRoleOwner = sendOwner;
      window.sendMessage = wrappedSend;
    }

    return Boolean(window.renderMessages?.__nfaActualRoleWrapped) &&
      Boolean(window.sendMessage?.__nfaActualRoleWrapped);
  }

  function setRailActive(action) {
    const rail = document.getElementById('nfaDesktopRail');
    rail?.querySelectorAll('.nfa-rail-button[data-nfa-action]').forEach(button => {
      button.classList.toggle('nfa-active', button.dataset.nfaAction === action);
    });
  }

  function ensureRightSidebarVisible() {
    const panel = document.getElementById('rightSidebar');
    if (!panel) return null;
    if (window.getComputedStyle(panel).display === 'none') {
      panel.style.setProperty('display', 'flex', 'important');
      try { localStorage.setItem('mpgs_right_sidebar_state', 'flex'); } catch (_) {}
    }
    return panel;
  }

  function hideTopReminderShortcut() {
    document.querySelectorAll('.topbar-icon-btn, .top-bar-icon').forEach(button => {
      const title = String(button.getAttribute('title') || '').toLowerCase();
      const onclick = String(button.getAttribute('onclick') || '').toLowerCase();
      if (title === 'reminders' || title === 'reminder' || onclick.includes("opentoppanel('reminders')")) {
        button.dataset.nfaMovedToRail = '1';
        button.hidden = true;
        button.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function ensureReminderRailButton() {
    const rail = document.getElementById('nfaDesktopRail');
    if (!rail) return false;

    let button = rail.querySelector('[data-nfa-action="reminders"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'nfa-rail-button';
      button.dataset.nfaAction = 'reminders';
      button.title = 'Reminders';
      button.setAttribute('aria-label', 'Reminders');
      button.innerHTML = '<i class="fa-regular fa-bell" aria-hidden="true"></i><span>Reminder</span>';

      const activity = rail.querySelector('[data-nfa-action="activity"]');
      if (activity?.nextSibling) rail.insertBefore(button, activity.nextSibling);
      else if (activity) rail.appendChild(button);
      else rail.insertBefore(button, rail.querySelector('.nfa-rail-spacer'));
    }

    if (button.dataset.nfaReminderOwner !== '1') {
      button.dataset.nfaReminderOwner = '1';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        collapseTaskHub();
        setRailActive('reminders');
        ensureRightSidebarVisible();
        window.openTopPanel?.('reminders');
      }, true);
    }

    return true;
  }

  function shellElements() {
    const right = document.getElementById('rightSidebar');
    const shell = right?.closest('.nfa-speed-shell') || document.querySelector('#root > .nfa-speed-shell');
    const rail = document.getElementById('nfaDesktopRail');
    return { shell, right, rail };
  }

  function updateRailStop() {
    const { shell, rail } = shellElements();
    if (!shell || !rail) return;
    shell.style.setProperty('--nfa-phase1-rail-stop', `${Math.ceil(rail.getBoundingClientRect().width)}px`);
  }

  function setTaskHubExpanded(expanded) {
    const { shell, right } = shellElements();
    if (!shell || !right) return false;

    const next = Boolean(expanded);
    shell.classList.toggle('nfa-task-hub-expanded', next);
    right.classList.toggle('nfa-task-hub-expanded', next);
    right.setAttribute('aria-expanded', String(next));

    const button = document.getElementById('nfaTaskHubExpandToggle');
    if (button) {
      button.setAttribute('aria-pressed', String(next));
      button.setAttribute('aria-label', next ? 'Restore Task Hub width' : 'Expand Task Hub to the navigation rail');
      button.title = next ? 'Restore Task Hub width' : 'Expand Task Hub';
      button.innerHTML = next
        ? '<i class="fa-solid fa-compress" aria-hidden="true"></i><span>Restore</span>'
        : '<i class="fa-solid fa-expand" aria-hidden="true"></i><span>Expand</span>';
    }

    if (next) {
      updateRailStop();
      ensureRightSidebarVisible();
      document.querySelectorAll('.top-panel-dropdown').forEach(panel => panel.remove());
      if (document.getElementById('activityFeedPanel')) window.closeActivityFeed?.();
      window.loadTasksForPanel?.();
      setRailActive('tasks');
      requestAnimationFrame(() => document.getElementById('tasksPanel')?.focus?.({ preventScroll: true }));
    }

    return true;
  }

  function collapseTaskHub() {
    return setTaskHubExpanded(false);
  }

  function ensureTaskHubToggle() {
    const heading = document.getElementById('nfaTaskHubHeading');
    if (!heading) return false;

    let button = document.getElementById('nfaTaskHubExpandToggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'nfaTaskHubExpandToggle';
      button.type = 'button';
      button.className = 'nfa-task-hub-expand-toggle';
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', 'Expand Task Hub to the navigation rail');
      button.title = 'Expand Task Hub';
      button.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i><span>Expand</span>';
      heading.appendChild(button);
    }

    if (button.dataset.nfaExpandOwner !== '1') {
      button.dataset.nfaExpandOwner = '1';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const shell = shellElements().shell;
        setTaskHubExpanded(!shell?.classList.contains('nfa-task-hub-expanded'));
      });
    }
    return true;
  }

  function installShellEvents() {
    const rail = document.getElementById('nfaDesktopRail');
    if (rail && rail.dataset.nfaPhase1CollapseOwner !== '1') {
      rail.dataset.nfaPhase1CollapseOwner = '1';
      rail.addEventListener('click', event => {
        const action = event.target.closest('[data-nfa-action]')?.dataset?.nfaAction;
        if (action && action !== 'tasks') collapseTaskHub();
      }, true);
    }

    if (document.documentElement.dataset.nfaPhase1KeyOwner !== '1') {
      document.documentElement.dataset.nfaPhase1KeyOwner = '1';
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && shellElements().shell?.classList.contains('nfa-task-hub-expanded')) {
          collapseTaskHub();
          document.getElementById('nfaTaskHubExpandToggle')?.focus();
        }
      });
      window.addEventListener('resize', () => {
        if (!isDesktop()) {
          collapseTaskHub();
          return;
        }
        updateRailStop();
      }, { passive: true });
    }
  }

  function mountShellPolish() {
    if (!isDesktop()) return false;
    hideTopReminderShortcut();
    const reminderReady = ensureReminderRailButton();
    const expandReady = ensureTaskHubToggle();
    installShellEvents();
    updateRailStop();
    return reminderReady && expandReady;
  }

  function installRenderMainOwner() {
    const owner = window.renderMainApp;
    if (typeof owner !== 'function' || owner.__nfaPhase1PolishWrapped) return Boolean(owner);

    state.renderMainOwner = owner;
    const wrapped = async function () {
      const result = await owner.apply(this, arguments);
      requestAnimationFrame(mountShellPolish);
      return result;
    };
    wrapped.__nfaPhase1PolishWrapped = true;
    wrapped.__nfaPhase1PolishOwner = owner;
    window.renderMainApp = wrapped;
    return true;
  }

  function installWhenReady() {
    const roleReady = installMessageRoleOwners();
    const renderReady = installRenderMainOwner();
    const shellReady = mountShellPolish();

    if (roleReady && renderReady && shellReady) return;
    state.installFrames += 1;
    if (state.installFrames < 180) requestAnimationFrame(installWhenReady);
  }

  window.nfaSetTaskHubExpanded = setTaskHubExpanded;
  window.nfaCollapseTaskHub = collapseTaskHub;
  window.nfaResolveActualRoleLabel = actualRoleLabel;

  requestAnimationFrame(installWhenReady);
})();
