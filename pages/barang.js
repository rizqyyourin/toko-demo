import { getList, create, update, remove, bustCache } from '../services/api.js';
import { createModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { tableSkeleton } from '../components/skeleton.js';
import { createTable } from '../components/table.js';
import { highlightActive, initNav } from '../components/nav.js';

const containerEl = document.getElementById('container');
const state = { rows: [], sort: { field: null, dir: 1 }, query: '', page: 1, perPage: 10, cols: null, tableWrap: null };
// Rupiah formatter without decimal places (e.g. "Rp 1.234")
const currencyFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

async function renderList(items) {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  if (!items.length) {
    area.innerHTML = '<div class="text-muted">Tidak ada barang.</div>';
    return;
  }
  state.rows = items.slice();

  const toolbar = document.createElement('div');
  toolbar.className = 'mb-3 flex gap-2 items-center flex-col sm:flex-row';
  const left = document.createElement('div');
  left.className = 'flex-1 w-full flex gap-2 items-center';
  const input = document.createElement('input');
  input.className = 'border border-border rounded px-3 py-2 w-full';
  input.placeholder = 'Cari kode, nama atau kategori (tekan Enter)...';
  input.value = state.query || '';
  left.appendChild(input);
  const btnSearch = document.createElement('button');
  btnSearch.type = 'button';
  btnSearch.className = 'px-3 py-2 bg-primary text-white rounded text-sm flex items-center gap-2';
  btnSearch.setAttribute('aria-label', 'Cari');
  btnSearch.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>`;
  const btnReset = document.createElement('button');
  btnReset.type = 'button';
  btnReset.className = 'px-3 py-2 border border-border rounded text-sm flex items-center gap-2';
  btnReset.setAttribute('aria-label', 'Reset pencarian');
  btnReset.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
  left.appendChild(btnSearch); left.appendChild(btnReset);
  toolbar.appendChild(left);
  area.appendChild(toolbar);

  input.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { state.query = input.value.trim(); state.page = 1; applyFilterSort(); } });
  btnSearch.addEventListener('click', ()=>{ state.query = input.value.trim(); state.page = 1; applyFilterSort(); });
  btnReset.addEventListener('click', ()=>{ input.value=''; state.query=''; state.page=1; applyFilterSort(); });
  try{ input.focus(); }catch(e){}

  const cols = [
    { label: 'KODE', field: 'KODE', class: 'w-36', tdClass: 'font-mono', sortable: true },
    { label: 'NAMA', field: 'NAMA', sortable: true, render: (v)=>{ const d=document.createElement('div'); d.className='truncate max-w-[220px]'; d.textContent=v; d.title=v; return d; } },
    { label: 'KATEGORI', field: 'KATEGORI', class: 'w-36', sortable: true },
  { label: 'HARGA', field: 'HARGA', class: 'w-28', tdClass: 'text-right', sortable: true, render: (v)=>{ const d=document.createElement('div'); d.className='text-right'; d.textContent = 'Rp ' + currencyFmt.format(Number(v||0)); return d; } },
  { label: 'STOCK', field: 'STOCK', class: 'w-20 text-center', tdClass: 'text-center', sortable: true, render: (v)=>{
      const wrap = document.createElement('div');
      const val = (v === undefined || v === null || String(v).trim() === '') ? 0 : Number(v);
      if (!val || Number(val) <= 0) {
        const badge = document.createElement('span'); badge.className = 'inline-block px-2 py-1 text-xs text-danger border border-danger rounded'; badge.textContent = 'kosong'; wrap.appendChild(badge);
      } else {
        const d = document.createElement('div'); d.className='text-center font-mono'; d.textContent = String(Number(val)); wrap.appendChild(d);
      }
      return wrap;
    } },
    { label: 'Aksi', field: '__actions', class: 'w-36', tdClass: 'w-36', render: (_, row) => {
      const wrap = document.createElement('div'); wrap.className='flex gap-2';
      const edit = document.createElement('button'); edit.className='px-2 py-1 bg-primary text-white rounded text-sm'; edit.textContent='Edit'; edit.addEventListener('click', ()=> openForm(row));
      const del = document.createElement('button'); del.className='px-2 py-1 bg-danger text-white rounded text-sm'; del.textContent='Hapus';
      del.addEventListener('click', async ()=>{ if(!confirm('Hapus barang ini?')) return; try{ await remove('barang',{KODE: row.KODE}); showToast('Barang dihapus'); await load(); }catch(e){ console.error(e); showToast('Gagal menghapus'); }});
  // notify other pages about change
  // removed cross-tab broadcast to avoid unexpected auto-refresh behavior
      wrap.appendChild(edit); wrap.appendChild(del); return wrap;
    } }
  ];

  const { wrap } = createTable({ columns: cols, rows: [], rowKey: 'KODE' });
  state.cols = cols; state.tableWrap = wrap;
  const ths = wrap.querySelectorAll('thead th');
  ths.forEach((th, idx)=>{
    const col = cols[idx]; if(!col || !col.sortable) return;
    const icon = document.createElement('span'); icon.className='ml-2 text-[10px] inline-block'; th.appendChild(icon); th.style.cursor='pointer';
    th.addEventListener('click', ()=>{ const f = col.field; if(state.sort.field===f) state.sort.dir=-state.sort.dir; else { state.sort.field=f; state.sort.dir=1;} state.page=1; updateSortIcons(wrap); applyFilterSort(); });
  });
  area.appendChild(wrap);

  const pag = document.createElement('div'); pag.id='pagination'; pag.className='mt-3 flex items-center gap-2'; area.appendChild(pag);
  updateSortIcons(wrap); applyFilterSort();
}

function updateSortIcons(wrap){
  const ths = wrap.querySelectorAll('thead th');
  ths.forEach((th, idx)=>{ const icon = th.querySelector('span'); const col = (state.cols && state.cols[idx])||null; if(!icon) return; if(!col||!col.sortable){ icon.innerHTML=''; th.classList.remove('text-primary'); return;} if(state.sort.field===col.field){ icon.innerHTML = state.sort.dir===1 ? '▲' : '▼'; th.classList.add('text-primary'); icon.classList.add('text-primary'); } else { icon.innerHTML=''; th.classList.remove('text-primary'); icon.classList.remove('text-primary'); } });
}

function applyFilterSort(){
  let rows = state.rows.slice();
  if(state.query){ const q=state.query.toLowerCase().trim(); // support special keyword 'kosong' to show out-of-stock items
    if(q.includes('kosong')){
      rows = rows.filter(r => { const s = r.STOCK; return s === '' || s === null || s === undefined || Number(s) === 0; });
    } else {
      rows = rows.filter(r => { const combined = ((r.NAMA||'') + ' ' + (r.KODE||'') + ' ' + (r.KATEGORI||'') + ' ' + String(r.HARGA||'')).toLowerCase(); return combined.includes(q); });
    }
  }
  if(state.sort.field){ rows.sort((a,b)=>{ const f=state.sort.field; if(f==='KODE'){ const na = (a.KODE||'').match(/BRG_(\d+)$/i); const nb = (b.KODE||'').match(/BRG_(\d+)$/i); const ia=na?parseInt(na[1],10):-1; const ib=nb?parseInt(nb[1],10):-1; if(ia<ib) return -1*state.sort.dir; if(ia>ib) return 1*state.sort.dir; return 0; } if(f==='HARGA'){ const va = Number(a[f]||0); const vb = Number(b[f]||0); return (va<vb ? -1 : va>vb ? 1 : 0) * state.sort.dir; } const fa = (a[f]||'').toString().toLowerCase(); const fb = (b[f]||'').toString().toLowerCase(); if(fa<fb) return -1*state.sort.dir; if(fa>fb) return 1*state.sort.dir; return 0; }); }
  const total = rows.length; const per = state.perPage||10; const totalPages = Math.max(1, Math.ceil(total/per)); if(state.page>totalPages) state.page=totalPages; const start=(state.page-1)*per; const end=start+per; const pageRows = rows.slice(start,end);
  const area = containerEl.querySelector('#list-area'); const tableWrap = state.tableWrap || (area && area.querySelector('div.w-full')); if(!tableWrap) return; const tbody = tableWrap.querySelector('tbody'); if(!tbody) return;
  // no results
  const noResultsId='no-results-barang'; const existingNo = area.querySelector('#'+noResultsId);
  if(total===0){ try{ tableWrap.style.display='none'; }catch(e){} if(!existingNo){ const msg=document.createElement('div'); msg.id=noResultsId; msg.className='text-muted py-6 text-center'; msg.textContent='Tidak ada data yang sesuai.'; const pagEl=document.getElementById('pagination'); if(pagEl) area.insertBefore(msg,pagEl); else area.appendChild(msg); } else { existingNo.style.display=''; existingNo.textContent='Tidak ada data yang sesuai.'; } const pagEl=document.getElementById('pagination'); if(pagEl) pagEl.style.display='none'; return; }
  if(existingNo) existingNo.style.display='none'; try{ tableWrap.style.display=''; }catch(e){}
  tbody.innerHTML=''; const colDefs = state.cols||[]; pageRows.forEach(r=>{ const tr=document.createElement('tr'); tr.className='odd:bg-[rgba(99,102,241,0.03)]'; colDefs.forEach(col=>{ const td=document.createElement('td'); td.className=`px-3 py-2 text-sm text-text ${col.tdClass||''}`; if(col.render){ const cell = col.render(r[col.field], r); if(typeof cell==='string') td.innerHTML=cell; else td.appendChild(cell); } else { td.textContent = r[col.field]||''; } tr.appendChild(td); }); tbody.appendChild(tr); }); try{ updateSortIcons(state.tableWrap); }catch(e){} renderPagination(total, state.page, totalPages);
}

function renderPagination(total, page, totalPages){ const pag = document.getElementById('pagination'); if(!pag) return; pag.innerHTML=''; const info=document.createElement('div'); info.className='text-sm text-muted'; info.textContent=`Menampilkan ${Math.min(total,(page-1)*state.perPage+1)} - ${Math.min(total,page*state.perPage)} dari ${total}`; pag.appendChild(info); const ctrl=document.createElement('div'); ctrl.className='ml-auto flex items-center gap-2'; const prev=document.createElement('button'); prev.textContent='‹'; prev.className='px-2 py-1 border rounded'; prev.disabled = page<=1; prev.addEventListener('click', ()=>{ if(state.page>1){ state.page--; applyFilterSort(); } }); const next=document.createElement('button'); next.textContent='›'; next.className='px-2 py-1 border rounded'; next.disabled = page>=totalPages; next.addEventListener('click', ()=>{ if(state.page<totalPages){ state.page++; applyFilterSort(); } }); ctrl.appendChild(prev); const startPage=Math.max(1,page-2); const endPage=Math.min(totalPages,startPage+4); for(let p=startPage;p<=endPage;p++){ const b=document.createElement('button'); b.textContent=String(p); b.className=`px-2 py-1 border rounded ${p===page? 'bg-primary text-white':''}`; b.addEventListener('click', ()=>{ state.page=p; applyFilterSort(); }); ctrl.appendChild(b); } ctrl.appendChild(next); pag.appendChild(ctrl); }

export async function load(){ const area = containerEl.querySelector('#list-area'); area.innerHTML=''; area.appendChild(tableSkeleton(5,4)); try{ const res = await getList('barang'); console.debug('[page:barang] load fromCache=', !!res.fromCache); const data = res.data || []; await renderList(data); }catch(err){ console.error('[page:barang] load error', err); area.innerHTML = '<div class="text-danger">Gagal memuat barang.</div>'; } }

async function openForm(row=null){ const isEdit=!!row; const form=document.createElement('form'); form.className='space-y-4';
  // gather existing categories from barang list to populate dropdown
  let kategoriOptions = [];
  try{ const all = await getList('barang'); const rows = all.data || []; const set = new Set(); rows.forEach(b => { const k = (b.KATEGORI||'').toString().trim(); if(k) set.add(k); }); kategoriOptions = Array.from(set).sort(); }catch(e){ console.warn('[page:barang] failed to load kategori list', e); }

  form.innerHTML=`
  <div class="grid grid-cols-1 gap-3">
    <label class="block"><div class="text-sm font-medium mb-1">KODE</div><input id="fld-kode" name="KODE" class="w-full border border-border rounded px-3 py-2" ${isEdit? 'readonly':''} pattern="^BRG_[0-9]+$"></label>
    <div id="fld-kode-msg" class="text-sm text-danger mt-1 hidden">Format harus BRG_angka (contoh: BRG_12)</div>
    <label class="block"><div class="text-sm font-medium mb-1">NAMA</div><input id="fld-nama" name="NAMA" class="w-full border border-border rounded px-3 py-2" required></label>
  <label class="block"><div class="text-sm font-medium mb-1">KATEGORI</div><input id="fld-kategori" name="KATEGORI" class="w-full border border-border rounded px-3 py-2"></label>
    <label class="block"><div class="text-sm font-medium mb-1">HARGA</div>
      <div class="flex">
        <input id="fld-harga-display" type="text" class="w-full border border-border rounded px-3 py-2" placeholder="Rp 0">
        <input id="fld-harga" name="HARGA" type="hidden">
      </div>
    </label>
    <label class="block"><div class="text-sm font-medium mb-1">STOCK</div>
      <div class="flex">
        <input id="fld-stock" name="STOCK" type="number" min="0" step="1" class="w-full border border-border rounded px-3 py-2" placeholder="0">
      </div>
    </label>
    <div id="fld-uniq-msg" class="text-sm text-danger mt-1 hidden">Kode sudah ada — gunakan kode lain.</div>
  </div>
  <div class="flex justify-end gap-2 mt-2"><button type="button" class="btn-cancel px-3 py-2">Batal</button><button type="submit" class="btn-submit px-3 py-2 bg-primary text-white rounded">Simpan</button></div>
`;
  // replace kategori input with select populated from kategoriOptions
  const kategoriInput = form.querySelector('#fld-kategori');
  if(kategoriInput){
    const sel = document.createElement('select'); sel.id = 'fld-kategori'; sel.name = 'KATEGORI'; sel.className = kategoriInput.className;
    // make kategori required and accessible
    sel.required = true; sel.setAttribute('aria-required','true');
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = '-- pilih kategori --'; sel.appendChild(empty);
    kategoriOptions.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; sel.appendChild(o); });
    kategoriInput.replaceWith(sel);
    // add inline validation message
    const msg = document.createElement('div'); msg.id = 'fld-kategori-msg'; msg.className = 'text-sm text-danger mt-1 hidden'; msg.textContent = 'Kategori harus dipilih.';
    sel.parentNode.insertBefore(msg, sel.nextSibling);
    sel.addEventListener('change', ()=>{ try{ msg.classList.add('hidden'); }catch(e){} });
  }

  if(isEdit){ form.KODE.value = row.KODE; form.NAMA.value = row.NAMA || ''; const selK = form.querySelector('#fld-kategori'); if(selK) selK.value = row.KATEGORI || ''; form.querySelector('#fld-harga').value = row.HARGA || 0; form.querySelector('#fld-harga-display').value = row.HARGA ? ('Rp ' + currencyFmt.format(Number(row.HARGA))) : ''; try{ const s = form.querySelector('#fld-stock'); if(s) s.value = (row.STOCK !== undefined && row.STOCK !== null) ? String(Number(row.STOCK)) : '0'; }catch(e){} } else { try{ const res = await getList('barang'); const rows = res.data || []; let max=0; rows.forEach(r=>{ const id = (r.KODE||'').toString(); const m = id.match(/BRG_(\d+)$/i); if(m){ const n=parseInt(m[1],10); if(!isNaN(n) && n>max) max = n;} }); const next = max+1; form.KODE.value = `BRG_${next}`; form.querySelector('#fld-harga').value = ''; form.querySelector('#fld-harga-display').value = ''; try{ const s = form.querySelector('#fld-stock'); if(s) s.value = '0'; }catch(e){} }catch(e){ form.KODE.value='BRG_1'; form.querySelector('#fld-harga').value = ''; form.querySelector('#fld-harga-display').value = ''; try{ const s = form.querySelector('#fld-stock'); if(s) s.value = '0'; }catch(e){} }}
  const idField = form.querySelector('#fld-kode'); if(idField){ const idMsg = form.querySelector('#fld-kode-msg'); idField.addEventListener('input', ()=>{ const v = idField.value.toUpperCase().replace(/[^A-Z0-9_]/g,''); idField.value = v; if(!/^BRG_[0-9]+$/.test(v)){ if(idMsg) idMsg.classList.remove('hidden'); } else { if(idMsg) idMsg.classList.add('hidden'); } }); }
  // HARGA display formatting: show "Rp x.xxx" to user, keep numeric value in hidden input (#fld-harga)
  const displayHarga = form.querySelector('#fld-harga-display'); const hiddenHarga = form.querySelector('#fld-harga');
  const fmt = (v)=> v==='' || v===null ? '' : 'Rp ' + currencyFmt.format(Number(v));
  if(displayHarga){ displayHarga.addEventListener('input', (e)=>{ const onlyDigits = (e.target.value||'').replace(/[^0-9]/g,''); hiddenHarga.value = onlyDigits ? String(Number(onlyDigits)) : ''; e.target.value = onlyDigits ? fmt(onlyDigits) : ''; });
    displayHarga.addEventListener('blur', (e)=>{ if(!hiddenHarga.value) e.target.value = ''; else e.target.value = fmt(hiddenHarga.value); }); }
  const modal = createModal({ title: isEdit ? 'Edit Barang' : 'Tambah Barang', content: form, onClose: null });
  form.querySelector('.btn-cancel').addEventListener('click', ()=> modal.close());
  form.addEventListener('submit', async (e)=>{ e.preventDefault(); const payload = { KODE: form.KODE.value.trim(), NAMA: form.NAMA.value.trim(), KATEGORI: form.KATEGORI.value ? form.KATEGORI.value.trim() : '', HARGA: Number(form.HARGA.value), STOCK: Number(form.STOCK && form.STOCK.value ? form.STOCK.value : 0) };
    // validate kategori selection
    if(!payload.KATEGORI){ const km = form.querySelector('#fld-kategori-msg'); if(km) km.classList.remove('hidden'); showToast('Pilih kategori terlebih dahulu'); return; }
    if(!payload.KODE || !payload.NAMA) { showToast('KODE dan NAMA harus diisi'); return; }
    if(!/^BRG_[0-9]+$/.test(payload.KODE)){ showToast('Kode harus berformat BRG_123'); return; }
    // validate stock
    if(!Number.isFinite(payload.STOCK) || payload.STOCK < 0 || !Number.isInteger(payload.STOCK)) { showToast('Stock harus berupa angka bulat >= 0'); const s = form.querySelector('#fld-stock'); if(s && typeof s.focus === 'function') s.focus(); return; }
    if(!isEdit){ try{ const existing = await getList('barang'); const rows = existing.data || []; if(rows.some(r=>String(r.KODE)===String(payload.KODE))){ const uniq = form.querySelector('#fld-uniq-msg'); if(uniq) uniq.classList.remove('hidden'); return; } }catch(e){ console.error('[page:barang] uniqueness check failed', e); } }
  try{ if(isEdit) await update('barang', payload); else await create('barang', payload); modal.close(); showToast(isEdit? 'Data barang diperbarui': 'Barang berhasil ditambahkan'); await load();
  // removed cross-tab broadcast to avoid unexpected auto-refresh behavior
    }catch(err){ console.error('[page:barang] save error', err); showToast('Gagal menyimpan data'); } });
  modal.open();
}

// wire buttons
document.addEventListener('DOMContentLoaded', ()=>{
  initNav();
  const btnRefresh = document.getElementById('btn-refresh');
  if(btnRefresh){
    btnRefresh.addEventListener('click', async ()=>{ bustCache('barang'); await load(); showToast('Refreshed'); });
    if(!document.getElementById('btn-add')){
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
