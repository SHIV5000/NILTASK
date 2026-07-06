// js/utils/logger.js — self-hosted logger: localStorage buffer + Supabase sync
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../shared.js';

const MAX_LOCAL   = 1000;  // localStorage ring-buffer size
const BATCH_LIMIT = 10;    // flush info/debug after 10 entries (was 50)
const FLUSH_MS    = 15000; // also flush every 15s (was 30s)
const STORAGE_KEY = 'niltask_logs';

// Unique per page-load — groups all logs from one browser session
const SESSION_ID = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

class Logger {
    constructor() {
        this.logs       = this._load() || [];
        this.isDebug    = new URLSearchParams(window.location.search).has('debug');
        this._sb        = null;
        this._userId    = null;
        this._tenantId  = null;
        this._authToken = null;  // stored for keepalive fetch on page close
        this._pending   = [];
        this._timer     = null;
        this._inited    = false;
    }

    // ── Called on every page boot after tenant context loads ──────
    init(sb, { userId, tenantId }) {
        // Guard against double-init on same page
        if (this._inited) return;
        this._inited   = true;
        this._sb       = sb;
        this._userId   = userId;
        this._tenantId = tenantId;

        // Grab auth token now and keep it fresh — needed for keepalive fetch
        sb.auth.getSession().then(({ data }) => {
            this._authToken = data?.session?.access_token || null;
        });
        sb.auth.onAuthStateChange((_event, session) => {
            this._authToken = session?.access_token || null;
        });

        // On tab hide / page close → guaranteed flush via keepalive fetch
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this._flushBeacon();
        });
        // Fallback for browsers that skip visibilitychange on close
        window.addEventListener('pagehide', () => this._flushBeacon(), { once: true });

        // Periodic flush for long-running sessions
        this._timer = setInterval(() => this.flush(), FLUSH_MS);
    }

    // ── Core log method ────────────────────────────────────────────
    _log(level, category, message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            data: data != null
                ? (typeof data === 'string' ? data : JSON.stringify(data))
                : null,
        };

        // Local ring-buffer (always, even before init)
        this.logs.push(entry);
        if (this.logs.length > MAX_LOCAL) this.logs.shift();
        this._save();

        if (this.isDebug) {
            const styles = { debug:'color:gray', info:'color:#38bdf8', warn:'color:orange', error:'color:red' };
            console.log(`%c[${level.toUpperCase()}] ${category}: ${message}`, styles[level] || '', data);
        }

        if (!this._sb) return; // not inited yet — localStorage only

        let rowData = entry.data ? JSON.parse(entry.data) : null;
        // Stamp warn/error rows with the running build version + device so remote
        // diagnosis can distinguish "bug in v74" from "stale v68 PWA on iOS".
        if (level === 'error' || level === 'warn') {
            const base = (rowData && typeof rowData === 'object' && !Array.isArray(rowData))
                ? rowData : (rowData != null ? { value: rowData } : {});
            base._ver = window.APP_VER || '?';
            base._ua  = (navigator.userAgent || '').slice(0, 160);
            rowData = base;
        }
        const row = {
            level,
            category,
            message,
            data:       rowData,
            tenant_id:  this._tenantId,
            user_id:    this._userId,
            session_id: SESSION_ID,
            page_url:   window.location.pathname,
        };

        if (level === 'error' || level === 'warn') {
            // Immediate insert — never batch errors
            this._sb.from('app_logs').insert(row).then(
                ({ error }) => { if (error) console.error('[Logger] immediate insert failed:', error.message, error.code); },
                (e) => console.error('[Logger] immediate insert exception:', e?.message)
            );
        } else {
            this._pending.push(row);
            if (this._pending.length >= BATCH_LIMIT) this.flush();
        }
    }

    // ── Normal async flush (periodic / on batch limit) ────────────
    async flush() {
        if (!this._sb || !this._pending.length) return;
        const batch = this._pending.splice(0);
        try {
            const { error } = await this._sb.from('app_logs').insert(batch);
            if (error) console.error('[Logger] flush insert failed:', error.message, error.code);
        } catch(e) { console.error('[Logger] flush exception:', e?.message); }
    }

    // ── Beacon flush — guaranteed delivery on page close ─────────
    // Uses fetch keepalive which survives page unload (unlike regular async fetch).
    // sendBeacon can't set Authorization headers so we use fetch+keepalive instead.
    _flushBeacon() {
        if (!this._pending.length || !this._authToken) {
            // Nothing pending or no token — try normal flush as best-effort
            this.flush();
            return;
        }
        const batch = this._pending.splice(0);
        try {
            fetch(`${SUPABASE_URL}/rest/v1/app_logs`, {
                method:    'POST',
                keepalive: true,           // survives page unload
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${this._authToken}`,
                    'apikey':        SUPABASE_ANON_KEY,
                    'Prefer':        'return=minimal',
                },
                body: JSON.stringify(batch),
            });
            // Fire-and-forget — keepalive means browser completes it after unload
        } catch {
            // Put rows back if fetch setup itself failed (shouldn't happen)
            this._pending.unshift(...batch);
        }
    }

    // ── Convenience methods ───────────────────────────────────────
    debug(category, message, data) { this._log('debug', category, message, data); }
    info(category, message, data)  { this._log('info',  category, message, data); }
    warn(category, message, data)  { this._log('warn',  category, message, data); }
    error(category, message, data) { this._log('error', category, message, data); }

    logApi(endpoint, params, duration) {
        this.info('API', duration != null ? `${endpoint} (${Math.round(duration)}ms)` : endpoint, params);
        // Surface slow queries as warnings (immediate insert + version stamp) so
        // delays are diagnosable from the server logs without console captures.
        if (duration != null && duration > 1500) {
            this.warn('SLOW', `${endpoint} took ${Math.round(duration)}ms`, params);
        }
    }
    logRealtime(event, payload) { this.info('REALTIME', event, payload); }
    logAction(action, data)     { this.info('ACTION',   action,  data);  }
    logError(error, context) {
        const msg = error?.message || String(error);
        this._log('error', 'ERROR', msg, { context, stack: error?.stack });
    }

    // ── Feature-specific diagnostics (reactions / replies / notifications) ──
    logReact(op, data)  { this.info('REACT', op, data); }
    logReply(op, data)  { this.info('REPLY', op, data); }
    logNotif(op, data)  { this.info('NOTIF', op, data); }
    // Realtime channel lifecycle — WARN on the failure states so reconnect storms
    // land in the server logs (immediate insert), INFO on healthy transitions.
    logRt(channel, status, data) {
        const bad = status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED';
        this._log(bad ? 'warn' : 'info', 'RT', `${channel}=${status}`, data);
    }
    // Uniform Supabase result logger — call after any insert/select/upsert/delete
    // to surface SILENT failures (e.g. RLS-blocked notification inserts). No-op on
    // success unless a duration is worth recording. Returns the error for chaining.
    sb(op, result, ctx) {
        const error = result?.error;
        if (error) {
            this.error('SUPABASE', `${op}: ${error.message}`,
                { code: error.code, details: error.details, hint: error.hint, ...ctx });
        }
        return error || null;
    }

    // ── Diagnose — call window.logger.diagnose() from DevTools ───
    async diagnose() {
        console.group('[Logger] Diagnosis');
        console.log('inited:',      this._inited);
        console.log('sb client:',   !!this._sb);
        console.log('userId:',      this._userId);
        console.log('tenantId:',    this._tenantId);
        console.log('authToken:',   this._authToken ? this._authToken.slice(0,20)+'…' : null);
        console.log('pending rows:', this._pending.length);
        console.log('localStorage entries:', this.logs.length);
        if (this._sb) {
            const { data, error } = await this._sb.from('app_logs').select('id').limit(1);
            console.log('app_logs table reachable:', error ? '❌ ' + error.message : '✅ yes, row count ≥ ' + (data?.length || 0));
            const { data: session } = await this._sb.auth.getSession();
            console.log('active session:', session?.session?.user?.email || '❌ no session');
        }
        console.groupEnd();
    }

    // ── Local helpers ─────────────────────────────────────────────
    getLogs() { return this.logs; }
    clear()   { this.logs = []; this._save(); }
    _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs)); } catch { /* quota */ }
    }
    _load() {
        try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; }
        catch { return null; }
    }
}

const logger = new Logger();
window.logger = logger;

// ── Global capture — the two error channels that were previously invisible ──
// 1. Unhandled promise rejections (most Supabase/async failures surface here).
window.addEventListener('unhandledrejection', (e) => {
    try {
        const r = e.reason;
        logger.error('UNHANDLED', r?.message || String(r), { stack: r?.stack?.slice(0, 800) });
    } catch { /* never let the handler itself throw */ }
});
// 2. Uncaught synchronous errors, with source location (web pages had no listener).
window.addEventListener('error', (e) => {
    try {
        if (!e?.message) return;
        const where = e.filename ? `${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : '?';
        logger.error('UNCAUGHT', e.message, { at: where, stack: e.error?.stack?.slice(0, 800) });
    } catch { }
});
// 3. Mirror console.error / console.warn to the server logs so anything printed
//    anywhere (our code OR a library) is diagnosable from a log dump — not just
//    the device console. The original console methods still run (dev sees them).
//    console.log is intentionally NOT mirrored (too high-volume / costly).
['error', 'warn'].forEach((lvl) => {
    const orig = console[lvl] ? console[lvl].bind(console) : () => {};
    console[lvl] = (...args) => {
        try {
            const msg = args.map(a => {
                if (a instanceof Error) return a.message + (a.stack ? ' | ' + a.stack.slice(0, 300) : '');
                if (typeof a === 'object') { try { return JSON.stringify(a).slice(0, 500); } catch { return String(a); } }
                return String(a);
            }).join(' ').slice(0, 900);
            // Skip the logger's own failure prints to avoid an infinite loop.
            if (msg && !msg.startsWith('[Logger]')) logger._log(lvl === 'warn' ? 'warn' : 'error', 'CONSOLE', msg);
        } catch { /* never let interception throw */ }
        orig(...args);
    };
});

export default logger;
