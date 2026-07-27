(function () {
    'use strict';

    const VERSION = 'v5';
    const STATE = {
        observer: null,
        installTimer: null,
        decorateTimer: null
    };

    function installStyles() {
        if (document.getElementById('nfa-compact-task-filters-style')) return;
        const style = document.createElement('style');
        style.id = 'nfa-compact-task-filters-style';
        style.textContent = `
            #rightSidebar:has(#activityFeedPanel) #rightSidebarFilters {
                display:none !important;
            }
            #rightSidebar:not(:has(#activityFeedPanel)) #rightSidebarFilters.nfa-compact-task-filters {
                display:grid !important;
                grid-template-columns:minmax(0,1.25fr) minmax(0,1fr) !important;
                gap:7px !important;
                padding:6px 8px !important;
                align-items:end !important;
                background:var(--bg-sidebar,#fff) !important;
            }
            #rightSidebarFilters.nfa-compact-task-filters > .nfa-task-select-wrap {
                display:flex !important;
                flex-direction:column !important;
                gap:3px !important;
                min-width:0 !important;
            }
            #rightSidebarFilters .nfa-task-select-label {
                padding-left:2px !important;
                color:var(--text-secondary,#64748b) !important;
                font-size:8px !important;
                line-height:1 !important;
                font-weight:800 !important;
                letter-spacing:.08em !important;
                text-transform:uppercase !important;
            }
            #rightSidebarFilters .nfa-task-select-wrap > select {
                display:block !important;
                width:100% !important;
                min-width:0 !important;
                height:31px !important;
                margin:0 !important;
                padding:0 24px 0 8px !important;
                border:1px solid var(--border-color,#d9dee8) !important;
                border-radius:8px !important;
                background:var(--bg-body,#f8fafc) !important;
                color:var(--text-primary,#111827) !important;
                font-size:10px !important;
                font-weight:700 !important;
                outline:none !important;
            }
            #rightSidebarFilters.nfa-compact-task-filters > .nfa-old-task-filter-row {
                display:none !important;
            }
            #dateRangeFilter:not(.hidden) {
                padding-top:6px !important;
                padding-bottom:6px !important;
            }
        `;
        document.head.appendChild(style);
    }

    function restorePlainTaskOptions(filter, sort) {
        const filterLabels = {
            all:'All', today:'Today', pending:'Pending', completed:'Done',
            allotted_by_me:'By Me', allotted_to_me:'To Me', delegated:'Delegated',
            transferred:'Transferred', date_range:'Date Range'
        };
        const sortLabels = {
            deadline_asc:'Deadline ↑', deadline_desc:'Deadline ↓',
            created_desc:'Newest', created_asc:'Oldest'
        };
        Array.from(filter.options).forEach(option => {
            if (filterLabels[option.value]) option.textContent = filterLabels[option.value];
        });
        Array.from(sort.options).forEach(option => {
            if (sortLabels[option.value]) option.textContent = sortLabels[option.value];
        });
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
        if (!host || !filter || !sort) return false;

        if (document.getElementById('activityFeedPanel')) return true;

        host.style.removeProperty('display');
        host.classList.add('nfa-compact-task-filters');
        filter.classList.remove('hidden');
        sort.classList.remove('hidden');
        filter.setAttribute('aria-label', 'Filter tasks');
        sort.setAttribute('aria-label', 'Sort tasks');
        restorePlainTaskOptions(filter, sort);

        const filterWrap = ensureWrap(host, filter, 'Filter', 'filter');
        const sortWrap = ensureWrap(host, sort, 'Sort', 'sort');
        if (filterWrap.nextElementSibling !== sortWrap) {
            host.insertBefore(sortWrap, filterWrap.nextElementSibling);
        }
        Array.from(host.children).forEach(child => {
            if (child !== filterWrap && child !== sortWrap) child.classList.add('nfa-old-task-filter-row');
        });
        return true;
    }

    function scheduleDecorate() {
        clearTimeout(STATE.decorateTimer);
        STATE.decorateTimer = setTimeout(decorateTaskFilters, 0);
    }

    function attach() {
        const root = document.getElementById('rightSidebar');
        if (!root) return false;
        installStyles();
        decorateTaskFilters();
        if (!STATE.observer) {
            STATE.observer = new MutationObserver(scheduleDecorate);
            STATE.observer.observe(root, { childList:true, subtree:true });
        }
        window.NILTASK_COMPACT_PANEL_FILTERS_VERSION = VERSION;
        return true;
    }

    function dispose() {
        clearTimeout(STATE.decorateTimer);
        clearInterval(STATE.installTimer);
        STATE.decorateTimer = null;
        STATE.installTimer = null;
        try { STATE.observer?.disconnect(); } catch (e) {}
        STATE.observer = null;
    }

    function boot() {
        if (attach()) return;
        let attempts = 0;
        STATE.installTimer = setInterval(() => {
            attempts += 1;
            if (attach() || attempts >= 150) {
                clearInterval(STATE.installTimer);
                STATE.installTimer = null;
            }
        }, 200);
    }

    window.addEventListener('niltask:session-cleaned', dispose);
    window.NILTASK_CompactTaskFilters = Object.freeze({ version:VERSION, decorate:decorateTaskFilters, dispose });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once:true });
    } else {
        boot();
    }
})();
