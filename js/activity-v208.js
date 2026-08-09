/**
 * Runtime compatibility entrypoint.
 *
 * Desktop Activity markup, filters, refresh ownership and card styling live
 * directly in js/ui-feed.js. This file contains the structural sidebar rule
 * required by the existing main-app shell and loads the cross-device chat
 * parity service. The mobile/tablet workflow layers are loaded only on the
 * mobile/native/coarse-pointer runtime boundary so the finalized desktop
 * Workspace v8 + Task Composer v11 stays isolated and speed-first.
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

    const mobileRuntime =
        window.IS_NATIVE === true ||
        window.innerWidth <= 768 ||
        (
            window.matchMedia &&
            window.matchMedia('(pointer: coarse)').matches &&
            window.innerWidth <= 1366
        );

    if (
        mobileRuntime &&
        !document.querySelector('script[data-nfa-mobile-workflow-parity]')
    ) {
        const workflow = document.createElement('script');
        workflow.src = 'js/mobile-workflow-parity-v209.js?v=2';
        workflow.async = false;
        workflow.dataset.nfaMobileWorkflowParity = '1';
        document.head.appendChild(workflow);
    }

    if (
        mobileRuntime &&
        !document.querySelector('script[data-nfa-mobile-role-parity]')
    ) {
        const roleParity = document.createElement('script');
        roleParity.src = 'js/mobile-role-parity-v210.js?v=2';
        roleParity.async = false;
        roleParity.dataset.nfaMobileRoleParity = '1';
        document.head.appendChild(roleParity);
    }

    window.NILTASK_ACTIVITY_UI_VERSION =
        'source-owned-layout-v2-mobile-workflow-v209-role-parity-v210';
})();