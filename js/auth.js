/**
 * auth.js — MPGS TaskFlow VER 2.0.0
 * ─────────────────────────────────────────────────────────────
 * Handles login, logout, ensureProfile, renderAuthScreen.
 * On login: loads tenant_id + role + feature_flags into window.*
 * so every other file can check permissions before rendering.
 * ─────────────────────────────────────────────────────────────
 */
import { sb } from './shared.js';

// ─── LOGIN ──────────────────────────────────────────────────────
window.signIn = async function(email, pwd) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pwd });
    if (error || !data?.user) return false;

    window.currentUser = data.user;

    // Load tenant context — everything else depends on this
    const loaded = await window.loadTenantContext();
    if (!loaded) {
        // Auth succeeded but no school tenant found — setup incomplete.
        // Show a clear message (NOT "invalid credentials") then redirect.
        document.getElementById('authMsg').textContent = '';
        window.showCenterToast(
            'School setup incomplete. Redirecting to registration...',
            'fa-solid fa-school', 'text-yellow-400'
        );
        await sb.auth.signOut();
        setTimeout(() => { window.location.href = './signup.html'; }, 2000);
        return false;
    }

    // Route by role — Phase 2 will add renderAdminScreen()
    // Until then, everyone goes to chat app
    const goToApp = () => {
        if (typeof window.renderMainApp === 'function') window.renderMainApp();
        if (typeof window.startSubscriptions === 'function') window.startSubscriptions();
    };

    if (window.currentPermissions?.admin_panel && typeof window.renderAdminScreen === 'function') {
        window.renderAdminScreen();   // Phase 2: admin panel
    } else {
        goToApp();                    // Phase 1: everyone uses chat app
    }
    return true;
};

// ─── LOAD TENANT CONTEXT ────────────────────────────────────────
// Fetches tenant_id, role, permissions, feature_flags for the
// logged-in user. Stores everything on window.* for global access.
window.loadTenantContext = async function() {
    const uid = window.currentUser?.id;
    if (!uid) return false;

    // Get profile (includes tenant_id)
    const { data: profile } = await sb.from('profiles')
        .select('*, tenant:tenants(id, school_name, principal_name)')
        .eq('id', uid)
        .single();

    if (!profile?.tenant_id) return false;

    window.currentTenantId   = profile.tenant_id;
    window.currentSchoolName = profile.tenant?.school_name || 'School';
    window._userAvatarUrl    = localStorage.getItem('mpgs_avatar_' + uid) || profile.avatar_url || null;

    // Get user role + permissions
    const { data: userRole } = await sb.from('user_roles')
        .select('*, role:roles(name, display_name, permissions)')
        .eq('user_id', uid)
        .eq('tenant_id', window.currentTenantId)
        .single();

    window.currentRole        = userRole?.role?.name        || 'teacher';
    window.currentRoleName    = userRole?.role?.display_name || 'Teacher';
    window.currentPermissions = userRole?.role?.permissions  || {};

    // Get feature flags for this school
    const { data: flags } = await sb.from('feature_flags')
        .select('*')
        .eq('tenant_id', window.currentTenantId)
        .single();

    window.featureFlags = flags || {
        tasks_enabled: true, uploads_enabled: true,
        reports_enabled: false, scheduling_enabled: true, max_upload_mb: 5
    };

    // Get subscription info
    const { data: sub } = await sb.from('subscriptions')
        .select('*')
        .eq('tenant_id', window.currentTenantId)
        .eq('status', 'active')
        .maybeSingle();

    window.currentSubscription = sub || null;

    return true;
};

// ─── PERMISSION HELPERS ─────────────────────────────────────────
// Call these anywhere in the app to check what the user can do.
window.hasPermission = function(key) {
    return window.currentPermissions?.[key] === true;
};

window.hasFeature = function(key) {
    return window.featureFlags?.[key] === true;
};

// ─── SIGNUP (used by signup.html — signUp handled there directly)
window.signUp = async function(email, pwd) {
    const { data, error } = await sb.auth.signUp({ email, password: pwd });
    if (error) throw error;
    return data;
};

