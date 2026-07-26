/**
 * CANONICAL text helpers — single source of truth (Phase 3 de-duplication).
 */
(function () {
    'use strict';

    function load(selector, src, dataKey) {
        try {
            if (document.querySelector(selector)) return;
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.dataset[dataKey] = '1';
            document.head.appendChild(script);
        } catch (e) {}
    }

    load('script[data-nfa-compact-panel-filters]', 'js/compact-panel-filters.js?v=5', 'nfaCompactPanelFilters');
    load('script[data-nfa-realtime-manager]', 'js/core/realtime-manager.js?v=1', 'nfaRealtimeManager');
    load('script[data-nfa-realtime-feature-owners]', 'js/core/realtime-feature-owners.js?v=5', 'nfaRealtimeFeatureOwners');
    load('script[data-nfa-session-lifecycle]', 'js/core/session-lifecycle.js?v=2', 'nfaSessionLifecycle');
    load('script[data-nfa-runtime-diagnostics]', 'js/core/runtime-diagnostics.js?v=7', 'nfaRuntimeDiagnostics');
    load('script[data-nfa-mobile-runtime-diagnostics]', 'js/core/mobile-runtime-diagnostics.js?v=1', 'nfaMobileRuntimeDiagnostics');
    load('script[data-nfa-subscription-guard]', 'js/runtime-subscription-guard.js?v=7', 'nfaSubscriptionGuard');
    load('script[data-nfa-notification-presentation]', 'js/notification-presentation-service.js?v=3', 'nfaNotificationPresentation');

    // Desktop/PWA unread authority. Mobile remains passive until its dedicated handoff.
    load('script[data-nfa-unread-service]', 'js/core/unread-service.js?v=3', 'nfaUnreadService');

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
        const text = stripHtml(html);
        const max = typeof n === 'number' && n > 0 ? n : 60;
        return text.length > max ? text.substring(0, max) + '…' : text;
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
    window.stripHtml = stripHtml;
    window.snippet = snippet;
    window.getSnippet = getSnippet;
    window.escapeJs = escapeJs;
})();