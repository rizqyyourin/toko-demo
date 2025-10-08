import { getList, create, update, remove, bustCache } from '../services/api.js';
import { createModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
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
      <h2 class="text-2xl font-semibold">Barang</h2>
      <div class="flex items-center gap-2">
        <button id="btn-refresh" class="px-3 py-2 bg-surface dark:bg-dark-surface border border-border rounded-md text-sm">Refresh</button>
        <button id="btn-add" class="px-3 py-2 bg-primary text-white rounded-md text-sm">Tambah</button>
      </div>
    </div>
    <div id="list-area"></div>
  `;
  container.appendChild(card);

  card.querySelector('#btn-refresh').addEventListener('click', async () => {
    bustCache('barang');
    await load();
    showToast('Refreshed');
  });
  card.querySelector('#btn-add').addEventListener('click', () => openForm());
}

function renderList(items) {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  if (!items.length) {
    area.innerHTML = '<div class="text-muted">Tidak ada barang.</div>';
    return;
  }
  const cols = [
    { label: 'KODE', field: 'KODE', class: 'w-28', tdClass: 'font-mono' },
    { label: 'NAMA', field: 'NAMA', render: (v) => { const d = document.createElement('div'); d.className = 'truncate max-w-[180px] md:max-w-[280px]'; d.textContent = v; d.title = v; return d; } },
    { label: 'KATEGORI', field: 'KATEGORI', class: 'w-28' },
    { label: 'HARGA', field: 'HARGA', class: 'w-24', tdClass: 'text-right' },
    { label: 'Aksi', field: '__actions', class: 'w-36', tdClass: 'w-36', render: (_, row) => {
      const wrap = document.createElement('div');
      wrap.className = 'flex gap-2';
      const edit = document.createElement('button');
      edit.className = 'px-2 py-1 bg-primary text-white rounded text-sm';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openForm(row));
      const del = document.createElement('button');
      del.className = 'px-2 py-1 bg-danger text-white rounded text-sm';
      del.textContent = 'Hapus';
      del.addEventListener('click', async () => {
        if (!confirm('Hapus barang ini?')) return;
        await remove('barang', { KODE: row.KODE });
        showToast('Deleted');
        await load();
      });
      wrap.appendChild(edit);
      wrap.appendChild(del);
      return wrap;
    } }
  ];
  const { table } = createTable({ columns: cols, rows: items, rowKey: 'KODE' });
  area.appendChild(table);
}

export async function load() {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  area.appendChild(tableSkeleton(5, 4));
  try {
    const res = await getList('barang');
    data = res.data || [];
    renderList(data);
  } catch (err) {
    area.innerHTML = '<div class="text-danger">Gagal memuat barang.</div>';
  }
}

function openForm(row = null) {
  const isEdit = !!row;
  const form = document.createElement('form');
  form.className = 'space-y-3';
  form.innerHTML = `
    <label class="block"><div class="text-sm font-medium mb-1">KODE</div><input name="KODE" class="w-full border border-border rounded px-2 py-1" ${isEdit? 'readonly':''} required></label>
    <label class="block"><div class="text-sm font-medium mb-1">NAMA</div><input name="NAMA" class="w-full border border-border rounded px-2 py-1" required></label>
    <label class="block"><div class="text-sm font-medium mb-1">KATEGORI</div><input name="KATEGORI" class="w-full border border-border rounded px-2 py-1"></label>
    <label class="block"><div class="text-sm font-medium mb-1">HARGA</div><input name="HARGA" type="number" min="0" class="w-full border border-border rounded px-2 py-1" required></label>
    <div class="flex justify-end gap-2"><button type="button" class="btn-cancel px-3 py-2">Batal</button><button type="submit" class="btn-submit px-3 py-2 bg-primary text-white rounded">Simpan</button></div>
  `;
  if (isEdit) {
    form.KODE.value = row.KODE;
    form.NAMA.value = row.NAMA || '';
    form.KATEGORI.value = row.KATEGORI || '';
    form.HARGA.value = row.HARGA || 0;
  }
  const modal = createModal({ title: isEdit ? 'Edit Barang' : 'Tambah Barang', content: form, onClose: null });
  form.querySelector('.btn-cancel').addEventListener('click', () => modal.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      KODE: form.KODE.value.trim(),
      NAMA: form.NAMA.value.trim(),
      KATEGORI: form.KATEGORI.value.trim(),
      HARGA: Number(form.HARGA.value) || 0,
    };
    if (!payload.KODE || !payload.NAMA) return alert('KODE and NAMA required');
    if (payload.HARGA < 0) return alert('HARGA must be >= 0');
    try {
      if (isEdit) await update('barang', payload);
      else await create('barang', payload);
      modal.close();
      showToast(isEdit ? 'Updated' : 'Created');
      await load();
    } catch (err) {
      alert('Gagal menyimpan');
    }
  });
  modal.open();
}
