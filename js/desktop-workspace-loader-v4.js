/* Load the desktop workspace only for the authenticated web/desktop shell. */
(function () {
  'use strict';

  let loaded = false;
  function loadDesktopWorkspace() {
    if (loaded) return;
    if (window.IS_NATIVE || window.innerWidth <= 768) return;
    loaded = true;
    import('./desktop-workspace-v4.js?v=215').catch(error => {
      loaded = false;
      console.error('[Noted For Action] Desktop workspace v4 failed to load', error);
    });
  }

  loadDesktopWorkspace();
  window.addEventListener('resize', loadDesktopWorkspace, { passive: true });
})();
