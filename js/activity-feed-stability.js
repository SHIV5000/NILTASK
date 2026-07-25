(function () {
    'use strict';

    const STATE = {
        installed: false,
        originalLoad: null,
        originalRefresh: null,
        originalPrepend: null,
        inFlight: false,
        pending: false,
        debounceTimer: null,
        installTimer: null,
        observedPanel: null,
        pollObserver: null
    };

    const FALLBACK_POLL_MS = 60000;

    function installStyles() {
        if (document.getElementById('nfa-activity-stability-styles')) return;
        const style = document.createElement('style');
        style.id = 'nfa-activity-stability-styles';
        style.textContent = `
            #activityFeedPanel { position: relative; }
            .nfa-af-snapshot {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 60;
                overflow-y: hidden !important;
                pointer-events: none;
                background: var(--bg-sidebar, #f8fafc);
                contain: strict;
            }
            #activityFeedPanel.nfa-af-refreshing #activityFeedList {
                contain: layout paint;
            }
        `;
        document.head.appendChild(style);
    }

    function makeSnapshot(list) {
        if (!list || !list.children.length) return null;
        const panel = document.getElementById('activityFeedPanel');
        if (!panel) return null;

        const snapshot = list.cloneNode(true);
        snapshot.removeAttribute('id');
        snapshot.classList.add('nfa-af-snapshot');
        snapshot.setAttribute('aria-hidden', 'true');
        snapshot.style.top = `${list.offsetTop}px`;
        snapshot.style.height = `${list.clientHeight}px`;
        snapshot.style.maxHeight = 'none';
        snapshot.style.width = `${list.clientWidth}px`;
        snapshot.scrollTop = list.scrollTop;
        panel.appendChild(snapshot);
        requestAnimationFrame(() => { snapshot.scrollTop = list.scrollTop; });
        return snapshot;
    }

    async function stableLoad(...args) {
        const list = document.getElementById('activityFeedList');
        if (!list || !STATE.originalLoad) {
            return STATE.originalLoad?.apply(this, args);
        }

        const isInitialLoad = Boolean(list.querySelector('.fa-spinner'));
        if (isInitialLoad) {
            return STATE.originalLoad.apply(this, args);
        }

        if (STATE.inFlight) {
            STATE.pending = true;
            return;
        }

        STATE.inFlight = true;
        const panel = document.getElementById('activityFeedPanel');
        const oldScrollTop = list.scrollTop;
        const snapshot = makeSnapshot(list);

        panel?.classList.add('nfa-af-refreshing');
        list.setAttribute('aria-busy', 'true');

        try {
            const result = await STATE.originalLoad.apply(this, args);
            const refreshedList = document.getElementById('activityFeedList');
            if (refreshedList) {
                refreshedList.scrollTop = Math.min(
                    oldScrollTop,
                    Math.max(0, refreshedList.scrollHeight - refreshedList.clientHeight)
                );
            }
            return result;
        } finally {
            const refreshedList = document.getElementById('activityFeedList');
            refreshedList?.removeAttribute('aria-busy');
            panel?.classList.remove('nfa-af-refreshing');
            requestAnimationFrame(() => requestAnimationFrame(() => snapshot?.remove()));
            STATE.inFlight = false;

            if (STATE.pending) {
                STATE.pending = false;
                scheduleRefresh(120);
            }
        }
    }

    function scheduleRefresh(delay = 350) {
        clearTimeout(STATE.debounceTimer);
        STATE.debounceTimer = setTimeout(() => {
            if (
                window._activityFeedOpen &&
                document.getElementById('activityFeedList') &&
                typeof window._loadActivityFeed === 'function'
            ) {
                window._loadActivityFeed();
            }
        }, delay);
    }

    function resetFallbackPoll() {
        try { clearInterval(window._afPollTimer); } catch (e) {}
        if (!window._activityFeedOpen || !document.getElementById('activityFeedList')) return;
        window._afPollTimer = setInterval(() => {
            if (
                window._activityFeedOpen &&
                document.getElementById('activityFeedList') &&
                typeof window._loadActivityFeed === 'function'
            ) {
                window._loadActivityFeed();
            } else {
                try { clearInterval(window._afPollTimer); } catch (e) {}
            }
        }, FALLBACK_POLL_MS);
    }

    function observePanelOpen() {
        if (STATE.pollObserver) return;
        STATE.pollObserver = new MutationObserver(() => {
            const panel = document.getElementById('activityFeedPanel');
            if (panel && panel !== STATE.observedPanel) {
                STATE.observedPanel = panel;
                // Let the original open function finish creating its 12-second timer,
                // then replace that timer without wrapping openActivityFeed().
                setTimeout(resetFallbackPoll, 0);
            } else if (!panel) {
                STATE.observedPanel = null;
            }
        });
        STATE.pollObserver.observe(document.body, { childList: true, subtree: true });
    }

    function install() {
        if (STATE.installed) return true;
        if (typeof window._loadActivityFeed !== 'function') return false;
        if (window._loadActivityFeed.__nfa207 !== true) return false;

        installStyles();
        STATE.originalLoad = window._loadActivityFeed;

        const wrappedLoad = function (...args) {
            return stableLoad.apply(this, args);
        };
        wrappedLoad.__nfaStable = true;
        wrappedLoad.__nfaOriginal = STATE.originalLoad;
        wrappedLoad.__nfa207 = true;
        window._loadActivityFeed = wrappedLoad;

        if (typeof window.refreshActivityFeed === 'function') {
            STATE.originalRefresh = window.refreshActivityFeed;
            window.refreshActivityFeed = function () {
                scheduleRefresh(350);
            };
        }

        if (typeof window.prependFeedItem === 'function') {
            STATE.originalPrepend = window.prependFeedItem;
            window.prependFeedItem = function (notif) {
                if (!notif) return;
                scheduleRefresh(220);
            };
        }

        observePanelOpen();

        STATE.installed = true;
        window.NILTASK_ACTIVITY_STABILITY_VERSION = 'v4';
        return true;
    }

    function boot() {
        if (install()) return;
        let attempts = 0;
        STATE.installTimer = setInterval(() => {
            attempts += 1;
            if (install() || attempts >= 160) clearInterval(STATE.installTimer);
        }, 150);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();