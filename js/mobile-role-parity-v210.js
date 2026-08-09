/**
 * NILTASK mobile/tablet role parity v210.
 * Keeps the chat-first v209 workflow, but enforces the authoritative task
 * capability set already used by Web/mobile task owners.
 */
(function () {
  'use strict';

  if (window.__NFA_MOBILE_ROLE_PARITY_V210__) return;
  window.__NFA_MOBILE_ROLE_PARITY_V210__ = true;
  window.NILTASK_MOBILE_ROLE_PARITY_VERSION = 'v210';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const sb = () => window.sb;
  const uid = () => window.currentUser?.id || null;
  const tid = () => window.currentTenantId || null;

  let current = null;
  let syncTimer = null;
  let observer = null;
  const taskCache = new Map();

  function toast(message, type='ok') {
    if (typeof window._mobToast === 'function') return window._mobToast(message, type);
    if (typeof window.showCenterToast === 'function') {
      return window.showCenterToast(
        message,
        type === 'err' ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-circle-info',
        type === 'err' ? 'text-red-500' : 'text-blue-500'
      );
    }
    console[type === 'err' ? 'error' : 'log']('[NFA role parity]', message);
  }

  function effectiveStatus(a) {
    if (!a) return '';
    if (a.status === 'pending_ack' && (a.state === 'acknowledged' || a.acked === true)) {
      return 'acknowledged';
    }
    return a.status || 'pending_ack';
  }

  function isClosed(task, assignments) {
    const taskState = String(task?.status || '').toLowerCase();
    if (taskState === 'cancelled' || taskState === 'accepted' || taskState === 'completed') return true;
    const active = (assignments || []).filter(a => !['transferred','cancelled'].includes(effectiveStatus(a)));
    return active.length > 0 && active.every(a => effectiveStatus(a) === 'accepted');
  }

  async function getTaskState(taskId, force=false) {
    if (!taskId || !sb() || !tid()) return null;
    const cached = taskCache.get(taskId);
    if (!force && cached && Date.now() - cached.at < 15000) return cached.value;

    try {
      const { data: task, error } = await sb()
        .from('tasks')
        .select('id,title,status,assigned_by,original_message_id')
        .eq('tenant_id', tid())
        .eq('id', taskId)
        .maybeSingle();
      if (error || !task) throw error || new Error('Task not found');

      const { data: assignments, error: assignmentError } = await sb()
        .from('task_assignees')
        .select('assignee_id,status,state,acked')
        .eq('tenant_id', tid())
        .eq('task_id', taskId);
      if (assignmentError) throw assignmentError;

      const me = (assignments || []).find(a =>
        a.assignee_id === uid() && !['accepted','transferred','cancelled'].includes(effectiveStatus(a))
      ) || null;
      const value = {
        task,
        assignments: assignments || [],
        me,
        myStatus: effectiveStatus(me),
        creator: task.assigned_by === uid(),
        readOnly: isClosed(task, assignments || [])
      };
      taskCache.set(taskId, { at: Date.now(), value });
      return value;
    } catch (e) {
      console.warn('[NFA role parity] task state', e?.message || e);
      return null;
    }
  }

  function chip(bar, key, label) {
    let button = bar.querySelector(`[data-nfa-special="${key}"]`);
    if (!button) {
      button = document.createElement('button');
      button.className = 'nfa-task-chip';
      button.dataset.nfaSpecial = key;
      bar.appendChild(button);
    }
    button.textContent = label;
    return button;
  }

  function orderAssigneeChips(bar, keys) {
    const firstCreator = bar.querySelector('[data-nfa-special="accept"], [data-nfa-special="return"], [data-nfa-special="transferCreator"], [data-nfa-special="remind"], [data-nfa-special="deadline"], [data-nfa-special="cancel"], [data-nfa-special="extApprove"], [data-nfa-special="extDecline"]');
    keys.forEach(key => {
      const el = bar.querySelector(`[data-nfa-special="${key}"]`);
      if (!el) return;
      if (firstCreator) bar.insertBefore(el, firstCreator);
      else bar.appendChild(el);
    });
  }

  async function syncTaskMode() {
    const ctx = $('.nfa-task-context');
    if (!ctx || !current?.taskId) return;

    const state = await getTaskState(current.taskId, true);
    if (!state || !$('.nfa-task-context')) return;
    current.state = state;

    if (state.readOnly || (!state.creator && !state.me)) {
      const close = $('.nfa-task-context [data-nfa-exit-task]');
      if (close) close.click();
      toast(
        state.readOnly ? 'This task is complete and read-only.' : 'No task actions are available for your role.',
        'err'
      );
      return;
    }

    let bar = $('.nfa-task-actionbar', ctx);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'nfa-task-actionbar';
      ctx.appendChild(bar);
    }

    // Assignees do not self-transfer in the authoritative workflow.
    bar.querySelector('[data-nfa-special="transfer"]')?.remove();

    const ms = state.myStatus;
    if (state.me) {
      if (ms === 'pending_ack') {
        chip(bar, 'ack', 'Acknowledge');
        chip(bar, 'extension', 'Request Extension');
        ['start','delegate','submit'].forEach(k => bar.querySelector(`[data-nfa-special="${k}"]`)?.remove());
        orderAssigneeChips(bar, ['ack','extension']);
      } else if (ms === 'acknowledged') {
        chip(bar, 'start', 'Start Work');
        chip(bar, 'extension', 'Request Extension');
        ['ack','delegate','submit'].forEach(k => bar.querySelector(`[data-nfa-special="${k}"]`)?.remove());
        orderAssigneeChips(bar, ['start','extension']);
      } else if (ms === 'in_progress' || ms === 'needs_review') {
        chip(bar, 'delegate', 'Delegate');
        chip(bar, 'extension', 'Request Extension');
        chip(bar, 'submit', ms === 'needs_review' ? 'Resubmit' : 'Submit');
        ['ack','start'].forEach(k => bar.querySelector(`[data-nfa-special="${k}"]`)?.remove());
        orderAssigneeChips(bar, ['delegate','extension','submit']);
      }
    }

    if (state.creator) {
      const approve = bar.querySelector('[data-nfa-special="accept"]');
      if (approve) approve.textContent = 'Approve';
      const remind = bar.querySelector('[data-nfa-special="remind"]');
      if (remind) remind.textContent = 'Remind Pending';
      const deadline = bar.querySelector('[data-nfa-special="deadline"]');
      if (deadline) deadline.textContent = 'Change Deadline';
      const cancel = bar.querySelector('[data-nfa-special="cancel"]');
      if (cancel) cancel.textContent = 'Cancel Task';
      const extApprove = bar.querySelector('[data-nfa-special="extApprove"]');
      if (extApprove) extApprove.textContent = 'Approve Extension';
      const extDecline = bar.querySelector('[data-nfa-special="extDecline"]');
      if (extDecline) extDecline.textContent = 'Decline Extension';
    }
  }

  async function patchTaskRow(row) {
    const taskId = row?.dataset?.nfaTaskId;
    if (!taskId) return;
    const bubble = $('.nfa-task-bubble', row);
    const actions = $('.nfa-task-actions', row);
    if (!bubble || !actions) return;

    if (!actions.querySelector('[data-nfa-task-pdf]')) {
      const pdf = document.createElement('button');
      pdf.className = 'nfa-task-link';
      pdf.dataset.nfaTaskPdf = taskId;
      pdf.textContent = '📄 PDF';
      actions.appendChild(pdf);
    }

    const state = await getTaskState(taskId);
    if (!state || !row.isConnected) return;
    const canMutate = !state.readOnly && (state.creator || !!state.me);
    bubble.classList.toggle('nfa-role-readonly', state.readOnly);
    const reply = actions.querySelector('[data-nfa-task-reply]');
    if (reply && !canMutate) reply.remove();
  }

  function patchVisibleRows() {
    $$('.m-bubble-row[data-nfa-task-id]').forEach(row => patchTaskRow(row));
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      patchVisibleRows();
      if ($('.nfa-task-context') && current?.taskId) syncTaskMode();
    }, 60);
  }

  function defaultTaskSendBlocked() {
    const state = current?.state;
    if (!state) return false;
    if (state.readOnly || (!state.creator && !state.me)) return true;
    if (state.creator) return false;
    return state.myStatus === 'pending_ack' || state.myStatus === 'acknowledged';
  }

  async function onWindowClick(e) {
    const pdf = e.target?.closest?.('[data-nfa-task-pdf]');
    if (pdf) {
      e.preventDefault();
      e.stopPropagation();
      const taskId = pdf.dataset.nfaTaskPdf;
      if (typeof window.downloadTaskPDF === 'function') {
        await window.downloadTaskPDF(taskId);
      } else {
        toast('Task Trail PDF is unavailable right now.', 'err');
      }
      return;
    }

    const reply = e.target?.closest?.('[data-nfa-task-reply]');
    if (reply) {
      current = { taskId: reply.dataset.nfaTaskReply, messageId: reply.dataset.mid, state: null };
      getTaskState(current.taskId, true).then(state => { if (current?.taskId === reply.dataset.nfaTaskReply) current.state = state; });
      setTimeout(syncTaskMode, 0);
      return;
    }

    const composer = $('.m-composer.nfa-task-mode');
    if (!composer) return;

    const send = e.target?.closest?.('.m-sendbtn');
    const attach = e.target?.closest?.('[data-caction="attach"]');
    if ((send && composer.contains(send)) || (attach && composer.contains(attach))) {
      const activeSpecial = $('.nfa-task-chip.on', composer);
      if (!activeSpecial && defaultTaskSendBlocked()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const s = current?.state?.myStatus;
        toast(
          s === 'pending_ack'
            ? 'Acknowledge the task first, or request an extension.'
            : s === 'acknowledged'
              ? 'Start Work first, or request an extension.'
              : 'This task is read-only for your role.',
          'err'
        );
      }
    }
  }

  function installCss() {
    if ($('#nfa-mobile-role-parity-v210-css')) return;
    const style = document.createElement('style');
    style.id = 'nfa-mobile-role-parity-v210-css';
    style.textContent = `
      .nfa-task-bubble.nfa-role-readonly { opacity: .90 !important; }
      .nfa-task-actions [data-nfa-task-pdf] { color:#b91c1c; }
    `;
    document.head.appendChild(style);
  }

  function start() {
    const app = $('#mobileApp');
    if (!app) return setTimeout(start, 250);
    installCss();
    window.addEventListener('click', onWindowClick, true);
    observer = new MutationObserver(scheduleSync);
    observer.observe(app, { childList:true, subtree:true });
    scheduleSync();
    console.log('[NFA] mobile/tablet role parity v210 active');
  }

  start();
})();