/*
 * Noted For Action — Phase 1 task-trail rendering correction.
 *
 * Desktop-only compatibility layer for rich progress updates written as:
 *   [NFA_RICH]<approved markup>
 *
 * Existing database records remain untouched. The layer:
 * - wraps both task-trail renderers before every Task Hub render;
 * - safely renders only Bold, Italic, Underline and List-compatible markup;
 * - repairs already-painted legacy trail text without a MutationObserver;
 * - leaves the Phase 1 right-panel / action-drawer workflow unchanged.
 */
(function () {
  'use strict';

  if (window.__NFA_DESKTOP_PHASE1_TRAIL_FIX_V3__) return;
  window.__NFA_DESKTOP_PHASE1_TRAIL_FIX_V3__ = true;

  const RICH_PREFIX = '[NFA_RICH]';
  const state = {
    installFrames: 0,
    loadTasksOwner: null
  };

  function isDesktop() {
    return window.innerWidth >= 769 &&
      !window.IS_NATIVE &&
      !window.isMobileView?.() &&
      !window.matchMedia?.('(pointer: coarse)').matches;
  }

  if (!isDesktop()) return;

  function sanitizeRichHtml(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    const allowed = new Set([
      'P', 'DIV', 'BR',
      'STRONG', 'B',
      'EM', 'I',
      'U',
      'UL', 'OL', 'LI'
    ]);

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

  function richComment(value) {
    const comment = String(value || '');
    if (!comment.startsWith(RICH_PREFIX)) return null;
    return sanitizeRichHtml(comment.slice(RICH_PREFIX.length));
  }

  function wrapRenderer(name) {
    const owner = window[name];
    if (typeof owner !== 'function') return false;
    if (owner.__nfaTrailRichV3Wrapped) return true;

    const wrapped = function (trailList) {
      const replacements = [];
      const safeList = (Array.isArray(trailList) ? trailList : []).map((trail, index) => {
        const rich = richComment(trail?.comment);
        if (rich == null) return trail;

        const token = `NFA_TRAIL_RICH_V3_${index}_${Math.random().toString(36).slice(2)}`;
        replacements.push({ token, rich });
        return { ...trail, comment: token };
      });

      let html = owner.apply(this, [safeList, ...Array.prototype.slice.call(arguments, 1)]);
      replacements.forEach(({ token, rich }) => {
        html = String(html).split(token).join(
          `<div class="nfa-phase1-rich-output nfa-trail-rich-v3">${rich}</div>`
        );
      });
      return html;
    };

    wrapped.__nfaTrailRichV3Wrapped = true;
    wrapped.__nfaTrailRichV3Owner = owner;
    window[name] = wrapped;
    return true;
  }

  function installRendererOwners() {
    const professional = wrapRenderer('renderProfessionalTrail');
    const compact = wrapRenderer('renderCompactTrail');
    return professional || compact;
  }

  function buildRichNode(rawText) {
    const marker = rawText.indexOf(RICH_PREFIX);
    if (marker < 0) return null;

    const before = rawText.slice(0, marker);
    const rich = sanitizeRichHtml(rawText.slice(marker + RICH_PREFIX.length));
    const fragment = document.createDocumentFragment();

    if (before) fragment.appendChild(document.createTextNode(before));

    const output = document.createElement('div');
    output.className = 'nfa-phase1-rich-output nfa-trail-rich-v3';
    output.innerHTML = rich;
    fragment.appendChild(output);
    return fragment;
  }

  function repairRenderedTrail(root) {
    const scope = root || document;
    const containers = [];

    if (scope.matches?.('.nt-task-trail,[id^="trail-"]')) containers.push(scope);
    scope.querySelectorAll?.('.nt-task-trail,[id^="trail-"]').forEach(node => containers.push(node));

    containers.forEach(container => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const matches = [];
      let node;
      while ((node = walker.nextNode())) {
        if (String(node.nodeValue || '').includes(RICH_PREFIX)) matches.push(node);
      }

      matches.forEach(textNode => {
        const replacement = buildRichNode(String(textNode.nodeValue || ''));
        if (replacement) textNode.replaceWith(replacement);
      });
    });
  }

  function installTaskLoadOwner() {
    const owner = window.loadTasksForPanel;
    if (typeof owner !== 'function') return false;
    if (owner.__nfaTrailRichV3Wrapped) return true;

    state.loadTasksOwner = owner;
    const wrapped = async function () {
      installRendererOwners();
      const result = await owner.apply(this, arguments);
      repairRenderedTrail(document);
      requestAnimationFrame(() => repairRenderedTrail(document));
      return result;
    };

    wrapped.__nfaTrailRichV3Wrapped = true;
    wrapped.__nfaTrailRichV3Owner = owner;
    window.loadTasksForPanel = wrapped;
    return true;
  }

  function installWhenReady() {
    const renderReady = installRendererOwners();
    const loadReady = installTaskLoadOwner();
    repairRenderedTrail(document);

    if (renderReady && loadReady) return;
    state.installFrames += 1;
    if (state.installFrames < 180) requestAnimationFrame(installWhenReady);
  }

  requestAnimationFrame(installWhenReady);
})();
