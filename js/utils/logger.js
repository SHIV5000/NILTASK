// js/utils/logger.js — self-hosted in-app logger (ring buffer, localStorage)
const MAX_LOGS = 1000;
const STORAGE_KEY = 'niltask_logs';

class Logger {
    constructor() {
        this.logs = this._load() || [];
        this.isDebug = new URLSearchParams(window.location.search).has('debug');
    }

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
        this.logs.push(entry);
        if (this.logs.length > MAX_LOGS) this.logs.shift();
        this._save();
        if (this.isDebug) {
            const styles = { debug: 'color:gray', info: 'color:#38bdf8', warn: 'color:orange', error: 'color:red' };
            console.log(`%c[${level.toUpperCase()}] ${category}: ${message}`, styles[level] || '', data);
        }
    }

    debug(category, message, data) { this._log('debug', category, message, data); }
    info(category, message, data)  { this._log('info',  category, message, data); }
    warn(category, message, data)  { this._log('warn',  category, message, data); }
    error(category, message, data) { this._log('error', category, message, data); }

    logApi(endpoint, params, duration) {
        this.info('API', duration != null ? `${endpoint} (${Math.round(duration)}ms)` : endpoint, params);
    }

    logRealtime(event, payload) { this.info('REALTIME', event, payload); }
    logAction(action, data)     { this.info('ACTION',   action,  data);   }

    logError(error, context) {
        const msg = error?.message || String(error);
        this._log('error', 'ERROR', msg, { context, stack: error?.stack });
    }

    getLogs() { return this.logs; }

    clear() { this.logs = []; this._save(); }

    _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs)); } catch { /* quota exceeded */ }
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
}

const logger = new Logger();
window.logger = logger;
export default logger;
