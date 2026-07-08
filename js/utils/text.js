/**
 * CANONICAL text helpers — single source of truth (Phase 3 de-duplication).
 *
 * Before this file there were FOUR escape variants and FOUR strip variants
 * scattered across shared.js, ui-core.js, mobile.js, ui-feed.js and
 * notifications.js — each handling entities slightly differently, which is why
 * "&nbsp;"/"&amp;" leaks kept getting fixed in one place but not another.
 *
 * Loaded as a CLASSIC script BEFORE the module scripts so window.* is defined
 * before any renderer calls it. Every old helper now delegates here.
 */
(function () {
    'use strict';

    // Full HTML-attribute-safe escape (escapes quotes too). Null-safe.
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Strip tags AND decode ALL HTML entities (via the DOM parser), then
    // normalise &nbsp;/whitespace. DOM-based so it handles every named/numeric
    // entity — not just the handful the old regex variants special-cased.
    function stripHtml(html) {
        if (html === null || html === undefined) return '';
        let text;
        try {
            const d = document.createElement('div');
            d.innerHTML = String(html);
            text = d.textContent || d.innerText || '';
        } catch (e) {
            // Non-DOM context fallback (e.g. worker): best-effort regex decode.
            text = String(html).replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        }
        return text.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Display snippet: strip + truncate with an ellipsis when longer than n.
    function snippet(html, n) {
        const t = stripHtml(html);
        const max = (typeof n === 'number' && n > 0) ? n : 60;
        return t.length > max ? t.substring(0, max) + '…' : t;
    }

    // Inline-safe snippet for embedding in onclick="…" attributes: additionally
    // strips quotes/backslashes then HTML-escapes. Legacy shape kept (60 + '...').
    function getSnippet(htmlStr) {
        const text = stripHtml(htmlStr).replace(/['"\\]/g, '');
        return escapeHtml(text).substring(0, 60) + '...';
    }

    // Safe to embed inside a SINGLE-QUOTED JS string that itself sits in an HTML
    // on* attribute (onclick="fn('...')"). escapeHtml is WRONG there: the HTML
    // parser decodes &#39; back to ' before the JS parser runs, letting a value
    // with a quote break out. This strips the breakout characters entirely.
    function escapeJs(str) {
        if (str === null || str === undefined) return '';
        // Strip only breakout chars (quotes, backslash, backtick, angle brackets,
        // CR/LF) — NOT spaces, so multi-word names stay intact.
        return String(str).replace(/["'`<>\r\n\\]/g, '');
    }

    window.escapeHtml = escapeHtml;
    window.stripHtml  = stripHtml;
    window.snippet    = snippet;
    window.getSnippet = getSnippet;
    window.escapeJs   = escapeJs;
})();
