const CACHE_NAME = 'talk-task-cache-v2';
const urlsToCache = [
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/react@18/umd/react.development.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone/babel.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) return response;
            return fetch(event.request);
        })
    );
});

// CRITICAL FIX: Wrap showNotification in event.waitUntil to prevent premature OS termination
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const title = event.data.title || 'Talk & Task Alert';
        const options = {
            body: event.data.body,
            icon: 'https://cdn-icons-png.flaticon.com/512/825/825590.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/825/825590.png',
            vibrate: [200, 100, 200, 100, 200],
            requireInteraction: true // Forces the notification to stay on screen until dismissed
        };
        
        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    }
});

// Handle clicking on the notification to bring the app to the front
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
