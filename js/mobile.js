/**
 * mobile.js — TaskFlow Mobile UI  VER 2.0
 * ─────────────────────────────────────────────────────────────
 * Complete mobile redesign:
 *   • Bottom navigation bar (Chats | Tasks | Activity | Profile)
 *   • Full-screen single-panel views
 *   • Back button from chat → channel list
 *   • Touch-optimized layout
 *
 * Uses setProperty('important') to beat dynamic inline styles.
 * Works WITH existing main.js — no function rewrites needed.
 * ─────────────────────────────────────────────────────────────
 */

const MOB  = 768;
window.isMobileView = () => window.innerWidth <= MOB;

let _mobileView    = 'channels'; // channels | chat | tasks | activity
let _mobilePatch   = false;       // patch applied once

// ── ENTRY POINT ───────────────────────────────────────────────
// Called by main.js after renderMainApp() + loadChatsList()
window.initMobileApp = function() {
    if (!window.isMobileView()) return;
    _buildBottomNav();
    _buildBackBtn();
    _addMobileRoomTitle();
    _patchChannelClicks();
    window.setMobileView('channels');

    // Re-run on resize / orientation change
    window.removeEventListener('resize', _onResize);
    window.addEventListener('resize', _onResize, { passive: true });
};

function _onResize() {
    if (window.isMobileView()) {
        window.setMobileView(_mobileView);
        _buildBottomNav();
        _buildBackBtn();
    } else {
        _restoreDesktop();
    }
}

// ── CORE VIEW SWITCHER ────────────────────────────────────────
window.setMobileView = function(view) {
    if (!window.isMobileView()) return;
    _mobileView = view;

    const leftSB   = document.getElementById('leftSidebar');
    const rightSB  = document.getElementById('rightSidebar');
    const chatArea = document.querySelector('.chat-area');
    const leftR    = document.getElementById('leftResizer');
    const rightR   = document.getElementById('rightResizer');
    const backBtn  = document.getElementById('mobBackBtn');
    const navEl    = document.getElementById('mobileBottomNav');

    // ── Hide all panels ──────────────────────────────────────
    [leftSB, rightSB, chatArea, leftR, rightR].forEach(el => {
        el?.style.setProperty('display', 'none', 'important');
    });

    // ── Show the right panel ─────────────────────────────────
    switch (view) {

        case 'channels':
            if (leftSB) {
                leftSB.style.setProperty('display',   'flex',    'important');
                leftSB.style.setProperty('position',  'relative','important');
                leftSB.style.setProperty('width',     '100vw',   'important');
                leftSB.style.setProperty('max-width', '100%',    'important');
                leftSB.style.setProperty('height',    '100%',    'important');
                leftSB.style.setProperty('top',       '0',       'important');
                leftSB.style.setProperty('left',      '0',       'important');
                leftSB.style.setProperty('box-shadow','none',    'important');
                leftSB.style.setProperty('z-index',   '1',       'important');
            }
            if (backBtn) backBtn.style.display = 'none';
            break;

        case 'chat':
            if (chatArea) {
                chatArea.style.setProperty('display', 'flex',   'important');
                chatArea.style.setProperty('width',   '100vw',  'important');
                chatArea.style.setProperty('flex',    '1 1 0',  'important');
            }
            if (backBtn) backBtn.style.display = 'flex';
            // Scroll messages to bottom
            setTimeout(() => {
                const msgs = document.getElementById('chatShellContainer');
                if (msgs) msgs.scrollTop = msgs.scrollHeight;
            }, 80);
            break;

        case 'tasks':
            if (rightSB) {
                rightSB.style.setProperty('display',  'flex',   'important');
                rightSB.style.setProperty('width',    '100vw',  'important');
                rightSB.style.setProperty('height',   '100%',   'important');
                rightSB.style.setProperty('position', 'relative','important');
            }
            if (backBtn) backBtn.style.display = 'none';
            // Refresh tasks
            if (typeof window.loadTasksForPanel === 'function') window.loadTasksForPanel();
            break;

        case 'activity':
            // Reuse the bell panel
            if (typeof window.openTopPanel === 'function') window.openTopPanel('activity');
            if (backBtn) backBtn.style.display = 'none';
            break;
    }

    // ── Update bottom nav active tab ─────────────────────────
    const tabMap = { channels:'mob-tab-chats', chat:'mob-tab-chats',
                     tasks:'mob-tab-tasks', activity:'mob-tab-activity' };
    navEl?.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
    navEl?.querySelector('#' + (tabMap[view] || 'mob-tab-chats'))?.classList.add('active');

    // ── Bottom nav always visible ────────────────────────────
    if (navEl) navEl.style.display = 'flex';
};

