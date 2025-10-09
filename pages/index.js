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
  // pie chart (SVG) with legend — colors per category
  container.innerHTML = '';
  if(!data || !data.length){ container.innerHTML = '<div class="text-muted">Tidak ada data stok.</div>'; return; }
  const width = Math.max(320, container.clientWidth || 600);
  const height = Math.max(240, container.clientHeight || 320);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width', '100%'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const total = data.reduce((s,d)=> s + (Number(d.stock)||0), 0) || 1;
  // color palette (extendable)
  const palette = ['#6366F1','#F59E0B','#10B981','#EF4444','#A78BFA','#F97316','#06B6D4','#8B5CF6','#84CC16','#EC4899'];

  const cx = Math.min(width * 0.4, 220);
  const cy = height / 2;
  const radius = Math.min(cx, cy) - 20;

  // start at top (-90deg)
  let angle = -Math.PI/2;

  data.forEach((d, i) => {
    const value = Number(d.stock) || 0;
    const slice = value / total;
    const theta = slice * Math.PI * 2;
    const start = angle;
    const end = angle + theta;
    const largeArc = (theta > Math.PI) ? 1 : 0;

    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);

    const path = document.createElementNS(svgNS, 'path');
    const dPath = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    path.setAttribute('d', dPath);
    path.setAttribute('fill', palette[i % palette.length]);
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('data-kategori', d.kategori);
    path.setAttribute('data-stock', String(d.stock));
    path.setAttribute('role','img');
    path.setAttribute('aria-label', `${d.kategori}: ${d.stock}`);
    // tooltip-like title
    const title = document.createElementNS(svgNS, 'title'); title.textContent = `${d.kategori}: ${d.stock}`; path.appendChild(title);
    svg.appendChild(path);

    angle = end;
  });

  // legend on the right
  const legendX = Math.max(cx + radius + 20, width * 0.55);
  const legendY = 20;
  const lineH = 20;
  data.forEach((d,i) => {
    const y = legendY + i * (lineH + 6);
    const rect = document.createElementNS(svgNS, 'rect'); rect.setAttribute('x', legendX); rect.setAttribute('y', y); rect.setAttribute('width', '14'); rect.setAttribute('height', '14'); rect.setAttribute('fill', palette[i % palette.length]); svg.appendChild(rect);
    const txt = document.createElementNS(svgNS, 'text'); txt.setAttribute('x', legendX + 20); txt.setAttribute('y', y + 11); txt.setAttribute('font-size', '12'); txt.setAttribute('fill', '#0F172A'); txt.textContent = `${d.kategori} (${d.stock})`; svg.appendChild(txt);
  });

  // center label: total
  const centerLabel = document.createElementNS(svgNS, 'text'); centerLabel.setAttribute('x', cx); centerLabel.setAttribute('y', cy); centerLabel.setAttribute('text-anchor','middle'); centerLabel.setAttribute('font-size','14'); centerLabel.setAttribute('fill','#0F172A'); centerLabel.setAttribute('font-weight','600'); centerLabel.textContent = String(total); svg.appendChild(centerLabel);

  container.appendChild(svg);
}

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
