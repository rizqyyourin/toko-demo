import { getList, create, update, remove, bustCache } from '../services/api.js';
import { createModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { tableSkeleton } from '../components/skeleton.js';
import { createTable } from '../components/table.js';
import { highlightActive, initNav } from '../components/nav.js';

// Global error hooks to surface runtime errors during page init/runtime
if (typeof window !== 'undefined') {
  window.addEventListener('error', (ev) => {
    try { console.error('[page:pelanggan] uncaught error', ev.error || ev.message, ev); } catch(e){}
    try { showToast('Terjadi error di halaman Pelanggan — lihat console untuk detail', { duration: 5000 }); } catch(e){}
  });
  window.addEventListener('unhandledrejection', (ev) => {
    try { console.error('[page:pelanggan] unhandled rejection', ev.reason); } catch(e){}
    try { showToast('Promise ditolak tanpa tangkapan — lihat console', { duration: 5000 }); } catch(e){}
  });
}

const containerEl = document.getElementById('container');
const state = { rows: [], sort: { field: null, dir: 1 }, query: '', page: 1, perPage: 10, cols: null, tableWrap: null };

async function renderList(items) {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  if (!items.length) {
    area.innerHTML = '<div class="text-muted">Tidak ada pelanggan.</div>';
    return;
  }
  // store original rows for client-side search/sort
  state.rows = items.slice();

  const toolbar = document.createElement('div');
  toolbar.className = 'mb-3 flex gap-2 items-center flex-col sm:flex-row';
  const left = document.createElement('div');
  left.className = 'flex-1 w-full flex gap-2 items-center';
  const input = document.createElement('input');
  input.className = 'border border-border rounded px-3 py-2 w-full';
  input.placeholder = 'Cari sesuatu';
  input.value = state.query || '';
  left.appendChild(input);
  // Search button (with icon)
  const btnSearch = document.createElement('button');
  btnSearch.type = 'button';
  btnSearch.className = 'px-3 py-2 bg-primary text-white rounded text-sm flex items-center gap-2';
  btnSearch.setAttribute('aria-label', 'Cari');
  btnSearch.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>`;
  // Reset button (with icon)
  const btnReset = document.createElement('button');
  btnReset.type = 'button';
  btnReset.className = 'px-3 py-2 border border-border rounded text-sm flex items-center gap-2';
  btnReset.setAttribute('aria-label', 'Reset pencarian');
  btnReset.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
  left.appendChild(btnSearch);
  left.appendChild(btnReset);

  toolbar.appendChild(left);
  area.appendChild(toolbar);
  area.appendChild(toolbar);

  // handlers: search on Enter only, no buttons
  input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { state.query = input.value.trim(); state.page = 1; applyFilterSort(); } });
  btnSearch.addEventListener('click', ()=>{ state.query = input.value.trim(); state.page = 1; applyFilterSort(); });
  btnReset.addEventListener('click', ()=>{ input.value = ''; state.query = ''; state.page = 1; applyFilterSort(); });
  // focus input for immediate typing
  try { input.focus(); } catch(e) {}
  const cols = [
    { label: 'ID Pelanggan', field: 'ID_PELANGGAN', class: 'w-32', tdClass: 'font-mono', sortable: true },
    { label: 'Nama', field: 'NAMA', class: '', tdClass: '', sortable: true, render: (v) => { const d = document.createElement('div'); d.className = 'truncate max-w-[180px] md:max-w-[280px]'; d.textContent = v; d.title = v; return d; } },
    { label: 'Domisili', field: 'DOMISILI', class: 'hidden sm:table-cell', tdClass: 'hidden sm:table-cell', sortable: true },
    { label: 'Jenis Kelamin', field: 'JENIS_KELAMIN', class: 'w-32', tdClass: 'w-32', sortable: true },
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
        try {
          await remove('pelanggan', { ID_PELANGGAN: row.ID_PELANGGAN });
          showToast('Pelanggan dihapus', { duration: 1400 });
          await load();
        } catch (e) {
          console.error('[page:pelanggan] delete error', e);
          showToast('Gagal menghapus', { duration: 1400 });
        }
      });
      wrap.appendChild(edit);
      wrap.appendChild(del);
      return wrap;
    } }
  ];
  // create table with empty rows — we'll populate tbody via applyFilterSort to avoid duplicates
  const { wrap } = createTable({ columns: cols, rows: [], rowKey: 'ID_PELANGGAN' });
  // keep column defs for re-rendering tbody with actions
  state.cols = cols;
  // keep a stable reference to the table wrapper so re-renders don't rely on querySelector timing
  state.tableWrap = wrap;
  // attach sorting handlers to headers and inject sort icons
  const ths = wrap.querySelectorAll('thead th');
  ths.forEach((th, idx) => {
    const col = cols[idx];
    if (!col || !col.sortable) return;
    // add icon container
    const icon = document.createElement('span');
    icon.className = 'ml-2 text-[10px] inline-block';
    icon.style.width = '10px';
    icon.style.height = '10px';
    icon.innerHTML = '';
    th.appendChild(icon);
    th.style.cursor = 'pointer';
    th.addEventListener('click', ()=>{
      const f = col.field;
      if (state.sort.field === f) state.sort.dir = -state.sort.dir; else { state.sort.field = f; state.sort.dir = 1; }
      state.page = 1;
      updateSortIcons(wrap);
      applyFilterSort();
    });
  });
  area.appendChild(wrap);

  // pagination container
  const pag = document.createElement('div');
  pag.id = 'pagination';
  pag.className = 'mt-3 flex items-center gap-2';
  area.appendChild(pag);

  // initially apply filter/sort if any
  updateSortIcons(wrap);
  applyFilterSort();
}

function updateSortIcons(wrap) {
  const ths = wrap.querySelectorAll('thead th');
  ths.forEach((th, idx) => {
    const icon = th.querySelector('span');
    const col = (state.cols && state.cols[idx]) || null;
    if (!icon) return;
    if (!col || !col.sortable) { icon.innerHTML = ''; th.classList.remove('text-primary'); return; }
    if (state.sort.field === col.field) {
      icon.innerHTML = state.sort.dir === 1 ? '▲' : '▼';
      th.classList.add('text-primary');
      icon.classList.add('text-primary');
    } else {
      icon.innerHTML = '';
      th.classList.remove('text-primary');
      icon.classList.remove('text-primary');
    }
  });
}

function applyFilterSort() {
  let rows = state.rows.slice();
  console.debug('[page:pelanggan] applyFilterSort start rows=', rows.length, 'query=', state.query, 'sort=', state.sort, 'page=', state.page);
  // filter by query
  if (state.query) {
    const q = state.query.toLowerCase();
    rows = rows.filter(r => {
      const nama = String(r.NAMA||'');
      const id = String(r.ID_PELANGGAN||'');
      const dom = String(r.DOMISILI||'');
      // normalize gender: support legacy L/P -> PRIA/WANITA
      let g = (r.JENIS_KELAMIN || '').toString().toUpperCase();
      if (g === 'L') g = 'PRIA';
      if (g === 'P') g = 'WANITA';
      const combined = (nama + ' ' + id + ' ' + dom + ' ' + g).toLowerCase();
      return combined.includes(q);
    });
  }
  console.debug('[page:pelanggan] after query filter rows=', rows.length);
  // (no gender filter)
  // sort
  if (state.sort.field) {
    rows.sort((a,b)=>{
      const field = state.sort.field;
      // numeric-aware sort for ID_PELANGGAN
      if (field === 'ID_PELANGGAN') {
        const na = (a.ID_PELANGGAN||'').toString().match(/(\d+)$/);
        const nb = (b.ID_PELANGGAN||'').toString().match(/(\d+)$/);
        const ia = na ? parseInt(na[1],10) : -1;
        const ib = nb ? parseInt(nb[1],10) : -1;
        if (ia < ib) return -1 * state.sort.dir; if (ia > ib) return 1 * state.sort.dir; return 0;
      }
      const fa = (a[field] || '').toString().toLowerCase();
      const fb = (b[field] || '').toString().toLowerCase();
      if (fa < fb) return -1 * state.sort.dir; if (fa > fb) return 1 * state.sort.dir; return 0;
    });
  }
  console.debug('[page:pelanggan] after sort rows=', rows.length);
  // compute pagination
  const total = rows.length;
  const per = state.perPage || 10;
  const totalPages = Math.max(1, Math.ceil(total / per));
  if (state.page > totalPages) state.page = totalPages;
  const start = (state.page - 1) * per;
  const end = start + per;
  const pageRows = rows.slice(start, end);
  console.debug('[page:pelanggan] pagination pageRows=', pageRows.length, 'start=', start, 'end=', end, 'totalPages=', totalPages);
  // re-render table body only
  const area = containerEl.querySelector('#list-area');
  const tableWrap = state.tableWrap || (area && area.querySelector('div.w-full'));
  if (!tableWrap) {
    console.error('[page:pelanggan] applyFilterSort: tableWrap not found', { areaExists: !!area, stateTableWrap: !!state.tableWrap });
    return;
  }
  const tbody = tableWrap.querySelector('tbody');
  if (!tbody) {
    console.error('[page:pelanggan] applyFilterSort: tbody not found inside tableWrap', tableWrap);
    return;
  }
  // if there are no rows at all, show a friendly message and hide table/pagination
  const noResultsId = 'no-results-pelanggan';
  const existingNo = area.querySelector('#' + noResultsId);
  if (total === 0) {
    // hide table
    try { tableWrap.style.display = 'none'; } catch (e) {}
    // show message
    if (!existingNo) {
      const msg = document.createElement('div');
      msg.id = noResultsId;
      msg.className = 'text-muted py-6 text-center';
      msg.textContent = 'Tidak ada data yang sesuai.';
      const pagEl = document.getElementById('pagination');
      if (pagEl) area.insertBefore(msg, pagEl);
      else area.appendChild(msg);
    } else {
      existingNo.style.display = '';
      existingNo.textContent = 'Tidak ada data yang sesuai.';
    }
    // hide pagination
    const pagEl = document.getElementById('pagination'); if (pagEl) pagEl.style.display = 'none';
    return;
  }
  // ensure no-results message is hidden and table is visible
  if (existingNo) existingNo.style.display = 'none';
  try { tableWrap.style.display = ''; } catch (e) {}
  // clear previous rows to avoid duplicates
  tbody.innerHTML = '';
  // rebuild tbody using column definitions so render functions (actions) stay functional
  const colDefs = state.cols || [];
  pageRows.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = 'odd:bg-[rgba(99,102,241,0.03)]';
    colDefs.forEach(col => {
      const td = document.createElement('td');
      td.className = `px-3 py-2 text-sm text-text ${col.tdClass || ''}`;
      if (col.render) {
        const cell = col.render(r[col.field], r);
        if (typeof cell === 'string') td.innerHTML = cell; else td.appendChild(cell);
      } else {
        td.textContent = r[col.field] || '';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  // refresh sort icons in case sorting state changed
  try { updateSortIcons(state.tableWrap); } catch (e) {}
  renderPagination(total, state.page, totalPages);
}

function renderPagination(total, page, totalPages) {
  const pag = document.getElementById('pagination');
  if (!pag) return;
  pag.innerHTML = '';
  const info = document.createElement('div');
  info.className = 'text-sm text-muted';
  info.textContent = `Menampilkan ${Math.min(total, (page-1)*state.perPage+1)} - ${Math.min(total, page*state.perPage)} dari ${total}`;
  pag.appendChild(info);

  const ctrl = document.createElement('div');
  ctrl.className = 'ml-auto flex items-center gap-2';
  const prev = document.createElement('button'); prev.textContent = '‹'; prev.className = 'px-2 py-1 border rounded';
  prev.disabled = page <= 1; prev.addEventListener('click', ()=>{ if (state.page>1) { state.page--; applyFilterSort(); } });
  const next = document.createElement('button'); next.textContent = '›'; next.className = 'px-2 py-1 border rounded';
  next.disabled = page >= totalPages; next.addEventListener('click', ()=>{ if (state.page<totalPages) { state.page++; applyFilterSort(); } });
  ctrl.appendChild(prev);
  // show up to 5 page buttons centered around current
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(totalPages, startPage + 4);
  for (let p = startPage; p <= endPage; p++) {
    const b = document.createElement('button'); b.textContent = String(p); b.className = `px-2 py-1 border rounded ${p===page? 'bg-primary text-white':''}`;
    b.addEventListener('click', ()=>{ state.page = p; applyFilterSort(); });
    ctrl.appendChild(b);
  }
  ctrl.appendChild(next);
  pag.appendChild(ctrl);
}

export async function load() {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  area.appendChild(tableSkeleton(5, 4));
  try {
    const res = await getList('pelanggan');
  console.debug('[page:pelanggan] load fromCache=', !!res.fromCache);
    const data = res.data || [];
    await renderList(data);
  } catch (err) {
    console.error('[page:pelanggan] load error', err);
    area.innerHTML = '<div class="text-danger">Gagal memuat pelanggan.</div>';
  }
}

async function openForm(row = null) {
  const isEdit = !!row;
  const form = document.createElement('form');
  form.className = 'space-y-4';
  form.innerHTML = `
    <div class="grid grid-cols-1 gap-3">
      <label class="block"><div class="text-sm font-medium mb-1">ID Pelanggan</div><input id="fld-id" name="ID_PELANGGAN" class="w-full border border-border rounded px-3 py-2" ${isEdit? 'readonly':''} pattern="^PELANGGAN_[0-9]+$" ></label>
      <div id="fld-id-msg" class="text-sm text-danger mt-1 hidden">Format harus PELANGGAN_angka (contoh: PELANGGAN_12)</div>
  <label class="block"><div class="text-sm font-medium mb-1">Nama</div><input id="fld-nama" name="NAMA" class="w-full border border-border rounded px-3 py-2" required></label>
  <label class="block"><div class="text-sm font-medium mb-1">Domisili</div><input id="fld-dom" name="DOMISILI" class="w-full border border-border rounded px-3 py-2" required></label>
  <div id="fld-uniq-msg" class="text-sm text-danger mt-1 hidden">ID sudah ada — gunakan ID lain.</div>
      <div>
        <div class="text-sm font-medium mb-2">Jenis Kelamin</div>
        <fieldset id="fld-gender" class="flex flex-col gap-2">
          <label class="inline-flex items-center gap-3 px-3 py-2 border border-border rounded cursor-pointer bg-surface"><input type="radio" name="JENIS_KELAMIN" value="PRIA" class="form-radio" checked><span class="text-sm">Pria</span></label>
          <label class="inline-flex items-center gap-3 px-3 py-2 border border-border rounded cursor-pointer bg-surface"><input type="radio" name="JENIS_KELAMIN" value="WANITA" class="form-radio"><span class="text-sm">Wanita</span></label>
        </fieldset>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-2"><button type="button" class="btn-cancel px-3 py-2">Batal</button><button type="submit" class="btn-submit px-3 py-2 bg-primary text-white rounded">Simpan</button></div>
  `;
  // when opening form for a new pelanggan, compute next sequential ID
  if (isEdit) {
    form.ID_PELANGGAN.value = row.ID_PELANGGAN;
    form.NAMA.value = row.NAMA || '';
    form.DOMISILI.value = row.DOMISILI || '';
    // Normalize existing gender to database values (support legacy L/P)
    const g = (row.JENIS_KELAMIN || '').toUpperCase();
    const norm = (g === 'L' ? 'PRIA' : (g === 'P' ? 'WANITA' : g));
    const radio = form.querySelectorAll('input[name="JENIS_KELAMIN"]');
    radio.forEach(r => { r.checked = (r.value === norm); });
  } else {
    try {
      const res = await getList('pelanggan');
      const rows = (res && res.data) || [];
      // find numeric suffixes for IDs like PELANGGAN_123
      let max = 0;
      rows.forEach(r => {
        const id = (r.ID_PELANGGAN || '').toString();
        const m = id.match(/PELANGGAN_(\d+)$/i);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n) && n > max) max = n;
        }
      });
      const next = max + 1;
      form.ID_PELANGGAN.value = `PELANGGAN_${next}`;
    } catch (e) {
      // fallback
      form.ID_PELANGGAN.value = 'PELANGGAN_1';
    }
  }

  // sanitise & enforce ID format as user types
  const idField = form.querySelector('#fld-id');
  if (idField) {
    const idMsg = form.querySelector('#fld-id-msg');
    idField.addEventListener('input', (ev) => {
      // keep uppercase and allow only letters, digits and underscore
      const v = idField.value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
      idField.value = v;
      // inline validation message
      if (!/^PELANGGAN_[0-9]+$/.test(v)) {
        if (idMsg) idMsg.classList.remove('hidden');
      } else {
        if (idMsg) idMsg.classList.add('hidden');
      }
    });
  }

  // style radio labels when selected
  const genderField = form.querySelector('#fld-gender');
  if (genderField) {
    const labels = Array.from(genderField.querySelectorAll('label'));
    function updateGenderStyles() {
      labels.forEach(lbl => {
        const inp = lbl.querySelector('input[type="radio"]');
        if (inp && inp.checked) {
          // subtle tint for selected, keep text readable
          lbl.classList.add('bg-primary/10','border-primary');
        } else {
          lbl.classList.remove('bg-primary/10','border-primary');
        }
      });
    }
    genderField.addEventListener('change', updateGenderStyles);
    updateGenderStyles();
  }
  const modal = createModal({ title: isEdit ? 'Edit Pelanggan' : 'Tambah Pelanggan', content: form, onClose: null });
  form.querySelector('.btn-cancel').addEventListener('click', () => modal.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const gender = form.querySelector('input[name="JENIS_KELAMIN"]:checked');
    const payload = {
      ID_PELANGGAN: form.ID_PELANGGAN.value.trim(),
      NAMA: form.NAMA.value.trim(),
      DOMISILI: form.DOMISILI.value.trim(),
      JENIS_KELAMIN: gender ? gender.value : 'PRIA',
    };
    // validate required fields
    if (!payload.ID_PELANGGAN || !payload.NAMA || !payload.DOMISILI) { showToast('ID, Nama, dan Domisili harus diisi', { duration: 1800 }); return; }
    if (!/^PELANGGAN_[0-9]+$/.test(payload.ID_PELANGGAN)) { showToast('ID harus berformat PELANGGAN_123', { duration: 1800 }); return; }
    // uniqueness check for create
    if (!isEdit) {
      try {
        const existing = await getList('pelanggan');
        const rows = existing.data || [];
        if (rows.some(r => String(r.ID_PELANGGAN) === String(payload.ID_PELANGGAN))) {
          const uniqMsg = form.querySelector('#fld-uniq-msg'); if (uniqMsg) uniqMsg.classList.remove('hidden');
          return;
        }
      } catch (e) {
        console.error('[page:pelanggan] uniqueness check failed', e);
      }
    }
    try {
      if (isEdit) await update('pelanggan', payload);
      else await create('pelanggan', payload);
      modal.close();
      showToast(isEdit ? 'Data pelanggan diperbarui' : 'Pelanggan berhasil ditambahkan', { duration: 1600 });
      await load();
    } catch (err) {
      console.error('[page:pelanggan] save error', err);
      showToast('Gagal menyimpan data', { duration: 1800 });
    }
  });
  modal.open();
}

// wire buttons
document.addEventListener('DOMContentLoaded', ()=>{
  initNav();
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async ()=>{ bustCache('pelanggan'); await load(); showToast('Refreshed'); });
    // ensure a single global Tambah button next to Refresh
    if (!document.getElementById('btn-add')){
      const btnAddGlobal = document.createElement('button');
  btnAddGlobal.id = 'btn-add'; btnAddGlobal.type = 'button';
  btnAddGlobal.className = 'w-full sm:w-auto px-3 py-2 bg-primary text-white rounded text-sm flex items-center justify-center gap-2';
      btnAddGlobal.setAttribute('aria-label','Tambah');
      btnAddGlobal.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg> Tambah`;
      btnAddGlobal.addEventListener('click', ()=> openForm());
      try{ btnRefresh.parentNode.insertBefore(btnAddGlobal, btnRefresh.nextSibling); }catch(e){ document.body.appendChild(btnAddGlobal); }
    }
  }
  highlightActive();
  load();
});
