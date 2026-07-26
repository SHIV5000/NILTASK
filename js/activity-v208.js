/**
 * Activity layout compatibility entrypoint.
 *
 * Desktop Activity markup, filters, refresh ownership and card styling live
 * directly in js/ui-feed.js. This file contains only the structural sidebar
 * rule required by the existing main-app shell: when Activity is open, the
 * full-height Task shell must leave the flex layout so Activity can occupy the
 * complete right sidebar. No function wrappers or MutationObservers are used.
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

    window.NILTASK_ACTIVITY_UI_VERSION = 'source-owned-layout-v2';
})();