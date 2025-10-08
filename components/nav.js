export function highlightActive() {
  const links = Array.from(document.querySelectorAll('nav a')).filter(a => !a.classList.contains('nav-brand'));
  const current = location.pathname.split('/').pop() || 'index.html';
  links.forEach(a => {
    try {
      const href = a.getAttribute('href');
      const name = href.split('/').pop();
      if (name === current) {
        // make it look like a purple button for the active page
        a.classList.add('bg-primary', 'text-white', 'px-3', 'py-1', 'rounded-md', 'font-semibold');
        a.setAttribute('aria-current', 'page');
      } else {
        a.classList.remove('bg-primary', 'text-white', 'px-3', 'py-1', 'rounded-md', 'font-semibold');
        a.removeAttribute('aria-current');
      }
    } catch (e) {}
  });
}

import { showLoader } from './loader.js';
import { getList } from '../services/api.js';

export function initNav(){
  const hb = document.getElementById('hamburger');
  const mm = document.getElementById('mobile-menu');
  const mo = document.getElementById('mobile-overlay');
  if(!hb || !mm || !mo) return;
  // ensure initial state
  if(!mm.getAttribute('aria-hidden')) mm.setAttribute('aria-hidden','true');
  function openMenu(){ mm.classList.remove('translate-x-full'); mm.setAttribute('aria-hidden','false'); mo.classList.remove('hidden'); }
  function closeMenu(){ mm.classList.add('translate-x-full'); mm.setAttribute('aria-hidden','true'); mo.classList.add('hidden'); }
  hb.addEventListener('click', ()=>{ if(mm.getAttribute('aria-hidden')==='true') openMenu(); else closeMenu(); });
  mo.addEventListener('click', closeMenu);
  // don't attach mobile "close menu" handlers yet — we'll add them after
  // the navigation interception handlers are attached so the prefetch
  // logic runs first (avoids closing the menu before we can show loader
  // and persist cache on mobile navigations).

  // Attach navigation click handlers to show loader immediately for internal navigations.
  const navLinks = Array.from(document.querySelectorAll('nav a'));
  function safeNavHandler(e){
    try{
      console.debug('[nav] safeNavHandler - clicked', e.currentTarget && e.currentTarget.getAttribute && e.currentTarget.getAttribute('href'));
      // allow middle-click or modifiers to open in new tab/window
      if (e.button && e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.currentTarget;
      const target = a.getAttribute('target');
      if (target && target !== '_self') return;
      const href = a.href;
      if (!href || href.startsWith('javascript:')) return;
      // only intercept same-origin navigations
      const loc = location;
      const url = new URL(href);
      if (url.origin !== loc.origin) return;
  e.preventDefault();
  // prevent other click handlers (like mobile menu close) from running
  // so we can perform prefetch and show the loader while the menu stays open.
  if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      // show loader and prefetch data for the target page if we know which tables it needs
      try{ showLoader(); }catch(err){}
      const path = url.pathname;
      const prefetchMap = {
        'pelanggan.html': ['pelanggan'],
        'barang.html': ['barang'],
        'item-penjualan.html': ['item_penjualan'],
        'index.html': ['pelanggan','barang','penjualan']
      };
      // find a mapping key that matches the pathname robustly (endsWith)
      let tables = [];
      for (const k of Object.keys(prefetchMap)) {
        if (path.endsWith(k) || path === '/' && k === 'index.html') { tables = prefetchMap[k]; break; }
      }
      const prefetchPromise = (async ()=>{
        if (!tables.length) return;
        await Promise.all(tables.map(t=> getList(t).catch(()=>{})));
      })();
  // don't wait forever: give up after 2500ms and navigate anyway (slightly longer for mobile)
      const timeout = new Promise(res => setTimeout(res, 2500));
      Promise.race([prefetchPromise, timeout]).then(()=> {
        // close mobile menu (if open) then navigate shortly after so the
        // UI transitions look natural on mobile.
        try{ closeMenu(); }catch(e){}
        setTimeout(()=> { location.href = href; }, 40);
      });
    }catch(err){ /* swallow */ }
  }
  navLinks.forEach(a => a.addEventListener('click', safeNavHandler));

  // Now attach the mobile menu close handlers so they run AFTER the
  // navigation interception handler. This ordering ensures the prefetch
  // and cache persist complete while the menu is still open (avoids
  // race conditions on some mobile browsers).
  mm.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeMenu(); });
}
