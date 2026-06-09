export let currentUser = null;
export let currentRoom = 'general';
export let messageSubscription = null;
export let taskSubscription = null;
export let assigneeSubscription = null;
export let trailSubscription = null;
export let notificationSubscription = null;
export let bookmarkSubscription = null;

export function setCurrentUser(user) { currentUser = user; }
export function setCurrentRoom(room) { currentRoom = room; }
// Subscription setters similarly