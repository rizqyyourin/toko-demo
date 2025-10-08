import { getList, create, update, remove, bustCache } from '../services/api.js';
import { tableSkeleton } from '../components/skeleton.js';
import { createTable } from '../components/table.js';
import { createModal } from '../components/modal.js';
import { highlightActive, initNav } from '../components/nav.js';
import { showToast } from '../components/toast.js';

const containerEl = document.getElementById('container');
// formatter for rupiah without decimals
const currencyFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

function parseIntFromStr(v){ if(v==null) return 0; const s = String(v).replace(/[^0-9\-]/g,''); return s ? Number(s) : 0; }
function formatRupiah(v){ return 'Rp ' + currencyFmt.format(Number(v||0)); }
function formatDateLongISO(iso){ try{ if(!iso) return ''; // support stored short format DD/MM/YY
    if(/^\d{2}\/\d{2}\/\d{2}$/.test(String(iso))){ const m = String(iso).match(/(\d{2})\/(\d{2})\/(\d{2})/); if(m){ const d = new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])); if(!isNaN(d)) { const parts = new Intl.DateTimeFormat('id-ID',{ day:'numeric', month:'long', year:'numeric' }).format(d).split(' '); if(parts.length>=3) return `${parts[0]} ${parts[1].toLowerCase()} ${parts[2]}`; return parts.join(' '); } } }
  // if ISO YYYY-MM-DD, construct Date with components to avoid timezone shifts
  const isoMatch = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let d;
  if(isoMatch){ d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])); }
  else { d = new Date(iso); }
    if(isNaN(d)) return String(iso);
    const parts = new Intl.DateTimeFormat('id-ID',{ day:'numeric', month:'long', year:'numeric' }).format(d).split(' ');
    if(parts.length>=3) return `${parts[0]} ${parts[1].toLowerCase()} ${parts[2]}`;
    return parts.join(' ');
  }catch(e){ return String(iso); } }

// convert input YYYY-MM-DD (date input value) to DD/MM/YY
function formatDateShortFromInput(input){ try{ if(!input) return ''; // input expected 'YYYY-MM-DD'
    const m = String(input).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return '';
    const yy = String(m[1]).slice(2);
    return `${m[3].padStart(2,'0')}/${m[2].padStart(2,'0')}/${yy}`;
  }catch(e){ return ''; } }

// parse stored date (ISO or DD/MM/YY) to YYYY-MM-DD for date input
function parseStoredDateToInput(stored){ try{ if(!stored) return ''; const s = String(stored).trim(); // if ISO
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    // if DD/MM/YY
    const shortMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
    if(shortMatch){ const year = 2000 + Number(shortMatch[3]); const mm = shortMatch[2].padStart(2,'0'); const dd = shortMatch[1].padStart(2,'0'); return `${year}-${mm}-${dd}`; }
    // fallback: try Date parsing
    const d = new Date(s); if(!isNaN(d)) return d.toISOString().slice(0,10);
    return '';
  }catch(e){ return ''; } }

