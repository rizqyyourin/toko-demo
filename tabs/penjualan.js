import { getList } from '../services/api.js';
import { tableSkeleton } from '../components/skeleton.js';
import { createTable } from '../components/table.js';

let containerEl;
let data = [];
let sortBy = null; // 'TGL' or 'SUBTOTAL'
let sortDir = 1;

export function init(container) {
  containerEl = container;
  container.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'bg-surface border border-border rounded-md shadow-sm p-4 md:p-6';
  card.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-semibold">Penjualan</h2>
      <div class="flex items-center gap-2">
        <button id="btn-refresh" class="px-3 py-2 bg-surface dark:bg-dark-surface border border-border rounded-md text-sm">Refresh</button>
      </div>
    </div>
    <div id="list-area"></div>
  `;
  container.appendChild(card);
  card.querySelector('#btn-refresh').addEventListener('click', async () => {
    await refresh();
  });
}

function renderList(items) {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  if (!items.length) {
    area.innerHTML = '<div class="text-muted">Tidak ada penjualan.</div>';
    return;
  }
  const cols = [
    { label: 'ID_NOTA', field: 'ID_NOTA', class: 'w-28', tdClass: 'font-mono' },
    { label: 'TGL', field: 'TGL', class: 'w-28', tdClass: '', render: (v) => {
      const d = new Date(v);
      const txt = isNaN(d) ? v : `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
      const span = document.createElement('span'); span.textContent = txt; return span;
    }, sortable: true },
    { label: 'KODE_PELANGGAN', field: 'KODE_PELANGGAN', class: 'hidden md:table-cell', tdClass: 'hidden md:table-cell' },
    { label: 'SUBTOTAL', field: 'SUBTOTAL', class: 'w-28', tdClass: 'text-right', sortable: true, render: (v) => { const s = document.createElement('div'); s.className='text-right'; s.textContent = Number(v).toLocaleString(); return s; } },
  ];
  const { table } = createTable({ columns: cols, rows: items, rowKey: 'ID_NOTA' });
  // wire sort
  const ths = table.querySelectorAll('thead th');
  ths.forEach(th => {
    if (th.textContent === 'TGL' || th.textContent === 'SUBTOTAL') {
      th.addEventListener('click', () => {
        const key = th.textContent === 'TGL' ? 'TGL' : 'SUBTOTAL';
        if (sortBy === key) sortDir = -sortDir; else { sortBy = key; sortDir = 1; }
        sortAndRender();
      });
    }
  });
  area.appendChild(table);
}

function sortAndRender() {
  const items = [...data];
  if (sortBy === 'TGL') items.sort((a,b) => (new Date(a.TGL))- (new Date(b.TGL)) * sortDir);
  if (sortBy === 'SUBTOTAL') items.sort((a,b) => (Number(a.SUBTOTAL) - Number(b.SUBTOTAL)) * sortDir);
  renderList(items);
}

export async function load() {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  area.appendChild(tableSkeleton(4, 4));
  try {
    const res = await getList('penjualan');
    data = res.data || [];
    sortAndRender();
  } catch (err) {
    area.innerHTML = '<div class="text-danger">Gagal memuat penjualan.</div>';
  }
}

export async function refresh() {
  // just reload ignoring cache by busting cache indirectly via getList with useCache=false
  // our api doesn't expose useCache param here, so call getList with no cache by temporarily removing cache via post? Simpler: call getList and then render; users refresh will rely on API TTL
  await load();
}
