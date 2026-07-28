/*
 * Noted For Action — desktop workspace refinements v4.
 * Desktop-only integration layer. Existing message, task, realtime and mobile
 * owners remain authoritative; this module routes and decorates their output.
 */
import { sb } from './shared.js';

(function () {
  'use strict';

  if (window.__NFA_DESKTOP_WORKSPACE_V4__) return;
  window.__NFA_DESKTOP_WORKSPACE_V4__ = true;

  const CSS_ID = 'nfa-desktop-workspace-v4-css';
  const READ_KEY_PREFIX = 'nfa_activity_read_v4_';
  const state = {
    profiles: [],
    profileRefreshAt: 0,
    activityRefreshBusy: false,
    lastRoom: null,
    latestTimers: [],
    wrappers: new Set(),
    decorating: false,
    activityOpenerInstalled: false,
    topPanelInstalled: false,
    exactGoToInstalled: false,
    roomWrappersInstalled: false
  };

  const isDesktop = () => window.innerWidth > 768 && !window.IS_NATIVE;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const esc = value => window.escapeHtml
    ? window.escapeHtml(String(value ?? ''))
    : String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const strip = value => window.stripHtml
    ? window.stripHtml(String(value ?? ''))
    : String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement('link');
    link.id = CSS_ID;
    link.rel = 'stylesheet';
    link.href = './css/desktop-workspace-v4.css?v=215';
    document.head.appendChild(link);
  }

  function centerHost() { return document.getElementById('nfaCenterWorkspace'); }
  function centerBody() { return document.getElementById('nfaCenterWorkspaceBody'); }
  function chatArea() { return document.querySelector('.chat-area'); }

  function markRail(action) {
    const rail = document.getElementById('nfaActionRail');
    rail?.querySelectorAll('.nfa-rail-item').forEach(button => {
      button.classList.toggle('active', button.dataset.nfaAction === action);
    });
  }

  function openCenter(type, title, subtitle = '') {
    if (!isDesktop()) return null;
    const host = centerHost();
    const body = centerBody();
    const area = chatArea();
    if (!host || !body || !area) return null;

    try { window.closeTaskActionLayer?.(); } catch (_) {}
    area.classList.add('nfa-center-workspace-open');
    document.body.classList.add('nfa-center-workspace-active');
    document.body.classList.toggle('nfa-center-task-active', type === 'task' || type === 'task-hub');
    host.classList.add('nfa-open');
    host.setAttribute('aria-hidden', 'false');
    host.dataset.nfaV4Type = type;

    const titleEl = document.getElementById('nfaCenterWorkspaceTitle');
    const subtitleEl = document.getElementById('nfaCenterWorkspaceSubtitle');
    const eyebrow = host.querySelector('.nfa-center-workspace-eyebrow');
    const back = document.getElementById('nfaCenterWorkspaceBack');
    if (eyebrow) eyebrow.textContent = 'Noted For Action';
    if (titleEl) titleEl.textContent = title;
    if (subtitleEl) subtitleEl.textContent = subtitle;
    if (back) back.style.display = 'none';
    body.innerHTML = '';
    markRail(type === 'task-hub' || type === 'task' ? 'tasks' : type);
    return body;
  }

  function showConversation() {
    window.nfaShowConversationCenter?.();
    markRail('stream');
    scheduleLatestScroll();
  }

  function svg(name) {
    const paths = {
      stream: '<path d="M5 4h14v5H5zM5 12h8v8H5zM16 12h3v8h-3z"/>',
      tasks: '<path d="M5 6h14M5 12h14M5 18h9"/><path d="m17 17 2 2 3-4"/>',
      activity: '<path d="M4 13h4l2-7 4 13 2-6h4"/>',
      bookmarks: '<path d="M6 4h12v17l-6-4-6 4z"/>',
      scheduled: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
      dashboard: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.5 1A7 7 0 0 0 15 6l-.3-2.7h-4L10.4 6A7 7 0 0 0 9 7.1l-2.5-1-2 3.4L6.5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.5-1A7 7 0 0 0 10.4 18l.3 2.7h4L15 18a7 7 0 0 0 1.4-1.1l2.5 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z"/>'
    };
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.stream}</svg>`;
  }

  function railButton(action, label, iconName) {
    const badge = action === 'activity' ? '<span class="nfa-activity-unread-badge" aria-label="Unread activity"></span>' : '';
    return `<button type="button" class="nfa-rail-item${action === 'stream' ? ' active' : ''}" data-nfa-action="${action}" title="${label}">${svg(iconName)}<span>${label}</span>${badge}</button>`;
  }

  function installRail() {
    const rail = document.getElementById('nfaActionRail');
    const nav = rail?.querySelector('.nfa-rail-nav');
    if (!rail || !nav) return;

    if (nav.dataset.nfaV4 !== '1') {
      nav.dataset.nfaV4 = '1';
      nav.innerHTML = [
        railButton('stream', 'Chat Stream', 'stream'),
        railButton('tasks', 'Task', 'tasks'),
        railButton('activity', 'Activity', 'activity'),
        railButton('bookmarks', 'Bookmarks', 'bookmarks'),
        railButton('scheduled', 'Schedule', 'scheduled'),
        railButton('dashboard', 'Dashboard', 'dashboard')
      ].join('');
    }

    if (rail.dataset.nfaV4Listener !== '1') {
      rail.dataset.nfaV4Listener = '1';
      rail.addEventListener('click', event => {
        const button = event.target.closest('[data-nfa-action]');
        if (!button || !isDesktop()) return;
        const action = button.dataset.nfaAction;
        event.preventDefault();
        event.stopImmediatePropagation();

        if (action === 'stream') showConversation();
        else if (action === 'tasks') openTaskHub();
        else if (action === 'activity') window.openActivityFeed?.();
        else if (action === 'bookmarks') openBookmarksCenter();
        else if (action === 'scheduled') openScheduleCenter();
        else if (action === 'dashboard') openDashboardPlaceholder();
        else if (action === 'settings') window.openSettings?.();
      }, true);
    }
  }

  function normalizeHeadings() {
    document.getElementById('nfaWorkstreamHeading')?.remove();
    const chats = document.getElementById('chatsList');
    chats?.parentElement?.querySelectorAll('div,span,p,h2,h3,h4').forEach(node => {
      if (node.children.length) return;
      const text = (node.textContent || '').trim().toUpperCase();
      if (text === 'WORKSTREAMS' || text === 'DEPARTMENTS') node.textContent = 'DEPARTMENTS';
      if (text === 'DIRECT') node.textContent = 'DIRECT';
    });

    const context = document.getElementById('nfaContextHeading');
    if (context && context.dataset.nfaV4 !== '1') {
      context.dataset.nfaV4 = '1';
      context.innerHTML = '<strong>Task Hub</strong>';
    }

    document.querySelectorAll('#activityFeedPanel .nfa-af-title span, #activityFeedPanel .nfa207-heading-title').forEach(node => {
      node.textContent = 'Activity Hub';
    });
    document.getElementById('activityFeedPanel')?.setAttribute('aria-label', 'Activity Hub');
  }

  function removeIds(root) {
    root.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  }

  async function openTaskHub() {
    if (!isDesktop()) return;
    const body = openCenter('task-hub', 'Task Hub', 'All tasks in one centre workspace — select a card to work on it');
    if (!body) return;
    body.innerHTML = '<div class="nfa-center-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading tasks…</div>';

    try { await window.loadTasksForPanel?.(); } catch (_) {}
    await sleep(80);
    const cards = [...document.querySelectorAll('#tasksPanel .nt-task-card[data-task-id]')];
    if (!cards.length) {
      body.innerHTML = '<div class="nfa-center-empty"><i class="fa-solid fa-clipboard-list"></i><strong>No tasks found</strong><span>Tasks assigned by you or to you will appear here.</span></div>';
      return;
    }

    const hub = document.createElement('section');
    hub.className = 'nfa-center-task-hub';
    hub.innerHTML = `<div class="nfa-center-task-hub-toolbar"><div><strong>${cards.length} task${cards.length === 1 ? '' : 's'}</strong><br><span>Click any task card to open all working controls and its complete trail.</span></div></div><div class="nfa-center-task-list"></div>`;
    const list = hub.querySelector('.nfa-center-task-list');

    cards.forEach(source => {
      const taskId = source.dataset.taskId;
      const clone = source.cloneNode(true);
      clone.classList.remove('nt-task-card-completed');
      clone.classList.add('nfa-task-hub-card');
      clone.querySelector('.nt-task-expanded')?.remove();
      removeIds(clone);
      const actionRow = clone.querySelector('.nt-task-action-row');
      if (actionRow) {
        actionRow.innerHTML = `<button type="button" class="nt-task-button nt-task-button-primary nfa-open-task-button"><i class="fa-solid fa-arrow-up-right-from-square"></i>Open Task</button>`;
      }
      const open = event => {
        if (event) { event.preventDefault(); event.stopPropagation(); }
        window.nfaOpenTaskCenter?.(taskId, 'manage');
      };
      clone.tabIndex = 0;
      clone.setAttribute('role', 'button');
      clone.addEventListener('click', event => {
        if (event.target.closest('button,a,input,select,textarea,label')) return;
        open(event);
      });
      clone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') open(event);
      });
      clone.querySelector('.nfa-open-task-button')?.addEventListener('click', open);
      list.appendChild(clone);
    });

    body.innerHTML = '';
    body.appendChild(hub);
    body.scrollTo({ top: 0, behavior: 'smooth' });
    hydrateAvatars();
  }
  window.nfaOpenTaskHub = openTaskHub;

  function collectionEmpty(iconClass, title, text) {
    return `<div class="nfa-center-empty"><i class="${iconClass}"></i><strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;
  }

  async function openBookmarksCenter() {
    if (!isDesktop()) return;
    const body = openCenter('bookmarks', 'Bookmarks', 'Saved messages and decisions');
    if (!body) return;
    body.innerHTML = '<div class="nfa-center-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading bookmarks…</div>';

    const { data, error } = await sb.from('bookmarks')
      .select('id,message_id,created_at,messages(id,text,room_id,created_at,sender_id)')
      .eq('user_id', window.currentUser?.id)
      .order('created_at', { ascending: false });

    if (error) {
      body.innerHTML = collectionEmpty('fa-solid fa-triangle-exclamation', 'Bookmarks unavailable', error.message);
      return;
    }
    if (!data?.length) {
      body.innerHTML = collectionEmpty('fa-regular fa-bookmark', 'No bookmarks yet', 'Bookmark a message to keep it here.');
      return;
    }

    const wrap = document.createElement('section');
    wrap.className = 'nfa-center-collection';
    wrap.innerHTML = `<div class="nfa-center-collection-toolbar"><p>${data.length} saved message${data.length === 1 ? '' : 's'}</p></div><div class="nfa-collection-grid"></div>`;
    const grid = wrap.querySelector('.nfa-collection-grid');

    data.forEach(item => {
      const message = Array.isArray(item.messages) ? item.messages[0] : item.messages;
      const card = document.createElement('article');
      card.className = 'nfa-collection-card';
      card.innerHTML = `
        <div class="nfa-collection-icon"><i class="fa-solid fa-bookmark"></i></div>
        <div><h4>${esc(strip(message?.text || 'Saved message').substring(0, 180))}</h4><p>${message?.created_at ? new Date(message.created_at).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'short' }) : 'Saved message'}</p></div>
        <button type="button" class="nfa-collection-open"><i class="fa-solid fa-arrow-right"></i> Open</button>
        <button type="button" class="nfa-collection-remove" title="Remove bookmark" aria-label="Remove bookmark"><i class="fa-solid fa-xmark"></i></button>`;
      card.querySelector('.nfa-collection-open')?.addEventListener('click', () => exactGoToMessage(item.message_id, null, message?.room_id || null));
      card.querySelector('.nfa-collection-remove')?.addEventListener('click', async () => {
        await sb.from('bookmarks').delete().eq('id', item.id).eq('user_id', window.currentUser?.id);
        try { window.bookmarkedSet?.delete?.(item.message_id); } catch (_) {}
        openBookmarksCenter();
      });
      grid.appendChild(card);
    });

    body.innerHTML = '';
    body.appendChild(wrap);
  }
  window.nfaOpenBookmarksCenter = openBookmarksCenter;

  async function deleteScheduleRow(id) {
    await sb.from('scheduled_messages').delete()
      .eq('id', id)
      .eq('sender_id', window.currentUser?.id)
      .eq('tenant_id', window.currentTenantId);
    openScheduleCenter();
  }

  async function clearAllSchedules() {
    if (!window.confirm('Clear all scheduled-message history, including pending messages?')) return;
    await sb.from('scheduled_messages').delete()
      .eq('sender_id', window.currentUser?.id)
      .eq('tenant_id', window.currentTenantId);
    openScheduleCenter();
  }

  async function openScheduleCenter() {
    if (!isDesktop()) return;
    const body = openCenter('scheduled', 'Schedule', 'Pending and historical scheduled messages');
    if (!body) return;
    body.innerHTML = '<div class="nfa-center-loading"><i class="fa-solid fa-spinner fa-spin"></i>Loading scheduled messages…</div>';

    const { data, error } = await sb.from('scheduled_messages')
      .select('*')
      .eq('sender_id', window.currentUser?.id)
      .eq('tenant_id', window.currentTenantId)
      .order('scheduled_time', { ascending: false });

    if (error) {
      body.innerHTML = collectionEmpty('fa-solid fa-triangle-exclamation', 'Schedule unavailable', error.message);
      return;
    }
    if (!data?.length) {
      body.innerHTML = collectionEmpty('fa-regular fa-clock', 'No scheduled messages', 'Pending and sent scheduled messages will appear here.');
      return;
    }

    const wrap = document.createElement('section');
    wrap.className = 'nfa-center-collection';
    wrap.innerHTML = `<div class="nfa-center-collection-toolbar"><p>${data.length} scheduled-message record${data.length === 1 ? '' : 's'}</p><button type="button" class="nfa-collection-clear"><i class="fa-solid fa-trash"></i> Clear All</button></div><div class="nfa-collection-grid"></div>`;
    wrap.querySelector('.nfa-collection-clear')?.addEventListener('click', clearAllSchedules);
    const grid = wrap.querySelector('.nfa-collection-grid');

    data.forEach(item => {
      const status = String(item.status || 'pending').replace(/_/g, ' ');
      const time = item.scheduled_time
        ? new Date(item.scheduled_time).toLocaleString('en-IN', { timeZone:'Asia/Kolkata', dateStyle:'medium', timeStyle:'short' })
        : 'No scheduled time';
      const card = document.createElement('article');
      card.className = 'nfa-collection-card';
      card.innerHTML = `
        <div class="nfa-collection-icon"><i class="fa-regular fa-clock"></i></div>
        <div><h4>${esc(strip(item.message_text || 'Scheduled message').substring(0, 220))}</h4><p>${esc(time)}</p><span class="nfa-collection-status"><i class="fa-solid fa-circle"></i>${esc(status)}</span></div>
        <span></span>
        <button type="button" class="nfa-collection-remove" title="${status === 'pending' ? 'Cancel scheduled message' : 'Remove history item'}" aria-label="Remove scheduled message"><i class="fa-solid fa-xmark"></i></button>`;
      card.querySelector('.nfa-collection-remove')?.addEventListener('click', () => deleteScheduleRow(item.id));
      grid.appendChild(card);
    });

    body.innerHTML = '';
    body.appendChild(wrap);
  }
  window.nfaOpenScheduleCenter = openScheduleCenter;

  function openDashboardPlaceholder() {
    const body = openCenter('dashboard', 'Dashboard', 'Reserved for the next approved dashboard design');
    if (!body) return;
    body.innerHTML = collectionEmpty('fa-solid fa-chart-line', 'Dashboard design pending', 'The navigation entry is ready. Its final cards and reports will be designed later.');
  }

  function installTopPanelRouting() {
    if (state.topPanelInstalled || typeof window.openTopPanel !== 'function') return;
    const original = window.openTopPanel;
    window.openTopPanel = async function(type, ...args) {
      if (isDesktop() && type === 'bookmarks') return openBookmarksCenter();
      if (isDesktop() && type === 'scheduled') return openScheduleCenter();
      return original.call(this, type, ...args);
    };
    window.openTopPanel.__nfaV4 = true;
    state.topPanelInstalled = true;
  }

  function installActivityHubOpener() {
    if (state.activityOpenerInstalled || typeof window._loadActivityFeed !== 'function') return;
    window.openActivityFeed = async function() {
      if (!isDesktop()) return;
      if (document.getElementById('activityFeedPanel')) {
        window.closeActivityFeed?.();
        markRail('stream');
        return;
      }
      const rightSidebar = document.getElementById('rightSidebar');
      if (!rightSidebar) return;
      if (getComputedStyle(rightSidebar).display === 'none') {
        rightSidebar.style.setProperty('display', 'flex', 'important');
        try { localStorage.setItem('mpgs_right_sidebar_state', 'flex'); } catch (_) {}
      }
      ['tasksPanel','rightSidebarFilters','dateRangeFilter'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
      });
      window._activityFeedOpen = true;
      const panel = document.createElement('section');
      panel.id = 'activityFeedPanel';
      panel.setAttribute('aria-label', 'Activity Hub');
      panel.innerHTML = `
        <header class="nfa-af-header">
          <div class="nfa-af-title"><i class="fa-solid fa-bolt" style="color:var(--accent);"></i><span>Activity Hub</span></div>
          <div class="nfa-af-actions"><button class="nfa-af-clear-all" onclick="window._clearAllActivity()">Clear All</button><button class="nfa-af-close" onclick="window.closeActivityFeed()" aria-label="Close Activity Hub">✕</button></div>
          <div id="activityFeedFilters"></div>
        </header>
        <div id="activityFeedList"><p style="text-align:center;padding:24px;color:var(--text-secondary);font-size:12px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</p></div>`;
      rightSidebar.appendChild(panel);
      markRail('activity');
      await window._loadActivityFeed();
      decorateActivityReadState();
      try { clearInterval(window._afPollTimer); } catch (_) {}
      window._afPollTimer = setInterval(() => {
        if (window._activityFeedOpen && document.getElementById('activityFeedList')) {
          window._loadActivityFeed().then(decorateActivityReadState);
        }
      }, 60000);
    };
    window.openActivityFeed.__nfaV4 = true;
    state.activityOpenerInstalled = true;
  }

  function activityReadKey() {
    return READ_KEY_PREFIX + (window.currentTenantId || '') + '_' + (window.currentUser?.id || '');
  }
  function localReadSet() {
    try { return new Set(JSON.parse(localStorage.getItem(activityReadKey()) || '[]')); }
    catch (_) { return new Set(); }
  }
  function saveLocalRead(set) {
    try { localStorage.setItem(activityReadKey(), JSON.stringify([...set].slice(-1000))); } catch (_) {}
  }
  function activityIdentity(card) {
    const clear = card?.querySelector('.nfa-af-item-clear,[onclick*="_webClearActivityItem"]');
    const code = clear?.getAttribute('onclick') || '';
    const match = code.match(/_webClearActivityItem\('([^']+)'\s*,\s*'([^']+)'\)/);
    return match ? { source: match[1], id: match[2] } : { source: null, id: null };
  }
  async function markActivityRead(source, id) {
    if (!id) return;
    if (source === 'notif') {
      await sb.from('notifications').update({ is_read: true })
        .eq('id', id).eq('user_id', window.currentUser?.id);
    } else {
      const set = localReadSet();
      set.add(String(id));
      saveLocalRead(set);
    }
  }

  function decorateActivityReadState() {
    const read = localReadSet();
    document.querySelectorAll('#activityFeedList .nfa-af-card').forEach(card => {
      const identity = activityIdentity(card);
      if (identity.source === 'local' && read.has(String(identity.id))) {
        card.classList.remove('nfa-af-unread', 'nfa207-unread');
        card.querySelector('.nfa-af-unread-dot')?.remove();
      }
    });
    normalizeHeadings();
    hydrateAvatars();
  }

  function setActivityBadge(count) {
    const badge = document.querySelector('#nfaActionRail [data-nfa-action="activity"] .nfa-activity-unread-badge');
    if (!badge) return;
    const value = Math.max(0, Number(count) || 0);
    badge.textContent = value > 99 ? '99+' : String(value);
    badge.classList.toggle('nfa-show', value > 0);
    badge.setAttribute('aria-label', `${value} unread activity item${value === 1 ? '' : 's'}`);
  }

  async function refreshActivityBadge() {
    if (state.activityRefreshBusy || !window.currentUser?.id || !window.currentTenantId) return;
    state.activityRefreshBusy = true;
    try {
      if (typeof window.NFA_buildActivity === 'function') {
        const uid = window.currentUser.id;
        const tid = window.currentTenantId;
        const read = localReadSet();
        const resolveName = id => {
          const profile = (window.globalUsersCache || []).find(user => user.id === id);
          return profile?.full_name || profile?.email?.split('@')[0] || '';
        };
        const result = await window.NFA_buildActivity(sb, {
          uid, tid,
          resolveName,
          resolveRoom: roomId => window.getRoomDisplayName?.(roomId) || roomId || '',
          snippet: window.snippet,
          markRead: false,
          logError: () => {}
        });
        let unread = 0;
        (result.items || []).forEach(item => {
          const id = String(item.n?.id || '');
          const notification = /^[0-9a-f-]{36}$/i.test(id);
          if (item.n?.is_read) return;
          if (!notification && read.has(id)) return;
          unread += 1;
        });
        setActivityBadge(unread);
        return;
      }
      const { count } = await sb.from('notifications').select('id', { count:'exact', head:true })
        .eq('user_id', window.currentUser.id).eq('tenant_id', window.currentTenantId).eq('is_read', false);
      setActivityBadge(count || 0);
    } catch (_) {}
    finally { state.activityRefreshBusy = false; }
  }
  window.nfaRefreshActivityBadge = refreshActivityBadge;

  function installActivityClickRouting() {
    if (document.body?.dataset.nfaV4ActivityClicks === '1') return;
    document.body.dataset.nfaV4ActivityClicks = '1';
    document.addEventListener('click', async event => {
      if (!isDesktop()) return;
      const card = event.target.closest('#activityFeedList .nfa-af-card');
      if (!card || event.target.closest('.nfa-af-item-clear')) return;
      const code = card.getAttribute('onclick') || card.querySelector('.nfa-af-action')?.getAttribute('onclick') || '';
      const taskMatch = code.match(/goToTask[^'(]*\('([^']+)'/);
      const messageMatch = code.match(/goToMessage[^'(]*\('([^']+)'/);
      if (!taskMatch && !messageMatch) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const identity = activityIdentity(card);
      await markActivityRead(identity.source, identity.id);
      card.classList.remove('nfa-af-unread', 'nfa207-unread');
      card.querySelector('.nfa-af-unread-dot')?.remove();

      if (taskMatch) await window.goToTask?.(taskMatch[1], identity.source === 'notif' ? identity.id : null);
      else await exactGoToMessage(messageMatch[1], identity.source === 'notif' ? identity.id : null, null);

      refreshActivityBadge();
    }, true);
  }

  async function exactGoToMessage(messageId, notificationId = null, roomId = null) {
    if (!messageId || !window.currentTenantId) return false;
    if (notificationId && notificationId !== 'null' && notificationId !== 'undefined') {
      try {
        await sb.from('notifications').update({ is_read: true })
          .eq('id', notificationId).eq('user_id', window.currentUser?.id);
      } catch (_) {}
    }

    let resolvedRoom = roomId;
    if (!resolvedRoom) {
      const { data } = await sb.from('messages').select('id,room_id')
        .eq('tenant_id', window.currentTenantId).eq('id', messageId).maybeSingle();
      resolvedRoom = data?.room_id || null;
    }
    if (!resolvedRoom) {
      window.showCenterToast?.('The message is unavailable or outside your access.', 'fa-solid fa-message', 'text-orange-500');
      refreshActivityBadge();
      return false;
    }

    showConversation();
    window.__nfaExactTargetNavigation = true;
    window.pendingScrollId = messageId;
    try {
      if (typeof window.openRoomById === 'function') await window.openRoomById(resolvedRoom, messageId);
      else if (typeof window.openChatRoom === 'function') {
        window.currentRoom = resolvedRoom;
        await window.openChatRoom(resolvedRoom);
      } else {
        window.currentRoom = resolvedRoom;
        try { localStorage.setItem('mpgs_current_room', resolvedRoom); } catch (_) {}
        await window.loadMessages?.();
      }

      let target = null;
      for (let attempt = 0; attempt < 45; attempt += 1) {
        target = document.getElementById(`row-${messageId}`)
          || document.getElementById(`msg-${messageId}`)
          || document.querySelector(`[data-message-id="${window.CSS?.escape ? CSS.escape(String(messageId)) : String(messageId)}"]`);
        if (target) break;
        if (attempt === 10 || attempt === 24) {
          try { await window.loadMessages?.(); } catch (_) {}
        }
        await sleep(140);
      }
      if (!target) {
        window.showCenterToast?.('The room opened, but the item is outside the loaded history.', 'fa-solid fa-message', 'text-orange-500');
        return false;
      }
      target.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' });
      target.classList.remove('nfa-focus-target');
      void target.offsetWidth;
      target.classList.add('nfa-focus-target');
      setTimeout(() => target.classList.remove('nfa-focus-target'), 3050);
      return true;
    } finally {
      setTimeout(() => { window.__nfaExactTargetNavigation = false; }, 3200);
      refreshActivityBadge();
    }
  }
  window.nfaExactGoToMessage = exactGoToMessage;

  function installExactGoToMessage() {
    if (state.exactGoToInstalled || typeof window.goToMessage !== 'function') return;
    const fallback = window.goToMessage;
    window.goToMessage = async function(messageId, notificationId = null, roomId = null) {
      if (isDesktop() && messageId) return exactGoToMessage(messageId, notificationId, roomId);
      return fallback.apply(this, arguments);
    };
    window.goToMessage.__nfaV4 = true;
    state.exactGoToInstalled = true;
  }

  function scrollLatest() {
    if (!isDesktop() || window.__nfaExactTargetNavigation) return;
    if (window.pendingScrollId && window.pendingScrollId !== 'BOTTOM') return;
    const containers = [document.getElementById('messagesContainer'), document.getElementById('chatShellContainer')].filter(Boolean);
    containers.forEach(container => {
      const top = Math.max(0, container.scrollHeight - container.clientHeight);
      try { container.scrollTo({ top, behavior:'smooth' }); }
      catch (_) { container.scrollTop = top; }
    });
    window.pendingScrollId = null;
  }

  function scheduleLatestScroll() {
    state.latestTimers.forEach(clearTimeout);
    state.latestTimers = [90, 260, 620, 1100].map(delay => setTimeout(scrollLatest, delay));
  }

  function installRoomWrappers() {
    ['openRoomById', 'openChatRoom'].forEach(name => {
      const current = window[name];
      if (typeof current !== 'function' || current.__nfaV4Latest) return;
      const wrapped = async function(...args) {
        const targeted = window.__nfaExactTargetNavigation || (args[1] && args[1] !== 'BOTTOM');
        const result = await current.apply(this, args);
        if (!targeted) scheduleLatestScroll();
        return result;
      };
      wrapped.__nfaV4Latest = true;
      wrapped.__nfaV4Original = current;
      window[name] = wrapped;
    });
  }

  function installChatLatestCapture() {
    if (document.body?.dataset.nfaV4LatestCapture === '1') return;
    document.body.dataset.nfaV4LatestCapture = '1';
    document.addEventListener('click', event => {
      if (!isDesktop()) return;
      const chat = event.target.closest('#chatsList [data-room], #chatsList [data-uid], #chatsList .channel-item');
      if (!chat) return;
      window.__nfaExactTargetNavigation = false;
      window.pendingScrollId = 'BOTTOM';
      showConversation();
      scheduleLatestScroll();
    }, true);
  }

  async function refreshProfiles(force = false) {
    if (!window.currentTenantId || !window.currentUser?.id) return;
    if (!force && Date.now() - state.profileRefreshAt < 60000 && state.profiles.length) return;
    state.profileRefreshAt = Date.now();
    try {
      const { data } = await sb.from('profiles')
        .select('id,full_name,email,designation,avatar_url,tenant_id')
        .eq('tenant_id', window.currentTenantId);
      if (data) {
        state.profiles = data;
        const byId = new Map((window.globalUsersCache || []).map(user => [user.id, user]));
        data.forEach(profile => byId.set(profile.id, { ...(byId.get(profile.id) || {}), ...profile }));
        window.globalUsersCache = [...byId.values()];
      }
    } catch (_) {}
  }

  function normalizedName(value) {
    return String(value || '')
      .replace(/\s*[·|].*$/, '')
      .replace(/^You$/i, window.currentUser?.user_metadata?.full_name || window.currentUser?.email?.split('@')[0] || 'You')
      .trim().toLowerCase();
  }

  function profileByName(value) {
    const name = normalizedName(value);
    if (!name) return null;
    return state.profiles.find(profile => {
      const full = normalizedName(profile.full_name);
      const email = normalizedName(profile.email?.split('@')[0]);
      return name === full || name === email;
    }) || null;
  }

  function applyPhoto(element, profile) {
    const url = profile?.avatar_url;
    if (!element || !url || element.dataset.nfaAvatarUrl === url) return;
    element.dataset.nfaAvatarUrl = url;
    element.classList.add('nfa-universal-avatar');
    element.innerHTML = `<img src="${esc(url)}" alt="${esc(profile.full_name || 'Profile photo')}" loading="lazy">`;
  }

  function hydrateAvatars() {
    if (!isDesktop() || !state.profiles.length) return;
    const currentProfile = state.profiles.find(profile => profile.id === window.currentUser?.id);
    applyPhoto(document.getElementById('sidebarAvatar'), currentProfile);
    applyPhoto(document.querySelector('#nfaActionRail .nfa-rail-avatar'), currentProfile);

    document.querySelectorAll('.bubble').forEach(bubble => {
      const name = bubble.querySelector('.b-name')?.textContent || '';
      applyPhoto(bubble.querySelector('.b-avatar'), profileByName(name));
    });

    document.querySelectorAll('.nt-task-person').forEach(row => {
      const name = row.querySelector('.nt-task-person-name')?.textContent || '';
      applyPhoto(row.querySelector('.nt-task-avatar'), profileByName(name));
    });

    document.querySelectorAll('#chatsList [data-uid], #chatsList .channel-item[data-user-id]').forEach(row => {
      const uid = row.dataset.uid || row.dataset.userId;
      const profile = state.profiles.find(item => item.id === uid);
      const candidates = [...row.querySelectorAll('.avatar,[class*="avatar"],.rounded-full,[class*="rounded-full"]')];
      const target = candidates.find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 24 && rect.width <= 90 && rect.height >= 24 && rect.height <= 90;
      });
      applyPhoto(target, profile);
    });

    document.querySelectorAll('#activityFeedList .nfa-af-card').forEach(card => {
      const senderText = (card.querySelector('.nfa-af-sender')?.textContent || '').replace(/^by\s+/i, '');
      applyPhoto(card.querySelector('.nfa207-avatar'), profileByName(senderText));
    });
  }

  function cleanBlankTimelineRows() {
    document.querySelectorAll('.nfa-timeline .row-sent, .nfa-timeline .row-rcvd').forEach(row => {
      const bubble = row.querySelector('.bubble');
      if (!bubble && !(row.textContent || '').trim()) row.setAttribute('aria-hidden', 'true');
      else row.removeAttribute('aria-hidden');
    });
  }

  function decorate() {
    if (state.decorating) return;
    state.decorating = true;
    try {
      ensureCss();
      if (!isDesktop()) return;
      installRail();
      normalizeHeadings();
      installTopPanelRouting();
      installActivityHubOpener();
      installActivityClickRouting();
      installExactGoToMessage();
      installRoomWrappers();
      installChatLatestCapture();
      cleanBlankTimelineRows();
      decorateActivityReadState();
      refreshProfiles().then(hydrateAvatars);

      if (window.currentRoom && window.currentRoom !== state.lastRoom) {
        state.lastRoom = window.currentRoom;
        if (!window.__nfaExactTargetNavigation) scheduleLatestScroll();
      }
    } finally {
      state.decorating = false;
    }
  }

  ensureCss();
  new MutationObserver(() => requestAnimationFrame(decorate))
    .observe(document.documentElement, { childList:true, subtree:true });
  window.addEventListener('resize', decorate, { passive:true });
  window.addEventListener('focus', () => { refreshActivityBadge(); refreshProfiles(true).then(hydrateAvatars); }, { passive:true });
  window.addEventListener('pageshow', () => { decorate(); refreshActivityBadge(); }, { passive:true });
  document.addEventListener('DOMContentLoaded', decorate, { once:true });
  setInterval(() => { decorate(); refreshActivityBadge(); }, 30000);
  setInterval(() => { refreshProfiles(true).then(hydrateAvatars); }, 60000);
  setTimeout(scheduleLatestScroll, 800);
  setTimeout(refreshActivityBadge, 1200);
  decorate();
})();
