/**
 * NILTASK Activity & Notifications UI — v207
 * Version 1: Task-Card Timeline
 *
 * Additive presentation layer:
 * - Does not replace feed fetching, realtime, push, sound or navigation logic.
 * - Styles/decorates existing web Activity Feed and Notifications.
 * - All timestamps remain sourced from existing IST-aware renderers.
 */

window.NILTASK_ACTIVITY_UI_VERSION = 'v207';

const NFA207 = {
    observer: null,
    panelObserver: null,
    originalOpen: null,
    originalLoad: null,
    decorateTimer: null
};

function nfa207InstallStyles() {
    if (document.getElementById('niltask-activity-v207-styles')) return;

    const style = document.createElement('style');
    style.id = 'niltask-activity-v207-styles';
    style.textContent = `
        :root {
            --nfa207-radius: 18px;
            --nfa207-shadow:
                0 2px 5px rgba(15,23,42,.04),
                0 10px 26px rgba(15,23,42,.07);
        }

        /* WEB PANEL */
        #activityFeedPanel.nfa207-panel {
            background: var(--bg-body, #f6f7fb) !important;
        }

        #activityFeedPanel.nfa207-panel > :first-child {
            min-height: 62px !important;
            padding: 12px 14px !important;
            background: var(--bg-body, #fff) !important;
            border-bottom: 1px solid var(--border-color, #e5e7eb) !important;
            position: sticky;
            top: 0;
            z-index: 30;
        }

        #activityFeedPanel .nfa207-heading {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }

        #activityFeedPanel .nfa207-heading-icon {
            width: 40px;
            height: 40px;
            flex: 0 0 auto;
            display: grid;
            place-items: center;
            border-radius: 13px;
            color: #fff;
            background: linear-gradient(135deg, var(--accent, #6366f1), #8b5cf6);
            box-shadow: 0 8px 18px rgba(99,102,241,.22);
        }

        #activityFeedPanel .nfa207-heading-copy {
            min-width: 0;
        }

        #activityFeedPanel .nfa207-heading-title {
            display: block;
            color: var(--text-primary, #111827);
            font-size: 15px;
            line-height: 1.2;
            font-weight: 900;
        }

        #activityFeedPanel .nfa207-heading-subtitle {
            display: block;
            margin-top: 3px;
            color: var(--text-secondary, #64748b);
            font-size: 9px;
            font-weight: 700;
        }

        #activityFeedPanel .nfa207-version {
            display: inline-flex;
            margin-left: 5px;
            padding: 3px 6px;
            border-radius: 999px;
            color: var(--accent, #6366f1);
            background: color-mix(in srgb, var(--accent, #6366f1) 10%, transparent);
            font-size: 8px;
            font-weight: 950;
            vertical-align: middle;
        }

        #activityFeedList.nfa207-list {
            padding: 13px !important;
            background: var(--bg-sidebar, #f8fafc) !important;
            scroll-behavior: smooth;
        }

        /* Compact labelled dropdowns, whatever the existing renderer calls them */
        #activityFeedPanel select,
        #activityFeedPanel .af-select {
            min-width: 0 !important;
            height: 39px !important;
            box-sizing: border-box !important;
            border: 1px solid var(--border-color, #cbd5e1) !important;
            border-radius: 11px !important;
            padding: 0 27px 0 9px !important;
            color: var(--text-primary, #111827) !important;
            background-color: var(--bg-body, #fff) !important;
            font-size: 10px !important;
            font-weight: 800 !important;
        }

        #activityFeedPanel .nfa207-filter-panel {
            position: sticky;
            top: 62px;
            z-index: 20;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px !important;
            margin: -1px -1px 12px !important;
            padding: 10px !important;
            border: 1px solid var(--border-color, #e1e6ef);
            border-radius: 14px;
            background: var(--bg-body, #fff);
            box-shadow: 0 5px 16px rgba(15,23,42,.05);
        }

        /* Date separators */
        #activityFeedPanel .nfa207-day {
            display: flex !important;
            align-items: center;
            gap: 9px;
            margin: 13px 0 10px !important;
            color: var(--text-secondary, #64748b) !important;
            background: transparent !important;
            border: 0 !important;
            box-shadow: none !important;
            font-size: 9px !important;
            font-weight: 950 !important;
            text-transform: uppercase;
            letter-spacing: .08em;
        }

        #activityFeedPanel .nfa207-day::before,
        #activityFeedPanel .nfa207-day::after {
            content: "";
            height: 1px;
            flex: 1;
            background: var(--border-color, #dbe2ea);
        }

        /* Activity cards */
        #activityFeedPanel .nfa207-card {
            position: relative !important;
            min-height: 82px;
            margin: 0 0 14px !important;
            padding: 13px 38px 13px 61px !important;
            border: 1px solid var(--border-color, #e1e6ef) !important;
            border-left-width: 5px !important;
            border-radius: var(--nfa207-radius) !important;
            color: var(--text-primary, #111827) !important;
            background: var(--bg-body, #fff) !important;
            box-shadow: var(--nfa207-shadow) !important;
            overflow: hidden;
        }

        #activityFeedPanel .nfa207-card.nfa207-unread,
        #activityFeedPanel [id^="feed-notif-"].nfa207-unread {
            background:
                linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--accent, #6366f1) 7%, var(--bg-body, #fff)),
                    var(--bg-body, #fff) 58%
                ) !important;
        }

        #activityFeedPanel .nfa207-avatar {
            position: absolute;
            top: 14px;
            left: 13px;
            width: 36px;
            height: 36px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            color: #fff;
            background: #6366f1;
            font-size: 13px;
            font-weight: 950;
            box-shadow: 0 5px 12px rgba(15,23,42,.13);
        }

        #activityFeedPanel .nfa207-card button:not(.nfa207-clear),
        #activityFeedPanel .nfa207-action {
            min-height: 34px !important;
            margin-top: 9px !important;
            padding: 7px 11px !important;
            border-radius: 10px !important;
            font-size: 9px !important;
            font-weight: 900 !important;
        }

        #activityFeedPanel .nfa207-clear {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 28px;
            height: 28px;
            display: grid;
            place-items: center;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 50% !important;
            color: var(--text-secondary, #64748b) !important;
            background: color-mix(in srgb, var(--text-secondary, #64748b) 10%, transparent) !important;
            cursor: pointer;
        }

        /* Compact notification rows */
        #activityFeedPanel [id^="feed-notif-"].nfa207-notice,
        .nfa207-notice {
            position: relative !important;
            display: flex !important;
            gap: 11px !important;
            margin: 0 0 9px !important;
            padding: 12px !important;
            border: 1px solid var(--border-color, #e1e6ef) !important;
            border-radius: 15px !important;
            background: var(--bg-body, #fff) !important;
            box-shadow: 0 3px 12px rgba(15,23,42,.05);
        }

        #activityFeedPanel [id^="feed-notif-"].nfa207-notice > div:first-child {
            width: 38px !important;
            height: 38px !important;
            border-radius: 13px !important;
        }

        /* Generic web notification containers used in older/newer shells */
        #notificationPanel .notification-item,
        #notificationsPanel .notification-item,
        #alertsPanel .notification-item,
        .notification-list .notification-item {
            margin: 0 0 9px !important;
            padding: 12px !important;
            border: 1px solid var(--border-color, #e1e6ef) !important;
            border-radius: 15px !important;
            background: var(--bg-body, #fff) !important;
            box-shadow: 0 3px 12px rgba(15,23,42,.05);
        }

        /* MOBILE — Version 1 task-card language */
        .mScr-inner.af-mode,
        .mScr-inner.nf-mode {
            background: var(--bg-body, #f6f7fb);
        }

        .mScr-inner.af-mode .m-hdr,
        .mScr-inner.nf-mode .m-hdr {
            min-height: 58px;
            padding-left: 14px;
            padding-right: 14px;
            background: var(--bg-body, #fff);
            border-bottom: 1px solid var(--border, #e5e7eb);
        }

        .mScr-inner.af-mode .m-htitle,
        .mScr-inner.nf-mode .m-htitle {
            font-size: 17px;
            font-weight: 950;
        }

        .mScr-inner.af-mode .m-htitle::after,
        .mScr-inner.nf-mode .m-htitle::after {
            content: "v207";
            display: inline-flex;
            margin-left: 7px;
            padding: 3px 6px;
            border-radius: 999px;
            color: var(--accent, #6366f1);
            background: color-mix(in srgb, var(--accent, #6366f1) 10%, transparent);
            font-size: 8px;
            font-weight: 950;
            vertical-align: middle;
        }

        .mScr-inner.af-mode .af-filters,
        .mScr-inner.nf-mode .af-filters {
            position: sticky;
            top: 58px;
            z-index: 18;
            display: grid;
            grid-template-columns: repeat(3, minmax(0,1fr));
            gap: 7px;
            margin: 9px 10px 3px;
            padding: 9px;
            overflow: visible;
            border: 1px solid var(--border, #dbe2ea);
            border-radius: 15px;
            background: var(--bg-body, #fff);
            box-shadow: 0 4px 14px rgba(15,23,42,.06);
        }

        .mScr-inner.af-mode .af-select,
        .mScr-inner.nf-mode .af-select {
            width: 100%;
            min-width: 0;
            height: 38px;
            box-sizing: border-box;
            padding: 0 22px 0 7px;
            border: 1px solid var(--border, #cbd5e1);
            border-radius: 10px;
            color: var(--text, #111827);
            background: var(--surface, #f8fafc);
            font-size: 9.5px;
            font-weight: 850;
            text-overflow: ellipsis;
        }

        .mScr-inner.af-mode .af-feed,
        .mScr-inner.nf-mode .af-feed {
            padding: 13px 11px 96px;
            gap: 0;
            background: var(--bg-body, #f6f7fb);
        }

        .mScr-inner.af-mode .af-div {
            margin: 12px 0 9px;
        }

        .mScr-inner.af-mode .af-div span,
        .mScr-inner.nf-mode .af-div span {
            color: var(--text-secondary, #64748b);
            background: transparent;
            padding: 0;
            font-size: 9px;
            font-weight: 950;
            text-transform: uppercase;
            letter-spacing: .08em;
        }

        .mScr-inner.af-mode .af-card {
            min-height: 86px;
            margin-bottom: 16px;
            padding: 13px 38px 13px 60px;
            border: 1px solid var(--border, #e1e6ef);
            border-left-width: 5px;
            border-radius: 18px;
            background: var(--bg-body, #fff);
            box-shadow: var(--nfa207-shadow);
        }

        .mScr-inner.af-mode .af-card::after {
            content: attr(data-v207-icon);
            position: absolute;
            top: 14px;
            left: 13px;
            width: 35px;
            height: 35px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            color: #fff;
            background: #6366f1;
            font-size: 15px;
            font-weight: 950;
            box-shadow: 0 5px 12px rgba(15,23,42,.13);
        }

        .mScr-inner.af-mode .af-title {
            padding-right: 3px;
            font-size: 13px;
            line-height: 1.45;
            font-weight: 850;
        }

        .mScr-inner.af-mode .af-meta {
            margin-top: 6px;
            font-size: 9.5px;
            line-height: 1.5;
        }

        .mScr-inner.af-mode .af-btn {
            min-height: 35px;
            padding: 7px 11px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: 900;
        }

        .mScr-inner.nf-mode .nf-row {
            margin: 0 0 9px;
            padding: 12px;
            border: 1px solid var(--border, #e1e6ef);
            border-radius: 15px;
            background: var(--bg-body, #fff);
            box-shadow: 0 3px 12px rgba(15,23,42,.05);
        }

        .mScr-inner.nf-mode .nf-row.unread {
            border-left: 5px solid var(--accent, #6366f1);
            background:
                linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--accent, #6366f1) 8%, var(--bg-body, #fff)),
                    var(--bg-body, #fff) 60%
                );
        }

        .mScr-inner.nf-mode .nf-ic {
            width: 40px;
            height: 40px;
            border-radius: 13px;
        }

        .mScr-inner.nf-mode .nf-title {
            font-size: 12px;
            line-height: 1.45;
            font-weight: 850;
        }

        .mScr-inner.nf-mode .nf-time {
            margin-top: 5px;
            font-size: 9px;
        }

        html[data-theme="dark"] #activityFeedPanel.nfa207-panel,
        html[data-theme="dark"] #activityFeedList.nfa207-list,
        html[data-theme="dark"] .mScr-inner.af-mode,
        html[data-theme="dark"] .mScr-inner.nf-mode,
        html[data-theme="dark"] .mScr-inner.af-mode .af-feed,
        html[data-theme="dark"] .mScr-inner.nf-mode .af-feed {
            background: #090a0d !important;
        }

        html[data-theme="dark"] #activityFeedPanel .nfa207-card,
        html[data-theme="dark"] #activityFeedPanel .nfa207-notice,
        html[data-theme="dark"] .mScr-inner.af-mode .af-card,
        html[data-theme="dark"] .mScr-inner.nf-mode .nf-row {
            background: #15161b !important;
            border-color: #292b33 !important;
            box-shadow: none !important;
        }

        @media (max-width: 380px) {
            .mScr-inner.af-mode .af-filters,
            .mScr-inner.nf-mode .af-filters {
                margin-left: 7px;
                margin-right: 7px;
                padding: 7px;
                gap: 5px;
            }

            .mScr-inner.af-mode .af-select,
            .mScr-inner.nf-mode .af-select {
                font-size: 8.5px;
                padding-left: 5px;
            }
        }
    `;
    document.head.appendChild(style);
}

