import { sb } from './config.js';
import { currentUser, setCurrentUser } from './state.js';

export function getCurrentUser() { return currentUser; }

export async function ensureProfile() {
    if (!currentUser) return;
    const { data: existing } = await sb
        .from('profiles')
        .select('id')
        .eq('id', currentUser.id)
        .maybeSingle();
    if (!existing) {
        await sb.from('profiles').insert({
            id: currentUser.id,
            email: currentUser.email,
            full_name: currentUser.email.split('@')[0],
            role: 'teacher'
        });
    }
}

export async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.user) {
        setCurrentUser(data.user);
        await ensureProfile();
    }
    return { error };
}

export async function signUp(email, password) {
    const { error } = await sb.auth.signUp({ email, password });
    return { error };
}

export async function logout() {
    await sb.auth.signOut();
    setCurrentUser(null);
}
