(function () {
    'use strict';

    function installStyles() {
        if (document.getElementById('nfa-compact-panel-filters-style')) return;
        const style = document.createElement('style');
        style.id = 'nfa-compact-panel-filters-style';
        style.textContent = `
            /* Activity Feed: keep the existing type/person selects fixed at top. */
            #activityFeedList > .nfa-af-sticky-filters {
                position: sticky !important;
                top: 0 !important;
                z-index: 45 !important;
                display: grid !important;
                grid-template-columns: minmax(0,1fr) minmax(0,1fr) !important;
                gap: 6px !important;
                margin: -12px -12px 8px !important;
                padding: 6px 8px !important;
                min-height: 38px !important;
                background: var(--bg-sidebar,#fff) !important;
                border-bottom: 1px solid var(--border-color,#e5e7eb) !important;
                box-shadow: 0 2px 5px rgba(15,23,42,.05) !important;
            }
            #activityFeedList > .nfa-af-sticky-filters select {
                height: 30px !important;
                min-width: 0 !important;
                padding: 0 24px 0 8px !important;
                border-radius: 8px !important;
                font-size: 10px !important;
                line-height: 30px !important;
                font-weight: 700 !important;
                margin: 0 !important;
            }

            /* Task panel: use the existing functional selects, not duplicated pills. */
            #rightSidebarFilters.nfa-compact-task-filters {
                display: grid !important;
                grid-template-columns: minmax(0,1.35fr) minmax(0,1fr) !important;
                gap: 7px !important;
                padding: 7px 9px !important;
                align-items: center !important;
                background: var(--bg-sidebar,#fff) !important;
            }
            #rightSidebarFilters.nfa-compact-task-filters > select {
                display: block !important;
                width: 100% !important;
                min-width: 0 !important;
                height: 32px !important;
                margin: 0 !important;
                padding: 0 25px 0 9px !important;
                border: 1px solid var(--border-color,#d9dee8) !important;
                border-radius: 9px !important;
                background: var(--bg-body,#f8fafc) !important;
                color: var(--text-primary,#111827) !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                outline: none !important;
            }
            #rightSidebarFilters.nfa-compact-task-filters > .nfa-old-task-filter-row {
                display: none !important;
            }
            #dateRangeFilter:not(.hidden) {
                padding-top: 6px !important;
                padding-bottom: 6px !important;
            }
        `;
        document.head.appendChild(style);
    }

    function decorateActivityFilters() {
        const list = document.getElementById('activityFeedList');
        if (!list) return;
        const row = Array.from(list.children).find(el =>
            el instanceof HTMLElement && el.querySelectorAll(':scope > select').length >= 2
        );
        if (row) row.classList.add('nfa-af-sticky-filters');
    }

    function relabelTaskSelects(filter, sort) {
        const filterLabels = {
            all: 'Filter: All', today: 'Filter: Today', pending: 'Filter: Pending',
            completed: 'Filter: Done', allotted_by_me: 'Filter: By Me',
            allotted_to_me: 'Filter: To Me', delegated: 'Filter: Delegated',
            transferred: 'Filter: Transferred', date_range: 'Filter: Date Range'
        };
        const sortLabels = {
            deadline_asc: 'Sort: Deadline ↑', deadline_desc: 'Sort: Deadline ↓',
            created_desc: 'Sort: Newest', created_asc: 'Sort: Oldest'
        };
        Array.from(filter.options).forEach(o => { if (filterLabels[o.value]) o.textContent = filterLabels[o.value]; });
        Array.from(sort.options).forEach(o => { if (sortLabels[o.value]) o.textContent = sortLabels[o.value]; });
    }

    function decorateTaskFilters() {
        const host = document.getElementById('rightSidebarFilters');
        const filter = document.getElementById('taskFilter');
        const sort = document.getElementById('taskSort');
        if (!host || !filter || !sort) return;

        host.classList.add('nfa-compact-task-filters');
        filter.classList.remove('hidden');
        sort.classList.remove('hidden');
        filter.setAttribute('aria-label', 'Filter tasks');
        sort.setAttribute('aria-label', 'Sort tasks');
        relabelTaskSelects(filter, sort);

        Array.from(host.children).forEach(child => {
            if (child !== filter && child !== sort) child.classList.add('nfa-old-task-filter-row');
        });
    }

    function decorateAll() {
        installStyles();
        decorateActivityFilters();
        decorateTaskFilters();
    }

    let timer;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(decorateAll, 20);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', decorateAll, { once: true });
    } else {
        decorateAll();
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.NILTASK_COMPACT_PANEL_FILTERS_VERSION = 'v1';
})();
