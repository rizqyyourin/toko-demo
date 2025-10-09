import { getList } from '../services/api.js';
import { showToast } from '../components/toast.js';
import { highlightActive, initNav } from '../components/nav.js';

const mappings = [
  { id: 'count-pelanggan', table: 'pelanggan', type: 'count' },
  { id: 'count-barang', table: 'barang', type: 'count' },
  { id: 'count-penjualan', table: 'penjualan', type: 'count' },
  { id: 'count-revenue', table: 'penjualan', type: 'sum', field: 'SUBTOTAL' },
];

function formatCurrency(n){
  try{ return Number(n).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }); }catch(e){ return String(n); }
}

// charting and revenue helpers removed (charts cleaned up)

// Single-fetch loader for dashboard: fetch required tables once and compute all card values
async function loadDashboardData(){
  // show placeholders
  document.getElementById('count-pelanggan') && (document.getElementById('count-pelanggan').textContent = '…');
  document.getElementById('count-barang') && (document.getElementById('count-barang').textContent = '…');
  document.getElementById('count-penjualan') && (document.getElementById('count-penjualan').textContent = '…');
  document.getElementById('count-revenue') && (document.getElementById('count-revenue').textContent = '…');

  try{
    // Fetch all needed tables in parallel, deduped by service layer
    const [pelRes, barRes, penRes, itemsRes] = await Promise.all([
      getList('pelanggan'),
      getList('barang'),
      getList('penjualan'),
      getList('item_penjualan')
    ]);
    const pelanggan = pelRes.data || [];
    const barang = barRes.data || [];
    const penjualan = penRes.data || [];
    const items = itemsRes.data || [];

    // counts
    const elP = document.getElementById('count-pelanggan'); if (elP) elP.textContent = String(pelanggan.length || 0);
    const elB = document.getElementById('count-barang'); if (elB) elB.textContent = String(barang.length || 0);
    const elS = document.getElementById('count-penjualan'); if (elS) elS.textContent = String(penjualan.length || 0);

    // total revenue: compute primarily from item_penjualan to avoid mismatch
    // Build barang price map for fallback when item row doesn't include HARGA
    const priceMap = {};
    // helper: robust parse for currency/number strings (handles '1.234.567' etc.)
    function parseNumber(v){
      if (v == null || v === '') return 0;
      if (typeof v === 'number' && !isNaN(v)) return v;
      let s = String(v).trim();
      s = s.replace(/[^0-9.,-]/g, '');
      if (!s) return 0;
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastComma > lastDot){ s = s.replace(/\./g, '').replace(',', '.'); }
      else if (lastDot > lastComma && (s.match(/\./g)||[]).length > 1){ s = s.replace(/\./g, ''); }
      else { s = s.replace(/,/g, ''); }
      const n = Number(s);
      return isNaN(n) ? 0 : n;
    }
    function normalizeNota(x){
      if (x == null) return '';
      const s = String(x).trim().toLowerCase();
      const cleaned = s.replace(/^(inv|nota|no|no\.|np)\s*/i, '').replace(/[^0-9a-z]/g, '');
      return cleaned || s.replace(/[^0-9a-z]/g,'');
    }
      // canonical key used across the dashboard to compare nota values reliably
      function canonicalNotaKey(x){
        if (x == null) return '';
        try{
          const s = String(x).toUpperCase().trim();
          // remove common prefixes and non-alphanumeric characters, keep letters+digits only
          return s.replace(/^(INV|NOTA|NO|NO\.|NP)\s*/i, '').replace(/[^0-9A-Z]/g, '');
        }catch(e){ return String(x).toUpperCase().replace(/[^0-9A-Z]/g,''); }
      }
    barang.forEach(b => { const k = String(b.KODE || b.KODE_BARANG || ''); priceMap[k] = parseNumber(b.HARGA || b.HARGA_BARANG || 0); });

    // build deduplicated per-nota item sums
    const itemsByNota = {};
    const perNotaItemsSum = {}; // nota -> numeric sum
    const seenItemKeys = new Set();
    let duplicateItems = 0;
    items.forEach(it => {
  const rawNota = it.NOTA || it.NOMOR || it.NOTA_PENJUALAN || '';
  const nota = normalizeNota(rawNota);
  const keyNota = canonicalNotaKey(rawNota);
      const qty = parseNumber(it.QTY || it.QTY_PENJUALAN || 0);
      const subGiven = parseNumber(it.SUBTOTAL || it.SUB_TOTAL || 0);
      const kode = String(it.KODE_BARANG || it.KODE || '');
      const harga = parseNumber(it.HARGA || 0) || priceMap[kode] || 0;
      const computed = (subGiven && subGiven > 0) ? subGiven : (qty * harga);
      const itemKey = keyNota + '|' + kode;
      if (seenItemKeys.has(itemKey)) {
        duplicateItems++;
        return; // skip duplicate row
      }
      seenItemKeys.add(itemKey);
      if (keyNota) {
        perNotaItemsSum[keyNota] = (perNotaItemsSum[keyNota] || 0) + Number(computed || 0);
        (itemsByNota[keyNota] = itemsByNota[keyNota] || []).push(it);
      }
    });
    // itemsTotal is sum of unique per-nota sums
    const itemsTotal = Object.values(perNotaItemsSum).reduce((s,v)=>s+Number(v||0), 0);
    if (duplicateItems > 0) console.debug('[page:index] skipped duplicate item_penjualan rows', { totalRows: items.length, duplicates: duplicateItems });

    // For penjualan rows that have no item_penjualan entries, add their SUBTOTAL
    let penjualanOnlyTotal = 0;
    penjualan.forEach(p => {
      const rawNota = p.ID_NOTA || p.NOTA || p.NOMOR || p.NO || '';
      const keyNota = canonicalNotaKey(rawNota);
      // if any items exist for this canonical nota key, skip adding penjualan.SUBTOTAL
      if (keyNota && (itemsByNota[keyNota] && itemsByNota[keyNota].length > 0)) {
        return;
      }
      // fallback: try older normalizeNota form (defensive)
      const fallbackNota = normalizeNota(rawNota);
      if (fallbackNota && (itemsByNota[fallbackNota] && itemsByNota[fallbackNota].length > 0)) return;
      const sub = parseNumber(p.SUBTOTAL || p.SUB_TOTAL || p.TOTAL || 0);
      penjualanOnlyTotal += sub;
    });

    // diagnostics: log per-nota breakdown and overlaps to help find double-counting
    try {
      const perNotaArr = Object.keys(perNotaItemsSum).map(k => ({ nota: k, sum: perNotaItemsSum[k] }));
      perNotaArr.sort((a,b)=>b.sum - a.sum);
      const penjualanMapByNota = {};
      penjualan.forEach(p => { const raw = p.ID_NOTA || p.NOTA || p.NOMOR || ''; const n = normalizeNota(raw); penjualanMapByNota[n] = (penjualanMapByNota[n] || 0) + parseNumber(p.SUBTOTAL || p.SUB_TOTAL || p.TOTAL || 0); });
      const penjualanArr = Object.keys(penjualanMapByNota).map(k => ({ nota: k, sum: penjualanMapByNota[k] }));
      penjualanArr.sort((a,b)=>b.sum - a.sum);
      const overlap = perNotaArr.filter(x => penjualanMapByNota[x.nota]);
      console.debug('[page:index] revenue debug', { itemsRows: items.length, uniqueItemKeys: seenItemKeys.size, itemsTotal, penjualanRows: penjualan.length, penjualanOnlyTotal, topItemNotas: perNotaArr.slice(0,8), topPenjualanNotas: penjualanArr.slice(0,8), overlapSample: overlap.slice(0,8) });
    } catch(e) { console.debug('[page:index] revenue debug failed', e); }

    const totalRevenue = itemsTotal + penjualanOnlyTotal;
    const elR = document.getElementById('count-revenue'); if (elR) elR.textContent = totalRevenue && totalRevenue>0 ? formatCurrency(totalRevenue) : '—';

    return { pelanggan, barang, penjualan, items, totalRevenue, itemsByNota, perNotaItemsSum, penjualanMapByNota };
  }catch(e){
    console.error('[page:index] loadDashboardData error', e);
    showToast('Gagal memuat data dashboard', { duration: 2500 });
    // fill with safe defaults
    const els = ['count-pelanggan','count-barang','count-penjualan','count-revenue'];
    els.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
    return { pelanggan:[], barang:[], penjualan:[], items:[], totalRevenue:0 };
  }
}