// ─── LOGOUT ─────────────────────────────────────────────────────
window.logout = async function() {
    await sb.auth.signOut();
    // Clear all tenant context
    window.currentUser         = null;
    window.currentTenantId     = null;
    window.currentRole         = null;
    window.currentPermissions  = {};
    window.featureFlags        = {};
    window.currentSubscription = null;
    window.globalUsersCache    = [];
    window.renderAuthScreen();
};

// ─── ENSURE PROFILE ─────────────────────────────────────────────
// Creates a minimal profile row if one doesn't exist yet.
window.ensureProfile = async function() {
    if (!window.currentUser) return;
    const { data: ex } = await sb.from('profiles')
        .select('id, tenant_id')
        .eq('id', window.currentUser.id)
        .maybeSingle();
    if (!ex) {
        // New user invited by admin — create minimal profile
        await sb.from('profiles').insert({
            id:        window.currentUser.id,
            email:     window.currentUser.email,
            full_name: window.currentUser.user_metadata?.full_name
                       || window.currentUser.email.split('@')[0]
        });
    }
};

// ─── RENDER AUTH SCREEN ─────────────────────────────────────────
window.renderAuthScreen = function() {
    if (typeof window.applyTheme === 'function') window.applyTheme();
    document.getElementById('root').innerHTML = `
    <div class="min-h-screen w-full flex items-center justify-center" style="background-color:var(--bg-body);">
        <div class="modal-content p-10 rounded-3xl shadow-2xl w-full max-w-md mx-4" style="background-color:var(--bg-sidebar);">
            <div class="text-center mb-8">
                <div style="width:52px;height:52px;border-radius:14px;background:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                    <i class="fa-solid fa-comments" style="color:#fff;font-size:20px;"></i>
                </div>
                <h1 class="text-2xl font-bold" style="color:var(--text-primary);">MPGS TaskFlow</h1>
                <p class="text-sm mt-1" style="color:var(--text-secondary);">Enterprise Communication Portal</p>
            </div>

            <div class="space-y-4">
                <input id="email" type="email" placeholder="Email Address"
                    class="ui-input w-full px-4 py-3 rounded-xl border"
                    style="border-color:var(--border-color);">

                <div class="relative">
                    <input id="password" type="password" placeholder="Password"
                        class="ui-input w-full px-4 py-3 rounded-xl border pr-10"
                        style="border-color:var(--border-color);">
                    <i class="fa-solid fa-eye absolute right-4 top-4 text-gray-400 cursor-pointer hover:text-gray-600"
                        id="togglePassword"></i>
                </div>

                <button id="loginBtn"
                    class="w-full py-3 rounded-xl text-white font-bold shadow-md"
                    style="background-color:var(--accent);">
                    <i class="fa-solid fa-arrow-right-to-bracket mr-2"></i>Login
                </button>

                <div id="authMsg" class="text-center text-red-500 text-sm font-medium h-5"></div>

                <div class="text-center pt-2 border-t" style="border-color:var(--border-color);">
                    <p class="text-sm" style="color:var(--text-secondary);">
                        New school?
                        <a href="./signup.html" class="font-bold" style="color:var(--accent);">
                            Register here →
                        </a>
                    </p>
                </div>
            </div>
        </div>
    </div>`;

    // Eye toggle
    document.getElementById('togglePassword').onclick = () => {
        const pwd  = document.getElementById('password');
        const icon = document.getElementById('togglePassword');
        if (pwd.type === 'password') { pwd.type = 'text';     icon.classList.replace('fa-eye','fa-eye-slash'); }
        else                          { pwd.type = 'password'; icon.classList.replace('fa-eye-slash','fa-eye'); }
    };

    // Enter key on password field
    document.getElementById('password').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('loginBtn').click();
    });

    document.getElementById('loginBtn').onclick = async () => {
        const btn = document.getElementById('loginBtn');
        const msg = document.getElementById('authMsg');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Logging in...';
        msg.textContent = '';
        const ok = await window.signIn(
            document.getElementById('email').value,
            document.getElementById('password').value
        );
        if (!ok) {
            // Only show "invalid credentials" if no toast was already shown
            // (toast means loadTenantContext failed, not bad password)
            const toast = document.querySelector('.center-toast');
            if (!toast) {
                msg.textContent = 'Wrong email or password. Please try again.';
            }
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket mr-2"></i>Login';
        }
    };
};
