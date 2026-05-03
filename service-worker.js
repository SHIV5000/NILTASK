const CACHE_NAME = 'talk-task-cache-v4';
const urlsToCache = [
  './index.html',
  './manifest.json'
];

self.addEventListener('install', event => {
    self.skipWaiting(); // Forces the new worker to install immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim()); // Takes control of the browser immediately
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
            return fetch(event.request);
        }).catch(() => {
            return null; 
        })
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const title = event.data.title || 'Talk & Task Alert';
        const options = {
            body: event.data.body,
            icon: 'https://cdn-icons-png.flaticon.com/512/825/825590.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/825/825590.png',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true 
        };
        
        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            if (windowClients.length > 0) {
                let client = windowClients[0];
                for (let i = 0; i < windowClients.length; i++) {
                    if (windowClients[i].focused) { client = windowClients[i]; break; }
                }
                return client.focus();
            } else {
                return clients.openWindow('/');
            }
        })
    );
});
