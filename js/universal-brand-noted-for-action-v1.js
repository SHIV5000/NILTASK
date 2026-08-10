/* Universal visible-brand owner: Noted For Action.
 * Keeps internal NILTASK code/version identifiers untouched; replaces only user-facing branding.
 */
(function () {
  'use strict';
  if (window.__NFA_UNIVERSAL_BRAND_V1__) return;
  window.__NFA_UNIVERSAL_BRAND_V1__ = true;

  const BRAND = 'Noted For Action';
  document.title = BRAND;

  let apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (!apple) {
    apple = document.createElement('meta');
    apple.name = 'apple-mobile-web-app-title';
    document.head.appendChild(apple);
  }
  apple.content = BRAND;

  function fixTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const raw = node.nodeValue || '';
    if (raw.trim() !== 'NILTASK') return;
    const lead = raw.match(/^\s*/)?.[0] || '';
    const tail = raw.match(/\s*$/)?.[0] || '';
    node.nodeValue = lead + BRAND + tail;
  }

  function fixElement(el) {
    if (!el || el.nodeType !== 1) return;
    ['title','aria-label','alt'].forEach(name => {
      const v = el.getAttribute?.(name);
      if (v === 'NILTASK') el.setAttribute(name, BRAND);
      else if (v && /^NILTASK\b/.test(v)) el.setAttribute(name, v.replace(/^NILTASK\b/, BRAND));
    });
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) fixTextNode(n);
  }

  const run = () => fixElement(document.body);
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run, { once:true });

  const startObserver = () => {
    if (!document.body) return;
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 3) fixTextNode(n);
          else if (n.nodeType === 1) fixElement(n);
        }
      }
    });
    mo.observe(document.body, { childList:true, subtree:true });
  };
  if (document.body) startObserver(); else document.addEventListener('DOMContentLoaded', startObserver, { once:true });
})();