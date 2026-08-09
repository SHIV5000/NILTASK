// Classic-script dynamic-import compatibility shim.
// js/native.js is a classic script, so its relative import() URLs resolve from
// the document root on web previews. Keep this root entry stable and delegate
// to the actual desktop module under /js.
import './js/desktop-speed-first.js?v=2';
