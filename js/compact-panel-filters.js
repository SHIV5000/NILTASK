(function () {
    'use strict';

    const INDIGO = '#4f46e5';
    const INDIGO_SOFT = '#e0e7ff';

    function installStyles() {
        if (document.getElementById('nfa-compact-panel-filters-style')) return;
        const style = document.createElement('style');
        style.id = 'nfa-compact-panel-filters-style';
        style.textContent = `
            /* Hide the freshly-rendered Activity filter row until it is moved into
               the fixed header. This prevents a one-frame duplicate during reload. */
            #activityFeedList > div:has(> select:nth-of-type(2)) {
                visibility: hidden !important;
                height: 0 !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
            }

            #activityFeedPanel > .nfa-af-header {
                display: grid !important;
                grid-template-columns: minmax(0,1fr) auto !important;
                grid-template-areas: "title actions" "filters filters" !important;
                gap: 5px 8px !important;
                padding: 8px 10px 7px !important;
                flex-shrink: 0 !important;
                background: var(--bg-sidebar,#fff) !important;
                border-bottom: 1px solid var(--border-color,#e5e7eb) !important;
                z-index: 70 !important;
            }
            #activityFeedPanel .nfa-af-header-title { grid-area: title !important; min-width: 0 !important; }
            #activityFeedPanel .nfa-af-header-actions { grid-area: actions !important; }
            #activityFeedPanel .nfa-af-header-filters {
                grid-area: filters !important;
                display: grid !important;
                grid-template-columns: minmax(0,1fr) minmax(0,1fr) !important;
                gap: 6px !important;
                visibility: visible !important;
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
                background: transparent !important;
                border: 0 !important;
                border-radius: 0 !important;
                box-shadow: none !important;
            }
            #activityFeedPanel .nfa-af-header-filters select {
                display: block !important;
                width: 100% !important;
                min-width: 0 !important;
                height: 29px !important;
                margin: 0 !important;
                padding: 0 23px 0 8px !important;
                border: 1px solid var(--border-color,#d9dee8) !important;
                border-radius: 7px !important;
                background: var(--bg-body,#f8fafc) !important;
                color: var(--text-primary,#111827) !important;
                font-size: 10px !important;
                line-height: 29px !important;
                font-weight: 700 !important;
                box-shadow: none !important;
            }
            #activityFeedList {
                padding: 8px 10px 10px !important;
                background: var(--bg-body,#f8fafc) !important;
            }
            #activityFeedList > .nfa-af-card {
                padding: 9px 10px 9px 11px !important;
                margin-bottom: 7px !important;
                border-radius: 11px !important;
                box-shadow: 0 1px 2px rgba(15,23,42,.05) !important;
            }
            #activityFeedList > .nfa-af-card .nfa-af-card-badge {
                margin-bottom: 4px !important;
                padding: 2px 8px !important;
                font-size: 9px !important;
            }
            #activityFeedList > .nfa-af-card .nfa-af-card-title {
                font-size: 12.5px !important;
                line-height: 1.28 !important;
            }
            #activityFeedList > .nfa-af-card .nfa-af-card-sender {
                margin-top: 1px !important;
                font-size: 10.5px !important;
            }
            #activityFeedList > .nfa-af-card .nfa-af-card-time {
                margin-top: 3px !important;
                font-size: 9.5px !important;
            }
            #activityFeedList > .nfa-af-card .nfa-af-card-action {
                margin-top: 6px !important;
                padding: 4px 10px !important;
                min-height: 27px !important;
                border-radius: 7px !important;
                font-size: 10px !important;
            }
            #activityFeedList > .nfa-af-card .nfa-af-card-clear {
                top: 7px !important;
                right: 7px !important;
                width: 22px !important;
                height: 22px !important;
            }
            #activityFeedList > .nfa-af-day {
                margin: 5px 0 7px !important;
            }

            /* Never show the Task filter/sort bar above an open Activity Feed. */
            #rightSidebar:has(#activityFeedPanel) #rightSidebarFilters { display: none !important; }
            #rightSidebar:not(:has(#activityFeedPanel)) #rightSidebarFilters.nfa-compact-task-filters {
                display: grid !important;
                grid-template-columns: minmax(0,1.25fr) minmax(0,1fr) !important;
                gap: 7px !important;
                padding: 6px 8px !important;
                align-items: end !important;
                background: var(--bg-sidebar,#fff) !important;
            }
            #rightSidebarFilters.nfa-compact-task-filters > .nfa-task-select-wrap {
                display: flex !important;
                flex-direction: column !important;
                gap: 3px !important;
                min-width: 0 !important;
            }
            #rightSidebarFilters .nfa-task-select-label {
                font-size: 8px !important;
                line-height: 1 !important;
                font-weight: 800 !important;
                letter-spacing: .08em !important;
                color: var(--text-secondary,#64748b) !important;
                text-transform: uppercase !important;
                padding-left: 2px !important;
            }
            #rightSidebarFilters .nfa-task-select-wrap > select {
                display: block !important;
                width: 100% !important;
                min-width: 0 !important;
                height: 31px !important;
                margin: 0 !important;
                padding: 0 24px 0 8px !important;
                border: 1px solid var(--border-color,#d9dee8) !important;
                border-radius: 8px !important;
                background: var(--bg-body,#f8fafc) !important;
                color: var(--text-primary,#111827) !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                outline: none !important;
            }
            #rightSidebarFilters.nfa-compact-task-filters > .nfa-old-task-filter-row { display: none !important; }
            #dateRangeFilter:not(.hidden) { padding-top: 6px !important; padding-bottom: 6px !important; }
        `;
        document.head.appendChild(style);
    }

    function important(el, prop, value) {
        try { el.style.setProperty(prop, value, 'important'); } catch (e) {}
    }

    function decorateActivityHeaderAndFilters() {
        const panel = document.getElementById('activityFeedPanel');
        const list = document.getElementById('activityFeedList');
        if (!panel || !list) return;

        const header = panel.firstElementChild;
        if (!header || header === list) return;
        header.classList.add('nfa-af-header');

        const headerChildren = Array.from(header.children);
        if (headerChildren[0]) headerChildren[0].classList.add('nfa-af-header-title');
        if (headerChildren[1]) headerChildren[1].classList.add('nfa-af-header-actions');

        // Remove the decorative subtitle wherever the v208 decorator placed it.
        header.querySelectorAll('small,p,div,span').forEach(el => {
            const text = (el.textContent || '').trim();
            if (text === 'Organisation activity · India Standard Time' ||
                text.includes('Organisation activity') && text.includes('India Standard Time')) {
                // Do not hide a parent that also contains the title/buttons.
                if (el.children.length === 0 || text === 'Organisation activity · India Standard Time') {
                    el.style.setProperty('display', 'none', 'important');
                }
            }
        });

        // Each full render creates a new filter row inside the list. Move that exact
        // node into the header so its native onchange handlers and selected values stay intact.
        const freshRow = Array.from(list.children).find(el =>
            el instanceof HTMLElement && el.querySelectorAll(':scope > select').length >= 2
        );
        const oldRow = header.querySelector('.nfa-af-header-filters');
        if (freshRow) {
            if (oldRow && oldRow !== freshRow) oldRow.remove();
            freshRow.className = 'nfa-af-header-filters';
            header.appendChild(freshRow);
        }
    }

    function decorateActivityCards() {
        const list = document.getElementById('activityFeedList');
        if (!list) return;

        Array.from(list.children).forEach(child => {
            if (!(child instanceof HTMLElement)) return;
            const text = (child.textContent || '').trim();
            if (!text) return;

            // Date separators have no Open/View Task action and include day labels.
            const action = Array.from(child.querySelectorAll('button')).find(btn =>
                /Open|View Task/i.test(btn.textContent || '')
            );
            const badge = Array.from(child.querySelectorAll('span')).find(span =>
                /CHATS|TASKS|REMINDER|SYSTEM/i.test(span.textContent || '')
            );
            const clear = Array.from(child.querySelectorAll('button')).find(btn =>
                (btn.title || '').toLowerCase() === 'clear' || (btn.textContent || '').trim() === '✕'
            );

            if (!action && !badge) {
                if (/TODAY|YESTERDAY|\d{2}\s+[A-Za-z]{3}/i.test(text)) child.classList.add('nfa-af-day');
                return;
            }

            child.classList.add('nfa-af-card');
            if (badge) badge.classList.add('nfa-af-card-badge');
            if (action) action.classList.add('nfa-af-card-action');
            if (clear) clear.classList.add('nfa-af-card-clear');

            const divs = Array.from(child.querySelectorAll(':scope > div, :scope > div > div'));
            const title = divs.find(d => {
                const t = (d.textContent || '').trim();
                return t && !/^by\s/i.test(t) && !/ago\s*·/i.test(t) && d.querySelectorAll('button').length === 0;
            });
            const sender = divs.find(d => /^by\s/i.test((d.textContent || '').trim()));
            const time = divs.find(d => /ago\s*·/i.test((d.textContent || '').trim()));
            if (title) title.classList.add('nfa-af-card-title');
            if (sender) sender.classList.add('nfa-af-card-sender');
            if (time) time.classList.add('nfa-af-card-time');

            // Replace the Task category's orange palette with indigo while leaving
            // Chat/Reminder/System categories unchanged.
            if (badge && /TASKS/i.test(badge.textContent || '')) {
                important(child, 'border-left-color', INDIGO);
                important(badge, 'background', INDIGO_SOFT);
                important(badge, 'color', INDIGO);
                if (action) important(action, 'background', INDIGO);

                const icon = child.querySelector('i, [style*="border-radius:50%"]');
                if (icon) important(icon, 'color', INDIGO);
            }
        });
    }

    function restorePlainTaskOptions(filter, sort) {
        const filterLabels = {
            all: 'All', today: 'Today', pending: 'Pending', completed: 'Done',
            allotted_by_me: 'By Me', allotted_to_me: 'To Me', delegated: 'Delegated',
            transferred: 'Transferred', date_range: 'Date Range'
        };
        const sortLabels = {
            deadline_asc: 'Deadline ↑', deadline_desc: 'Deadline ↓',
            created_desc: 'Newest', created_asc: 'Oldest'
        };
        Array.from(filter.options).forEach(o => { if (filterLabels[o.value]) o.textContent = filterLabels[o.value]; });
        Array.from(sort.options).forEach(o => { if (sortLabels[o.value]) o.textContent = sortLabels[o.value]; });
    }

    function ensureWrap(host, select, labelText, key) {
        let wrap = host.querySelector('.nfa-task-select-wrap[data-key="' + key + '"]');
        if (!wrap) {
            wrap = document.createElement('label');
            wrap.className = 'nfa-task-select-wrap';
            wrap.dataset.key = key;
            const label = document.createElement('span');
            label.className = 'nfa-task-select-label';
            label.textContent = labelText;
            wrap.appendChild(label);
            host.insertBefore(wrap, host.firstChild);
        }
        if (select.parentElement !== wrap) wrap.appendChild(select);
        return wrap;
    }

    function decorateTaskFilters() {
        const host = document.getElementById('rightSidebarFilters');
        const filter = document.getElementById('taskFilter');
        const sort = document.getElementById('taskSort');
        if (!host || !filter || !sort) return;

        if (document.getElementById('activityFeedPanel')) {
            important(host, 'display', 'none');
            return;
        }

        host.style.removeProperty('display');
        host.classList.add('nfa-compact-task-filters');
        filter.classList.remove('hidden');
        sort.classList.remove('hidden');
        filter.setAttribute('aria-label', 'Filter tasks');
        sort.setAttribute('aria-label', 'Sort tasks');
        restorePlainTaskOptions(filter, sort);

        const filterWrap = ensureWrap(host, filter, 'Filter', 'filter');
        const sortWrap = ensureWrap(host, sort, 'Sort', 'sort');
        if (filterWrap.nextElementSibling !== sortWrap) host.insertBefore(sortWrap, filterWrap.nextElementSibling);
        Array.from(host.children).forEach(child => {
            if (child !== filterWrap && child !== sortWrap) child.classList.add('nfa-old-task-filter-row');
        });
    }

    function decorateAll() {
        installStyles();
        decorateActivityHeaderAndFilters();
        decorateActivityCards();
        decorateTaskFilters();
    }

    let timer;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(decorateAll, 0);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', decorateAll, { once: true });
    } else {
        decorateAll();
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.NILTASK_COMPACT_PANEL_FILTERS_VERSION = 'v4';
})();