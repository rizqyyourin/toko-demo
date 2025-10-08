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
      <h2 class="text-2xl font-semibold">Pelanggan</h2>
      <div class="flex items-center gap-2">
        <button id="btn-refresh" class="px-3 py-2 bg-surface dark:bg-dark-surface border border-border rounded-md text-sm">Refresh</button>
        <button id="btn-add" class="px-3 py-2 bg-primary text-white rounded-md text-sm">Tambah</button>
      </div>
    </div>
    <div id="list-area"></div>
  `;
  container.appendChild(card);

  card.querySelector('#btn-refresh').addEventListener('click', async () => {
    bustCache('pelanggan');
    await load();
    showToast('Refreshed');
  });
  card.querySelector('#btn-add').addEventListener('click', () => openForm());
}

function renderList(items) {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  if (!items.length) {
    area.innerHTML = '<div class="text-muted">Tidak ada pelanggan.</div>';
    return;
  }
  const cols = [
    { label: 'ID_PELANGGAN', field: 'ID_PELANGGAN', class: 'w-32', tdClass: 'font-mono' },
    { label: 'NAMA', field: 'NAMA', class: '', tdClass: '', render: (v) => { const d = document.createElement('div'); d.className = 'truncate max-w-[180px] md:max-w-[280px]'; d.textContent = v; d.title = v; return d; } },
    { label: 'DOMISILI', field: 'DOMISILI', class: 'hidden sm:table-cell', tdClass: 'hidden sm:table-cell' },
    { label: 'JENIS_KELAMIN', field: 'JENIS_KELAMIN', class: 'w-32', tdClass: 'w-32' },
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
        if (!confirm('Hapus pelanggan ini?')) return;
        await remove('pelanggan', { ID_PELANGGAN: row.ID_PELANGGAN });
        showToast('Deleted');
        await load();
      });
      wrap.appendChild(edit);
      wrap.appendChild(del);
      return wrap;
    } }
  ];
  const { table } = createTable({ columns: cols, rows: items, rowKey: 'ID_PELANGGAN' });
  area.appendChild(table);
}

export async function load() {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  area.appendChild(tableSkeleton(5, 4));
  try {
    const res = await getList('pelanggan');
    data = res.data || [];
    renderList(data);
  } catch (err) {
    area.innerHTML = '<div class="text-danger">Gagal memuat pelanggan.</div>';
  }
}

function openForm(row = null) {
  const isEdit = !!row;
  const form = document.createElement('form');
  form.className = 'space-y-3';
  form.innerHTML = `
    <label class="block"><div class="text-sm font-medium mb-1">ID_PELANGGAN</div><input name="ID_PELANGGAN" class="w-full border border-border rounded px-2 py-1" ${isEdit? 'readonly':''}></label>
    <label class="block"><div class="text-sm font-medium mb-1">NAMA</div><input name="NAMA" class="w-full border border-border rounded px-2 py-1" required></label>
    <label class="block"><div class="text-sm font-medium mb-1">DOMISILI</div><input name="DOMISILI" class="w-full border border-border rounded px-2 py-1"></label>
    <label class="block"><div class="text-sm font-medium mb-1">JENIS_KELAMIN</div><select name="JENIS_KELAMIN" class="w-full border border-border rounded px-2 py-1"><option value="L">L</option><option value="P">P</option></select></label>
    <div class="flex justify-end gap-2"><button type="button" class="btn-cancel px-3 py-2">Batal</button><button type="submit" class="btn-submit px-3 py-2 bg-primary text-white rounded">Simpan</button></div>
  `;
  if (isEdit) {
    form.ID_PELANGGAN.value = row.ID_PELANGGAN;
    form.NAMA.value = row.NAMA || '';
    form.DOMISILI.value = row.DOMISILI || '';
    form.JENIS_KELAMIN.value = row.JENIS_KELAMIN || 'L';
  }
  const modal = createModal({ title: isEdit ? 'Edit Pelanggan' : 'Tambah Pelanggan', content: form, onClose: null });
  form.querySelector('.btn-cancel').addEventListener('click', () => modal.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      ID_PELANGGAN: form.ID_PELANGGAN.value.trim(),
      NAMA: form.NAMA.value.trim(),
      DOMISILI: form.DOMISILI.value.trim(),
      JENIS_KELAMIN: form.JENIS_KELAMIN.value,
    };
    if (!payload.ID_PELANGGAN || !payload.NAMA) return alert('ID and NAMA required');
    try {
      if (isEdit) await update('pelanggan', payload);
      else await create('pelanggan', payload);
      modal.close();
      showToast(isEdit ? 'Updated' : 'Created');
      await load();
    } catch (err) {
      alert('Gagal menyimpan');
    }
  });
  modal.open();
}
