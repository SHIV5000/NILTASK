// NILTASK remaining-module presentation hooks. No business logic is replaced.
(function(){
  'use strict';
  const text=(el)=>el?.textContent?.replace(/\s+/g,' ').trim()||'';
  const closestPanel=(el)=>el?.closest('.top-panel-dropdown,[class*="fixed"],[class*="absolute"],aside,section,[role="dialog"]')||el?.parentElement?.parentElement;

  function markTopPanels(){
    document.querySelectorAll('.top-panel-dropdown').forEach(panel=>{
      panel.classList.add('nfa-module-panel');
      const title=text(panel.querySelector('h4,h3,h2'));
      let type='';
      if(/Scheduled/i.test(title)) type='schedule';
      else if(/Reminder/i.test(title)) type='reminder';
      else if(/Bookmark/i.test(title)) type='bookmark';
      else if(/Notification|Alert/i.test(title)) type='alert';
      panel.dataset.nfaModule=type;
      panel.querySelectorAll(':scope > div').forEach(card=>{
        if(card.querySelector('h4')) return;
        card.classList.add('nfa-module-card');
        if(type) card.classList.add('nfa-'+type+'-card');
      });
      panel.querySelectorAll('p').forEach(p=>{
        if(/^No |All caught up|Nothing /i.test(text(p))) p.classList.add('nfa-module-empty');
      });
    });
  }

  function markActivityAndNotifications(){
    [...document.querySelectorAll('h1,h2,h3,h4,div,span')].forEach(el=>{
      const t=text(el);
      if(t==='Activity Feed') closestPanel(el)?.classList.add('nfa-activity-panel','nfa-module-panel');
      if(t==='Notifications'||t==='Notification Centre') closestPanel(el)?.classList.add('nfa-notification-panel','nfa-module-panel');
    });
    document.querySelectorAll('.nfa-activity-panel [class*="rounded"],.nfa-activity-panel [class*="border"]').forEach(el=>{
      if(text(el).length>8) el.classList.add('nfa-activity-card');
    });
    document.querySelectorAll('.nfa-notification-panel [class*="rounded"],.nfa-notification-panel [class*="border"]').forEach(el=>{
      if(text(el).length>8) el.classList.add('nfa-notification-card');
    });
  }

  function markModals(){
    const ids=['settingsModal','groupSettingsModal','reminderModal','scheduleModal','taskModal','linkPillModal','forwardModal','changePasswordModal'];
    ids.forEach(id=>{
      const modal=document.getElementById(id);
      if(!modal) return;
      modal.classList.add('nfa-module-modal');
      if(id==='settingsModal') modal.classList.add('nfa-settings-modal');
    });
    document.querySelectorAll('input[type="search"],input[placeholder*="Search" i]').forEach(el=>el.classList.add('nfa-search-field'));
  }

  function markMobileNav(){
    const candidates=[document.getElementById('mBottomNav'),document.querySelector('.mBottomNav'),document.querySelector('[class*="bottom-nav"]'),document.querySelector('#mobileApp nav')].filter(Boolean);
    candidates.forEach(nav=>nav.classList.add('nfa-mobile-nav'));
  }

  function markStates(){
    document.querySelectorAll('[class*="spinner"],.fa-spinner').forEach(el=>el.parentElement?.classList.add('nfa-loading'));
    document.querySelectorAll('[role="alert"],.error-message,[class*="error"]').forEach(el=>{
      if(text(el)) el.classList.add('nfa-error');
    });
  }

  function syncRail(){
    const openPanel=document.querySelector('.top-panel-dropdown');
    if(!openPanel) return;
    const type=openPanel.dataset.nfaModule;
    const key=type==='alert'?'notifications':type==='schedule'?'schedule':null;
    if(!key) return;
    document.querySelectorAll('.nfa-rail-button').forEach(btn=>{
      const active=btn.dataset.module===key;
      btn.classList.toggle('is-active',active);
      active?btn.setAttribute('aria-current','page'):btn.removeAttribute('aria-current');
    });
  }

  function run(){markTopPanels();markActivityAndNotifications();markModals();markMobileNav();markStates();syncRail();}
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run();});};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',schedule,{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
