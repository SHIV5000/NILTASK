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

    if (!document.querySelector('script[data-nfa-universal-brand]')) {
        const brand = document.createElement('script');
        brand.src = 'js/universal-brand-noted-for-action-v1.js?v=1';
        brand.defer = true;
        brand.dataset.nfaUniversalBrand = '1';
        document.head.appendChild(brand);
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

    if (
        mobileRuntime &&
        !document.querySelector('script[data-nfa-mobile-final-ui]')
    ) {
        const finalUi = document.createElement('script');
        finalUi.src = 'js/mobile-final-ui-v212.js?v=1';
        finalUi.async = false;
        finalUi.dataset.nfaMobileFinalUi = '1';
        document.head.appendChild(finalUi);
    }

    if (
        mobileRuntime &&
        !document.querySelector('script[data-nfa-mobile-acceptance]')
    ) {
        const acceptance = document.createElement('script');
        acceptance.src = 'js/mobile-final-acceptance-v213.js?v=1';
        acceptance.async = false;
        acceptance.dataset.nfaMobileAcceptance = '1';
        document.head.appendChild(acceptance);
    }

    if (
        mobileRuntime &&
        !document.querySelector('script[data-nfa-mobile-acceptance-v214]')
    ) {
        const acceptance214 = document.createElement('script');
        acceptance214.src = 'js/mobile-final-acceptance-v214.js?v=1';
        acceptance214.async = false;
        acceptance214.dataset.nfaMobileAcceptanceV214 = '1';
        document.head.appendChild(acceptance214);
    }

    if (
        mobileRuntime &&
        !document.querySelector('script[data-nfa-mobile-acceptance-v215]')
    ) {
        const acceptance215 = document.createElement('script');
        acceptance215.src = 'js/mobile-final-acceptance-v215.js?v=2';
        acceptance215.async = false;
        acceptance215.dataset.nfaMobileAcceptanceV215 = '1';
        document.head.appendChild(acceptance215);
    }

    if (
        mobileRuntime &&
        !document.querySelector('script[data-nfa-mobile-task-owner-v216]')
    ) {
        const taskOwner = document.createElement('script');
        taskOwner.src = 'js/mobile-task-owner-v216.js?v=2';
        taskOwner.async = false;
        taskOwner.dataset.nfaMobileTaskOwnerV216 = '1';
        document.head.appendChild(taskOwner);
    }

    // Keep the established Activity ownership contract stable for validators and
    // downstream code. Mobile release detail is exposed separately.
    window.NILTASK_ACTIVITY_UI_VERSION = 'source-owned-layout-v2';
    window.NFA_MOBILE_LAYER_VERSION =
        'workflow-v209-role-v210-ui-v212-acceptance-v213-v214-v215.1-task-owner-v216';
})();