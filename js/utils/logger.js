// js/utils/logger.js — self-hosted logger: localStorage buffer + Supabase sync
const MAX_LOCAL   = 1000;   // localStorage ring-buffer size
const BATCH_LIMIT = 50;     // max pending entries before forced flush
const FLUSH_MS    = 30000;  // flush info/debug to Supabase every 30s
const STORAGE_KEY = 'niltask_logs';

// Unique per page-load — groups all logs from one browser session
const SESSION_ID = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

class Logger {
    constructor() {
        this.logs      = this._load() || [];  // localStorage ring-buffer (local view)
        this.isDebug   = new URLSearchParams(window.location.search).has('debug');
        this._sb       = null;     // set by init() after login
        this._userId   = null;
        this._tenantId = null;
        this._pending  = [];       // buffered info/debug rows awaiting flush
        this._timer    = null;
    }

    // ── Called after login when Supabase client + user context are ready ──
    init(sb, { userId, tenantId }) {
        this._sb       = sb;
        this._userId   = userId;
        this._tenantId = tenantId;

        // Flush on tab hide / close
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') this.flush();
        });

        // Periodic batch flush
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

        // Local ring-buffer
        this.logs.push(entry);
        if (this.logs.length > MAX_LOCAL) this.logs.shift();
        this._save();

        if (this.isDebug) {
            const styles = { debug:'color:gray', info:'color:#38bdf8', warn:'color:orange', error:'color:red' };
            console.log(`%c[${level.toUpperCase()}] ${category}: ${message}`, styles[level] || '', data);
        }

        // Supabase sync (only after init)
        if (this._sb) {
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
                // Immediate insert — don't lose errors
                this._sb.from('app_logs').insert(row).then(null, () => {});
            } else {
                // Batch for periodic flush
                this._pending.push(row);
                if (this._pending.length >= BATCH_LIMIT) this.flush();
            }
        }
    }

    // ── Flush pending info/debug batch to Supabase ────────────────
    async flush() {
        if (!this._sb || !this._pending.length) return;
        const batch = this._pending.splice(0);
        try {
            await this._sb.from('app_logs').insert(batch);
        } catch { /* non-fatal — data still in localStorage */ }
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

    // ── Local storage helpers ─────────────────────────────────────
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
