/**
 * CANONICAL early runtime bootstrap and text helpers.
 */
(function () {
    'use strict';

    // Mobile lifecycle tracking must be installed synchronously here because this
    // classic script executes before mobile.js/mobile-tasks.js module evaluation.
    // The native browser APIs remain authoritative during normal operation; these
    // wrappers only record resources whose immediate callsite is a mobile module,
    // and suppress new mobile work after an explicit lifecycle stop begins.
    (function installMobileRuntimeLifecycle() {
        if (window.NILTASK_MobileRuntime) return;

        const VERSION = 'v1';
        const Native = {
            setTimeout: window.setTimeout.bind(window),
            clearTimeout: window.clearTimeout.bind(window),
            setInterval: window.setInterval.bind(window),
            clearInterval: window.clearInterval.bind(window),
            requestAnimationFrame: window.requestAnimationFrame?.bind(window) || null,
            cancelAnimationFrame: window.cancelAnimationFrame?.bind(window) || null,
            addEventListener: window.EventTarget?.prototype?.addEventListener || null,
            removeEventListener: window.EventTarget?.prototype?.removeEventListener || null,
            MutationObserver: window.MutationObserver || null
        };
        const STATE = {
            stopped: false,
            stopReason: null,
            stopPromise: null,
            timeouts: new Set(),
            intervals: new Set(),
            animationFrames: new Set(),
            listeners: new Set(),
            observers: new Set(),
            channelsRemoved: 0,
            lastStop: null
        };

        function mobileCallsite() {
            try {
                const lines = String(new Error().stack || '').split('\n').slice(1);
                for (const line of lines) {
                    if (/\/js\/utils\/text\.js(?:[?:]|$)/.test(line)) continue;
                    return /\/js\/mobile(?:-tasks)?\.js(?:[?:]|$)/.test(line);
                }
            } catch (e) {}
            return false;
        }

        function topicOf(channel) {
            const raw = String(channel?.topic || channel?.subTopic || '');
            return raw.startsWith('realtime:') ? raw.slice('realtime:'.length) : raw;
        }

        function mobileChannel(channel) {
            const topic = topicOf(channel);
            return topic.startsWith('mobile-rt-') || topic.startsWith('presence-');
        }

        function persistentTarget(target) {
            if (!target) return false;
            if (target === window || target === document || target === window.visualViewport) return true;
            try { if (target === navigator.serviceWorker) return true; } catch (e) {}
            return ['mobileApp', 'mStage', 'mSheet', 'mFileInput'].includes(target.id || '');
        }

        function captureOf(options) {
            return typeof options === 'boolean' ? options : Boolean(options?.capture);
        }

        function removeListenerRecord(target, type, listener, options) {
            const capture = captureOf(options);
            for (const record of Array.from(STATE.listeners)) {
                if (
                    record.target === target && record.type === type &&
                    record.listener === listener && record.capture === capture
                ) STATE.listeners.delete(record);
            }
        }

        window.setTimeout = function (handler, delay, ...args) {
            const tracked = mobileCallsite();
            if (tracked && STATE.stopped) return 0;
            let handle;
            const callback = tracked && typeof handler === 'function'
                ? function (...callbackArgs) {
                    STATE.timeouts.delete(handle);
                    return handler.apply(this, callbackArgs);
                }
                : handler;
            handle = Native.setTimeout(callback, delay, ...args);
            if (tracked) STATE.timeouts.add(handle);
            return handle;
        };

        window.clearTimeout = function (handle) {
            STATE.timeouts.delete(handle);
            STATE.intervals.delete(handle);
            return Native.clearTimeout(handle);
        };

        window.setInterval = function (handler, delay, ...args) {
            const tracked = mobileCallsite();
            if (tracked && STATE.stopped) return 0;
            const handle = Native.setInterval(handler, delay, ...args);
            if (tracked) STATE.intervals.add(handle);
            return handle;
        };

        window.clearInterval = function (handle) {
            STATE.intervals.delete(handle);
            STATE.timeouts.delete(handle);
            return Native.clearInterval(handle);
        };

        if (Native.requestAnimationFrame && Native.cancelAnimationFrame) {
            window.requestAnimationFrame = function (callback) {
                const tracked = mobileCallsite();
                if (tracked && STATE.stopped) return 0;
                let handle;
                const wrapped = tracked
                    ? function (time) {
                        STATE.animationFrames.delete(handle);
                        return callback(time);
                    }
                    : callback;
                handle = Native.requestAnimationFrame(wrapped);
                if (tracked) STATE.animationFrames.add(handle);
                return handle;
            };
            window.cancelAnimationFrame = function (handle) {
                STATE.animationFrames.delete(handle);
                return Native.cancelAnimationFrame(handle);
            };
        }

        if (Native.addEventListener && Native.removeEventListener && window.EventTarget?.prototype) {
            window.EventTarget.prototype.addEventListener = function (type, listener, options) {
                const tracked = mobileCallsite() && persistentTarget(this);
                if (tracked && STATE.stopped) return;
                const result = Native.addEventListener.call(this, type, listener, options);
                if (tracked && listener) {
                    const capture = captureOf(options);
                    const exists = Array.from(STATE.listeners).some(record =>
                        record.target === this && record.type === type &&
                        record.listener === listener && record.capture === capture
                    );
                    if (!exists) STATE.listeners.add({ target:this, type, listener, capture });
                }
                return result;
            };
            window.EventTarget.prototype.removeEventListener = function (type, listener, options) {
                removeListenerRecord(this, type, listener, options);
                return Native.removeEventListener.call(this, type, listener, options);
            };
        }

        if (Native.MutationObserver) {
            function TrackedMutationObserver(callback) {
                const tracked = mobileCallsite();
                const observer = new Native.MutationObserver(callback);
                if (!tracked) return observer;

                const observe = observer.observe.bind(observer);
                const disconnect = observer.disconnect.bind(observer);
                observer.observe = function (...args) {
                    if (STATE.stopped) return;
                    STATE.observers.add(observer);
                    return observe(...args);
                };
                observer.disconnect = function () {
                    STATE.observers.delete(observer);
                    return disconnect();
                };
                STATE.observers.add(observer);
                return observer;
            }
            TrackedMutationObserver.prototype = Native.MutationObserver.prototype;
            try { Object.setPrototypeOf(TrackedMutationObserver, Native.MutationObserver); } catch (e) {}
            window.MutationObserver = TrackedMutationObserver;
        }

        function clearTrackedResources() {
            const cleared = {
                timeouts: STATE.timeouts.size,
                intervals: STATE.intervals.size,
                animationFrames: STATE.animationFrames.size,
                listeners: STATE.listeners.size,
                observers: STATE.observers.size
            };

            for (const handle of Array.from(STATE.timeouts)) Native.clearTimeout(handle);
            for (const handle of Array.from(STATE.intervals)) Native.clearInterval(handle);
            if (Native.cancelAnimationFrame) {
                for (const handle of Array.from(STATE.animationFrames)) Native.cancelAnimationFrame(handle);
            }
            for (const record of Array.from(STATE.listeners)) {
                try {
                    Native.removeEventListener.call(
                        record.target, record.type, record.listener, record.capture
                    );
                } catch (e) {}
            }
            for (const observer of Array.from(STATE.observers)) {
                try { observer.disconnect(); } catch (e) {}
            }

            STATE.timeouts.clear();
            STATE.intervals.clear();
            STATE.animationFrames.clear();
            STATE.listeners.clear();
            STATE.observers.clear();
            return cleared;
        }

        async function removeMobileChannels() {
            const sb = window.sb;
            if (!sb || typeof sb.getChannels !== 'function') return 0;
            const channels = Array.from(sb.getChannels() || []).filter(mobileChannel);
            let removed = 0;
            for (const channel of channels) {
                try {
                    if (typeof sb.removeChannel === 'function') await sb.removeChannel(channel);
                    else await channel.unsubscribe?.();
                    removed += 1;
                } catch (e) {
                    try { await channel.unsubscribe?.(); removed += 1; } catch (e2) {}
                }
            }
            STATE.channelsRemoved += removed;
            return removed;
        }

        function snapshot() {
            let channels = [];
            try {
                channels = Array.from(window.sb?.getChannels?.() || [])
                    .map(channel => ({ topic:topicOf(channel), state:channel?.state || null }))
                    .filter(item => item.topic.startsWith('mobile-rt-') || item.topic.startsWith('presence-'));
            } catch (e) {}
            return {
                version: VERSION,
                stopped: STATE.stopped,
                stopReason: STATE.stopReason,
                cleanupInFlight: Boolean(STATE.stopPromise),
                tracked: {
                    timeouts: STATE.timeouts.size,
                    intervals: STATE.intervals.size,
                    animationFrames: STATE.animationFrames.size,
                    listeners: STATE.listeners.size,
                    observers: STATE.observers.size
                },
                channels,
                channelsRemoved: STATE.channelsRemoved,
                lastStop: STATE.lastStop ? { ...STATE.lastStop } : null,
                restartMode: 'page-reload'
            };
        }

        async function stop(reason = 'manual') {
            if (STATE.stopPromise) return STATE.stopPromise;
            STATE.stopped = true;
            STATE.stopReason = reason;
            STATE.stopPromise = (async () => {
                const clearedBeforeChannels = clearTrackedResources();
                const channelsRemoved = await removeMobileChannels();
                // Channel CLOSED callbacks may synchronously attempt a reconnect. The
                // stopped gate rejects new mobile timers; this second pass clears any
                // resource that was already queued while channel removal completed.
                const clearedAfterChannels = clearTrackedResources();
                STATE.lastStop = {
                    reason,
                    at: new Date().toISOString(),
                    channelsRemoved,
                    clearedBeforeChannels,
                    clearedAfterChannels
                };
                try {
                    window.dispatchEvent(new CustomEvent('niltask:mobile-runtime-stopped', {
                        detail: { reason, channelsRemoved }
                    }));
                } catch (e) {}
                return true;
            })().finally(() => { STATE.stopPromise = null; });
            return STATE.stopPromise;
        }

        function start(reason = 'manual-restart') {
            if (!STATE.stopped) return true;
            try { sessionStorage.setItem('niltask_mobile_restart_reason', reason); } catch (e) {}
            window.location.reload();
            return true;
        }

        function printSnapshot() {
            const data = snapshot();
            try { console.table(data.channels); } catch (e) {}
            try { console.log('[NILTASK MobileRuntime]', data); } catch (e) {}
            return data;
        }

        window.NILTASK_MobileRuntime = Object.freeze({
            version: VERSION,
            stop,
            start,
            restart: start,
            snapshot,
            printSnapshot
        });
        window.NILTASK_MOBILE_RUNTIME_VERSION = VERSION;
    })();

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
    load('script[data-nfa-session-lifecycle]', 'js/core/session-lifecycle.js?v=4', 'nfaSessionLifecycle');
    load('script[data-nfa-runtime-diagnostics]', 'js/core/runtime-diagnostics.js?v=7', 'nfaRuntimeDiagnostics');
    load('script[data-nfa-mobile-runtime-diagnostics]', 'js/core/mobile-runtime-diagnostics.js?v=3', 'nfaMobileRuntimeDiagnostics');
    load('script[data-nfa-subscription-guard]', 'js/runtime-subscription-guard.js?v=7', 'nfaSubscriptionGuard');
    load('script[data-nfa-notification-presentation]', 'js/notification-presentation-service.js?v=3', 'nfaNotificationPresentation');

    // Desktop owns queries/rendering; mobile observes its existing query calls without adding a poll.
    load('script[data-nfa-unread-service]', 'js/core/unread-service.js?v=4', 'nfaUnreadService');

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
