// Compatibility loader: the patch-based workspace has been replaced by the dedicated proposed renderer.
(function(){
  'use strict';
  if (document.getElementById('nfa-proposed-workspace-js')) return;
  const script = document.createElement('script');
  script.id = 'nfa-proposed-workspace-js';
  script.src = './js/proposed-workspace.js?v=1';
  script.defer = true;
  document.head.appendChild(script);
})();
