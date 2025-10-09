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

async function loadCard(m) {
  const el = document.getElementById(m.id);
  if (!el) return;
  el.textContent = '…';
  try {
    const res = await getList(m.table);
    console.debug('[page:index] loadCard', m.table, 'fromCache=', !!res.fromCache);
    const rows = res.data || [];
      if (m.type === 'count') el.textContent = rows.length.toString();
      else if (m.type === 'sum') {
        try{
          // For revenue card we prefer computing total from item_penjualan and barang prices
          // This avoids mismatches when penjualan.SUBTOTAL is stale or computed differently.
          if (m.id === 'count-revenue'){
            const itemsRes = await getList('item_penjualan', { useCache: false }); const items = itemsRes.data || [];
            const bres = await getList('barang', { useCache: false }); const bl = (bres.data||[]);
            const priceMap = {}; bl.forEach(b => { const k = b.KODE || b.KODE_BARANG || ''; priceMap[k] = Number(b.HARGA||0); });
            const total = items.reduce((s,it)=>{ const qty = Number(it.QTY||0); const sub = Number(it.SUBTOTAL||0); if(sub && sub>0) return s + sub; const p = priceMap[it.KODE_BARANG||it.KODE] || Number(it.HARGA||0); return s + (qty * (p||0)); }, 0);
            el.textContent = total && total>0 ? formatCurrency(total) : '—';
          } else {
            const sum = rows.reduce((s,r)=> s + (Number(r[m.field])||0), 0);
            el.textContent = sum && sum>0 ? formatCurrency(sum) : '—';
          }
        }catch(e){ el.textContent = '—'; }
      }
  } catch (err) {
    el.textContent = '—';
    showToast('Gagal memuat ringkasan', { duration: 1400 });
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

  // load all cards in parallel
  await Promise.all(mappings.map(m => loadCard(m)));

  // make cards keyboard-activatable
  document.querySelectorAll('.card').forEach(card=>{
    card.setAttribute('tabindex','0');
    card.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  });

  // render stock per category chart
  try{
    const chartEl = document.getElementById('stock-chart');
    if(chartEl){
      const res = await getList('barang', { useCache: false });
      const rows = res.data || [];
      const byCat = {};
      rows.forEach(r => {
        const k = (r.KATEGORI || '—').toString() || '—';
        const s = Number(r.STOCK || 0) || 0;
        byCat[k] = (byCat[k] || 0) + s;
      });
      const data = Object.keys(byCat).map(cat => ({ kategori: cat, stock: byCat[cat] })).sort((a,b)=> b.stock - a.stock);
      renderStockChart(chartEl, data);
      // re-render on resize
      let t;
      window.addEventListener('resize', ()=>{ clearTimeout(t); t = setTimeout(()=> renderStockChart(chartEl, data), 150); });
    }
  }catch(e){ console.warn('[page:index] failed to render stock chart', e); }
}

function renderStockChart(container, data){
  // simple horizontal bar chart using SVG
  container.innerHTML = '';
  if(!data || !data.length){ container.innerHTML = '<div class="text-muted">Tidak ada data stok.</div>'; return; }
  const width = container.clientWidth || 600;
  const height = container.clientHeight || Math.max(200, data.length * 36 + 40);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width', '100%'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const max = Math.max(...data.map(d=>d.stock), 1);
  const marginLeft = 140; const rowH = Math.max(28, Math.floor((height - 20) / data.length));
  data.forEach((d,i)=>{
    const y = 10 + i * rowH;
    const barW = Math.round(((width - marginLeft - 20) * d.stock) / max);
    // label
    const label = document.createElementNS(svgNS, 'text'); label.setAttribute('x', 8); label.setAttribute('y', y + (rowH/2) + 5); label.setAttribute('font-size', '12'); label.setAttribute('fill', '#0F172A'); label.textContent = d.kategori; svg.appendChild(label);
    // bar background
    const bg = document.createElementNS(svgNS, 'rect'); bg.setAttribute('x', marginLeft); bg.setAttribute('y', y + 6); bg.setAttribute('width', String(width - marginLeft - 20)); bg.setAttribute('height', String(rowH - 12)); bg.setAttribute('fill', '#F1F5F9'); svg.appendChild(bg);
    // bar
    const bar = document.createElementNS(svgNS, 'rect'); bar.setAttribute('x', marginLeft); bar.setAttribute('y', y + 6); bar.setAttribute('width', String(barW)); bar.setAttribute('height', String(rowH - 12)); bar.setAttribute('fill', '#6366F1'); svg.appendChild(bar);
    // value text
    const val = document.createElementNS(svgNS, 'text'); val.setAttribute('x', marginLeft + barW + 8); val.setAttribute('y', y + (rowH/2) + 5); val.setAttribute('font-size', '12'); val.setAttribute('fill', '#0F172A'); val.textContent = String(d.stock); svg.appendChild(val);
  });
  container.appendChild(svg);
}

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