export default async function initDashboard(){
  // highlight active nav link
  const links = document.querySelectorAll('nav a');
  links.forEach(a=>{
    try{
      // don't mark the brand as active (brand uses .nav-brand)
      if (a.classList && a.classList.contains('nav-brand')) return;
      const href = new URL(a.href);
      if (href.pathname === location.pathname) a.classList.add('text-primary','font-semibold');
    }catch(e){}
  });

  // load dashboard data (single-fetch for required tables) and render cards
  const data = await loadDashboardData();

  // render yearly sales chart under the cards area
  try{
    renderYearlySalesChart(data);
  }catch(e){ console.error('[page:index] renderYearlySalesChart failed', e); }

  // make cards keyboard-activatable
  document.querySelectorAll('.card').forEach(card=>{
    card.setAttribute('tabindex','0');
    card.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  });

  // charts removed: stock & revenue charts were cleaned up per user request
}

// charts and helpers removed — cleaned up to simplify dashboard

function monthName(idx){ return ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][idx] || String(idx); }

function parseYearFromDateStr(s){
  if(!s) return null;
  try{
    const str = String(s).trim();
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(iso) return Number(iso[1]);
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(dmy){ let yy = dmy[3]; if(yy.length===2) yy = '20'+yy; return Number(yy); }
    const d = new Date(str);
    if(!isNaN(d)) return d.getFullYear();
  }catch(e){}
  return null;
}

function canonicalNotaKeyLocal(x){ if(x==null) return ''; try{ return String(x).toUpperCase().trim().replace(/^(INV|NOTA|NO|NO\.|NP)\s*/i,'').replace(/[^0-9A-Z]/g,''); }catch(e){ return String(x).toUpperCase().replace(/[^0-9A-Z]/g,''); } }

