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
  await loadDashboardData();

  // make cards keyboard-activatable
  document.querySelectorAll('.card').forEach(card=>{
    card.setAttribute('tabindex','0');
    card.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  });

  // charts are opt-in: add a small toggle to load charts lazily to avoid breaking the dashboard
  try{
    const container = document.querySelector('.cards') || document.getElementById('cards') || document.body;
    const ctl = document.createElement('div'); ctl.className = 'mt-3';
    const btn = document.createElement('button'); btn.className = 'px-3 py-1 text-sm bg-primary text-white rounded'; btn.type = 'button'; btn.textContent = 'Tampilkan Grafik Penjualan';
    ctl.appendChild(btn);
    container.parentNode && container.parentNode.insertBefore(ctl, container.nextSibling);
    let chartInst = null;
    btn.addEventListener('click', async () => {
      if (chartInst) { chartInst.destroy(); chartInst = null; btn.textContent = 'Tampilkan Grafik Penjualan'; return; }
      btn.textContent = 'Memuat...';
      try{
        const mod = await import('../components/chart-yearly.js');
        chartInst = await mod.mountYearlyChart(document.body, await loadDashboardData());
        btn.textContent = 'Sembunyikan Grafik';
      }catch(e){
        console.error('[page:index] failed to load chart module', e);
        showToast('Gagal memuat grafik', { duration: 2500 });
        btn.textContent = 'Tampilkan Grafik Penjualan';
      }
    });
  }catch(e){ /* non-fatal */ }
}

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