// ── BUILD BOTTOM NAV ──────────────────────────────────────────
function _buildBottomNav() {
    if (document.getElementById('mobileBottomNav')) return; // already built

    const nav = document.createElement('div');
    nav.id = 'mobileBottomNav';
    nav.innerHTML = `
        <button class="mob-tab active" id="mob-tab-chats"
            onclick="window.setMobileView('channels')">
            <i class="fa-solid fa-comments mob-tab-icon"></i>
            <span class="mob-tab-label">Chats</span>
        </button>
        <button class="mob-tab" id="mob-tab-tasks"
            onclick="window.setMobileView('tasks')">
            <i class="fa-solid fa-list-check mob-tab-icon"></i>
            <span class="mob-tab-label">Tasks</span>
            <span class="mob-badge" id="mobTaskBadge" style="display:none;">!</span>
        </button>
        <button class="mob-tab" id="mob-tab-activity"
            onclick="window.setMobileView('activity')">
            <i class="fa-solid fa-bell mob-tab-icon"></i>
            <span class="mob-tab-label">Activity</span>
            <span class="mob-badge" id="mobBellBadge" style="display:none;">!</span>
        </button>
        <button class="mob-tab" id="mob-tab-profile"
            onclick="window.openSettings?.()">
            <i class="fa-solid fa-circle-user mob-tab-icon"></i>
            <span class="mob-tab-label">Profile</span>
        </button>`;
    document.body.appendChild(nav);

    // Sync unread badge from existing bell button
    _syncBadges();
}

function _syncBadges() {
    // Copy unread count from desktop bell badge to mobile badge
    const desktopBadge = document.getElementById('notifCount');
    const mobileBadge  = document.getElementById('mobBellBadge');
    if (desktopBadge && mobileBadge) {
        const txt = desktopBadge.textContent?.trim();
        if (txt && txt !== '0') { mobileBadge.style.display='flex'; mobileBadge.textContent=txt; }
        else { mobileBadge.style.display='none'; }
    }
}

// ── BUILD BACK BUTTON ─────────────────────────────────────────
function _buildBackBtn() {
    if (document.getElementById('mobBackBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'mobBackBtn';
    btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';
    btn.title = 'Back to channels';
    btn.onclick = () => window.setMobileView('channels');
    btn.style.display = 'none';

    // Insert before the sidebar toggle in the top bar
    const toggle = document.getElementById('mobileSidebarToggle');
    if (toggle?.parentNode) {
        toggle.parentNode.insertBefore(btn, toggle);
        toggle.style.display = 'none'; // hide hamburger — replaced by back btn
    }
}

// ── ADD MOBILE ROOM TITLE (channel name in top bar) ───────────
function _addMobileRoomTitle() {
    const titleSpan = document.getElementById('roomTitleDisplay');
    if (!titleSpan || titleSpan.dataset.mobilePatch) return;
    titleSpan.dataset.mobilePatch = '1';
    // Ensure school name is shown in channels view
    // (top bar is hidden in channels view — left sidebar has school badge)
}

// ── PATCH CHANNEL CLICKS ──────────────────────────────────────
// After loadChatsList() re-renders, add mobile navigation to each channel
function _patchChannelClicks() {
    if (_mobilePatch) return;
    _mobilePatch = true;

    // Monkey-patch loadChatsList so every re-render also patches mobile clicks
    const _orig = window.loadChatsList;
    if (_orig) {
        window.loadChatsList = async function(...args) {
            await _orig.apply(this, args);
            if (window.isMobileView()) {
                _addMobileClicksToChannels();
                if (typeof window.applyGroupGearRBAC === 'function') window.applyGroupGearRBAC();
            }
        };
    }
    _addMobileClicksToChannels();
}

function _addMobileClicksToChannels() {
    document.querySelectorAll('.channel-item').forEach(el => {
        if (el.dataset.mobilePatch) return;
        el.dataset.mobilePatch = '1';

        const origClick = el.onclick;
        el.addEventListener('click', (e) => {
            // Don't intercept gear icon clicks
            if (e.target.closest('[onclick*="openGroupSettings"]')) return;
            // Switch to chat view after a short tick (let original handler run first)
            setTimeout(() => window.setMobileView('chat'), 30);
        });
    });
}

// ── RESTORE DESKTOP ───────────────────────────────────────────
function _restoreDesktop() {
    const nav = document.getElementById('mobileBottomNav');
    if (nav) nav.style.display = 'none';
    const backBtn = document.getElementById('mobBackBtn');
    if (backBtn) backBtn.style.display = 'none';

    // Remove forced styles so desktop CSS takes over
    const leftSB   = document.getElementById('leftSidebar');
    const rightSB  = document.getElementById('rightSidebar');
    const chatArea = document.querySelector('.chat-area');
    [leftSB, rightSB, chatArea].forEach(el => {
        if (!el) return;
        el.style.removeProperty('display');
        el.style.removeProperty('width');
        el.style.removeProperty('position');
        el.style.removeProperty('flex');
    });
}
