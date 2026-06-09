import { sb } from './config.js';
import { currentUser } from './state.js';
import { escapeHtml } from './utils.js';

export async function toggleBookmark(messageId, messageText, btnElement) {
    const { data: existing } = await sb
        .from('bookmarks')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('message_id', messageId)
        .maybeSingle();
    if (existing) {
        await sb.from('bookmarks').delete().eq('id', existing.id);
        btnElement.classList.remove('text-yellow-500');
        btnElement.classList.add('text-gray-400');
    } else {
        await sb.from('bookmarks').insert({
            user_id: currentUser.id,
            message_id: messageId
        });
        btnElement.classList.remove('text-gray-400');
        btnElement.classList.add('text-yellow-500');
    }
    loadBookmarks();
}

export async function loadBookmarks() {
    const { data: bookmarks, error } = await sb
        .from('bookmarks')
        .select('*, messages(id, text, room_id, profiles(full_name, email))')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    const container = document.getElementById('bookmarksList');
    if (!container) return;
    if (error || !bookmarks || bookmarks.length === 0) {
        container.innerHTML = '<div class="text-xs text-gray-500">No saved messages</div>';
        return;
    }
    container.innerHTML = bookmarks.map(bm => {
        const msg = bm.messages;
        const sender = msg?.profiles?.full_name || msg?.profiles?.email || 'Unknown';
        return `
            <div class="border rounded p-2 text-xs bg-gray-50">
                <div class="font-semibold">${escapeHtml(sender)}</div>
                <div class="truncate">${escapeHtml(msg?.text || '')}</div>
                <button class="text-blue-500 text-xs mt-1 view-message-btn" data-message-id="${msg?.id}" data-room-id="${msg?.room_id}">View in chat →</button>
            </div>
        `;
    }).join('');
    document.querySelectorAll('.view-message-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const roomId = btn.getAttribute('data-room-id');
            if (roomId) {
                // Use the global function defined in main.js
                if (window.setCurrentRoomAndRefresh) {
                    window.setCurrentRoomAndRefresh(roomId);
                } else {
                    console.warn('setCurrentRoomAndRefresh not available');
                }
            }
        });
    });
}

export function subscribeToBookmarks() {
    if (window.bookmarkSubscription) window.bookmarkSubscription.unsubscribe();
    const sub = sb
        .channel('bookmarks-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks', filter: `user_id=eq.${currentUser.id}` }, () => {
            loadBookmarks();
        })
        .subscribe();
    window.bookmarkSubscription = sub;
}