async function openForm(row=null){
  const isEdit = !!row;
  const form = document.createElement('form'); form.className='space-y-4';

  // fetch pelanggan and barang lists to populate selects
  let pelangganList = [];
  let barangList = [];
  try{ const p = await getList('pelanggan'); pelangganList = p.data || []; }catch(e){ console.warn('[page:penjualan] failed to fetch pelanggan for form', e); }
  try{ const b = await getList('barang'); barangList = b.data || []; }catch(e){ console.warn('[page:penjualan] failed to fetch barang for form', e); }

  form.innerHTML = `
    <div class="grid grid-cols-1 gap-3">
      <label class="block"><div class="text-sm font-medium mb-1">ID Nota</div><input id="fld-nota" name="ID_NOTA" class="w-full border border-border rounded px-3 py-2" ${isEdit? 'readonly':''} pattern="^NOTA_[0-9]+$"></label>
      <div id="fld-nota-msg" class="text-sm text-danger mt-1 hidden">Format harus NOTA_angka (contoh: NOTA_12)</div>
      <label class="block"><div class="text-sm font-medium mb-1">Tanggal</div><input id="fld-tgl" name="TGL" type="date" class="w-full border border-border rounded px-3 py-2"></label>
      <label class="block"><div class="text-sm font-medium mb-1">Kode Pelanggan</div>
        <select id="fld-kode-pelanggan" name="KODE_PELANGGAN" class="w-full border border-border rounded px-3 py-2"></select>
      </label>

      <div>
        <div class="flex items-start justify-between">
          <div class="text-sm font-medium mb-2">Item Barang</div>
          <div class="mb-2"><button id="btn-add-item" type="button" class="px-3 py-1 border rounded text-sm">Tambah Item</button></div>
        </div>
  <div class="overflow-x-auto overflow-visible">
          <table id="items-table" class="w-full border-collapse">
            <thead>
              <tr class="text-left text-sm text-muted">
                <th class="p-2 min-w-[120px]">Barang</th>
                <th class="p-2 w-36">Qty</th>
                <th class="p-2 w-28 text-right">Subtotal</th>
                <th class="p-2 w-16">&nbsp;</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div class="mt-3 text-sm text-muted flex justify-end gap-4">
          <div>Total Qty: <span id="total-qty">0</span></div>
          <div>SUBTOTAL: <strong id="total-subtotal">Rp 0</strong></div>
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-2"><button type="button" class="btn-cancel px-3 py-2">Batal</button><button type="submit" class="btn-submit px-3 py-2 bg-primary text-white rounded">Simpan</button></div>
  `;

  const notaField = form.querySelector('#fld-nota');
  const tglField = form.querySelector('#fld-tgl');
  const kodeField = form.querySelector('#fld-kode-pelanggan');
  const itemsTbody = form.querySelector('#items-table tbody');
  const btnAddItem = form.querySelector('#btn-add-item');
  const totalQtyEl = form.querySelector('#total-qty');
  const totalSubtotalEl = form.querySelector('#total-subtotal');

  // populate pelanggan dropdown
  (function populatePelanggan(){
    kodeField.innerHTML = '';
    const emptyOpt = document.createElement('option'); emptyOpt.value=''; emptyOpt.textContent='-- pilih pelanggan --'; kodeField.appendChild(emptyOpt);
    pelangganList.forEach(p => {
      const opt = document.createElement('option'); opt.value = p.ID_PELANGGAN || p.ID || p.ID_PELANGGAN; opt.textContent = p.NAMA || opt.value; kodeField.appendChild(opt);
    });
  })();

  // helper to format currency
  const fmt = (v)=>{
    if(v==='' || v===null) return '';
    const n = Number(v);
    if(isNaN(n)) return 'Rp ' + currencyFmt.format(0);
    return 'Rp ' + currencyFmt.format(n);
  };

  

  function computeTotals(){
    let totalQty = 0; let totalSub = 0;
    Array.from(itemsTbody.querySelectorAll('tr')).forEach(tr=>{
      const qty = Number(tr.querySelector('.it-qty').value||0);
      const kode = tr.querySelector('.it-barang').value;
      // try to read price from select option dataset (if present) or from barangList fallback
      let price = 0;
      try{
        const sel = tr.querySelector('.it-barang');
        const opt = (sel && sel.selectedOptions && sel.selectedOptions[0]) || (sel && sel.options && sel.options[sel.selectedIndex]);
        if(opt && opt.dataset && opt.dataset.harga){ price = Number(String(opt.dataset.harga).replace(/[^0-9\-\.]/g,'')) || 0; }
      }catch(e){}
      if(!price){ const match = barangList.find(b => (b.KODE||b.KODE_BARANG||b.KODE) == kode); if(match){ price = Number(match.HARGA||0); } }
      // fallback: if the row has a HARGA input stored as data attribute or initial data, try that
  const rowHarga = (function(){ try{ const stored = tr.dataset.harga; if(stored !== undefined && stored !== null && String(stored).trim() !== '') return Number(String(stored).replace(/[^0-9\-\.]/g,''))||0; return null;}catch(e){return null;} })();
  if((price === 0 || !price) && rowHarga !== null){ price = rowHarga; }
      totalQty += qty;
      const line = qty * (price||0);
      totalSub += line;
      const subCell = tr.querySelector('.it-subtotal'); if(subCell) subCell.textContent = fmt(line);
    });
    totalQtyEl.textContent = String(totalQty);
    totalSubtotalEl.textContent = fmt(totalSub);
    return { totalQty, totalSub };
  }

  function createItemRow(data={}){
    const tr = document.createElement('tr'); tr.className='border-t';
    // barang select
    const tdBarang = document.createElement('td'); tdBarang.className='p-2';
  const sel = document.createElement('select'); sel.className='w-full min-w-[120px] border border-border rounded px-2 py-1 it-barang bg-white text-text';
    const none = document.createElement('option'); none.value=''; none.textContent='-- pilih barang --'; sel.appendChild(none);
  barangList.forEach(b=>{ const o=document.createElement('option'); o.value = b.KODE || b.KODE_BARANG || b.KODE; o.textContent = b.NAMA || o.value; o.dataset.harga = String(b.HARGA || 0); sel.appendChild(o); });
    if(data.KODE_BARANG) sel.value = data.KODE_BARANG || data.KODE;
  tdBarang.appendChild(sel); tr.appendChild(tdBarang);
  // attach per-row HARGA as data attribute for fallback when barang list changes
  try{
    let initialPrice = null;
    if(data.HARGA != null){ initialPrice = Number(data.HARGA)||0; }
    if(initialPrice === null || initialPrice === 0){ // try to find price from barangList by kode
      const kode = data.KODE_BARANG || data.KODE || sel.value;
      if(kode){ const m = barangList.find(b => (b.KODE||b.KODE_BARANG||b.KODE) == kode); if(m && m.HARGA != null) initialPrice = Number(m.HARGA)||0; }
    }
    if(initialPrice !== null){ tr.dataset.harga = String(initialPrice); }
  }catch(e){}

    // qty input
    const tdQty = document.createElement('td'); tdQty.className='p-2';
  const inQty = document.createElement('input'); inQty.type='number'; inQty.min='0'; inQty.step='1';
  // larger, more prominent qty input: bigger padding and larger font for touch devices
  inQty.className='w-full border border-border rounded px-3 py-2 sm:px-3 sm:py-2 it-qty bg-white text-text text-base sm:text-lg';
  inQty.value = data.QTY != null ? String(Number(data.QTY)) : '1';
    tdQty.appendChild(inQty); tr.appendChild(tdQty);

    // subtotal cell
  const tdSub = document.createElement('td'); tdSub.className='p-2 text-right it-subtotal text-text'; tdSub.textContent = fmt(0);
    tr.appendChild(tdSub);

    // remove button
    const tdAct = document.createElement('td'); tdAct.className='p-2';
  const btnRem = document.createElement('button'); btnRem.type='button'; btnRem.className='px-2 py-1 bg-danger text-white rounded text-sm'; btnRem.textContent = 'Hapus'; btnRem.addEventListener('click', ()=>{ tr.remove(); computeTotals(); });
    tdAct.appendChild(btnRem); tr.appendChild(tdAct);

  // wiring: recompute totals when barang or qty changes
  sel.addEventListener('change', ()=>{
    // when user changes selected barang, clear any per-row stored harga (use option dataset instead)
    try{ delete tr.dataset.harga; }catch(e){}
    computeTotals();
  });
  inQty.addEventListener('input', computeTotals);

    // don't compute totals here; caller will compute after appending the row
    return tr;
  }

  // add initial row when creating
  if(isEdit){
    // prefill fields for edit
    notaField.value = row.ID_NOTA;
    try{ tglField.value = parseStoredDateToInput(row.TGL); }catch(e){}
    kodeField.value = row.KODE_PELANGGAN || '';
    // load existing item rows for this nota
    try{
      const res = await getList('item_penjualan');
      const items = (res.data||[]).filter(it => String(it.NOTA||it.NOTA) === String(row.ID_NOTA));
      items.forEach(it=>{ itemsTbody.appendChild(createItemRow({ KODE_BARANG: it.KODE_BARANG || it.KODE, QTY: it.QTY || it.JUMLAH || 0, HARGA: it.HARGA || 0 })); });
      // compute totals after all rows appended so last row is included
      computeTotals();
    }catch(e){ console.warn('[page:penjualan] failed to load item_penjualan for edit', e); }
  } else {
    // new nota: compute next and set today's date
    try{ const res = await getList('penjualan'); const rows = res.data || []; let max=0; rows.forEach(r=>{ const m = (r.ID_NOTA||'').toString().match(/NOTA_(\d+)$/i); if(m){ const n=parseInt(m[1],10); if(!isNaN(n) && n>max) max=n; } }); const next = max+1; notaField.value = `NOTA_${next}`; }catch(e){ notaField.value='NOTA_1'; }
    // set date to today by default
    const today = new Date(); tglField.value = today.toISOString().slice(0,10);
    // start with one empty item row
    itemsTbody.appendChild(createItemRow());
    computeTotals();
  }

  // add item button
  btnAddItem.addEventListener('click', ()=>{ itemsTbody.appendChild(createItemRow()); computeTotals(); });

  // ID sanitization
  if(notaField){ const idMsg = form.querySelector('#fld-nota-msg'); notaField.addEventListener('input', ()=>{ const v = notaField.value.toUpperCase().replace(/[^A-Z0-9_]/g,''); notaField.value = v; if(!/^NOTA_[0-9]+$/.test(v)){ if(idMsg) idMsg.classList.remove('hidden'); } else { if(idMsg) idMsg.classList.add('hidden'); } }); }

  const modal = createModal({ title: isEdit ? 'Edit Penjualan' : 'Tambah Penjualan', content: form, onClose: null });
  form.querySelector('.btn-cancel').addEventListener('click', ()=> modal.close());

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    // collect items
    const rows = Array.from(itemsTbody.querySelectorAll('tr'));
    const items = rows.map(tr => {
      const kode = tr.querySelector('.it-barang').value;
      const qty = Number(tr.querySelector('.it-qty').value||0);
      // resolve harga: option dataset -> barangList lookup -> tr.dataset.harga -> 0
      let harga = 0;
      try{ const sel = tr.querySelector('.it-barang'); const opt = (sel && sel.selectedOptions && sel.selectedOptions[0]) || (sel && sel.options && sel.options[sel.selectedIndex]); if(opt && opt.dataset && opt.dataset.harga) harga = Number(String(opt.dataset.harga).replace(/[^0-9\-\.]/g,''))||0; }catch(e){}
  if(!harga){ const m = barangList.find(b=> (b.KODE||b.KODE_BARANG||b.KODE) == kode); if(m) harga = Number(m.HARGA||0); }
  if((harga === 0 || !harga)){ try{ const stored = tr.dataset.harga; if(stored !== undefined && stored !== null && String(stored).trim() !== '') harga = Number(String(stored).replace(/[^0-9\-\.]/g,''))||0; }catch(e){} }
      return { KODE_BARANG: kode, QTY: qty, HARGA: harga };
    }).filter(it=>it.KODE_BARANG && it.QTY>0);
    if(!notaField.value || !kodeField.value){ showToast('ID_NOTA dan KODE_PELANGGAN harus diisi'); return; }
    if(!/^NOTA_[0-9]+$/.test(notaField.value)){ showToast('Format ID_NOTA salah'); return; }
    if(items.length===0){ showToast('Tambahkan minimal satu item'); return; }
    const totals = computeTotals();
  const payload = { ID_NOTA: notaField.value.trim(), TGL: (tglField.value ? formatDateShortFromInput(tglField.value) : ''), KODE_PELANGGAN: kodeField.value.trim(), SUBTOTAL: Number(totals.totalSub || 0), TOTAL_QTY: Number(totals.totalQty || 0) };

    try{
      if(isEdit){
        await update('penjualan', payload);
        // delete existing items for this nota then recreate
        try{ await remove('item_penjualan', { NOTA: payload.ID_NOTA }); }catch(er){ console.warn('[page:penjualan] failed to remove existing item_penjualan before recreate', er); }
      } else {
        await create('penjualan', payload);
      }
      // create item_penjualan rows
      for(const it of items){
        // include the penjualan date (TGL) on each item row so item_penjualan can be filtered directly
        const itemPayload = { NOTA: payload.ID_NOTA, KODE_BARANG: it.KODE_BARANG, QTY: it.QTY, HARGA: it.HARGA, SUBTOTAL: Number(it.QTY * it.HARGA || 0), TGL: payload.TGL };
        try{ await create('item_penjualan', itemPayload); }catch(er){ console.error('[page:penjualan] failed to create item_penjualan', er); }
      }
      modal.close();
      showToast(isEdit? 'Data penjualan diperbarui':'Penjualan berhasil ditambahkan');
      await load();
    }catch(err){ console.error('[page:penjualan] save error', err); showToast('Gagal menyimpan'); }
  });
  modal.open();
}

