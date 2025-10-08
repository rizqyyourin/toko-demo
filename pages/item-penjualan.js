import { getList, bustCache } from '../services/api.js';
import { fetchPenjualanMeta } from '../services/penjualan-dates.js';
// ...toast utilities not needed here
import { tableSkeleton } from '../components/skeleton.js';
import { createTable } from '../components/table.js';
import { highlightActive, initNav } from '../components/nav.js';

const containerEl = document.getElementById('container');
// Rupiah formatter without decimals
const currencyFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

function parseNum(v){ try{ if(v==null) return 0; const s = String(v).replace(/[^0-9\-]/g,''); return s ? Number(s) : 0; }catch(e){ return 0; } }

// penjualan metadata cache: nota -> { iso, year, month (0-11), week }
let penjualanMeta = {};

function getQueryParam(name){ try{ const u = new URL(location.href); return u.searchParams.get(name); }catch(e){ return null; } }

async function renderList(items, barangMap = {}, priceMap = {}, penjualanMap = {}, pelangganMap = {}) {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  // diagnostic: we'll compute counts of how many items have item-level TGL, how many can be resolved from penjualanMeta, and how many lack dates
  try{ console.debug('[page:item-penjualan] penjualanMeta sample', Object.keys(penjualanMeta).slice(0,10)); }catch(e){}
  const notaFilter = getQueryParam('nota');
  let rows = items || [];
  // simplified: diagnostics removed
  if(notaFilter){
    rows = rows.filter(r => String(r.NOTA||'') === String(notaFilter));
    const h = document.createElement('div'); h.className='mb-3 flex items-center gap-3';
    const label = document.createElement('div'); label.className='text-sm text-muted'; label.textContent = 'Menampilkan:'; h.appendChild(label);
    const kodePel = penjualanMap && penjualanMap[notaFilter] ? penjualanMap[notaFilter] : null;
    const namaPel = kodePel && pelangganMap && pelangganMap[kodePel] ? pelangganMap[kodePel] : '';
    const notaBadge = document.createElement('div'); notaBadge.className = 'px-3 py-1 border border-border rounded bg-white text-sm font-mono'; notaBadge.textContent = notaFilter; h.appendChild(notaBadge);
    if(namaPel){ const nameBadge = document.createElement('div'); nameBadge.className = 'px-3 py-1 rounded text-sm bg-primary text-white'; nameBadge.textContent = namaPel; h.appendChild(nameBadge); }
    area.appendChild(h);
  }
  if (!rows.length) {
    area.innerHTML = '<div class="text-muted">Tidak ada item penjualan.</div>';
    return;
  }
  // helper: format ISO date (YYYY-MM-DD) to long Indonesian format
  function formatDateLongISO(iso){ try{ if(!iso) return ''; // create from components to avoid timezone shift
      const parts = String(iso).split('-'); if(parts.length<3) return String(iso); const yy = Number(parts[0]); const mm = Number(parts[1]) - 1; const dd = Number(parts[2]); const d = new Date(yy, mm, dd); if(isNaN(d)) return String(iso); return new Intl.DateTimeFormat('id-ID',{ day:'numeric', month:'long', year:'numeric' }).format(d);}catch(e){ return String(iso); } }

  const cols = [
    { label: 'NOTA', field: 'NOTA', class: 'w-28', tdClass: 'font-mono' },
    { label: 'TGL', field: 'TGL', class: 'w-36', render: (v,row)=>{ const d=document.createElement('div'); // prefer item-level TGL then penjualan meta
        const itemT = v || row.TGL || row.tgl || row.Tanggal || row.tanggal || null; if(itemT){ // try to parse if ISO-like or timestamp
          // if itemT looks like ISO timestamp, try to extract date
          const m = String(itemT).match(/^(\d{4}-\d{2}-\d{2})/);
          if(m) { d.textContent = formatDateLongISO(m[1]); return d; }
          // try parse fallback
          try{ const pd = new Date(String(itemT)); if(!isNaN(pd)){ d.textContent = new Intl.DateTimeFormat('id-ID',{ day:'numeric', month:'long', year:'numeric' }).format(pd); return d; } }catch(e){}
          d.textContent = String(itemT); return d;
        }
        const meta = penjualanMeta && penjualanMeta[row.NOTA]; if(meta && meta.iso){ d.textContent = formatDateLongISO(meta.iso); return d; }
        d.textContent = ''; return d; } },
    { label: 'Nama Barang', field: 'KODE_BARANG', class: '', render: (v,row) => { const d = document.createElement('div'); const name = barangMap && barangMap[v] ? barangMap[v] : (row && (row.NAMA || row.NAMA_BARANG || '')) || v || ''; d.textContent = name; return d; } },
    { label: 'QTY', field: 'QTY', class: 'w-20', tdClass: 'text-right', render: (v)=>{ const d=document.createElement('div'); d.className='text-right'; d.textContent = String(Number(v||0)); return d; } },
    { label: 'Subtotal', field: 'SUBTOTAL', class: 'w-28', tdClass: 'text-right', render: (v,row)=>{ const rowSub = parseNum(v); const kode = row.KODE_BARANG || row.KODE || ''; const price = (priceMap && priceMap[kode]) ? parseNum(priceMap[kode]) : parseNum(row.HARGA); const qty = Number(row.QTY||0); const sub = rowSub > 0 ? rowSub : (price * qty); const d=document.createElement('div'); d.className='text-right'; d.textContent = 'Rp ' + currencyFmt.format(Number(sub||0)); return d; } },
  ];
  const { wrap } = createTable({ columns: cols, rows: rows, rowKey: 'NOTA' });
  area.appendChild(wrap);
  // compute totals and display below table
  try{
  let totalQty = 0; let totalSub = 0;
  rows.forEach(r=>{ const q = Number(r.QTY||0); const rowSub = parseNum(r.SUBTOTAL); const kode = r.KODE_BARANG || r.KODE || ''; const price = (priceMap && priceMap[kode]) ? parseNum(priceMap[kode]) : parseNum(r.HARGA); const sub = rowSub > 0 ? rowSub : (price * q); totalQty += q; totalSub += sub; });
  const foot = document.createElement('div'); foot.className = 'mt-3 flex justify-end gap-4 items-center';
  const boxQty = document.createElement('div');
  boxQty.className = 'px-3 py-2 rounded-md text-sm font-medium bg-primary/10 text-primary';
  boxQty.textContent = `Total Qty: ${totalQty}`;
  const boxTotal = document.createElement('div');
  boxTotal.className = 'px-3 py-2 rounded-md text-sm font-semibold bg-success/10 text-success';
  boxTotal.textContent = `TOTAL: Rp ${currencyFmt.format(Number(totalSub||0))}`;
  foot.appendChild(boxQty); foot.appendChild(boxTotal); area.appendChild(foot);
  }catch(e){}
}

