/* Noted For Action — Desktop Task PDF click owner v11
 * Workspace v8 binds its PDF button to a closed-over legacy generator.
 * Capture the button before that target handler and route it to the professional v11 owner.
 */
(function(){
  'use strict';
  if(window.__NFA_DESKTOP_TASK_PDF_CLICK_V11__)return;
  window.__NFA_DESKTOP_TASK_PDF_CLICK_V11__=true;
  const coarse=window.matchMedia?.('(pointer: coarse)').matches;
  if(window.IS_NATIVE||window.innerWidth<769||window.isMobileView?.()||coarse)return;
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-v8-task-pdf]');
    if(!button)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const taskId=String(button.dataset.v8TaskPdf||'').trim();
    if(taskId)window.nfaDownloadTaskTrailPdf?.(taskId);
  },true);
})();