function updateSortIcons(wrap){
  const ths = wrap.querySelectorAll('thead th');
  ths.forEach((th, idx)=>{ const icon = th.querySelector('span'); const col = (state.cols && state.cols[idx])||null; if(!icon) return; if(!col||!col.sortable){ icon.innerHTML=''; th.classList.remove('text-primary'); return;} if(state.sort.field===col.field){ icon.innerHTML = state.sort.dir===1 ? '▲' : '▼'; th.classList.add('text-primary'); icon.classList.add('text-primary'); } else { icon.innerHTML=''; th.classList.remove('text-primary'); icon.classList.remove('text-primary'); } });
}

function applyFilterSort(){
  let rows = state.rows.slice();
  if(state.query){ const q=state.query.toLowerCase(); rows = rows.filter(r => { const namaPel = (state.pelangganMap && state.pelangganMap[r.KODE_PELANGGAN]) ? state.pelangganMap[r.KODE_PELANGGAN] : (r.NAMA_PELANGGAN||r.NAMA||''); const combined = ((r.ID_NOTA||'') + ' ' + (r.KODE_PELANGGAN||'') + ' ' + namaPel + ' ' + (formatDateLongISO(r.TGL)||'') + ' ' + String(r.SUBTOTAL||'')).toLowerCase(); return combined.includes(q); }); }
  if(state.sort.field){ rows.sort((a,b)=>{ const f=state.sort.field; if(f==='ID_NOTA'){ const na = (a.ID_NOTA||'').toString().match(/(\d+)$/); const nb = (b.ID_NOTA||'').toString().match(/(\d+)$/); const ia=na?parseInt(na[1],10):-1; const ib=nb?parseInt(nb[1],10):-1; if(ia<ib) return -1*state.sort.dir; if(ia>ib) return 1*state.sort.dir; return 0; } if(f==='TGL'){ const da=new Date(a.TGL||0); const db=new Date(b.TGL||0); return (da<db? -1: da>db?1:0) * state.sort.dir; } if(f==='SUBTOTAL'){ const va=parseIntFromStr(a.SUBTOTAL); const vb=parseIntFromStr(b.SUBTOTAL); return (va<vb? -1: va>vb? 1:0) * state.sort.dir; } const fa=(a[f]||'').toString().toLowerCase(); const fb=(b[f]||'').toString().toLowerCase(); if(fa<fb) return -1*state.sort.dir; if(fa>fb) return 1*state.sort.dir; return 0; }); }
  const total = rows.length; const per = state.perPage||10; const totalPages = Math.max(1, Math.ceil(total/per)); if(state.page>totalPages) state.page=totalPages; const start=(state.page-1)*per; const end=start+per; const pageRows = rows.slice(start,end);
  const area = containerEl.querySelector('#list-area'); const tableWrap = state.tableWrap || (area && area.querySelector('div.w-full')); if(!tableWrap) return; const tbody = tableWrap.querySelector('tbody'); if(!tbody) return;
  const noResultsId='no-results-penjualan'; const existingNo = area.querySelector('#'+noResultsId);
  if(total===0){ try{ tableWrap.style.display='none'; }catch(e){} if(!existingNo){ const msg=document.createElement('div'); msg.id=noResultsId; msg.className='text-muted py-6 text-center'; msg.textContent='Tidak ada data yang sesuai.'; const pagEl=document.getElementById('pagination'); if(pagEl) area.insertBefore(msg,pagEl); else area.appendChild(msg); } else { existingNo.style.display=''; existingNo.textContent='Tidak ada data yang sesuai.'; } const pagEl=document.getElementById('pagination'); if(pagEl) pagEl.style.display='none'; return; }
  if(existingNo) existingNo.style.display='none'; try{ tableWrap.style.display=''; }catch(e){}
  tbody.innerHTML=''; const colDefs = state.cols||[]; pageRows.forEach(r=>{ const tr=document.createElement('tr'); tr.className='odd:bg-[rgba(99,102,241,0.03)]'; colDefs.forEach(col=>{ const td=document.createElement('td'); td.className=`px-3 py-2 text-sm text-text ${col.tdClass||''}`; if(col.render){ const cell = col.render(r[col.field], r); if(typeof cell==='string') td.innerHTML=cell; else td.appendChild(cell); } else { td.textContent = r[col.field]||''; } tr.appendChild(td); }); tbody.appendChild(tr); }); try{ updateSortIcons(state.tableWrap); }catch(e){} renderPagination(total, state.page, totalPages);
}

