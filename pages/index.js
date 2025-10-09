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
    barang.forEach(b => { const k = String(b.KODE || b.KODE_BARANG || ''); priceMap[k] = Number(b.HARGA || 0); });

    // build itemsByNota map and sum items total
    const itemsByNota = {};
    let itemsTotal = 0;
    items.forEach(it => {
      const nota = String(it.NOTA || it.NOMOR || it.NOTA_PENJUALAN || '');
      const qty = Number(it.QTY || it.QTY_PENJUALAN || 0) || 0;
      const subGiven = Number(it.SUBTOTAL || it.SUB_TOTAL || 0) || 0;
      const kode = String(it.KODE_BARANG || it.KODE || '');
      const harga = Number(it.HARGA || 0) || priceMap[kode] || 0;
      const computed = subGiven && subGiven > 0 ? subGiven : (qty * harga);
      itemsTotal += Number(computed) || 0;
      if (!nota) return;
      (itemsByNota[nota] = itemsByNota[nota] || []).push(it);
    });

    // For penjualan rows that have no item_penjualan entries, add their SUBTOTAL
    let penjualanOnlyTotal = 0;
    penjualan.forEach(p => {
      const nota = String(p.NOTA || p.NOMOR || p.NO || '');
      if (nota && (itemsByNota[nota] && itemsByNota[nota].length > 0)) {
        // invoice has item rows -> already counted via itemsTotal
        return;
      }
      const sub = Number(p.SUBTOTAL || p.SUB_TOTAL || p.TOTAL || 0) || 0;
      penjualanOnlyTotal += sub;
    });

    const totalRevenue = itemsTotal + penjualanOnlyTotal;
    const elR = document.getElementById('count-revenue'); if (elR) elR.textContent = totalRevenue && totalRevenue>0 ? formatCurrency(totalRevenue) : '—';

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

  // charts removed: stock & revenue charts were cleaned up per user request
}

// charts and helpers removed — cleaned up to simplify dashboard

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
