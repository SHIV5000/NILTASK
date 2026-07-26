/**
 * CANONICAL text helpers — single source of truth (Phase 3 de-duplication).
 *
 * Before this file there were FOUR escape variants and FOUR strip variants
 * scattered across shared.js, ui-core.js, mobile.js and
 * notifications.js — each handling entities slightly differently, which is why
 * "&nbsp;"/"&amp;" leaks kept getting fixed in one place but not another.
 *
 * Loaded as a CLASSIC script BEFORE the module scripts so window.* is defined
 * before any renderer calls it. Every old helper now delegates here.
 */
(function () {
    'use strict';

    // Task-only compact filter presentation. Activity now renders its final
    // compact header and cards directly from js/ui-feed.js with no DOM decorator.
    try {
        if (!document.querySelector('script[data-nfa-compact-panel-filters]')) {
            const script = document.createElement('script');
            script.src = 'js/compact-panel-filters.js?v=5';
            script.defer = true;
            script.dataset.nfaCompactPanelFilters = '1';
            document.head.appendChild(script);
        }
    } catch (e) {}

    // First shared runtime owner for Supabase channels. It provides topic cleanup,
    // owner registration, operation coalescing and a diagnostic snapshot without
    // yet replacing every legacy feature subscription.
    try {
        if (!document.querySelector('script[data-nfa-realtime-manager]')) {
            const script = document.createElement('script');
            script.src = 'js/core/realtime-manager.js?v=1';
            script.defer = true;
            script.dataset.nfaRealtimeManager = '1';
            document.head.appendChild(script);
        }
    } catch (e) {}

    // Named owners for the three desktop topics that previously leaked or repeated
    // presentation: shared broadcast, scheduled-message updates and notification rows.
    try {
        if (!document.querySelector('script[data-nfa-realtime-feature-owners]')) {
            const script = document.createElement('script');
            script.src = 'js/core/realtime-feature-owners.js?v=1';
            script.defer = true;
            script.dataset.nfaRealtimeFeatureOwners = '1';
            document.head.appendChild(script);
        }
    } catch (e) {}

    // Central logout/account/tenant lifecycle. It stops Activity timers, Supabase
    // channels, presence timers, logger flushes and device push identity before a
    // session is discarded, then clears user-owned runtime state.
    try {
        if (!document.querySelector('script[data-nfa-session-lifecycle]')) {
            const script = document.createElement('script');
            script.src = 'js/core/session-lifecycle.js?v=2';
            script.defer = true;
            script.dataset.nfaSessionLifecycle = '1';
            document.head.appendChild(script);
        }
    } catch (e) {}

    // Silent, on-demand diagnostics. Nothing is logged automatically; developers
    // can call NILTASK_printRuntimeSnapshot() when checking a preview.
    try {
        if (!document.querySelector('script[data-nfa-runtime-diagnostics]')) {
            const script = document.createElement('script');
            script.src = 'js/core/runtime-diagnostics.js?v=3';
            script.defer = true;
            script.dataset.nfaRuntimeDiagnostics = '1';
            document.head.appendChild(script);
        }
    } catch (e) {}

    // Phase 0 migration bridge: coalesce repeated legacy startup, remove stale
    // copies, then hand the managed topics to RealtimeFeatureOwners.
    try {
        if (!document.querySelector('script[data-nfa-subscription-guard]')) {
            const script = document.createElement('script');
            script.src = 'js/runtime-subscription-guard.js?v=4';
            script.defer = true;
            script.dataset.nfaSubscriptionGuard = '1';
            document.head.appendChild(script);
        }
    } catch (e) {}

    // One notification-presentation boundary: message IDs and notification-toast
    // signatures are deduplicated, and paired duplicate sounds are suppressed.
    try {
        if (!document.querySelector('script[data-nfa-notification-presentation]')) {
            const script = document.createElement('script');
            script.src = 'js/notification-presentation-service.js?v=3';
            script.defer = true;
            script.dataset.nfaNotificationPresentation = '1';
            document.head.appendChild(script);
        }
    } catch (e) {}

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stripHtml(html) {
        if (html === null || html === undefined) return '';
        let text;
        try {
            const d = document.createElement('div');
            d.innerHTML = String(html);
            text = d.textContent || d.innerText || '';
        } catch (e) {
            text = String(html).replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        }
        return text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    }

    function snippet(html, n) {
        const t = stripHtml(html);
        const max = (typeof n === 'number' && n > 0) ? n : 60;
        return t.length > max ? t.substring(0, max) + '…' : t;
    }

    function getSnippet(htmlStr) {
        const text = stripHtml(htmlStr).replace(/['"\\]/g, '');
        return escapeHtml(text).substring(0, 60) + '...';
    }

    function escapeJs(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/["'`<>\r\n\\]/g, '');
    }

    window.escapeHtml = escapeHtml;
    window.stripHtml  = stripHtml;
    window.snippet    = snippet;
    window.getSnippet = getSnippet;
    window.escapeJs   = escapeJs;
})();
