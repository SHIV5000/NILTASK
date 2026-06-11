import { sb } from './shared.js';

window.signIn = async function(email, pwd) { 
    const {data, error} = await sb.auth.signInWithPassword({email, password: pwd}); 
    if(!error && data?.user) { 
        window.currentUser = data.user; 
        await window.ensureProfile(); 
        window.renderMainApp(); 
        window.startSubscriptions(); 
        return true; 
    } 
    return false; 
};

window.signUp = async function(email, pwd) { 
    const {data, error} = await sb.auth.signUp({email, password: pwd}); 
    if(error) throw error; 
    window.showCenterToast('Sign up successful! Please wait for admin approval.', 'fa-solid fa-envelope', 'text-blue-400'); 
};

window.logout = async function() { 
    await sb.auth.signOut(); 
    window.currentUser = null; 
    window.renderAuthScreen(); 
};

window.ensureProfile = async function() { 
    if(!window.currentUser) return; 
    const {data:ex} = await sb.from('profiles').select('id').eq('id', window.currentUser.id).maybeSingle(); 
    if(!ex) await sb.from('profiles').insert({id: window.currentUser.id, email: window.currentUser.email, full_name: window.currentUser.email.split('@')[0], role: 'teacher'}); 
};

window.renderAuthScreen = function() { 
    window.applyTheme();
    document.getElementById('root').innerHTML = `
        <div class="min-h-screen w-full flex items-center justify-center bg-white" style="background-color: var(--bg-body);">
            <div class="modal-content p-10 rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden bg-white" style="background-color: var(--bg-sidebar);">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold tracking-tight" style="color: var(--text-primary);">MPGS TaskFlow</h1>
                    <p class="text-sm mt-2" style="color: var(--text-secondary);">Enterprise Communication Portal</p>
                </div>
                <div class="space-y-4">
                    <input id="email" placeholder="Email Address" class="ui-input w-full px-4 py-3 rounded-xl border border-gray-300">
                    <div class="relative">
                        <input id="password" type="password" placeholder="Password (Min 6 chars)" class="ui-input w-full px-4 py-3 rounded-xl border border-gray-300 pr-10">
                        <i class="fa-solid fa-eye absolute right-4 top-4 text-gray-400 cursor-pointer hover:text-gray-600" id="togglePassword"></i>
                    </div>
                    <div class="flex gap-3 pt-2">
                        <button id="loginBtn" class="flex-1 py-3 px-4 rounded-xl text-white font-medium shadow-md transition-colors" style="background-color: var(--accent);">Login</button>
                        <button id="signupBtn" class="flex-1 py-3 px-4 rounded-xl border font-medium shadow-sm transition-colors" style="border-color: var(--accent); color: var(--accent);">Sign Up</button>
                    </div>
                    <div id="authMsg" class="mt-4 text-center text-red-500 text-sm font-medium h-5"></div>
                </div>
            </div>
        </div>`; 
    
    document.getElementById('togglePassword').onclick = () => {
        const pwd = document.getElementById('password');
        const icon = document.getElementById('togglePassword');
        if (pwd.type === 'password') { pwd.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
        else { pwd.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
    };

    document.getElementById('loginBtn').onclick = async () => { 
        const ok = await window.signIn(document.getElementById('email').value, document.getElementById('password').value); 
        if(!ok) document.getElementById('authMsg').innerText = 'Invalid credentials'; 
    };
    
    document.getElementById('signupBtn').onclick = async () => { 
        try { 
            const email = document.getElementById('email').value;
            const pwd = document.getElementById('password').value;
            if(pwd.length < 6) throw new Error("Password must be at least 6 characters.");
            if(!email) throw new Error("Email is required.");
            await window.signUp(email, pwd); 
        } catch(e) { document.getElementById('authMsg').innerText = e.message; } 
    };
};