function nfa207CategoryFromText(text) {
    const value = String(text || '').toLowerCase();
    if (value.includes('task') || value.includes('submit') || value.includes('extension')) {
        return { icon: '✓', colour: '#7e22ce' };
    }
    if (value.includes('remind')) return { icon: '🔔', colour: '#ea580c' };
    if (value.includes('message') || value.includes('chat') || value.includes('reply')) {
        return { icon: '💬', colour: '#2563eb' };
    }
    if (value.includes('complete') || value.includes('success')) {
        return { icon: '✓', colour: '#16a34a' };
    }
    return { icon: '⚡', colour: '#6366f1' };
}

function nfa207DecorateWebPanel() {
    const panel = document.getElementById('activityFeedPanel');
    if (!panel) return;

    panel.classList.add('nfa207-panel');

    const header = panel.firstElementChild;
    if (header && !header.dataset.nfa207Header) {
        header.dataset.nfa207Header = '1';

        const titleCandidate = header.querySelector('span');
        if (titleCandidate) {
            titleCandidate.classList.add('nfa207-heading');
            titleCandidate.innerHTML = `
                <span class="nfa207-heading-icon">
                    <i class="fa-solid fa-bolt"></i>
                </span>
                <span class="nfa207-heading-copy">
                    <span class="nfa207-heading-title">
                        Activity Feed <span class="nfa207-version">v207</span>
                    </span>
                    <span class="nfa207-heading-subtitle">
                        Organisation activity · India Standard Time
                    </span>
                </span>
            `;
        }
    }

    const list = document.getElementById('activityFeedList');
    if (!list) return;
    list.classList.add('nfa207-list');

    // Recognise an existing filter row without changing its handlers.
    [...list.children].forEach(child => {
        if (child.querySelectorAll?.('select').length >= 2) {
            child.classList.add('nfa207-filter-panel');
        }
    });

    [...list.children].forEach(child => {
        if (!(child instanceof HTMLElement)) return;

        if (child.id?.startsWith('feed-notif-')) {
            child.classList.add('nfa207-notice');
            if (
                child.style.background.includes('rgba') ||
                child.querySelector('[style*="width:6px"]')
            ) {
                child.classList.add('nfa207-unread');
            }
            return;
        }

        const text = child.textContent?.trim() || '';
        const hasAction = Boolean(child.querySelector('button'));
        const looksLikeDay =
            !hasAction &&
            child.children.length <= 2 &&
            /^(today|yesterday|\d{1,2}\s+\w+|\w+\s+\d{1,2})/i.test(text);

        if (looksLikeDay) {
            child.classList.add('nfa207-day');
            return;
        }

        const looksLikeCard =
            hasAction ||
            child.style.borderLeft ||
            child.querySelector('span[style*="border-radius"]');

        if (!looksLikeCard) return;

        child.classList.add('nfa207-card');

        if (
            child.style.background.includes('F8FBFF') ||
            child.querySelector('[style*="width:7px"]')
        ) {
            child.classList.add('nfa207-unread');
        }

        if (!child.querySelector('.nfa207-avatar')) {
            const category = nfa207CategoryFromText(text);
            const avatar = document.createElement('span');
            avatar.className = 'nfa207-avatar';
            avatar.textContent = category.icon;
            avatar.style.background = category.colour;
            child.prepend(avatar);
        }

        child.querySelectorAll('button').forEach(button => {
            if (
                button.title === 'Clear' ||
                button.textContent.trim() === '✕' ||
                button.querySelector('.fa-xmark')
            ) {
                button.classList.add('nfa207-clear');
            } else {
                button.classList.add('nfa207-action');
            }
        });
    });
}

