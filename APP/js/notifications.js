import { sb } from './config.js';
import { currentUser, notificationSubscription, setNotificationSubscription } from './state.js';

export function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded shadow-lg z-50 animate-pulse';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

export function subscribeToNotifications() {
    if (notificationSubscription) notificationSubscription.unsubscribe();
    const sub = sb
        .channel('notifications-channel')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${currentUser.id}`
        }, (payload) => {
            showToast(payload.new.message);
        })
        .subscribe();
    setNotificationSubscription(sub);
}