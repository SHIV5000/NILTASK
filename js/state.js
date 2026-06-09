// Global state variables
export let currentUser = null;
export let currentRoom = 'general';

// Subscriptions
export let messageSubscription = null;
export let taskSubscription = null;
export let assigneeSubscription = null;
export let trailSubscription = null;
export let notificationSubscription = null;
export let bookmarkSubscription = null;

// Setter functions
export function setCurrentUser(user) { currentUser = user; }
export function setCurrentRoom(room) { currentRoom = room; }
export function setMessageSubscription(sub) { messageSubscription = sub; }
export function setTaskSubscription(sub) { taskSubscription = sub; }
export function setAssigneeSubscription(sub) { assigneeSubscription = sub; }
export function setTrailSubscription(sub) { trailSubscription = sub; }
export function setNotificationSubscription(sub) { notificationSubscription = sub; }
export function setBookmarkSubscription(sub) { bookmarkSubscription = sub; }
