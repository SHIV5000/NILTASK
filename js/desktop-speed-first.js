/*
 * Noted For Action — speed-first desktop shell, Phase 1.
 *
 * This controller mounts once after the existing desktop app renders. It does
 * not poll, observe the document, clone task cards, query Supabase, own app
 * state or load on mobile/native. Existing public feature owners are reused.
 */

(function () {
  'use strict';

  const DESKTOP_MIN_WIDTH = 769;

  function isDesktop() {
    return window.innerWidth >= DESKTOP_MIN_WIDTH && !window.IS_NATIVE;
  }

  function iconButton(action, icon, label, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nfa-rail-button';
    button.dataset.nfaAction = action;
    button.title = title || label;
    button.setAttribute('aria-label', title || label);
    button.innerHTML = `<i class="${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return button;
  }

  function setActiveRail(rail, action) {
    if (!rail) return;
    rail.querySelectorAll('.nfa-rail-button[data-nfa-action]').forEach(button => {
      button.classList.toggle('nfa-active', button.dataset.nfaAction === action);
    });
  }

  function copyProfile(profileHost) {
    const source = document.getElementById('sidebarAvatar');
    const image = source?.querySelector('img');
    if (image?.src) {
      const clonedImage = document.createElement('img');
      clonedImage.src = image.src;
      clonedImage.alt = 'Profile';
      profileHost.replaceChildren(clonedImage);
      return;
    }

    const text = (source?.textContent || window.currentUser?.email || 'U').trim();
    profileHost.textContent = text.slice(0, 2).toUpperCase();
  }

  function ensureRightSidebarVisible() {
    const panel = document.getElementById('rightSidebar');
    if (!panel) return;
    if (window.getComputedStyle(panel).display === 'none') {
      panel.style.setProperty('display', 'flex', 'important');
      try { localStorage.setItem('mpgs_right_sidebar_state', 'flex'); } catch (_) {}
    }
  }

  function runAction(action, rail) {
    setActiveRail(rail, action);

    switch (action) {
      case 'chat': {
        document.getElementById('messagesContainer')?.focus?.({ preventScroll: true });
        break;
      }
      case 'tasks': {
        ensureRightSidebarVisible();
        window.loadTasksForPanel?.();
        document.getElementById('tasksPanel')?.scrollTo?.({ top: 0, behavior: 'smooth' });
        break;
      }
      case 'activity': {
        window.openActivityFeed?.();
        break;
      }
      case 'bookmarks': {
        window.openTopPanel?.('bookmarks');
        break;
      }
      case 'scheduled': {
        window.openTopPanel?.('scheduled');
        break;
      }
      case 'dashboard': {
        window.openDashboard?.();
        break;
      }
      case 'settings': {
        window.openSettings?.();
        break;
      }
      default:
        break;
    }
  }

  function createRail() {
    const rail = document.createElement('nav');
    rail.id = 'nfaDesktopRail';
    rail.setAttribute('aria-label', 'Primary workspace navigation');

    const mark = document.createElement('div');
    mark.className = 'nfa-rail-mark';
    mark.textContent = 'N';
    mark.title = 'Noted For Action';
    rail.appendChild(mark);

    rail.appendChild(iconButton('chat', 'fa-regular fa-comments', 'Chat Stream'));
    rail.appendChild(iconButton('tasks', 'fa-solid fa-list-check', 'Task'));
    rail.appendChild(iconButton('activity', 'fa-solid fa-wave-square', 'Activity'));
    rail.appendChild(iconButton('bookmarks', 'fa-regular fa-bookmark', 'Bookmarks'));
    rail.appendChild(iconButton('scheduled', 'fa-regular fa-clock', 'Schedule'));
    rail.appendChild(iconButton('dashboard', 'fa-solid fa-table-cells-large', 'Dashboard'));

    const spacer = document.createElement('div');
    spacer.className = 'nfa-rail-spacer';
    rail.appendChild(spacer);

    const profile = document.createElement('button');
    profile.type = 'button';
    profile.className = 'nfa-rail-profile';
    profile.dataset.nfaAction = 'settings';
    profile.title = 'Profile settings';
    profile.setAttribute('aria-label', 'Profile settings');
    copyProfile(profile);
    rail.appendChild(profile);

    rail.addEventListener('click', event => {
      const button = event.target.closest('[data-nfa-action]');
      if (!button || !rail.contains(button)) return;
      runAction(button.dataset.nfaAction, rail);
    });

    setActiveRail(rail, 'chat');
    return rail;
  }

  function addDepartmentsHeading(leftSidebar) {
    if (document.getElementById('nfaDepartmentsHeading')) return;
    const chatsList = document.getElementById('chatsList');
    if (!chatsList || chatsList.parentElement !== leftSidebar) return;

    const heading = document.createElement('div');
    heading.id = 'nfaDepartmentsHeading';
    heading.innerHTML = '<strong>DEPARTMENTS</strong><span>Groups and direct conversations</span>';
    leftSidebar.insertBefore(heading, chatsList);
  }

  function addTaskHubHeading(rightSidebar) {
    if (document.getElementById('nfaTaskHubHeading')) return;
    const heading = document.createElement('div');
    heading.id = 'nfaTaskHubHeading';
    heading.innerHTML = '<strong>Task Hub</strong><span>Tasks, ownership and progress</span>';
    rightSidebar.insertBefore(heading, rightSidebar.firstElementChild);
  }

  function applyCompactDefaults(leftSidebar, rightSidebar) {
    try {
      if (!localStorage.getItem('mpgs_left_width')) leftSidebar.style.width = '268px';
      if (!localStorage.getItem('mpgs_right_width')) rightSidebar.style.width = '306px';
    } catch (_) {
      leftSidebar.style.width = '268px';
      rightSidebar.style.width = '306px';
    }
  }

  function mount() {
    if (!isDesktop()) return false;

    const root = document.getElementById('root');
    const shell = root?.firstElementChild;
    const leftSidebar = document.getElementById('leftSidebar');
    const chatArea = document.querySelector('.chat-area');
    const rightSidebar = document.getElementById('rightSidebar');

    if (!shell || !leftSidebar || !chatArea || !rightSidebar) return false;
    if (shell.dataset.nfaSpeedFirstMounted === '1') return true;

    shell.dataset.nfaSpeedFirstMounted = '1';
    shell.classList.add('nfa-speed-shell');
    leftSidebar.classList.add('nfa-departments-panel');
    chatArea.classList.add('nfa-speed-chat');
    rightSidebar.classList.add('nfa-task-hub-panel');

    applyCompactDefaults(leftSidebar, rightSidebar);
    addDepartmentsHeading(leftSidebar);
    addTaskHubHeading(rightSidebar);

    const rail = createRail();
    shell.insertBefore(rail, leftSidebar);

    return true;
  }

  function installRenderHook() {
    const original = window.renderMainApp;
    if (typeof original !== 'function' || original.__nfaSpeedFirstWrapped) return;

    const wrapped = async function (...args) {
      const result = await original.apply(this, args);
      mount();
      return result;
    };

    wrapped.__nfaSpeedFirstWrapped = true;
    wrapped.__nfaSpeedFirstOriginal = original;
    window.renderMainApp = wrapped;
  }

  window.nfaMountDesktopSpeedFirst = mount;
  installRenderHook();
  mount();
})();