function renderPagination(total, page, totalPages){ const pag = document.getElementById('pagination'); if(!pag) return; pag.innerHTML=''; const info=document.createElement('div'); info.className='text-sm text-muted'; info.textContent=`Menampilkan ${Math.min(total,(page-1)*state.perPage+1)} - ${Math.min(total,page*state.perPage)} dari ${total}`; pag.appendChild(info); const ctrl=document.createElement('div'); ctrl.className='ml-auto flex items-center gap-2'; const prev=document.createElement('button'); prev.textContent='‹'; prev.className='px-2 py-1 border rounded'; prev.disabled = page<=1; prev.addEventListener('click', ()=>{ if(state.page>1){ state.page--; applyFilterSort(); } }); const next=document.createElement('button'); next.textContent='›'; next.className='px-2 py-1 border rounded'; next.disabled = page>=totalPages; next.addEventListener('click', ()=>{ if(state.page<totalPages){ state.page++; applyFilterSort(); } }); ctrl.appendChild(prev); const startPage=Math.max(1,page-2); const endPage=Math.min(totalPages,startPage+4); for(let p=startPage;p<=endPage;p++){ const b=document.createElement('button'); b.textContent=String(p); b.className=`px-2 py-1 border rounded ${p===page? 'bg-primary text-white':''}`; b.addEventListener('click', ()=>{ state.page=p; applyFilterSort(); }); ctrl.appendChild(b); } ctrl.appendChild(next); pag.appendChild(ctrl); }

