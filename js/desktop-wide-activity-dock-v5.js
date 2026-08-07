/*
 * Noted For Action — wide-screen persistent Activity dock v5.
 *
 * Wide fine-pointer desktops open Activity in the existing right sidebar by
 * default. The user may hide it with the header control or the Activity rail
 * button; the preference is stored per tenant/user. Existing Activity fetch,
 * refresh, navigation and item-level read owners remain authoritative.
 *
 * No database owner, realtime subscription, polling loop or MutationObserver
 * is introduced here.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_WIDE_ACTIVITY_DOCK_V5__) return;
  window.__NFA_DESKTOP_WIDE_ACTIVITY_DOCK_V5__ = true;

  const MIN_WIDTH = 1180;
  const state = {
    openOwner: null,
    closeOwner: null,
    renderOwner: null,
    savedInlineWidth: '',
    savedWidthCaptured: false,
    transientTaskMode: false,
    opening: false,
    closing: false,
    installFrames: 0,
    resizeTimer: null
  };

  function isWideDesktop() {
    return window.innerWidth >= MIN_WIDTH &&
      !window.IS_NATIVE &&
      !window.isMobileView?.() &&
      !window.matchMedia?.('(pointer: coarse)').matches;
  }

  function identityReady() {
    return Boolean(window.currentUser?.id && window.currentTenantId);
  }

  function preferenceKey() {
    const tenant = window.currentTenantId || 'tenant';
    const user = window.currentUser?.id || 'user';
    return `nfa_activity_dock_visible_v1:${tenant}:${user}`;
  }

  function preferenceVisible() {
    try {
      return localStorage.getItem(preferenceKey()) !== '0';
    } catch (_) {
      return true;
    }
  }

  function savePreference(visible) {
    try {
      localStorage.setItem(preferenceKey(), visible ? '1' : '0');
    } catch (_) {}
  }

  function elements() {
    const right = document.getElementById('rightSidebar');
    const shell = right?.closest('.nfa-speed-shell') ||
      document.querySelector('#root > .nfa-speed-shell');
    return {
      right,
      shell,
      rail: document.getElementById('nfaDesktopRail'),
      heading: document.getElementById('nfaTaskHubHeading'),
      focusBar: document.getElementById('nfaFocusedTaskBar'),
      panel: document.getElementById('activityFeedPanel'),
      taskPanel: document.getElementById('tasksPanel'),
      filters: document.getElementById('rightSidebarFilters'),
      range: document.getElementById('dateRangeFilter')
    };
  }

  function installStyles() {
    if (document.getElementById('nfa-wide-activity-dock-v5-styles')) return;
    const style = document.createElement('style');
    style.id = 'nfa-wide-activity-dock-v5-styles';
    style.textContent = `
      @media (min-width: ${MIN_WIDTH}px) and (pointer: fine) {
        .nfa-speed-shell.nfa-wide-activity-layout {
          min-width: 0;
        }

        #rightSidebar.nfa-wide-activity-dock {
          display: flex !important;
          flex-direction: column !important;
          min-width: 320px !important;
          max-width: 430px !important;
          border-left: 1px solid var(--border-color, #dfe4ec) !important;
          background: var(--bg-body, #f7f8fc) !important;
          box-shadow: -8px 0 24px rgba(15, 23, 42, .05) !important;
        }

        #rightSidebar.nfa-wide-activity-dock #nfaTaskHubHeading,
        #rightSidebar.nfa-wide-activity-dock #nfaFocusedTaskBar,
        #rightSidebar.nfa-wide-activity-dock #rightSidebarFilters,
        #rightSidebar.nfa-wide-activity-dock #dateRangeFilter,
        #rightSidebar.nfa-wide-activity-dock #tasksPanel {
          display: none !important;
        }

        #rightSidebar.nfa-wide-activity-dock #activityFeedPanel {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          width: 100% !important;
          border: 0 !important;
        }

        #rightSidebar.nfa-wide-activity-dock #activityFeedPanel .nfa-af-header {
          padding: 10px 11px 9px !important;
        }

        #rightSidebar.nfa-wide-activity-dock #activityFeedPanel .nfa-af-close {
          width: auto !important;
          min-width: 64px !important;
          height: 30px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 5px !important;
          padding: 0 9px !important;
          border: 1px solid var(--border-color, #d9dee8) !important;
          border-radius: 8px !important;
          background: var(--bg-body, #f8fafc) !important;
          color: var(--text-secondary, #64748b) !important;
          font-size: 9px !important;
          font-weight: 850 !important;
        }

        #rightSidebar.nfa-wide-activity-dock #activityFeedPanel .nfa-af-close:hover {
          color: var(--accent, #4f46e5) !important;
          border-color: color-mix(in srgb, var(--accent, #4f46e5) 38%, var(--border-color, #d9dee8)) !important;
          transform: translateY(-1px);
        }

        #rightSidebar.nfa-wide-activity-dock #activityFeedPanel .nfa-af-clear-all {
          min-height: 30px !important;
        }

        #rightSidebar.nfa-wide-activity-dock #activityFeedList {
          overscroll-behavior: contain;
          scroll-behavior: smooth;
          scrollbar-gutter: stable;
        }

        #nfaDesktopRail .nfa-rail-button[data-nfa-action="activity"].nfa-active {
          background: color-mix(in srgb, var(--accent, #6366f1) 22%, transparent) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function setActivityRailActive(active) {
    const button = elements().rail?.querySelector('[data-nfa-action="activity"]');
    button?.classList.toggle('nfa-active', Boolean(active));
    button?.setAttribute('aria-pressed', String(Boolean(active)));
  }

  function captureWidth(right) {
    if (!right || state.savedWidthCaptured) return;
    state.savedWidthCaptured = true;
    state.savedInlineWidth = right.style.width || '';
  }

  function applyDockPresentation() {
    const { right, shell, heading, focusBar, panel } = elements();
    if (!right || !panel) return false;

    captureWidth(right);
    if (right.getBoundingClientRect().width < 320) {
      right.style.setProperty('width', '350px', 'important');
    }

    shell?.classList.add('nfa-wide-activity-layout');
    right.classList.add('nfa-wide-activity-dock');
    right.setAttribute('aria-label', 'Persistent Activity Feed');
    heading?.setAttribute('aria-hidden', 'true');
    focusBar?.setAttribute('aria-hidden', 'true');
    setActivityRailActive(true);

    const close = panel.querySelector('.nfa-af-close');
    if (close) {
      close.title = 'Hide Activity Feed';
      close.setAttribute('aria-label', 'Hide Activity Feed');
      close.innerHTML = '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i><span>Hide</span>';
    }

    panel.dataset.nfaPersistentDock = '1';
    return true;
  }

  function restoreTaskPresentation() {
    const { right, shell, heading, focusBar } = elements();
    shell?.classList.remove('nfa-wide-activity-layout');
    right?.classList.remove('nfa-wide-activity-dock');
    right?.removeAttribute('aria-label');
    heading?.removeAttribute('aria-hidden');
    focusBar?.removeAttribute('aria-hidden');
    setActivityRailActive(false);

    if (right && state.savedWidthCaptured) {
      right.style.removeProperty('width');
      if (state.savedInlineWidth) right.style.width = state.savedInlineWidth;
    }
    state.savedWidthCaptured = false;
    state.savedInlineWidth = '';
  }

  function collapseSidebar() {
    const { right } = elements();
    if (!right) return;
    right.style.setProperty('display', 'none', 'important');
    try { localStorage.setItem('mpgs_right_sidebar_state', 'none'); } catch (_) {}
  }

  function showSidebar() {
    const { right } = elements();
    if (!right) return false;
    right.style.setProperty('display', 'flex', 'important');
    try { localStorage.setItem('mpgs_right_sidebar_state', 'flex'); } catch (_) {}
    return true;
  }

  async function openDock(options = {}) {
    const persist = options.persist !== false;
    if (!isWideDesktop()) {
      return state.openOwner?.apply(this, options.args || []);
    }
    if (!identityReady() || state.opening) return false;

    const existing = document.getElementById('activityFeedPanel');
    if (existing) {
      applyDockPresentation();
      if (persist) savePreference(true);
      return true;
    }

    state.opening = true;
    state.transientTaskMode = false;
    showSidebar();
    try {
      const result = await state.openOwner?.apply(this, options.args || []);
      applyDockPresentation();
      requestAnimationFrame(applyDockPresentation);
      setTimeout(applyDockPresentation, 120);
      if (persist) savePreference(true);
      return result;
    } finally {
      state.opening = false;
    }
  }

  function closeDock(options = {}) {
    const persist = options.persist !== false;
    const collapse = options.collapse !== false;
    if (state.closing) return false;

    state.closing = true;
    try {
      const result = state.closeOwner?.apply(this, options.args || []);
      restoreTaskPresentation();
      if (persist) savePreference(false);
      if (collapse) collapseSidebar();
      return result;
    } finally {
      state.closing = false;
    }
  }

  function installActivityOwners() {
    const openOwner = window.openActivityFeed;
    const closeOwner = window.closeActivityFeed;
    if (typeof openOwner !== 'function' || typeof closeOwner !== 'function') return false;
    if (openOwner.__nfaWideActivityDockV5 && closeOwner.__nfaWideActivityDockV5) return true;

    state.openOwner = openOwner;
    state.closeOwner = closeOwner;

    const wrappedOpen = async function () {
      if (!isWideDesktop()) return openOwner.apply(this, arguments);
      if (document.getElementById('activityFeedPanel')) {
        return closeDock.call(this, { persist: true, collapse: true, args: Array.from(arguments) });
      }
      return openDock.call(this, { persist: true, args: Array.from(arguments) });
    };

    const wrappedClose = function () {
      if (!isWideDesktop()) return closeOwner.apply(this, arguments);
      return closeDock.call(this, { persist: true, collapse: true, args: Array.from(arguments) });
    };

    wrappedOpen.__nfaWideActivityDockV5 = true;
    wrappedOpen.__nfaWideActivityDockV5Owner = openOwner;
    wrappedClose.__nfaWideActivityDockV5 = true;
    wrappedClose.__nfaWideActivityDockV5Owner = closeOwner;
    window.openActivityFeed = wrappedOpen;
    window.closeActivityFeed = wrappedClose;
    return true;
  }

  function installRailRouting() {
    const rail = elements().rail;
    if (!rail || rail.dataset.nfaWideActivityOwner === '1') return Boolean(rail);
    rail.dataset.nfaWideActivityOwner = '1';

    rail.addEventListener('click', event => {
      if (!isWideDesktop()) return;
      const action = event.target.closest('[data-nfa-action]')?.dataset?.nfaAction;
      if (!action) return;

      if (action === 'tasks') {
        if (document.getElementById('activityFeedPanel')) {
          state.transientTaskMode = true;
          closeDock({ persist: false, collapse: false });
          showSidebar();
        }
        return;
      }

      if (action === 'chat' && preferenceVisible() && !document.getElementById('activityFeedPanel')) {
        state.transientTaskMode = false;
        setTimeout(() => openDock({ persist: false }), 0);
      }
    }, true);
    return true;
  }

  function installRenderOwner() {
    const owner = window.renderMainApp;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaWideActivityDockV5) return true;
    state.renderOwner = owner;

    const wrapped = async function () {
      const result = await owner.apply(this, arguments);
      requestAnimationFrame(mountDefaultDock);
      return result;
    };
    wrapped.__nfaWideActivityDockV5 = true;
    wrapped.__nfaWideActivityDockV5Owner = owner;
    window.renderMainApp = wrapped;
    return true;
  }

  function mountDefaultDock() {
    installStyles();
    if (!isWideDesktop() || !identityReady()) return false;
    if (!elements().right) return false;
    installRailRouting();

    if (preferenceVisible() && !state.transientTaskMode) {
      openDock({ persist: false });
    } else if (!preferenceVisible() && document.getElementById('activityFeedPanel')) {
      closeDock({ persist: false, collapse: true });
    }
    return true;
  }

  function installResizeOwner() {
    if (document.documentElement.dataset.nfaWideActivityResizeOwner === '1') return;
    document.documentElement.dataset.nfaWideActivityResizeOwner = '1';
    window.addEventListener('resize', () => {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(() => {
        if (!isWideDesktop()) {
          if (document.getElementById('activityFeedPanel')) {
            closeDock({ persist: false, collapse: false });
          }
          return;
        }
        mountDefaultDock();
      }, 120);
    }, { passive: true });
  }

  function installWhenReady() {
    const ownersReady = installActivityOwners();
    const renderReady = installRenderOwner();
    const railReady = installRailRouting();
    installResizeOwner();

    if (ownersReady && renderReady && railReady && mountDefaultDock()) return;
    state.installFrames += 1;
    if (state.installFrames < 240) requestAnimationFrame(installWhenReady);
  }

  window.nfaSetActivityDockVisible = function (visible) {
    return visible
      ? openDock({ persist: true })
      : closeDock({ persist: true, collapse: true });
  };

  window.nfaIsActivityDockVisible = function () {
    return Boolean(document.getElementById('activityFeedPanel'));
  };

  requestAnimationFrame(installWhenReady);
})();
