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

        const row = {
            level,
            category,
            message,
            data:       entry.data ? JSON.parse(entry.data) : null,
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
    }
    logRealtime(event, payload) { this.info('REALTIME', event, payload); }
    logAction(action, data)     { this.info('ACTION',   action,  data);  }
    logError(error, context) {
        const msg = error?.message || String(error);
        this._log('error', 'ERROR', msg, { context, stack: error?.stack });
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
export default logger;