const state = { rows: [], sort: { field: null, dir: 1 }, query: '', page: 1, perPage: 10, cols: null, tableWrap: null };

async function renderList(items){
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  if(!items || !items.length){ area.innerHTML = '<div class="text-muted">Tidak ada penjualan.</div>'; return; }
  state.rows = (items||[]).slice();

  const toolbar = document.createElement('div'); toolbar.className='mb-3 flex gap-2 items-center flex-col sm:flex-row';
  const left = document.createElement('div'); left.className='flex-1 w-full flex gap-2 items-center';
  const input = document.createElement('input'); input.className='border border-border rounded px-3 py-2 w-full'; input.placeholder='Cari nota, pelanggan atau tanggal (tekan Enter)...'; input.value = state.query || '';
  left.appendChild(input);
  const btnSearch = document.createElement('button'); btnSearch.type='button'; btnSearch.className='px-3 py-2 bg-primary text-white rounded text-sm flex items-center gap-2'; btnSearch.setAttribute('aria-label','Cari'); btnSearch.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"/></svg>`;
  const btnReset = document.createElement('button'); btnReset.type='button'; btnReset.className='px-3 py-2 border border-border rounded text-sm flex items-center gap-2'; btnReset.setAttribute('aria-label','Reset pencarian'); btnReset.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
  left.appendChild(btnSearch); left.appendChild(btnReset);
  // append the left side only (search controls). The global Add button is inserted in the header next to Refresh.
  toolbar.appendChild(left);
  area.appendChild(toolbar);

  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ state.query = input.value.trim(); state.page = 1; applyFilterSort(); } });
  btnSearch.addEventListener('click', ()=>{ state.query = input.value.trim(); state.page = 1; applyFilterSort(); });
  btnReset.addEventListener('click', ()=>{ input.value=''; state.query=''; state.page=1; applyFilterSort(); });
  try{ input.focus(); }catch(e){}

  const cols = [
    { label: 'ID_NOTA', field: 'ID_NOTA', class: 'w-36', tdClass: 'font-mono', sortable: true },
    { label: 'TGL', field: 'TGL', class: 'w-36', sortable: true, render: (v)=>{ const d=document.createElement('div'); d.textContent = formatDateLongISO(v); return d; } },
  { label: 'Nama Pelanggan', field: 'KODE_PELANGGAN', class: '', sortable: true, render: (v,row)=>{ const d=document.createElement('div'); const name = (state.pelangganMap && state.pelangganMap[v]) ? state.pelangganMap[v] : (row && (row.NAMA_PELANGGAN || row.NAMA || '')) || v || ''; d.textContent = name; return d; } },
    { label: 'SUBTOTAL', field: 'SUBTOTAL', class: 'text-right w-28', tdClass: 'text-right', sortable: true, render: (v)=>{ const d=document.createElement('div'); d.textContent = formatRupiah(parseIntFromStr(v)); return d; } },
    { label: 'Aksi', field: '__actions', class: 'w-40', tdClass: 'w-40', render: (_, row) => {
      const wrap = document.createElement('div'); wrap.className='flex gap-2';
  const edit = document.createElement('button'); edit.className='px-2 py-1 bg-primary text-white rounded text-sm'; edit.textContent='Edit'; edit.addEventListener('click', ()=> openForm(row));
  const del = document.createElement('button'); del.className='px-2 py-1 bg-danger text-white rounded text-sm'; del.textContent='Hapus';
  del.addEventListener('click', async ()=>{ if(!confirm('Hapus nota ini?')) return; try{ await remove('penjualan',{ID_NOTA: row.ID_NOTA}); showToast('Nota dihapus'); await load(); }catch(e){ console.error('[page:penjualan] delete error', e); showToast('Gagal menghapus'); } });
  const view = document.createElement('button'); view.className='px-2 py-1 border rounded text-sm'; view.textContent='Lihat'; view.addEventListener('click', ()=>{ const nota = row.ID_NOTA; if(!nota) return; location.href = `item-penjualan.html?nota=${encodeURIComponent(nota)}`; });
  wrap.appendChild(edit); wrap.appendChild(del); wrap.appendChild(view); return wrap;
    } }
  ];

  const { wrap } = createTable({ columns: cols, rows: [], rowKey: 'ID_NOTA' });
  state.cols = cols; state.tableWrap = wrap;

  const ths = wrap.querySelectorAll('thead th');
  ths.forEach((th, idx)=>{ const col = cols[idx]; if(!col || !col.sortable) return; const icon = document.createElement('span'); icon.className='ml-2 text-[10px] inline-block'; th.appendChild(icon); th.style.cursor='pointer'; th.addEventListener('click', ()=>{ const f = col.field; if(state.sort.field===f) state.sort.dir=-state.sort.dir; else { state.sort.field=f; state.sort.dir=1; } state.page=1; updateSortIcons(wrap); applyFilterSort(); }); });

  area.appendChild(wrap);
  const pag = document.createElement('div'); pag.id='pagination'; pag.className='mt-3 flex items-center gap-2'; area.appendChild(pag);
  updateSortIcons(wrap); applyFilterSort();
}