export async function load() {
  const area = containerEl.querySelector('#list-area');
  area.innerHTML = '';
  area.appendChild(tableSkeleton(3, 4));
  try {
    const res = await getList('item_penjualan');
    const data = res.data || [];
  // load barang map to resolve names and prices from kode
  let barangMap = {}; let priceMap = {};
  try{ const bres = await getList('barang'); const bl = (bres.data||[]); bl.forEach(b => { const k = b.KODE || b.KODE_BARANG || ''; barangMap[k] = b.NAMA || ''; priceMap[k] = b.HARGA || b.HARGA || 0; }); }catch(e){ /* ignore */ }
  // build penjualan->pelanggan map and pelanggan name map
  let penjualanMap = {}; let pelangganMap = {};
  try{
    // fetch penjualan metadata (dates) and basic mapping
    try{
      const pmeta = await fetchPenjualanMeta({ useCache: true });
      // populate local penjualanMeta (object lookup used by renderList)
      penjualanMeta = {};
      for(const [k,v] of pmeta.metaByKey){ if(v) penjualanMeta[k] = v; }
      const pl = pmeta.rows || [];
      pl.forEach(p => { const nid = p.ID_NOTA || p.ID || p.NOTA || ''; const kode = p.KODE_PELANGGAN || p.KODE || ''; if(nid) penjualanMap[nid] = kode; });
    }catch(e){ console.warn('[page:item-penjualan] fetchPenjualanMeta failed', e); const pres = await getList('penjualan'); const pl = (pres.data||[]); pl.forEach(p => { const nid = p.ID_NOTA || p.ID || p.NOTA || ''; const kode = p.KODE_PELANGGAN || p.KODE || ''; if(nid) penjualanMap[nid] = kode; }); }
  }catch(e){}
  try{ const pelRes = await getList('pelanggan'); const pel = (pelRes.data||[]); pel.forEach(pp => { const id = pp.ID_PELANGGAN || pp.ID || ''; pelangganMap[id] = pp.NAMA || ''; }); }catch(e){}
    // wire filter controls (period + date) to filter items by penjualan date
    const periodEl = document.getElementById('filter-period');
    const dateEl = document.getElementById('filter-date');

    // helper: ISO week number
    const isoWeek = (dt)=>{ const t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())); const dayNum = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil((((t - yearStart) / 86400000) + 1)/7); };

    async function applyFiltersAndRender(){
      try{
        const period = (periodEl && periodEl.value) || 'hari';
        const dateVal = (dateEl && dateEl.value) || null; // value depends on input type
        if(!dateVal){ renderList(data, barangMap, priceMap, penjualanMap, pelangganMap); return; }

        // derive selected values depending on period
        let selYear, selMonth, selDay, selWeek;
        if(period === 'hari'){ const s = new Date(dateVal + 'T00:00:00'); selYear = s.getFullYear(); selMonth = s.getMonth(); selDay = s.getDate(); }
        else if(period === 'bulan'){ const parts = dateVal.split('-'); selYear = Number(parts[0]); selMonth = Number(parts[1]) - 1; }
        else if(period === 'tahun'){ selYear = Number(dateVal); }
        else if(period === 'minggu'){ const m = String(dateVal).match(/^(\d{4})-W?(\d{2})$/i); if(m){ selYear = Number(m[1]); selWeek = Number(m[2]); } }

        const filtered = data.filter(it => {
          const nota = it.NOTA || it.NOTa || it.nota || '';
          // prefer item-level TGL if present
          let meta = null;
          const itemT = it.TGL || it.tgl || it.Tanggal || it.tanggal || null;
          if(itemT){
            let iso = null;
            if(/^\d{4}-\d{2}-\d{2}$/.test(String(itemT))) iso = itemT;
            else if(/^\d{2}\/\d{2}\/\d{2,4}$/.test(String(itemT))){ const parts = String(itemT).split('/'); let yy = parts[2]; if(yy.length===2) yy = '20'+yy; iso = `${yy}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; }
            if(iso){ const d = new Date(iso + 'T00:00:00'); const year = d.getFullYear(); const month = d.getMonth(); const week = isoWeek(d); meta = { iso, year, month, week }; }
          }
          if(!meta) meta = penjualanMeta[nota];
          if(!meta) return false;
          if(period === 'hari') return meta.year === selYear && meta.month === selMonth && (new Date(meta.iso + 'T00:00:00').getDate() === selDay);
          if(period === 'bulan') return meta.year === selYear && meta.month === selMonth;
          if(period === 'tahun') return meta.year === selYear;
          if(period === 'minggu') return meta.year === selYear && meta.week === selWeek;
          return false;
        });

        renderList(filtered, barangMap, priceMap, penjualanMap, pelangganMap);
      }catch(e){ console.error('[page:item-penjualan] filter error', e); renderList(data, barangMap, priceMap, penjualanMap, pelangganMap); }
    }

    // update date input type when period changes
    function updateFilterInputType(){ if(!periodEl||!dateEl) return; const p = periodEl.value; if(p==='hari'){ dateEl.type='date'; dateEl.value=''; } else if(p==='minggu'){ dateEl.type='week'; dateEl.value=''; } else if(p==='bulan'){ dateEl.type='month'; dateEl.value=''; } else if(p==='tahun'){ dateEl.type='number'; dateEl.min = 2000; dateEl.max = 2099; dateEl.value = new Date().getFullYear(); } }

    if(periodEl && dateEl) {
      periodEl.addEventListener('change', ()=>{ updateFilterInputType(); applyFiltersAndRender(); });
      dateEl.addEventListener('change', ()=> applyFiltersAndRender());
      // initialise input type
      updateFilterInputType();
    }

    // initial render (unfiltered)
    renderList(data, barangMap, priceMap, penjualanMap, pelangganMap);
  } catch (err) {
    area.innerHTML = '<div class="text-danger">Gagal memuat item penjualan.</div>';
  }
}

// wire refresh
document.addEventListener('DOMContentLoaded', ()=>{
  initNav();
  const btnRefresh = document.getElementById('btn-refresh');
  if(btnRefresh){
  btnRefresh.addEventListener('click', async ()=>{ try{ bustCache('item_penjualan'); bustCache('barang'); }catch(e){} await load(); });
    if(!document.getElementById('btn-back')){
      const btnBack = document.createElement('button');
      btnBack.id = 'btn-back'; btnBack.type = 'button';
  btnBack.className = 'w-full sm:w-auto px-3 py-2 border border-primary rounded text-sm flex items-center justify-center gap-2 text-primary hover:bg-primary/5';
      btnBack.setAttribute('aria-label','Kembali ke Penjualan');
      btnBack.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg> Kembali`;
      btnBack.addEventListener('click', ()=>{ location.href = 'penjualan.html'; });
      try{ btnRefresh.parentNode.insertBefore(btnBack, btnRefresh.nextSibling); }catch(e){ document.body.appendChild(btnBack); }
    }
    // backfill UI removed per request
  }
  highlightActive();
  load();
});