function nfa207DecorateMobile() {
    document.querySelectorAll('.mScr-inner.af-mode .af-card').forEach(card => {
        if (card.dataset.nfa207Icon) return;
        const cat = nfa207CategoryFromText(card.textContent);
        card.dataset.v207Icon = cat.icon;
    });
}

function nfa207DecorateAll() {
    nfa207DecorateWebPanel();
    nfa207DecorateMobile();
}

function nfa207ScheduleDecorate() {
    clearTimeout(NFA207.decorateTimer);
    NFA207.decorateTimer = setTimeout(nfa207DecorateAll, 10);
}

function nfa207WrapFeedFunctions() {
    if (
        typeof window.openActivityFeed === 'function' &&
        !window.openActivityFeed.__nfa207
    ) {
        NFA207.originalOpen = window.openActivityFeed;

        const wrappedOpen = async function(...args) {
            const result = await NFA207.originalOpen.apply(this, args);
            nfa207ScheduleDecorate();
            setTimeout(nfa207DecorateAll, 80);
            return result;
        };

        wrappedOpen.__nfa207 = true;
        window.openActivityFeed = wrappedOpen;
    }

    if (
        typeof window._loadActivityFeed === 'function' &&
        !window._loadActivityFeed.__nfa207
    ) {
        NFA207.originalLoad = window._loadActivityFeed;

        const wrappedLoad = async function(...args) {
            const result = await NFA207.originalLoad.apply(this, args);
            nfa207ScheduleDecorate();
            return result;
        };

        wrappedLoad.__nfa207 = true;
        window._loadActivityFeed = wrappedLoad;
    }
}

function nfa207Init() {
    nfa207InstallStyles();
    nfa207WrapFeedFunctions();

    if (!NFA207.observer) {
        NFA207.observer = new MutationObserver(nfa207ScheduleDecorate);
        NFA207.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    const retry = setInterval(() => {
        nfa207WrapFeedFunctions();
        nfa207DecorateAll();

        if (
            window.openActivityFeed?.__nfa207 &&
            window._loadActivityFeed?.__nfa207
        ) {
            clearInterval(retry);
        }
    }, 300);

    setTimeout(() => clearInterval(retry), 15000);
    nfa207DecorateAll();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', nfa207Init, { once: true });
} else {
    nfa207Init();
}