export async function load() {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  area.appendChild(tableSkeleton(6, 4));
  try {
    const res = await getList('penjualan');
    console.debug('[page:penjualan] load fromCache=', !!res.fromCache);
    const data = res.data || [];
    // also fetch pelanggan for name lookup in the KODE_PELANGGAN column
    try{ const p = await getList('pelanggan'); const pel = (p.data||[]); state.pelangganMap = {}; pel.forEach(x=>{ state.pelangganMap[x.ID_PELANGGAN || x.ID || ''] = x.NAMA || ''; }); }catch(e){ console.warn('[page:penjualan] failed to load pelanggan for name map', e); }
    await renderList(data);
  } catch (err) {
    area.innerHTML = '<div class="text-danger">Gagal memuat penjualan.</div>';
  }
}

function initPage(){
  initNav();
  highlightActive();
  const btnRefresh = document.getElementById('btn-refresh');
  if(btnRefresh){
    // ensure only one handler
    btnRefresh.removeEventListener && btnRefresh.removeEventListener('click', (()=>{}));
    btnRefresh.addEventListener('click', async ()=>{ await load(); showToast('Refreshed'); });
    // add global Tambah button next to refresh (if not present)
    if(!document.getElementById('btn-add')){
      const btnAddGlobal = document.createElement('button');
      btnAddGlobal.id = 'btn-add';
      btnAddGlobal.type = 'button';
      btnAddGlobal.className = 'w-full sm:w-auto px-3 py-2 bg-primary text-white rounded text-sm flex items-center justify-center gap-2';
      btnAddGlobal.setAttribute('aria-label','Tambah');
      btnAddGlobal.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg> Tambah`;
      btnAddGlobal.addEventListener('click', ()=> openForm());
      // insert after refresh button
      try{ btnRefresh.parentNode.insertBefore(btnAddGlobal, btnRefresh.nextSibling); }catch(e){ /* fallback: append to body */ document.body.appendChild(btnAddGlobal); }
    }
  }
  // initial load
  load();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPage); else initPage();
