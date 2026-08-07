/*
 * Noted For Action — Task Message v7 runtime hardening.
 *
 * Fixes two desktop-only regressions found in authenticated preview testing:
 * 1) cached messages can paint before the user directory is ready and remain
 *    stuck as "Unknown" when message ids are unchanged;
 * 2) the v6 inline Create Task path removes its newly-created host before the
 *    task form is mounted, leaving the three-dot Create Task action invisible.
 *
 * Existing message/task database owners remain authoritative. No polling loop,
 * MutationObserver, realtime subscription or duplicate task mutation owner is
 * introduced here.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_TASK_MESSAGES_V7_HOTFIX__) return;
  window.__NFA_DESKTOP_TASK_MESSAGES_V7_HOTFIX__ = true;

  const state = {
    installFrames: 0,
    renderOwner: null,
    loadOwner: null,
    openOwner: null,
    closeOwner: null,
    saveOwner: null,
    createCard: null,
    createMessageId: '',
    hydrationPromise: null
  };

  function isDesktop() {
    return window.innerWidth >= 769 &&
      !window.IS_NATIVE &&
      !window.isMobileView?.() &&
      !window.matchMedia?.('(pointer: coarse)').matches;
  }

  if (!isDesktop()) return;

  function cleanId(value) {
    const id = String(value == null ? '' : value).trim();
    return id && id !== 'null' && id !== 'undefined' ? id : '';
  }

  function validProfile(profile) {
    const name = String(profile?.full_name || '').trim();
    const email = String(profile?.email || '').trim();
    return Boolean(
      (name && name.toLowerCase() !== 'unknown' && name.toLowerCase() !== 'loading sender…') ||
      (email && email.toLowerCase() !== 'unknown')
    );
  }

  function userMap() {
    return new Map((window.globalUsersCache || []).map(user => [user.id, user]));
  }

  function enrichMessageIdentities(messages) {
    const users = userMap();
    let missing = false;
    const enriched = (Array.isArray(messages) ? messages : []).map(message => {
      if (message?.sender_id === window.currentUser?.id) return message;
      if (validProfile(message?.profiles)) return message;

      const cached = users.get(message?.sender_id);
      if (validProfile(cached)) return { ...message, profiles: cached };

      missing = true;
      return {
        ...message,
        profiles: {
          ...(message?.profiles || {}),
          full_name: 'Loading sender…'
        }
      };
    });
    return { enriched, missing };
  }

  async function hydrateCurrentRoom(force = false) {
    const room = window.currentRoom;
    const list = Array.isArray(window._roomMsgs) ? window._roomMsgs : [];
    if (!room || !list.length) return false;

    try { await window.ensureUsersLoaded?.(force); } catch (_) {}
    if (window.currentRoom !== room) return false;

    let users = userMap();
    let unresolved = list.some(message =>
      message?.sender_id !== window.currentUser?.id &&
      !validProfile(message?.profiles) &&
      !validProfile(users.get(message?.sender_id))
    );

    if (unresolved && !force) {
      try { await window.ensureUsersLoaded?.(true); } catch (_) {}
      if (window.currentRoom !== room) return false;
      users = userMap();
    }

    const hydrated = list.map(message => {
      if (message?.sender_id === window.currentUser?.id || validProfile(message?.profiles)) {
        return message;
      }
      const cached = users.get(message?.sender_id);
      if (validProfile(cached)) return { ...message, profiles: cached };
      return message;
    });

    window._roomMsgs = hydrated;
    if (window.currentRoom !== room) return false;
    window.renderMessages?.(hydrated);
    return true;
  }

  function scheduleHydration() {
    if (state.hydrationPromise) return state.hydrationPromise;
    state.hydrationPromise = hydrateCurrentRoom(false)
      .finally(() => { state.hydrationPromise = null; });
    return state.hydrationPromise;
  }

  function installSenderHydration() {
    const render = window.renderMessages;
    const load = window.loadMessages;
    if (typeof render !== 'function' || typeof load !== 'function') return false;
    if (!render.__nfaTaskMessagesV6 || !load.__nfaTaskMessagesV6) return false;

    if (!render.__nfaSenderHydrationV7) {
      state.renderOwner = render;
      const wrappedRender = function (messages) {
        const { enriched, missing } = enrichMessageIdentities(messages);
        const result = state.renderOwner.apply(
          this,
          [enriched, ...Array.prototype.slice.call(arguments, 1)]
        );
        if (missing) scheduleHydration();
        return result;
      };
      wrappedRender.__nfaSenderHydrationV7 = true;
      wrappedRender.__nfaSenderHydrationV7Owner = state.renderOwner;
      window.renderMessages = wrappedRender;
    }

    if (!load.__nfaSenderHydrationV7) {
      state.loadOwner = load;
      const wrappedLoad = async function () {
        const usersReady = window.ensureUsersLoaded?.();
        const result = await state.loadOwner.apply(this, arguments);
        try { await usersReady; } catch (_) {}
        await hydrateCurrentRoom(false);
        return result;
      };
      wrappedLoad.__nfaSenderHydrationV7 = true;
      wrappedLoad.__nfaSenderHydrationV7Owner = state.loadOwner;
      window.loadMessages = wrappedLoad;
    }

    if (Array.isArray(window._roomMsgs) && window._roomMsgs.length) scheduleHydration();
    return true;
  }

  function rowForMessage(messageId) {
    const id = cleanId(messageId);
    if (!id) return null;
    return document.getElementById(`row-${id}`) ||
      document.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  }

  function bubbleForMessage(messageId) {
    const row = rowForMessage(messageId);
    return row?.querySelector('.bubble') || row;
  }

  function removeCreateHosts() {
    document.querySelectorAll('.nfa-v7-create-host,.nfa-v6-create-host').forEach(host => {
      if (!host.contains(state.createCard)) host.remove();
    });
  }

  function restoreCreateCard() {
    const modal = document.getElementById('taskModal');
    const card = state.createCard || document.querySelector('.nfa-v7-inline-create-card');
    if (card && modal && card.parentElement !== modal) {
      card.classList.remove('nfa-v7-inline-create-card', 'nfa-v6-inline-create-card');
      modal.appendChild(card);
    }
    modal?.classList.remove('nfa-v6-modal-shell');
    document.querySelectorAll('.nfa-v7-create-host,.nfa-v6-create-host').forEach(host => host.remove());
    state.createCard = null;
    state.createMessageId = '';
    document.body.style.overflow = '';
  }

  function createHost(messageId) {
    const id = cleanId(messageId);
    const bubble = bubbleForMessage(id);
    if (!id || !bubble) return null;
    let host = bubble.querySelector(`[data-v7-create-host="${CSS.escape(id)}"]`);
    if (!host) {
      host = document.createElement('div');
      host.className = 'nfa-v6-create-host nfa-v7-create-host';
      host.dataset.v7CreateHost = id;
      bubble.appendChild(host);
    }
    return host;
  }

  function mountCreateCard(messageId) {
    const id = cleanId(messageId);
    if (!id) return false;

    // Important ordering: remove old hosts BEFORE creating the new host. v6 did
    // this in the opposite order, detaching the host that was about to be used.
    restoreCreateCard();

    const modal = document.getElementById('taskModal');
    const card = modal?.firstElementChild;
    const host = createHost(id);
    if (!modal || !card || !host) return false;

    state.createMessageId = id;
    state.createCard = card;
    card.classList.add('nfa-v6-inline-create-card', 'nfa-v7-inline-create-card');
    host.appendChild(card);
    modal.classList.add('nfa-v6-modal-shell');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
    requestAnimationFrame(() => document.getElementById('taskTitle')?.focus?.({ preventScroll: true }));
    return true;
  }

  function existingTaskMessage(messageId) {
    return bubbleForMessage(messageId)?.querySelector('.nfa-task-message-v6') || null;
  }

  function installInlineCreateFix() {
    const open = window.openTaskModal;
    const close = window.closeTaskModal;
    const save = window.saveTaskMultiAssignee;
    if (typeof open !== 'function' || typeof close !== 'function' || typeof save !== 'function') return false;
    if (!open.__nfaTaskMessagesV6 || !close.__nfaTaskMessagesV6) return false;

    if (!open.__nfaInlineCreateV7) {
      state.openOwner = open.__nfaTaskMessagesV6Owner || open;
      const wrappedOpen = async function (messageId, messageText) {
        const id = cleanId(messageId);
        if (!id) return false;

        const existing = existingTaskMessage(id);
        if (existing) {
          existing.querySelector('[data-v6-toggle-task]')?.click();
          return false;
        }

        restoreCreateCard();
        const result = await state.openOwner.apply(this, arguments);
        const modal = document.getElementById('taskModal');
        if (!modal || !modal.classList.contains('flex')) return result;

        if (!mountCreateCard(id)) {
          // Never leave the user with an invisible form. If the inline host cannot
          // be resolved, keep the existing modal visible as a safe fallback.
          modal.classList.remove('hidden', 'nfa-v6-modal-shell');
          modal.classList.add('flex');
        }
        return result;
      };
      wrappedOpen.__nfaInlineCreateV7 = true;
      wrappedOpen.__nfaInlineCreateV7Owner = state.openOwner;
      window.openTaskModal = wrappedOpen;
    }

    if (!close.__nfaInlineCreateV7) {
      state.closeOwner = close.__nfaTaskMessagesV6Owner || close;
      const wrappedClose = function () {
        restoreCreateCard();
        const result = state.closeOwner.apply(this, arguments);
        requestAnimationFrame(() => window.nfaRefreshTaskMessages?.(true));
        return result;
      };
      wrappedClose.__nfaInlineCreateV7 = true;
      wrappedClose.__nfaInlineCreateV7Owner = state.closeOwner;
      window.closeTaskModal = wrappedClose;
    }

    if (!save.__nfaInlineCreateV7) {
      state.saveOwner = save;
      const wrappedSave = async function () {
        const result = await state.saveOwner.apply(this, arguments);
        restoreCreateCard();
        await window.nfaRefreshTaskMessages?.(true);
        return result;
      };
      wrappedSave.__nfaInlineCreateV7 = true;
      wrappedSave.__nfaInlineCreateV7Owner = state.saveOwner;
      window.saveTaskMultiAssignee = wrappedSave;
    }

    return true;
  }

  function installCreateStyles() {
    if (document.getElementById('nfa-v7-create-hotfix-css')) return;
    const style = document.createElement('style');
    style.id = 'nfa-v7-create-hotfix-css';
    style.textContent = `
      @media (min-width:769px) and (pointer:fine) {
        .nfa-v7-create-host {
          margin-top:9px;
          position:relative;
          z-index:12;
        }
        .nfa-v7-inline-create-card {
          display:block !important;
          visibility:visible !important;
          opacity:1 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installWhenReady() {
    if (!isDesktop()) return;
    installCreateStyles();
    const senderReady = installSenderHydration();
    const createReady = installInlineCreateFix();
    if (senderReady && createReady) return;
    state.installFrames += 1;
    if (state.installFrames < 300) requestAnimationFrame(installWhenReady);
  }

  window.nfaHydrateMessageSenders = hydrateCurrentRoom;
  window.nfaRestoreInlineTaskCreate = restoreCreateCard;

  requestAnimationFrame(installWhenReady);
})();
