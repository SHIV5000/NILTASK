/**
 * Retired Activity presentation shim.
 *
 * Desktop Activity markup, filters, refresh ownership and styling now live
 * directly in js/ui-feed.js. Keeping this file as a harmless module preserves
 * the existing HTML load path while eliminating function wrappers and the
 * former document.body MutationObserver.
 */
window.NILTASK_ACTIVITY_UI_VERSION = 'retired-source-owned-v1';
