/* NILTASK Mobile + Tablet Final UI v211
 * Approved simulation parity layer.
 * UI-only: reuses mobile.js + workflow v209 + role parity v210 business/data owners.
 * Phone: top brand + five bottom tabs. Tablet: left rail + chat directory + work pane.
 */
(function () {
  'use strict';

  if (window.__NFA_MOBILE_FINAL_UI_V211__) return;
  window.__NFA_MOBILE_FINAL_UI_V211__ = true;
  window.NILTASK_MOBILE_FINAL_UI_VERSION = 'v211';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  let observer = null;
  let timer = null;
  let directoryHtml = '';
  let colourIndex = 0;
  const colourCycle = ['#800000','#006400','#00008b'];

  const isRuntime = () => window.IS_NATIVE === true || window.innerWidth <= 768 ||
    (!!window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 1366);
  const isTablet = () => isRuntime() && window.innerWidth > 768;
  const screen = () => $('#mStage > .mScr')?.dataset?.screen || '';

  function injectCss() {
    if ($('#nfa-final-ui-v211-css')) return;
    const style = document.createElement('style');
    style.id = 'nfa-final-ui-v211-css';
    style.textContent = `
      #mobileApp.nfa-final-ui-v211{
        --nfa-accent:#4f46e5;--nfa-accent-dark:#3730a3;--nfa-ink:#101828;
        --nfa-muted:#667085;--nfa-line:#e4e7ec;--nfa-bg:#f4f6fb;
        inset:0!important;background:var(--nfa-bg)!important;color:var(--text-primary,#101828);
        overflow:hidden!important;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
      }
      #mobileApp.nfa-final-phone{
        display:grid!important;grid-template-columns:minmax(0,1fr)!important;
        grid-template-rows:54px minmax(0,1fr) calc(64px + env(safe-area-inset-bottom,0px))!important;
      }
      #mobileApp.nfa-final-tablet{
        display:grid!important;grid-template-columns:72px 300px minmax(0,1fr)!important;
        grid-template-rows:54px minmax(0,1fr)!important;
      }
      #mobileApp.nfa-final-ui-v211 #mSB{
        position:relative!important;inset:auto!important;width:auto!important;height:54px!important;min-height:54px!important;
        display:flex!important;align-items:center!important;gap:8px!important;padding:7px 11px!important;
        background:var(--bg-body,#fff)!important;border-bottom:1px solid var(--border-color,#e4e7ec)!important;
        box-shadow:none!important;z-index:30!important;overflow:visible!important;
      }
      #mobileApp.nfa-final-phone #mSB{grid-column:1;grid-row:1}
      #mobileApp.nfa-final-tablet #mSB{grid-column:3;grid-row:1}
      #mobileApp.nfa-final-ui-v211 #mStage{
        position:relative!important;inset:auto!important;min-width:0!important;min-height:0!important;height:auto!important;width:auto!important;
        background:var(--bg-body,#f4f6fb)!important;overflow:hidden!important;
      }
      #mobileApp.nfa-final-phone #mStage{grid-column:1;grid-row:2}
      #mobileApp.nfa-final-tablet #mStage{grid-column:3;grid-row:2}
      #mobileApp.nfa-final-ui-v211 #mNav{position:relative!important;inset:auto!important;z-index:31!important;box-shadow:none!important}
      #mobileApp.nfa-final-phone #mNav{
        grid-column:1;grid-row:3;width:auto!important;height:auto!important;display:grid!important;
        grid-template-columns:repeat(5,minmax(0,1fr))!important;background:var(--bg-body,#fff)!important;
        border-top:1px solid var(--border-color,#e4e7ec)!important;padding:0 2px env(safe-area-inset-bottom,0px)!important;
      }
      #mobileApp.nfa-final-phone #mNav .mn-btn{
        min-width:0!important;border:0!important;background:transparent!important;color:var(--text-secondary,#667085)!important;
        display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;
        padding:6px 2px 5px!important;font-size:8px!important;font-weight:850!important;border-radius:0!important;
      }
      #mobileApp.nfa-final-phone #mNav .mn-btn>i{font-size:17px!important;line-height:1!important}
      #mobileApp.nfa-final-phone #mNav .mn-lbl{font-size:8px!important;font-weight:850!important}
      #mobileApp.nfa-final-phone #mNav .mn-btn.active{color:var(--nfa-accent)!important}
      #mobileApp.nfa-final-tablet #mNav{
        grid-column:1;grid-row:1 / span 2;width:72px!important;height:100%!important;display:flex!important;
        flex-direction:column!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;
        padding:76px 7px 12px!important;background:#1f2454!important;border:0!important;
      }
      #mobileApp.nfa-final-tablet #mNav:before{
        content:'N';position:absolute;top:14px;left:15px;width:42px;height:42px;border-radius:13px;background:#4f46e5;
        color:#fff;display:grid;place-items:center;font-size:16px;font-weight:900;
      }
      #mobileApp.nfa-final-tablet #mNav .mn-btn{
        width:55px!important;min-height:55px!important;flex:none!important;border:0!important;border-radius:12px!important;background:transparent!important;
        color:#c7d2fe!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;
        gap:4px!important;padding:7px 2px!important;
      }
      #mobileApp.nfa-final-tablet #mNav .mn-btn>i{font-size:17px!important}
      #mobileApp.nfa-final-tablet #mNav .mn-lbl{font-size:8px!important;font-weight:900!important}
      #mobileApp.nfa-final-tablet #mNav .mn-btn.active{background:rgba(255,255,255,.14)!important;color:#fff!important}
      #mobileApp.nfa-final-ui-v211 #mSBInfo{display:none!important}
      #mobileApp.nfa-final-ui-v211 #mSBAdmin,#mobileApp.nfa-final-ui-v211 #mSBLens,#mobileApp.nfa-final-ui-v211 #mSBTheme,#mobileApp.nfa-final-ui-v211 #mSBDnd,#mobileApp.nfa-final-ui-v211 #mSB>button[title="Sign out"]{display:none!important}
      #mobileApp.nfa-final-ui-v211 #mSBBell{
        margin-left:auto!important;width:36px!important;height:36px!important;min-width:36px!important;border:0!important;border-radius:50%!important;
        background:var(--bg-sidebar,#f2f4f7)!important;color:var(--text-primary,#344054)!important;display:grid!important;place-items:center!important;
      }
      #mobileApp.nfa-final-ui-v211 #mSBBell i{font-size:15px!important}
      #nfaFinalBrand{display:flex;align-items:center;gap:9px;min-width:0;flex:1}
      #nfaFinalLogo{width:34px;height:34px;border-radius:10px;background:linear-gradient(145deg,#4f46e5,#7c3aed);color:#fff;display:grid;place-items:center;font-size:15px;font-weight:900;flex:none}
      #nfaFinalBrandCopy{min-width:0;line-height:1.15}#nfaFinalBrandCopy b{display:block;font-size:13px;color:var(--text-primary,#101828)}
      #nfaFinalSubtitle{display:block;margin-top:3px;font-size:9px;color:var(--text-secondary,#667085);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52vw}
      #mobileApp.nfa-final-ui-v211 .mScr{height:100%!important;background:var(--bg-body,#f4f6fb)!important;overflow:hidden!important}
      #mobileApp.nfa-final-ui-v211 .mScr-inner{height:100%!important;overflow-y:auto!important;padding:10px 10px 24px!important;background:var(--bg-body,#f4f6fb)!important}
      #mobileApp.nfa-final-ui-v211 .m-hdr{min-height:48px!important;padding:7px 6px!important;border-bottom:1px solid var(--border-color,#e4e7ec)!important;background:var(--bg-body,#fff)!important}
      #mobileApp.nfa-final-ui-v211 .m-hdr-plain{margin:-10px -10px 10px!important;padding:9px 12px!important}
      #mobileApp.nfa-final-ui-v211 .m-htitle{font-size:13px!important;font-weight:850!important;color:var(--text-primary,#101828)!important}
      #mobileApp.nfa-final-ui-v211 .m-hsubtitle{font-size:9px!important}
      #mobileApp.nfa-final-ui-v211 .m-back{width:32px!important;height:32px!important;min-width:32px!important;background:#eef2ff!important;color:#4338ca!important;border-radius:50%!important}
      #mobileApp.nfa-final-ui-v211 .m-sl{margin:8px 2px 7px!important;padding:0!important;font-size:9px!important;color:var(--text-secondary,#667085)!important;text-transform:uppercase!important;letter-spacing:.08em!important;font-weight:900!important}
      #mobileApp.nfa-final-ui-v211 .m-row{display:flex!important;align-items:center!important;gap:10px!important;margin:0 0 9px!important;padding:11px!important;border:1px solid var(--border-color,#e4e7ec)!important;border-radius:14px!important;background:var(--card-bg,#fff)!important;box-shadow:0 2px 7px rgba(16,24,40,.035)!important;min-height:62px!important}
      #mobileApp.nfa-final-ui-v211 .m-ri{min-width:0!important;flex:1!important;cursor:pointer!important}
      #mobileApp.nfa-final-ui-v211 .m-rn{font-size:11px!important;font-weight:850!important;color:var(--text-primary,#101828)!important}
      #mobileApp.nfa-final-ui-v211 .m-rs{font-size:8.5px!important;color:var(--text-secondary,#667085)!important;margin-top:3px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      #mobileApp.nfa-final-ui-v211 .m-av{width:36px!important;height:36px!important;min-width:36px!important;border-radius:50%!important}
      #mobileApp.nfa-final-ui-v211 .m-av.sq{border-radius:50%!important}
      #mobileApp.nfa-final-ui-v211 .nfa-chat-tools{padding:0 2px 8px!important;margin:0!important;background:transparent!important}
      #mobileApp.nfa-final-ui-v211 .nfa-chat-tools b{font-size:15px!important;color:var(--text-primary,#101828)!important}
      #mobileApp.nfa-final-ui-v211 .nfa-quick-btn{border-radius:10px!important;font-size:9px!important;padding:7px 9px!important}
      #mobileApp.nfa-final-ui-v211 .mFlex{height:100%!important;min-height:0!important;background:var(--bg-body,#f4f6fb)!important}
      #mobileApp.nfa-final-ui-v211 .m-msgs{background:var(--bg-body,#f4f6fb)!important;padding:10px 10px 8px!important}
      #mobileApp.nfa-final-ui-v211 .m-bubble-row{gap:7px!important;margin-bottom:7px!important}
      #mobileApp.nfa-final-ui-v211 .m-bubble{border:1px solid var(--border-color,#e4e7ec)!important;border-radius:6px 15px 15px 15px!important;box-shadow:none!important;padding:9px 10px!important}
      #mobileApp.nfa-final-ui-v211 .m-bubble.snt{border-radius:15px 6px 15px 15px!important}
      #mobileApp.nfa-final-ui-v211 .m-bmeta{font-size:8px!important;color:var(--text-secondary,#98a2b3)!important}
      #mobileApp.nfa-final-ui-v211 .m-btext{font-size:10.5px!important;line-height:1.48!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-bubble{border-left:4px solid var(--nfa-accent)!important;background:color-mix(in srgb,var(--nfa-accent) 4%,var(--card-bg,#fff))!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-meta{margin-top:7px!important;padding-top:7px!important;gap:5px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-pill{font-size:8px!important;padding:4px 7px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-actions{gap:11px!important;margin-top:7px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-link{font-size:8px!important;font-weight:900!important;color:var(--text-secondary,#667085)!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-bookmark.on{color:#d97706!important}
      #mobileApp.nfa-final-ui-v211 .nfa-inline-thread{margin:2px 10px 10px 35px!important;padding-left:8px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-inline-card{border-radius:12px!important;padding:8px 9px!important;background:var(--card-bg,#fff)!important}
      #mobileApp.nfa-final-ui-v211 .nfa-inline-head{font-size:8px!important}.nfa-final-ui-v211 .nfa-inline-text{font-size:9.5px!important}
      #mobileApp.nfa-final-ui-v211 .m-composer{flex-wrap:wrap!important;align-items:flex-end!important;gap:6px!important;padding:7px 8px 8px!important;background:var(--bg-body,#fff)!important;border-top:1px solid var(--border-color,#e4e7ec)!important;box-shadow:none!important}
      #mobileApp.nfa-final-ui-v211 .m-composer.nfa-task-mode{border-top:2px solid #a5b4fc!important;background:color-mix(in srgb,#eef2ff 34%,var(--bg-body,#fff))!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-context{flex:0 0 100%!important;padding:2px 2px 6px!important;margin:0 0 1px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-context-head{font-size:9px!important;color:#3730a3!important}.nfa-final-ui-v211 .nfa-task-context-head button{font-size:17px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-actionbar{gap:5px!important;padding:6px 0 1px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-chip{font-size:8px!important;padding:6px 8px!important;border-radius:999px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-task-extra{flex:0 0 100%!important;width:100%!important}.nfa-final-ui-v211 .nfa-task-extra select,.nfa-final-ui-v211 .nfa-task-extra input{font-size:9px!important;padding:8px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-final-formatbar{flex:0 0 100%;width:100%;display:flex;align-items:center;gap:4px;overflow-x:auto;padding:2px 0 1px;scrollbar-width:none}
      #mobileApp.nfa-final-ui-v211 .nfa-final-formatbar::-webkit-scrollbar{display:none}
      #mobileApp.nfa-final-ui-v211 .nfa-final-fmt{min-width:28px;height:28px;border:1px solid var(--border-color,#d0d5dd);border-radius:8px;background:var(--card-bg,#fff);color:var(--text-primary,#344054);font-size:11px;font-weight:850;display:grid;place-items:center;padding:0 6px}
      #mobileApp.nfa-final-ui-v211 .m-ce-wrap{flex:1 1 180px!important;min-width:0!important;border:1px solid var(--border-color,#d0d5dd)!important;border-radius:12px!important;background:var(--card-bg,#fff)!important;min-height:40px!important}
      #mobileApp.nfa-final-ui-v211 .m-ce{font-size:11px!important;min-height:38px!important;max-height:88px!important;padding:10px 8px!important}
      #mobileApp.nfa-final-ui-v211 .m-cic{width:34px!important;min-width:34px!important;height:38px!important;border-radius:10px!important}
      #mobileApp.nfa-final-ui-v211 .m-sendbtn{width:38px!important;min-width:38px!important;height:38px!important;border-radius:11px!important;background:var(--nfa-accent)!important;color:#fff!important}
      #mobileApp.nfa-final-ui-v211 .nfa-selected-file{font-size:9px!important;border-radius:9px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-final-task-title{font-size:9px;color:var(--text-secondary,#667085);text-transform:uppercase;letter-spacing:.08em;font-weight:900;margin:3px 2px 8px}
      #mobileApp.nfa-final-ui-v211 .nfa-final-task-filters{display:flex;gap:6px;overflow-x:auto;margin:0 0 10px;padding:0 1px 2px;scrollbar-width:none}
      #mobileApp.nfa-final-ui-v211 .nfa-final-task-filters::-webkit-scrollbar{display:none}
      #mobileApp.nfa-final-ui-v211 .nfa-final-task-filter{white-space:nowrap;border:1px solid var(--border-color,#d0d5dd);background:var(--card-bg,#fff);color:var(--text-secondary,#475467);border-radius:999px;padding:7px 9px;font-size:8px;font-weight:900}
      #mobileApp.nfa-final-ui-v211 .nfa-final-task-filter.on{background:var(--nfa-accent);border-color:var(--nfa-accent);color:#fff}
      #mobileApp.nfa-final-ui-v211 .nfa-final-hide-task-selects{display:none!important}
      #mobileApp.nfa-final-ui-v211 .m-taskcard{background:var(--card-bg,#fff)!important;border:1px solid var(--border-color,#e4e7ec)!important;border-radius:15px!important;padding:12px!important;margin:0 0 9px!important;box-shadow:none!important}
      #mobileApp.nfa-final-ui-v211 .m-tc-title{font-size:11px!important;font-weight:850!important}.nfa-final-ui-v211 .m-tc-meta,.nfa-final-ui-v211 .m-tc-people{font-size:8.5px!important;color:var(--text-secondary,#667085)!important}
      #mobileApp.nfa-final-ui-v211 .m-taskcard:after{content:'Open in Chat';display:inline-flex;margin-top:8px;background:#ecfdf3;color:#067647;border-radius:999px;padding:4px 7px;font-size:8px;font-weight:900}
      #mobileApp.nfa-final-ui-v211 .nfa-settings-shortcuts{border-radius:15px!important;background:var(--card-bg,#fff)!important}
      #mobileApp.nfa-final-ui-v211 .nfa-settings-grid button{border-radius:11px!important;min-height:48px!important}
      #mobileApp.nfa-final-ui-v211 .nfa-activity{background:var(--bg-body,#f4f6fb)!important;padding-bottom:24px!important}.nfa-final-ui-v211 .nfa-activity-head{background:var(--bg-body,#fff)!important}.nfa-final-ui-v211 .nfa-acard{border-radius:14px!important}
      #mobileApp.nfa-final-ui-v211 #mSheet{z-index:200!important;grid-column:1/-1!important;grid-row:1/-1!important}
      #mobileApp.nfa-final-ui-v211 #mFmtPopup,#mobileApp.nfa-final-ui-v211 #mToast{z-index:260!important}
      #nfaTabletDirectory{display:none;background:#f8fafc;border-right:1px solid var(--border-color,#e4e7ec);overflow-y:auto;padding:14px;min-width:0}
      #mobileApp.nfa-final-tablet #nfaTabletDirectory{display:block;grid-column:2;grid-row:1 / span 2}
      #nfaTabletDirectory .nfa-side-section{font-size:9px;color:#667085;letter-spacing:.08em;text-transform:uppercase;font-weight:900;margin:4px 2px 8px}
      #nfaTabletDirectory .m-row{margin-bottom:9px!important;background:#fff!important;cursor:pointer!important}
      #nfaTabletDirectory .m-row *{pointer-events:none}
      #nfaTabletDirectory .nfa-side-empty{padding:24px 10px;text-align:center;color:#667085;font-size:11px}
      #mobileApp.nfa-final-tablet #mStage>.mScr[data-screen="home"]>.mScr-inner{display:none!important}
      #mobileApp.nfa-final-tablet .nfa-tablet-welcome{height:100%;display:grid;place-items:center;text-align:center;padding:30px;color:#667085;background:var(--bg-body,#f4f6fb)}
      #mobileApp.nfa-final-tablet .nfa-tablet-welcome b{display:block;color:#101828;font-size:16px;margin-bottom:5px}
      #mobileApp.nfa-final-tablet #mnActBadge{right:4px!important;top:2px!important}
      html[data-theme="dark"] #nfaTabletDirectory{background:#111318!important;border-color:#2b2f36!important}
      html[data-theme="dark"] #nfaTabletDirectory .m-row{background:#1e1e1e!important}
      @media(max-width:420px){#mobileApp.nfa-final-phone #mNav .mn-lbl{font-size:7.5px!important}#nfaFinalSubtitle{max-width:44vw}}
    `;
    document.head.appendChild(style);
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function ensureBrand() {
    const bar = $('#mSB');
    if (!bar) return;
    let brand = $('#nfaFinalBrand', bar);
    if (!brand) {
      brand = document.createElement('div');
      brand.id = 'nfaFinalBrand';
      brand.innerHTML = '<span id="nfaFinalLogo">N</span><span id="nfaFinalBrandCopy"><b>NILTASK</b><span id="nfaFinalSubtitle">Chats</span></span>';
      bar.prepend(brand);
    }
    const title = $('#mStage .m-hdr .m-htitle')?.textContent?.trim();
    const s = screen();
    const fallback = ({home:'Chats',tasks:'Tasks',activity:'Activity Feed',remind:'Reminders',settings:'Settings',dashboard:'Dashboard',marks:'Bookmarks'})[s] || 'NILTASK';
    setText($('#nfaFinalSubtitle'), title || fallback);
  }

  function exec(editor, cmd, value=null) {
    if (!editor) return;
    editor.focus();
    try { document.execCommand(cmd, false, value); } catch (_) {}
  }

  function ensureFormatBar(composer) {
    if (!composer || composer.querySelector('.nfa-final-formatbar')) return;
    const editor = $('.m-ce', composer);
    const wrap = $('.m-ce-wrap', composer);
    if (!editor || !wrap) return;
    const bar = document.createElement('div');
    bar.className = 'nfa-final-formatbar';
    bar.setAttribute('aria-label','Formatting toolbar');
    bar.innerHTML = `
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="bold"><b>B</b></button>
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="italic"><i>I</i></button>
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="underline"><u>U</u></button>
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="strikeThrough"><s>S</s></button>
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="colour"><u>A</u></button>
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="insertUnorderedList">•≡</button>
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="insertOrderedList">1.</button>
      <button type="button" class="nfa-final-fmt" data-nfa-fmt="removeFormat">T×</button>`;
    composer.insertBefore(bar, wrap);
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-nfa-fmt]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const cmd = b.dataset.nfaFmt;
      if (cmd === 'colour') {
        const c = colourCycle[colourIndex++ % colourCycle.length];
        b.style.color = c;
        exec(editor, 'foreColor', c);
      } else exec(editor, cmd);
    });
  }

  function ensureAllComposers() {
    $$('#mStage .m-composer').forEach(ensureFormatBar);
  }

  function patchHome() {
    if (screen() !== 'home') return;
    const root = $('#mStage > .mScr .mScr-inner');
    if (!root) return;
    $$('.m-sl', root).forEach(label => {
      const txt = (label.textContent || '').replace(/\s+/g,' ').trim().toUpperCase();
      if (txt.startsWith('DEPARTMENTS')) {
        const span = $('span', label);
        if (span) setText(span, 'GROUPS');
        else if (!label.querySelector('button')) setText(label, 'GROUPS');
      }
    });
    captureTabletDirectory(root);
  }

  function cleanClone(node) {
    node.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    node.querySelectorAll('button').forEach(btn => { if (!btn.closest('.m-row')) btn.remove(); });
    return node;
  }

  function captureTabletDirectory(root) {
    const holder = document.createElement('div');
    [...root.children].forEach(child => {
      if (child.classList?.contains('nfa-chat-tools')) return;
      if (child.classList?.contains('m-sl')) {
        const txt = (child.textContent || '').replace(/Manage/ig,'').trim();
        const h = document.createElement('div');
        h.className='nfa-side-section';
        h.textContent=/DIRECT MESSAGES/i.test(txt) ? 'DIRECT MESSAGES' : 'GROUPS';
        holder.appendChild(h);
        return;
      }
      if (child.classList?.contains('m-row')) holder.appendChild(cleanClone(child.cloneNode(true)));
    });
    const next = holder.querySelector('.m-row') ? holder.innerHTML : '';
    if (next && next !== directoryHtml) {
      directoryHtml = next;
      renderTabletDirectory();
    }
  }

  function ensureTabletDirectoryNode() {
    const app = $('#mobileApp'); if (!app) return null;
    let side = $('#nfaTabletDirectory', app);
    if (!side) {
      side = document.createElement('aside'); side.id='nfaTabletDirectory';
      const nav = $('#mNav', app); if (nav) nav.after(side); else app.prepend(side);
      side.addEventListener('click', e => {
        const row = e.target.closest('.m-row'); if (!row) return;
        e.preventDefault(); e.stopPropagation();
        const dm = row.matches('[data-action="dm"]') ? row : row.querySelector('[data-action="dm"]');
        if (dm) return window._navTo?.('dm',{uid:dm.dataset.uid,name:dm.dataset.name,room:dm.dataset.room});
        const gp = row.matches('[data-action="groupChat"]') ? row : row.querySelector('[data-action="groupChat"]');
        if (gp) return window._navTo?.('groupChat',{room:gp.dataset.room,name:gp.dataset.name,color:gp.dataset.color});
      }, true);
    }
    return side;
  }

  function renderTabletDirectory() {
    const side = ensureTabletDirectoryNode(); if (!side) return;
    if (directoryHtml) {
      if (side.dataset.snapshot !== directoryHtml) {
        side.innerHTML = directoryHtml;
        side.dataset.snapshot = directoryHtml;
      }
    } else if (!side.children.length) {
      side.innerHTML='<div class="nfa-side-section">CHATS</div><div class="nfa-side-empty">Open Chat once to load your Groups and Direct Messages here.</div>';
      side.dataset.snapshot='empty';
    }
  }

  function ensureTabletWelcome() {
    const frame = $('#mStage > .mScr');
    if (!frame || screen() !== 'home' || !isTablet()) return;
    if (!$('.nfa-tablet-welcome', frame)) {
      const welcome=document.createElement('div');welcome.className='nfa-tablet-welcome';
      welcome.innerHTML='<div><b>Select a conversation</b><span>Choose a Group or Direct Message from the chat directory.</span></div>';
      frame.appendChild(welcome);
    }
  }

  function patchTaskDashboard() {
    if (screen() !== 'tasks') return;
    const root = $('#mStage > .mScr .mScr-inner'); if (!root) return;
    setText($('.m-hdr .m-htitle', root),'Tasks');
    let title = $('.nfa-final-task-title', root);
    if (!title) {
      title=document.createElement('div'); title.className='nfa-final-task-title'; title.textContent='Task Dashboard';
      const hdr=$('.m-hdr',root); if (hdr) hdr.after(title); else root.prepend(title);
    }
    const selrow = $('.af-selrow', root);
    if (selrow) selrow.classList.add('nfa-final-hide-task-selects');
    let filters = $('.nfa-final-task-filters', root);
    if (!filters) {
      filters=document.createElement('div'); filters.className='nfa-final-task-filters';
      title.after(filters);
    }
    const active = window._taskFilter || 'all';
    if (filters.dataset.active !== active) {
      const defs=[['all','All'],['forme','Allotted to Me'],['byme','Allotted by Me'],['pending','Pending'],['done','Completed']];
      filters.innerHTML=defs.map(([k,l])=>`<button type="button" class="nfa-final-task-filter ${active===k?'on':''}" data-nfa-final-task-filter="${k}">${l}</button>`).join('');
      filters.dataset.active=active;
    }
  }

  function patchScreenLabels() {
    const s=screen();
    if (s==='remind') setText($('#mStage .m-hdr .m-htitle'),'Reminders');
    else if (s==='settings') setText($('#mStage .m-hdr .m-htitle'),'Settings');
  }

  function applyLayout() {
    if (!isRuntime()) return;
    const app=$('#mobileApp'); if(!app)return;
    app.classList.add('nfa-final-ui-v211');
    app.classList.toggle('nfa-final-tablet',isTablet());
    app.classList.toggle('nfa-final-phone',!isTablet());
    const sb=$('#mSB'), nav=$('#mNav');
    if(sb && sb.style.getPropertyValue('display')!=='flex') sb.style.setProperty('display','flex','important');
    const navDisplay=isTablet()?'flex':'grid';
    if(nav && nav.style.getPropertyValue('display')!==navDisplay) nav.style.setProperty('display',navDisplay,'important');
    renderTabletDirectory();
  }

  function enhance() {
    if (!isRuntime() || !$('#mobileApp')) return;
    applyLayout(); injectCss(); ensureBrand(); ensureAllComposers(); patchHome(); patchTaskDashboard(); patchScreenLabels(); ensureTabletWelcome();
  }

  function schedule() { clearTimeout(timer); timer=setTimeout(enhance,70); }

  function onClick(e) {
    const f=e.target.closest('[data-nfa-final-task-filter]');
    if(f){e.preventDefault();e.stopImmediatePropagation();window._mobTaskFilter?.(f.dataset.nfaFinalTaskFilter);}
  }

  function start() {
    if (!isRuntime()) return;
    const app=$('#mobileApp');
    if(!app){setTimeout(start,250);return;}
    injectCss(); enhance();
    app.addEventListener('click',onClick,true);
    observer=new MutationObserver(schedule); observer.observe(app,{childList:true,subtree:true});
    window.addEventListener('resize',schedule,{passive:true});
    window.addEventListener('focus',schedule);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
    console.log('[NFA] final mobile/tablet UI v211 active');
  }

  start();
})();