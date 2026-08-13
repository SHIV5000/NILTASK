/* Noted For Action — WEB v13 acceptance guard
 * Desktop-only finishing layer:
 *  - visible WEB v13 identifier at the top of the UI
 *  - pre-quarantines the legacy task action layer before any authoritative
 *    action owner runs, so Deadline/Return/Cancel/Transfer/Extension cannot flash
 *    as a modal before Composer v11/v12 adopts the panel inline.
 */
(function () {
  'use strict';

  if (window.__NFA_WEB_V13__) return;
  window.__NFA_WEB_V13__ = true;
  window.NFA_WEB_VERSION = 'WEB v13';

  function isDesktop() {
    return window.innerWidth >= 769 && !window.IS_NATIVE &&
      !window.isMobileView?.() && !window.matchMedia?.('(pointer: coarse)').matches;
  }
  if (!isDesktop()) return;

  function quarantineLegacyLayer() {
    const layer = document.getElementById('ntTaskActionLayer');
    if (!layer) return;
    layer.classList.remove('nt-open');
    layer.setAttribute('aria-hidden', 'true');
    try { layer.inert = true; } catch (_) {}
    layer.style.setProperty('display', 'none', 'important');
    layer.style.setProperty('visibility', 'hidden', 'important');
    layer.style.setProperty('opacity', '0', 'important');
    layer.style.setProperty('pointer-events', 'none', 'important');
    document.body.style.overflow = '';
  }

  function wrapActionOwner(name) {
    const owner = window[name];
    if (typeof owner !== 'function' || owner.__nfaWebV13) return false;
    const wrapped = function (...args) {
      const taskMode = document.querySelector('.nfa-v11-task-mode');
      if (taskMode) quarantineLegacyLayer();
      const result = owner.apply(this, args);
      if (taskMode) quarantineLegacyLayer();
      return result;
    };
    wrapped.__nfaWebV13 = true;
    wrapped.__nfaOriginal = owner;
    window[name] = wrapped;
    return true;
  }

  function installActionGuards() {
    [
      'openTaskDeadlineAction',
      'openTaskCancelAction',
      'openTaskReturnAction',
      'openTaskDelegateAction',
      'openTaskTransferAction',
      'openTaskExtensionRequest'
    ].forEach(wrapActionOwner);
  }

  function installVersionBadge() {
    if (document.getElementById('nfaWebVersionV13')) return;
    const badge = document.createElement('div');
    badge.id = 'nfaWebVersionV13';
    badge.textContent = 'WEB v13';
    badge.setAttribute('aria-label', 'Web version 13');
    badge.style.cssText = [
      'position:fixed',
      'top:7px',
      'right:12px',
      'z-index:12000',
      'pointer-events:none',
      'padding:3px 8px',
      'border:1px solid rgba(79,70,229,.22)',
      'border-radius:999px',
      'background:rgba(238,242,255,.94)',
      'color:#4338ca',
      'font:800 10px/1.35 Inter,-apple-system,BlinkMacSystemFont,sans-serif',
      'letter-spacing:.035em',
      'box-shadow:0 1px 4px rgba(15,23,42,.08)'
    ].join(';');
    document.body.appendChild(badge);
  }

  function installPermanentTaskModeQuarantine() {
    if (document.getElementById('nfa-web-v13-task-layer-css')) return;
    const style = document.createElement('style');
    style.id = 'nfa-web-v13-task-layer-css';
    style.textContent = `
      body:has(.nfa-v11-task-mode) #ntTaskActionLayer {
        display:none !important;
        visibility:hidden !important;
        opacity:0 !important;
        pointer-events:none !important;
      }
    `;
    document.head.appendChild(style);
  }

  installPermanentTaskModeQuarantine();
  installActionGuards();
  installVersionBadge();

  // Action owners are defined by tasks.js before the desktop stack in normal boot,
  // but retry briefly for restored sessions or unusually slow module evaluation.
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    installActionGuards();
    if (attempts >= 30 || [
      'openTaskDeadlineAction','openTaskCancelAction','openTaskReturnAction',
      'openTaskDelegateAction','openTaskTransferAction','openTaskExtensionRequest'
    ].every(name => window[name]?.__nfaWebV13)) clearInterval(timer);
  }, 100);

  console.log('[NFA] WEB v13 active');
})();
