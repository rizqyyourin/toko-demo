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

  // charts removed to keep dashboard minimal and avoid visual regressions

  // make cards keyboard-activatable
  document.querySelectorAll('.card').forEach(card=>{
    card.setAttribute('tabindex','0');
    card.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  });

  // charts removed: stock & revenue charts were cleaned up per user request
}

// charts and helpers removed — cleaned up to simplify dashboard

// charts removed entirely to keep the dashboard minimal and stable

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
