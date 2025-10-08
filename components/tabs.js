import { prefetchTables } from '../services/api.js';
import { showToast } from './toast.js';

const TABS = [
  { id: 'pelanggan', label: 'Pelanggan' },
  { id: 'barang', label: 'Barang' },
  { id: 'penjualan', label: 'Penjualan' },
  { id: 'item-penjualan', label: 'Item Penjualan' },
];

const controllers = new Map(); // id -> module
const initialized = new Map();

const tabbar = document.getElementById('tabbar');
const container = document.getElementById('container');

function buildTabBar() {
  tabbar.innerHTML = '';
  for (const t of TABS) {
    const a = document.createElement('a');
    a.href = `#${t.id}`;
    a.className = 'inline-flex items-center px-3 py-2 mr-2 text-sm rounded-md hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary';
    a.textContent = t.label;
    a.dataset.tab = t.id;
    tabbar.appendChild(a);
  }
}

function setActive(tabId) {
  for (const el of tabbar.querySelectorAll('[data-tab]')) {
    if (el.dataset.tab === tabId) {
      el.classList.add('text-primary');
      // underline
      el.classList.add('border-b-2', 'border-primary');
    } else {
      el.classList.remove('text-primary', 'border-b-2', 'border-primary');
    }
  }
}

function tableNameForTab(tabId) {
  if (tabId === 'item-penjualan') return 'item_penjualan';
  return tabId;
}

async function loadTab(tabId) {
  setActive(tabId);
  container.innerHTML = '';
  const mod = controllers.get(tabId);
  if (mod && initialized.get(tabId)) {
    await mod.load();
    return;
  }
  // lazy import
  try {
    let path = `../tabs/${tabId}.js`;
    const m = await import(path);
    controllers.set(tabId, m);
    if (typeof m.init === 'function') m.init(container);
    initialized.set(tabId, true);
    if (typeof m.load === 'function') await m.load();
    // after first paint, prefetch some tables
    requestAnimationFrame(() => prefetchTables(['barang', 'penjualan', 'item_penjualan']));
  } catch (err) {
    container.innerHTML = `<div class="text-danger">Failed to load tab: ${err.message}</div>`;
  }
}

function currentTabFromHash() {
  const h = (location.hash || '#pelanggan').replace('#', '');
  return TABS.some(t => t.id === h) ? h : 'pelanggan';
}

window.addEventListener('hashchange', () => {
  const tab = currentTabFromHash();
  loadTab(tab);
});

window.addEventListener('DOMContentLoaded', () => {
  buildTabBar();
  // keyboard navigation for tabbar
  tabbar.addEventListener('keydown', (e) => {
    const focusable = Array.from(tabbar.querySelectorAll('a'));
    const idx = focusable.indexOf(document.activeElement);
    if (e.key === 'ArrowRight') {
      focusable[(idx + 1) % focusable.length].focus();
    } else if (e.key === 'ArrowLeft') {
      focusable[(idx - 1 + focusable.length) % focusable.length].focus();
    }
  });

  const tab = currentTabFromHash();
  loadTab(tab);
});

export { loadTab, tableNameForTab };
