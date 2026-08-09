/**
 * Runtime compatibility entrypoint.
 *
 * Desktop Activity markup, filters, refresh ownership and card styling live
 * directly in js/ui-feed.js. This file contains the structural sidebar rule
 * required by the existing main-app shell and loads the cross-device chat
 * parity services.
 */
(function () {
    'use strict';

    if (!document.getElementById('niltask-activity-sidebar-layout')) {
        const style = document.createElement('style');
        style.id = 'niltask-activity-sidebar-layout';
        style.textContent = `
            #rightSidebar:has(> #activityFeedPanel) > :not(#activityFeedPanel) {
                display: none !important;
            }

            #rightSidebar > #activityFeedPanel {
                flex: 1 1 0% !important;
                align-self: stretch !important;
                width: 100% !important;
                height: 100% !important;
                min-height: 0 !important;
                min-width: 0 !important;
            }
        `;
        document.head.appendChild(style);
    }

    if (!document.querySelector('script[data-nfa-chat-parity]')) {
        const script = document.createElement('script');
        script.src = 'js/core/chat-parity-service.js?v=2';
        script.defer = true;
        script.dataset.nfaChatParity = '1';
        document.head.appendChild(script);
    }

    if (!document.querySelector('script[data-nfa-mobile-workflow-parity]')) {
        const workflow = document.createElement('script');
        workflow.src = 'js/mobile-workflow-parity-v209.js?v=2';
        workflow.async = false;
        workflow.dataset.nfaMobileWorkflowParity = '1';
        document.head.appendChild(workflow);
    }

    window.NILTASK_ACTIVITY_UI_VERSION = 'source-owned-layout-v2-mobile-workflow-v209';
})();