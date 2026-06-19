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
        setTimeout(() => { window.location.href = '/signup.html'; }, 2000);
        return false;
    }

    // Record last login timestamp (fire and forget — don't block routing)
    // .catch() doesn't exist on PostgrestFilterBuilder — use .then(null, fn) instead
    sb.rpc('record_last_login').then(null, () => {});

    // Request notification permission after login
    if (typeof window.initNotifications === 'function') window.initNotifications();

    // Route by role then redirect — boot sequence handles rendering
    if (window.currentPermissions?.admin_panel) {
        window.location.href = '/admin.html';
    } else {
        window.location.href = '/';
    }
    return true;
};

// ─── LOAD TENANT CONTEXT ────────────────────────────────────────
// Fetches tenant_id, role, permissions, feature_flags for the
// logged-in user. For staff, checks allowed_users whitelist.
window.loadTenantContext = async function() {
    const uid   = window.currentUser?.id;
    const email = window.currentUser?.email;
    if (!uid) return false;

    // Get profile (includes tenant_id)
    let { data: profile } = await sb.from('profiles')
        .select('*, tenant:tenants(id, school_name, principal_name)')
        .eq('id', uid)
        .maybeSingle();

    // If no profile with tenant_id → check allowed_users whitelist
    if (!profile?.tenant_id && email) {
        const { data: allowed } = await sb.from('allowed_users')
            .select('*, tenant:tenants(id, school_name, principal_name)')
            .eq('email', email)
            .is('deleted_at', null)
            .maybeSingle();

        if (!allowed) {
            window.authBlockReason = 'not_registered';
            return false;
        }
        if (!allowed.approved) {
            window.authBlockReason = 'pending_approval';
            return false;
        }

        // Found in whitelist — create/update profile with tenant context
        await sb.from('profiles').upsert({
            id: uid,
            full_name: window.currentUser?.user_metadata?.full_name || allowed.full_name,
            email,
            tenant_id:   allowed.tenant_id,
            designation: allowed.designation,
            department:  allowed.department
        }, { onConflict: 'id' });

        // Reload profile now that tenant_id is set
        const { data: refreshed } = await sb.from('profiles')
            .select('*, tenant:tenants(id, school_name, principal_name)')
            .eq('id', uid)
            .maybeSingle();
        profile = refreshed;
    }

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
    // Clear tenant context then redirect to login
    // Use location.href so it works from any page (admin.html, index, etc.)
    window.location.href = '/';
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
                    <p class="text-sm mt-2" style="color:var(--text-secondary);">
                        Principal forgot password?
                        <a href="#" id="forgotLink" class="font-bold" style="color:var(--accent);">
                            Reset via email →
                        </a>
                    </p>
                </div>

                <div id="resetBox" style="display:none;padding:14px;background:var(--bg-body);border-radius:12px;border:1px solid var(--border-color);margin-top:8px;">
                    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Enter your email. Reset link is only sent to Principal accounts.</p>
                    <input id="resetEmail" type="email" placeholder="Principal email address"
                        class="ui-input w-full px-4 py-3 rounded-xl border"
                        style="border-color:var(--border-color);margin-bottom:10px;">
                    <button id="resetBtn"
                        class="w-full py-2 rounded-xl text-white font-bold"
                        style="background:var(--accent);font-size:13px;">
                        Send Reset Link
                    </button>
                    <div id="resetMsg" style="font-size:12px;text-align:center;margin-top:8px;min-height:16px;"></div>
                </div>
            </div>
        </div>
    </div>`;

    document.getElementById('forgotLink').onclick = (e) => {
        e.preventDefault();
        const box = document.getElementById('resetBox');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
        if (box.style.display === 'block') {
            const em = document.getElementById('email').value.trim();
            if (em) document.getElementById('resetEmail').value = em;
        }
    };

    document.getElementById('resetBtn').onclick = async () => {
        const btn = document.getElementById('resetBtn');
        const msg = document.getElementById('resetMsg');
        const email = document.getElementById('resetEmail').value.trim();
        if (!email) { msg.style.color='var(--accent)'; msg.textContent='Enter your email first.'; return; }

        btn.disabled = true;
        btn.textContent = 'Checking...';
        msg.textContent = '';

        // Step 1: find the profile by email
        const { data: profile } = await sb.from('profiles')
            .select('id, role')
            .eq('email', email)
            .maybeSingle();

        if (!profile) {
            msg.style.color = '#ef4444';
            msg.textContent = 'No account found with that email.';
            btn.disabled = false; btn.textContent = 'Send Reset Link';
            return;
        }

        // Step 2: check if this user is a principal via user_roles table
        // (profiles.role is not reliably set — role authority is user_roles → roles)
        let isPrincipal = (profile.role || '').toLowerCase() === 'principal';

        if (!isPrincipal) {
            const { data: ur } = await sb.from('user_roles')
                .select('role_id, roles(name)')
                .eq('user_id', profile.id)
                .maybeSingle();
            isPrincipal = (ur?.roles?.name || '').toLowerCase() === 'principal';
        }

        if (!isPrincipal) {
            msg.style.color = '#ef4444';
            msg.textContent = 'This option is only for the Principal account. Other staff — contact your Principal to reset your password.';
            btn.disabled = false; btn.textContent = 'Send Reset Link';
            return;
        }

        btn.textContent = 'Sending...';
        const { error } = await sb.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/index.html'
        });
        if (error) {
            msg.style.color = '#ef4444';
            msg.textContent = error.message;
        } else {
            msg.style.color = '#16a34a';
            msg.textContent = 'Reset link sent! Check your email inbox.';
        }
        btn.disabled = false; btn.textContent = 'Send Reset Link';
    };

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
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket mr-2"></i>Login';
            // Show specific message based on block reason
            if (window.authBlockReason === 'not_registered') {
                msg.innerHTML = '⛔ Your account is not registered.<br><span style="font-size:11px;">Contact your Principal to get access.</span>';
            } else if (window.authBlockReason === 'pending_approval') {
                msg.innerHTML = '⏳ Your account is pending approval.<br><span style="font-size:11px;">Contact your Principal to get access.</span>';
            } else {
                const toast = document.querySelector('.center-toast');
                if (!toast) msg.textContent = 'Wrong email or password. Please try again.';
            }
        }
    };
};
