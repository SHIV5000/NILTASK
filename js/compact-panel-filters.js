(function () {
    'use strict';

    function installStyles() {
        if (document.getElementById('nfa-compact-panel-filters-style')) return;
        const style = document.createElement('style');
        style.id = 'nfa-compact-panel-filters-style';
        style.textContent = `
            #activityFeedList {
                padding-top: 0 !important;
            }
            #activityFeedList > .nfa-af-sticky-filters {
                position: sticky !important;
                top: 0 !important;
                z-index: 55 !important;
                display: grid !important;
                grid-template-columns: minmax(0,1fr) minmax(0,1fr) !important;
                gap: 6px !important;
                margin: 0 -12px 8px !important;
                padding: 5px 10px !important;
                min-height: 40px !important;
                background: var(--bg-sidebar,#fff) !important;
                border: 0 !important;
                border-bottom: 1px solid var(--border-color,#e5e7eb) !important;
                border-radius: 0 !important;
                box-shadow: none !important;
            }
            #activityFeedList > .nfa-af-sticky-filters select {
                display: block !important;
                width: 100% !important;
                height: 30px !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 24px 0 8px !important;
                border: 1px solid var(--border-color,#d9dee8) !important;
                border-radius: 7px !important;
                background: var(--bg-body,#f8fafc) !important;
                color: var(--text-primary,#111827) !important;
                font-size: 10px !important;
                line-height: 30px !important;
                font-weight: 700 !important;
                box-shadow: none !important;
            }

            /* Never show the Task filter/sort bar above an open Activity Feed. */
            #rightSidebar:has(#activityFeedPanel) > #rightSidebarFilters,
            #rightSidebar:has(#activityFeedPanel) #rightSidebarFilters {
                display: none !important;
            }

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

    function important(el, prop, value) {
        try { el.style.setProperty(prop, value, 'important'); } catch (e) {}
    }

    function decorateActivityFilters() {
        const list = document.getElementById('activityFeedList');
        if (!list) return;
        const row = Array.from(list.children).find(el =>
            el instanceof HTMLElement && el.querySelectorAll(':scope > select').length >= 2
        );
        if (!row) return;

        row.classList.add('nfa-af-sticky-filters');
        important(row, 'position', 'sticky');
        important(row, 'top', '0');
        important(row, 'z-index', '55');
        important(row, 'display', 'grid');
        important(row, 'grid-template-columns', 'minmax(0,1fr) minmax(0,1fr)');
        important(row, 'gap', '6px');
        important(row, 'margin', '0 -12px 8px');
        important(row, 'padding', '5px 10px');
        important(row, 'min-height', '40px');
        important(row, 'background', 'var(--bg-sidebar,#fff)');
        important(row, 'border', '0');
        important(row, 'border-bottom', '1px solid var(--border-color,#e5e7eb)');
        important(row, 'border-radius', '0');
        important(row, 'box-shadow', 'none');
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

        /* Activity owns the right sidebar while open. Do not override its hide rule. */
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
        decorateActivityFilters();
        decorateTaskFilters();
    }

    let timer;
    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(decorateAll, 30);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', decorateAll, { once: true });
    } else {
        decorateAll();
    }

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.NILTASK_COMPACT_PANEL_FILTERS_VERSION = 'v3';
})();