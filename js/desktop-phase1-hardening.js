/*
 * Noted For Action — desktop Phase 1 hardening.
 *
 * Keeps the legacy right-panel / action-drawer task workflow. This layer only:
 * - hardens Progress Update against missing/stale task references;
 * - adds the approved four-control rich editor and an explicit Cancel action;
 * - preserves Activity unread state until the individual item is opened;
 * - shortens splash-to-usable-shell time without background polling.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_PHASE1_HARDENING__) return;
  window.__NFA_DESKTOP_PHASE1_HARDENING__ = true;

  const RICH_PREFIX = '[NFA_RICH]';
  const state = {
    taskUpdateOwner: null,
    activityOpenOwner: null,
    activityLoadOwner: null,
    rendererFrames: 0
  };

  function isDesktop() {
    return window.innerWidth >= 769 &&
      !window.IS_NATIVE &&
      !window.isMobileView?.() &&
      !window.matchMedia?.('(pointer: coarse)').matches;
  }

  if (!isDesktop()) return;

  function client() {
    return window.sb || null;
  }

  function ids() {
    return {
      uid: window.currentUser?.id || null,
      tid: window.currentTenantId || null
    };
  }

  function toast(message, icon, className) {
    if (typeof window.showCenterToast === 'function') {
      window.showCenterToast(
        message,
        icon || 'fa-solid fa-circle-info',
        className || 'text-blue-500'
      );
      return;
    }
    console.warn('[desktop-phase1]', message);
  }

  function cleanTaskId(value) {
    const id = String(value == null ? '' : value).trim();
    return id && id !== 'null' && id !== 'undefined' ? id : '';
  }

  function resolveTaskId(value) {
    const direct = cleanTaskId(value);
    if (direct) return direct;

    const eventCard = window.event?.target?.closest?.('.nt-task-card[data-task-id]');
    const eventId = cleanTaskId(eventCard?.dataset?.taskId);
    if (eventId) return eventId;

    const openDetails = document.querySelector('.nt-task-expanded.nt-open[id^="nt-task-details-"]');
    const openId = cleanTaskId(openDetails?.id?.replace('nt-task-details-', ''));
    if (openId) return openId;

    const openCard = document.querySelector('.nt-task-card[data-task-id]:has(.nt-task-expanded.nt-open)');
    return cleanTaskId(openCard?.dataset?.taskId);
  }

  async function getTask(taskId) {
    const sb = client();
    const { uid, tid } = ids();
    if (!sb || !uid || !tid || !taskId) return null;

    const { data, error } = await sb
      .from('tasks')
      .select('id,title,assigned_by,original_message_id,tenant_id')
      .eq('tenant_id', tid)
      .eq('id', taskId)
      .maybeSingle();

    if (error) {
      console.error('[desktop-phase1] task lookup failed', error);
      return null;
    }
    return data || null;
  }

  async function activeAssignment(taskId) {
    const sb = client();
    const { uid, tid } = ids();
    if (!sb || !uid || !tid || !taskId) return null;

    const { data, error } = await sb
      .from('task_assignees')
      .select('assignee_id,status,state,acked')
      .eq('tenant_id', tid)
      .eq('task_id', taskId)
      .eq('assignee_id', uid)
      .maybeSingle();

    if (error || !data) return null;
    const status = String(data.status || 'pending_ack').toLowerCase();
    if (['accepted', 'transferred', 'cancelled'].includes(status)) return null;
    return data;
  }

  function sanitizeRichHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const allowed = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI']);

    const walk = node => {
      [...node.childNodes].forEach(child => {
        if (child.nodeType !== Node.ELEMENT_NODE) return;
        if (!allowed.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        [...child.attributes].forEach(attribute => child.removeAttribute(attribute.name));
        walk(child);
      });
    };

    walk(template.content);
    return template.innerHTML.trim();
  }

  function richPlainText(surface) {
    return String(surface?.innerText || surface?.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function decodeRichComment(comment) {
    const value = String(comment || '');
    if (!value.startsWith(RICH_PREFIX)) return null;
    return sanitizeRichHtml(value.slice(RICH_PREFIX.length));
  }

  function wrapTrailRenderer(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__nfaPhase1RichWrapped) return Boolean(original);

    const wrapped = function (trailList) {
      const replacements = [];
      const safeList = (trailList || []).map((trail, index) => {
        const rich = decodeRichComment(trail?.comment);
        if (rich == null) return trail;
        const token = `NFA_RICH_${index}_${Math.random().toString(36).slice(2)}`;
        replacements.push({ token, rich });
        return { ...trail, comment: token };
      });

      let html = original.apply(this, [safeList, ...Array.prototype.slice.call(arguments, 1)]);
      replacements.forEach(({ token, rich }) => {
        html = String(html).split(token).join(`<div class="nfa-phase1-rich-output">${rich}</div>`);
      });
      return html;
    };

    wrapped.__nfaPhase1RichWrapped = true;
    wrapped.__nfaPhase1RichOwner = original;
    window[name] = wrapped;
    return true;
  }

  function installTrailRenderers() {
    const professional = wrapTrailRenderer('renderProfessionalTrail');
    wrapTrailRenderer('renderCompactTrail');
    if (professional || state.rendererFrames >= 120) return;
    state.rendererFrames += 1;
    requestAnimationFrame(installTrailRenderers);
  }

  function ensureCancelButton() {
    const footer = document.getElementById('ntTaskActionFooter');
    const primary = document.getElementById('ntTaskActionPrimary');
    if (!footer || !primary) return null;

    let cancel = document.getElementById('nfaTaskActionCancel') ||
      [...footer.querySelectorAll('button')].find(button => button !== primary);

    if (!cancel) {
      cancel = document.createElement('button');
      footer.insertBefore(cancel, primary);
    }

    cancel.id = 'nfaTaskActionCancel';
    cancel.type = 'button';
    cancel.className = 'nt-task-button nt-task-button-secondary nfa-phase1-cancel';
    cancel.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Cancel</span>';
    cancel.onclick = () => window.closeTaskActionLayer?.();
    return cancel;
  }

  async function submitRichUpdate(taskId, surface, primary) {
    if (!primary || primary.disabled) return;
    const sb = client();
    const { uid, tid } = ids();
    const text = richPlainText(surface);

    if (!sb || !uid || !tid) {
      toast('Your session is still loading. Please try again.', 'fa-solid fa-clock', 'text-orange-500');
      return;
    }
    if (!text) {
      toast('Progress update cannot be empty.', 'fa-solid fa-triangle-exclamation', 'text-red-500');
      surface?.focus();
      return;
    }

    primary.disabled = true;
    primary.setAttribute('aria-busy', 'true');
    try {
      const currentTask = await getTask(taskId);
      if (!currentTask) {
        toast('This task is no longer available. The Task Hub has been refreshed.', 'fa-solid fa-rotate', 'text-orange-500');
        await window.loadTasksForPanel?.();
        return;
      }

      const assignment = await activeAssignment(taskId);
      if (!assignment) {
        toast('Only an active assignee can post a progress update.', 'fa-solid fa-lock', 'text-orange-500');
        await window.loadTasksForPanel?.();
        return;
      }

      const rich = sanitizeRichHtml(surface.innerHTML);
      const { error } = await sb.from('task_trails').insert({
        task_id: taskId,
        user_id: uid,
        tenant_id: tid,
        action: 'UPDATE',
        comment: RICH_PREFIX + rich
      });
      if (error) throw error;

      await window.notifyUser?.(
        currentTask.assigned_by,
        `💬 Task Update: ${currentTask.title} — ${text.slice(0, 60)}`,
        currentTask.original_message_id,
        'task',
        taskId
      );

      toast('Progress update posted.', 'fa-solid fa-check', 'text-green-500');
      window.closeTaskActionLayer?.();
      await window.loadTasksForPanel?.();
    } catch (error) {
      console.error('[desktop-phase1] progress update failed', error);
      toast(error?.message || 'Progress update could not be posted.', 'fa-solid fa-circle-xmark', 'text-red-500');
    } finally {
      primary.disabled = false;
      primary.removeAttribute('aria-busy');
    }
  }

  function decorateProgressModal(taskId) {
    let frames = 0;
    const apply = () => {
      const layer = document.getElementById('ntTaskActionLayer');
      const title = document.getElementById('ntTaskActionTitle');
      const textarea = document.getElementById('ntTaskUpdateText');
      const primary = document.getElementById('ntTaskActionPrimary');

      if (!layer?.classList.contains('nt-open') || !textarea || !primary || title?.textContent?.trim() !== 'Progress Update') {
        frames += 1;
        if (frames < 60) requestAnimationFrame(apply);
        return;
      }

      ensureCancelButton();
      if (document.getElementById('nfaTaskRichEditor')) return;

      textarea.hidden = true;
      const editor = document.createElement('section');
      editor.id = 'nfaTaskRichEditor';
      editor.className = 'nfa-phase1-rich-editor';
      editor.innerHTML = `
        <div class="nfa-phase1-rich-toolbar" role="toolbar" aria-label="Task update formatting">
          <button type="button" data-nfa-format="bold" title="Bold" aria-label="Bold"><b>B</b></button>
          <button type="button" data-nfa-format="italic" title="Italic" aria-label="Italic"><i>I</i></button>
          <button type="button" data-nfa-format="underline" title="Underline" aria-label="Underline"><u>U</u></button>
          <button type="button" data-nfa-format="insertUnorderedList" title="Bulleted list" aria-label="Bulleted list">• List</button>
        </div>
        <div id="nfaTaskRichSurface" class="nfa-phase1-rich-surface" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Write a clear progress update…"></div>`;
      textarea.after(editor);

      const surface = document.getElementById('nfaTaskRichSurface');
      const sync = () => {
        textarea.value = RICH_PREFIX + sanitizeRichHtml(surface?.innerHTML || '');
      };
      editor.querySelector('.nfa-phase1-rich-toolbar').addEventListener('click', event => {
        const button = event.target.closest('[data-nfa-format]');
        if (!button) return;
        event.preventDefault();
        surface.focus();
        document.execCommand(button.dataset.nfaFormat, false, null);
        sync();
      });
      surface.addEventListener('input', sync);
      surface.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          submitRichUpdate(taskId, surface, primary);
        }
      });
      primary.onclick = () => submitRichUpdate(taskId, surface, primary);
      requestAnimationFrame(() => surface.focus({ preventScroll: true }));
    };
    requestAnimationFrame(apply);
  }

  function installTaskUpdateOwner() {
    const original = window.openTaskUpdateAction;
    if (typeof original !== 'function' || original.__nfaPhase1HardeningWrapped) return false;
    state.taskUpdateOwner = original;

    const wrapped = async function (taskId, assigneeId) {
      const resolvedTaskId = resolveTaskId(taskId);
      if (!resolvedTaskId) {
        toast('Task reference is unavailable. Refreshing Task Hub.', 'fa-solid fa-rotate', 'text-orange-500');
        await window.loadTasksForPanel?.();
        return false;
      }

      const task = await getTask(resolvedTaskId);
      if (!task) {
        toast('This task is no longer available. The Task Hub has been refreshed.', 'fa-solid fa-rotate', 'text-orange-500');
        await window.loadTasksForPanel?.();
        return false;
      }

      const result = original.call(this, resolvedTaskId, assigneeId || ids().uid);
      decorateProgressModal(resolvedTaskId);
      return result;
    };

    wrapped.__nfaPhase1HardeningWrapped = true;
    wrapped.__nfaPhase1HardeningOwner = original;
    window.openTaskUpdateAction = wrapped;
    return true;
  }

  function notificationIdFromCard(card) {
    const clear = card?.querySelector('.nfa-af-item-clear');
    const handler = clear?.getAttribute('onclick') || '';
    const match = handler.match(/_webClearActivityItem\(['"]notif['"],['"]([^'"]+)['"]\)/);
    return match?.[1] || '';
  }

  function decorateActivityCards() {
    const panel = document.getElementById('activityFeedPanel');
    if (!panel) return;

    panel.querySelectorAll('.nfa-af-card').forEach(card => {
      const notificationId = notificationIdFromCard(card);
      if (notificationId) card.dataset.nfaNotificationId = notificationId;
    });

    if (panel.dataset.nfaReadOwner === '1') return;
    panel.dataset.nfaReadOwner = '1';
    panel.addEventListener('click', event => {
      if (event.target.closest('.nfa-af-item-clear,.nfa-af-clear-all,.nfa-af-close,select')) return;
      const card = event.target.closest('.nfa-af-card[data-nfa-notification-id]');
      if (!card || !panel.contains(card)) return;
      markActivityNotificationRead(card.dataset.nfaNotificationId, card);
    }, true);
  }

  async function markActivityNotificationRead(notificationId, card) {
    const sb = client();
    const { uid, tid } = ids();
    if (!sb || !uid || !tid || !notificationId || card?.dataset.nfaMarkingRead === '1') return;

    card.dataset.nfaMarkingRead = '1';
    const wasUnread = card.classList.contains('nfa-af-unread');
    card.classList.remove('nfa-af-unread');
    card.querySelector('.nfa-af-unread-dot')?.remove();

    const { error } = await sb.from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', uid)
      .eq('tenant_id', tid);

    delete card.dataset.nfaMarkingRead;
    if (error) {
      if (wasUnread) card.classList.add('nfa-af-unread');
      console.error('[desktop-phase1] notification read update failed', error);
      return;
    }
    await window._loadActivityFeed?.();
  }

  async function captureUnreadNotificationIds() {
    const sb = client();
    const { uid } = ids();
    if (!sb || !uid) return [];
    const { data, error } = await sb.from('notifications')
      .select('id')
      .eq('user_id', uid)
      .eq('is_read', false);
    if (error) return [];
    return (data || []).map(row => row.id).filter(Boolean);
  }

  async function restoreUnreadNotifications(notificationIds) {
    const sb = client();
    const { uid } = ids();
    if (!sb || !uid || !notificationIds.length) return;
    const { error } = await sb.from('notifications')
      .update({ is_read: false })
      .eq('user_id', uid)
      .in('id', notificationIds);
    if (error) console.error('[desktop-phase1] unread restore failed', error);
  }

  function installActivityOwners() {
    const loadOwner = window._loadActivityFeed;
    if (typeof loadOwner === 'function' && !loadOwner.__nfaPhase1HardeningWrapped) {
      state.activityLoadOwner = loadOwner;
      const wrappedLoad = async function () {
        const result = await loadOwner.apply(this, arguments);
        decorateActivityCards();
        return result;
      };
      wrappedLoad.__nfaPhase1HardeningWrapped = true;
      wrappedLoad.__nfaPhase1HardeningOwner = loadOwner;
      window._loadActivityFeed = wrappedLoad;
    }

    const openOwner = window.openActivityFeed;
    if (typeof openOwner !== 'function' || openOwner.__nfaPhase1HardeningWrapped) return false;
    state.activityOpenOwner = openOwner;

    const wrappedOpen = async function () {
      if (document.getElementById('activityFeedPanel')) return openOwner.apply(this, arguments);

      const unreadIds = await captureUnreadNotificationIds();
      const clearBadgeOwner = window._clearBellBadge;
      window._clearBellBadge = function () {};
      try {
        const result = await openOwner.apply(this, arguments);
        await restoreUnreadNotifications(unreadIds);
        await window._loadActivityFeed?.();
        decorateActivityCards();
        return result;
      } finally {
        window._clearBellBadge = clearBadgeOwner;
      }
    };

    wrappedOpen.__nfaPhase1HardeningWrapped = true;
    wrappedOpen.__nfaPhase1HardeningOwner = openOwner;
    window.openActivityFeed = wrappedOpen;
    return true;
  }

  function accelerateSplash() {
    const splash = document.getElementById('bootSplash');
    if (splash) splash.style.transition = 'opacity .12s ease-out';

    const originalHide = window._hideSplash;
    if (typeof originalHide === 'function' && !originalHide.__nfaPhase1FastWrapped) {
      const fastHide = function () {
        const node = document.getElementById('bootSplash');
        if (!node || node.dataset.hiding) return;
        node.dataset.hiding = '1';
        node.style.transition = 'opacity .12s ease-out';
        node.style.opacity = '0';
        setTimeout(() => node.remove(), 150);
      };
      fastHide.__nfaPhase1FastWrapped = true;
      fastHide.__nfaPhase1FastOwner = originalHide;
      window._hideSplash = fastHide;
    }

    let frames = 0;
    const revealWhenUsable = () => {
      const root = document.getElementById('root');
      const appReady = document.getElementById('leftSidebar') &&
        document.getElementById('messagesContainer') &&
        document.getElementById('rightSidebar');
      const authReady = root?.querySelector('form,input[type="email"],input[type="password"]');
      if (appReady || authReady) {
        requestAnimationFrame(() => window._hideSplash?.());
        return;
      }
      frames += 1;
      if (frames < 150) requestAnimationFrame(revealWhenUsable);
    };
    requestAnimationFrame(revealWhenUsable);
  }

  function installOwnersWhenReady() {
    let frames = 0;
    const install = () => {
      const taskReady = installTaskUpdateOwner();
      const activityReady = installActivityOwners();
      if (taskReady && activityReady) return;
      frames += 1;
      if (frames < 180) requestAnimationFrame(install);
    };
    requestAnimationFrame(install);
  }

  installTrailRenderers();
  accelerateSplash();
  installOwnersWhenReady();
})();
