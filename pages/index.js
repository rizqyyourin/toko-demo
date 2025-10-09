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

// --- Chart helpers ---
function parseDMY(s){
  if(!s) return null;
  try{
    const str = String(s).trim();
    const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(m){ let dd = Number(m[1]); let mm = Number(m[2]); let yy = String(m[3]); if(yy.length===2) yy = '20'+yy; return new Date(Number(yy), mm-1, dd); }
    const d = new Date(str);
    if(!isNaN(d)) return d;
  }catch(e){}
  return null;
}

function formatIDR(n){ try{ return Number(n).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }); }catch(e){ return String(n); } }

let stockChart = null;
let salesChart = null;

function destroyChart(instance){ try{ if(instance) instance.destroy(); }catch(e){}
}

function renderStockChart({ labels = [], values = [] } = {}){
  const ctx = document.getElementById('chart-stock');
  const emptyEl = document.getElementById('stock-empty');
  if(!ctx) return;
  // hide/show empty state
  if(!values || values.length === 0){ if(emptyEl) emptyEl.classList.remove('hidden'); ctx.style.display='none'; return; } else { if(emptyEl) emptyEl.classList.add('hidden'); ctx.style.display='block'; }
  destroyChart(stockChart);
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const cfg = {
    type: isMobile ? 'bar' : 'bar', // we'll flip index/axis via options
    data: { labels, datasets: [{ label: 'Stok', data: values, backgroundColor: 'rgba(99,102,241,0.28)', borderColor: 'rgba(79,70,229,1)', borderWidth: 1 }] },
    options: {
      indexAxis: isMobile ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { ticks: { callback: v=> Number(v).toLocaleString('id-ID') } }, y: { ticks: { autoSkip: false } } },
      plugins: { tooltip: { callbacks: { label(ctx){ const v = ctx.raw || 0; return `${ctx.label} • ${v} unit`; } } }, legend: { display:false } }
    }
  };
  // eslint-disable-next-line no-undef
  stockChart = new Chart(ctx.getContext('2d'), cfg);
}

function renderSalesChart({ labels = [], values = [], year = null, count = 0, total = 0 } = {}){
  const ctx = document.getElementById('chart-sales');
  const summary = document.getElementById('sales-summary');
  if(!ctx) return;
  destroyChart(salesChart);
  const cfg = {
    type: 'bar',
    data: { labels, datasets: [{ label: `Penjualan ${year}`, data: values, backgroundColor: 'rgba(99,102,241,0.28)', borderColor: 'rgba(79,70,229,1)', borderWidth: 1 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { ticks: { callback: v=> Number(v).toLocaleString('id-ID') } } },
      plugins: { tooltip: { callbacks: { label(ctx){ const v = ctx.raw || 0; return `Rp ${Number(v).toLocaleString('id-ID')}`; } } }, legend: { display:false } }
    }
  };
  // eslint-disable-next-line no-undef
  salesChart = new Chart(ctx.getContext('2d'), cfg);
  if(summary) summary.textContent = '';
}


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

    // total revenue: prefer penjualan.SUBTOTAL, fallback to items grouping
    let totalRevenue = 0;
    // build itemsByNota map
    const itemsByNota = {};
    items.forEach(it => {
      const nota = String(it.NOTA || it.NOMOR || it.NOTA_PENJUALAN || '');
      if (!nota) return;
      (itemsByNota[nota] = itemsByNota[nota] || []).push(it);
    });

    penjualan.forEach(p => {
      let sub = Number(p.SUBTOTAL || p.SUB_TOTAL || p.TOTAL || 0) || 0;
      if (!sub || sub <= 0){
        const nota = String(p.NOTA || p.NOMOR || p.NO || '');
        const its = itemsByNota[nota] || [];
        sub = its.reduce((s,it) => s + (Number(it.SUBTOTAL || it.SUB_TOTAL || 0) || 0), 0);
      }
      totalRevenue += sub || 0;
    });

    const elR = document.getElementById('count-revenue');
    if (elR) elR.textContent = totalRevenue && totalRevenue > 0 ? formatCurrency(totalRevenue) : '—';

    return { pelanggan, barang, penjualan, items, totalRevenue };
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
  const baseData = await loadDashboardData();

  // Prepare analytics datasets using cached getList (do not force refetch)
  try{
    const barangRes = await getList('barang');
    const penjualanRes = await getList('penjualan');
    const barang = barangRes.data || [];
    const penjualan = penjualanRes.data || [];

    // --- Stock per Kategori ---
    const catMap = {};
    let hasStockColumn = false;
    barang.forEach(b => {
      const k = String(b.KATEGORI || b.KATEGORI_BARANG || b.KATEGORI || 'Lainnya').trim() || 'Lainnya';
      if (b.STOCK != null) hasStockColumn = true;
      const stock = (b.STOCK == null) ? 0 : Number(b.STOCK) || 0;
      catMap[k] = (catMap[k] || 0) + stock;
    });
    const stockLabels = Object.keys(catMap);
    const stockValues = stockLabels.map(l => catMap[l]);
    if (!hasStockColumn) {
      // show empty state
      document.getElementById('stock-empty') && document.getElementById('stock-empty').classList.remove('hidden');
    } else {
      renderStockChart({ labels: stockLabels, values: stockValues });
    }

    // --- Sales per Month per Year ---
    const salesByYear = {}; // year -> { months: [12], total, count }
    penjualan.forEach(p => {
      const t = p.TGL || p.TANGGAL || p.tgl || '';
      const d = parseDMY(t) || new Date(t);
      if (!d || isNaN(d)) return;
      const y = d.getFullYear();
      const m = d.getMonth();
      const sub = Number(p.SUBTOTAL || p.SUB_TOTAL || p.TOTAL || 0) || 0;
      salesByYear[y] = salesByYear[y] || { months: new Array(12).fill(0), total:0, count:0 };
      salesByYear[y].months[m] += sub;
      salesByYear[y].total += sub;
      salesByYear[y].count += 1;
    });
    const years = Object.keys(salesByYear).map(Number).sort((a,b)=>b-a);
    const yearSelect = document.getElementById('select-year');
    if (yearSelect && years.length>0){
      yearSelect.innerHTML = '';
      years.forEach(y => { const o = document.createElement('option'); o.value = String(y); o.textContent = String(y); yearSelect.appendChild(o); });
      yearSelect.value = String(years[0]);
      const applyYear = (yy) => {
        const info = salesByYear[Number(yy)] || { months: new Array(12).fill(0), total:0, count:0 };
        renderSalesChart({ labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'], values: info.months, year: yy, count: info.count, total: info.total });
      };
      applyYear(yearSelect.value);
      yearSelect.addEventListener('change', (e) => { applyYear(e.target.value); });
    } else {
      // no penjualan data, render empty sales
      renderSalesChart({ labels: ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'], values: new Array(12).fill(0), year: new Date().getFullYear(), count:0, total:0 });
    }

  }catch(e){ console.error('[page:index] analytics init failed', e); }

  // make cards keyboard-activatable
  document.querySelectorAll('.card').forEach(card=>{
    card.setAttribute('tabindex','0');
    card.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  });

  // charts removed: stock & revenue charts were cleaned up per user request
}

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
