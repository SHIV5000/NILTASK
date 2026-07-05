/**
 * NILTASK client-side storage engine (Dexie.js / IndexedDB).
 *
 * Purpose: a bigger, faster persistence layer for the per-room message caches
 * than localStorage (which is quota-limited and stores only ~50 messages/room).
 * Design: WRITE-THROUGH with an in-memory mirror in mobile.js — reads stay
 * synchronous (no call-site changes, no render stalls); Dexie persists larger
 * slices across sessions and hydrates the mirror at boot.
 *
 * Graceful degradation: if Dexie (CDN) or IndexedDB is unavailable, every API
 * resolves harmlessly and the app continues on its localStorage fallback.
 */
(function () {
    let db = null;
    try {
        if (window.Dexie) {
            db = new Dexie('NiltaskStore');
            db.version(1).stores({
                rooms: 'roomId',   // { roomId, msgs: [...], updated }
                kv:    'key',      // { key, value } — misc persisted state
            });
        }
    } catch (e) { db = null; }

    window.LocalDB = {
        ready: !!db,

        async putRoom(roomId, msgs) {
            if (!db || !roomId) return;
            try { await db.rooms.put({ roomId, msgs, updated: Date.now() }); } catch (e) {}
        },

        async getRoom(roomId) {
            if (!db || !roomId) return null;
            try { return (await db.rooms.get(roomId))?.msgs || null; } catch (e) { return null; }
        },

        // All room caches at once — used to hydrate the in-memory mirror at boot.
        async allRooms() {
            if (!db) return {};
            try {
                const rows = await db.rooms.toArray();
                const map = {};
                rows.forEach(r => { map[r.roomId] = r.msgs; });
                return map;
            } catch (e) { return {}; }
        },

        async kvSet(key, value) {
            if (!db) return;
            try { await db.kv.put({ key, value }); } catch (e) {}
        },

        async kvGet(key) {
            if (!db) return null;
            try { return (await db.kv.get(key))?.value ?? null; } catch (e) { return null; }
        },

        async clearAll() {
            if (!db) return;
            try { await db.rooms.clear(); await db.kv.clear(); } catch (e) {}
        },
    };
})();
