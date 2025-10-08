import { getList } from '../services/api.js';
import { tableSkeleton } from '../components/skeleton.js';
import { createTable } from '../components/table.js';

let containerEl;
let data = [];

export function init(container) {
  containerEl = container;
  container.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'bg-surface border border-border rounded-md shadow-sm p-4 md:p-6';
  card.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-2xl font-semibold">Item Penjualan</h2>
      <div class="flex items-center gap-2">
        <button id="btn-refresh" class="px-3 py-2 bg-surface dark:bg-dark-surface border border-border rounded-md text-sm">Refresh</button>
      </div>
    </div>
    <div id="list-area"></div>
  `;
  container.appendChild(card);
  card.querySelector('#btn-refresh').addEventListener('click', async () => {
    await load();
  });
}

function renderList(items) {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  if (!items.length) {
    area.innerHTML = '<div class="text-muted">Tidak ada item penjualan.</div>';
    return;
  }
  const cols = [
    { label: 'NOTA', field: 'NOTA', class: 'w-28', tdClass: 'font-mono' },
    { label: 'KODE_BARANG', field: 'KODE_BARANG', class: 'hidden md:table-cell', tdClass: 'hidden md:table-cell' },
    { label: 'QTY', field: 'QTY', class: 'w-20', tdClass: 'text-right' },
  ];
  const { table } = createTable({ columns: cols, rows: items, rowKey: 'NOTA' });
  area.appendChild(table);
}

export async function load() {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  area.appendChild(tableSkeleton(3, 4));
  try {
    const res = await getList('item_penjualan');
    data = res.data || [];
    renderList(data);
  } catch (err) {
    area.innerHTML = '<div class="text-danger">Gagal memuat item penjualan.</div>';
  }
}