function renderYearlySalesChart(data){
  let chartWrap = document.getElementById('yearly-sales-wrap');
  if(!chartWrap){
    chartWrap = document.createElement('div'); chartWrap.id='yearly-sales-wrap'; chartWrap.className='mt-6 space-y-3';
    const cards = document.querySelector('.cards') || document.getElementById('cards');
    if(cards && cards.parentNode) cards.parentNode.insertBefore(chartWrap, cards.nextSibling);
    else document.body.appendChild(chartWrap);
  }
  chartWrap.innerHTML = '';

  const years = new Set();
  (data.penjualan||[]).forEach(p => { const y = parseYearFromDateStr(p.TGL || p.TANGGAL || p.tgl || ''); if(y) years.add(y); });
  const now = new Date(); if(years.size===0) years.add(now.getFullYear());
  const yearsArr = Array.from(years).sort((a,b)=>b-a);

  const header = document.createElement('div'); header.className='flex items-center justify-between';
  const title = document.createElement('h3'); title.className='text-lg font-semibold'; title.textContent = 'Grafik Penjualan per Tahun';
  const sel = document.createElement('select'); sel.className='border px-2 py-1 rounded'; yearsArr.forEach(y=>{ const o=document.createElement('option'); o.value=String(y); o.textContent=String(y); sel.appendChild(o); }); sel.value = String(now.getFullYear());
  const selWrap = document.createElement('div'); selWrap.className='flex items-center gap-2'; selWrap.appendChild(sel);
  header.appendChild(title); header.appendChild(selWrap); chartWrap.appendChild(header);

  const chartBox = document.createElement('div'); chartBox.className='mt-2 p-3 bg-white rounded shadow-sm'; chartWrap.appendChild(chartBox);

  function computeMonthlyTotals(year){
    const perNota = data.perNotaItemsSum || {};
    const pen = data.penjualan || [];
    const months = new Array(12).fill(0);
    Object.keys(perNota).forEach(k => {
      // find penjualan row with matching canonical key
      const pRow = pen.find(p => canonicalNotaKeyLocal(p.ID_NOTA || p.NOTA || p.NOMOR || '') === k);
      let iso = null;
      if(pRow && pRow.TGL){ const s = String(pRow.TGL); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) iso = `${m[1]}-${m[2]}-${m[3]}`; else { const mm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if(mm){ let yy = mm[3]; if(yy.length===2) yy='20'+yy; iso = `${yy}-${mm[2].padStart(2,'0')}-${mm[1].padStart(2,'0')}`; } } }
      if(!iso) return; const yyyy = Number(iso.slice(0,4)); if(yyyy !== Number(year)) return; const mon = Number(iso.slice(5,7)) - 1; months[mon] += Number(perNota[k]||0);
    });
    return months;
  }

  function draw(year){
    chartBox.innerHTML = '';
    const months = computeMonthlyTotals(year);
    const max = Math.max(1, ...months);
    const w = 720; const h = 260; const leftAxisW = 88; const bottomH = 36; const chartW = w - leftAxisW - 24; const chartH = h - bottomH - 24;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width','100%'); svg.setAttribute('height','260');
    // left axis
    const axis = document.createElementNS(svgNS,'g'); axis.setAttribute('transform', `translate(12,12)`);
    for(let i=0;i<=4;i++){ const y = (chartH) * (i/4); const val = Math.round(max * (1 - i/4)); const ty = y + 6; const t = document.createElementNS(svgNS,'text'); t.setAttribute('x',0); t.setAttribute('y', ty); t.setAttribute('font-size','12'); t.setAttribute('fill','#374151'); t.textContent = 'Rp ' + Number(val).toLocaleString('id-ID'); axis.appendChild(t); }
    svg.appendChild(axis);
    const bars = document.createElementNS(svgNS,'g'); bars.setAttribute('transform', `translate(${leftAxisW},12)`);
    const band = chartW / 12; const barW = band * 0.64; const gap = band - barW;
    months.forEach((m, idx)=>{
      const x = idx * band + gap/2;
      const hBar = (max === 0) ? 0 : (m / max) * chartH;
      const y = chartH - hBar;
      const rect = document.createElementNS(svgNS,'rect'); rect.setAttribute('x', x); rect.setAttribute('y', y); rect.setAttribute('width', String(barW)); rect.setAttribute('height', String(hBar)); rect.setAttribute('fill', '#6366f1'); rect.setAttribute('rx','4'); bars.appendChild(rect);
      const lbl = document.createElementNS(svgNS,'text'); lbl.setAttribute('x', x + barW/2); lbl.setAttribute('y', chartH + 18); lbl.setAttribute('font-size','12'); lbl.setAttribute('fill','#374151'); lbl.setAttribute('text-anchor','middle'); lbl.textContent = monthName(idx); bars.appendChild(lbl);
    });
    svg.appendChild(bars);
    chartBox.appendChild(svg);
  }

  sel.addEventListener('change', ()=> draw(sel.value));
  draw(sel.value);
}

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
