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

// robust date parser: accepts Date, ISO strings, dd/mm/yyyy or dd-mm-yyyy (assume day-first for locale),
// timestamps (ms), and Excel-style serial numbers.
function parseDate(v){
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  // numbers: could be epoch ms or Excel serial
  if (typeof v === 'number'){
    // treat large numbers as ms timestamp
    if (v > 1e12) return new Date(v);
    if (v > 1e9) return new Date(v); // ms-ish
    // otherwise treat as Excel serial (days since 1899-12-30)
    try{ const ms = (v - 25569) * 86400 * 1000; return new Date(ms); }catch(e){ return null; }
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO or RFC format
  if (/^\d{4}-\d{2}-\d{2}/.test(s) || s.includes('T')){
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // dd/mm/yyyy or mm/dd/yyyy-like with slashes: assume day-first (id locale)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash){
    const day = Number(slash[1]); const mon = Number(slash[2]); let yr = Number(slash[3]); if (yr < 100) yr += 2000;
    const d = new Date(yr, mon - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
  // dash-separated day-month-year
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dash){
    const day = Number(dash[1]); const mon = Number(dash[2]); let yr = Number(dash[3]); if (yr < 100) yr += 2000;
    const d = new Date(yr, mon - 1, day);
    return isNaN(d.getTime()) ? null : d;
  }
  // fallback to Date parser
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
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
      // also initialize revenue chart if present
      const revenueEl = document.getElementById('revenue-chart');
      if (revenueEl) {
        const prevBtn = document.getElementById('prev-year');
        const nextBtn = document.getElementById('next-year');
        const yearDisplay = document.getElementById('year-display');
        let currentYear = new Date().getFullYear();
        function setYear(y){ currentYear = Number(y) || currentYear; if(yearDisplay) yearDisplay.textContent = String(currentYear); renderRevenuePerMonth(revenueEl, currentYear); }
        if (prevBtn) prevBtn.addEventListener('click', ()=> setYear(currentYear - 1));
        if (nextBtn) nextBtn.addEventListener('click', ()=> setYear(currentYear + 1));
        // support keyboard +/- on the year display for accessibility
        if (yearDisplay) { yearDisplay.tabIndex = 0; yearDisplay.addEventListener('keydown', (e)=>{ if (e.key === 'ArrowLeft') setYear(currentYear - 1); else if (e.key === 'ArrowRight') setYear(currentYear + 1); }); }
        setYear(currentYear);
        // re-render on resize
        let rt;
        window.addEventListener('resize', ()=>{ clearTimeout(rt); rt = setTimeout(()=> renderRevenuePerMonth(revenueEl, currentYear), 200); });
      }
      // re-render on resize
      let t;
      window.addEventListener('resize', ()=>{ clearTimeout(t); t = setTimeout(()=> renderStockChart(chartEl, data), 150); });
    }
  }catch(e){ console.warn('[page:index] failed to render stock chart', e); }
}

// revenue helpers: use `penjualan` as primary source; if penjualan.SUBTOTAL is missing
// fall back to summing item_penjualan rows for that NOTA. Returns array of { tgl, subtotal }
async function fetchRevenueItems(){
  // fetch penjualan and items in parallel
  const [pRes, itRes] = await Promise.all([
    getList('penjualan', { useCache: false }),
    getList('item_penjualan', { useCache: false })
  ]);
  const penjualan = pRes.data || [];
  const items = itRes.data || [];
  // group items by NOTA for quick subtotal computation
  const itemsByNota = {};
  items.forEach(it => {
    const nota = (it.NOTA || it.NOMOR || it.NOTA_PENJUALAN || '').toString();
    if (!nota) return;
    itemsByNota[nota] = itemsByNota[nota] || [];
    itemsByNota[nota].push(it);
  });

  const out = [];
  penjualan.forEach(p => {
    const raw = p.TGL || p.TANGGAL || p.DATE || p.TGL_PENJUALAN || p.CREATED || p.WAKTU || p.WAKTU_PENJUALAN || '';
    const parsed = parseDate(raw);
    const tgl = parsed ? parsed.toISOString() : '';
    let subtotal = Number(p.SUBTOTAL || p.SUB_TOTAL || p.TOTAL || 0) || 0;
    if (!subtotal || subtotal <= 0) {
      // compute from item_penjualan if available
      const nota = (p.NOTA || p.NOMOR || p.NO || '').toString();
      const its = itemsByNota[nota] || [];
      subtotal = its.reduce((s,it) => s + (Number(it.SUBTOTAL || it.SUB_TOTAL || 0) || 0), 0);
    }
    if (!tgl) return; // skip if we can't determine date
    out.push({ tgl: tgl, subtotal: subtotal });
  });
  // filter out zero subtotals and invalid dates
  return out.filter(x => x.subtotal && x.tgl);
}

function bucketBy(items, range){
  const buckets = {};
  items.forEach(it => {
    const d = new Date(it.tgl);
    if (isNaN(d)) return;
    let key;
    if (range === 'day') key = d.toISOString().slice(0,10);
    else if (range === 'week') { const w = getWeekNumber(d); key = `${d.getFullYear()}-W${w}`; }
    else if (range === 'month') key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    else if (range === 'year') key = `${d.getFullYear()}`;
    buckets[key] = (buckets[key] || 0) + (Number(it.subtotal) || 0);
  });
  // convert to sorted array
  return Object.keys(buckets).sort().map(k => ({ key: k, value: buckets[k] }));
}

function getWeekNumber(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1)/7);
  return String(weekNo).padStart(2,'0');
}

async function renderRevenueChart(container, range){
  container.innerHTML = '';
  try{
    const items = await fetchRevenueItems();
    if (!items.length){ container.innerHTML = '<div class="text-muted">Tidak ada data penghasilan.</div>'; return; }
    const data = bucketBy(items, range);
    // simple horizontal bar chart using SVG
    const width = Math.max(320, container.clientWidth || 400);
    const height = Math.max(200, Math.min(320, 28 * data.length));
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width','100%'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const max = Math.max(...data.map(d => d.value), 1);
    const rowH = Math.floor(height / data.length);
    data.forEach((d, i) => {
      const y = i * rowH;
      const barW = Math.max(4, Math.round((d.value / max) * (width * 0.6)));
      const label = document.createElementNS(svgNS, 'text'); label.setAttribute('x', 6); label.setAttribute('y', y + rowH/2 + 4); label.setAttribute('font-size','11'); label.setAttribute('fill','#0F172A'); label.textContent = d.key; svg.appendChild(label);
      const rect = document.createElementNS(svgNS, 'rect'); rect.setAttribute('x', width * 0.35); rect.setAttribute('y', y + 6); rect.setAttribute('width', String(barW)); rect.setAttribute('height', String(Math.max(8, rowH - 12))); rect.setAttribute('fill','#6366F1'); svg.appendChild(rect);
      const val = document.createElementNS(svgNS, 'text'); val.setAttribute('x', width * 0.35 + barW + 8); val.setAttribute('y', y + rowH/2 + 4); val.setAttribute('font-size','11'); val.setAttribute('fill','#475569'); val.textContent = formatCurrency(d.value); svg.appendChild(val);
    });
    container.appendChild(svg);
  }catch(e){ console.warn('renderRevenueChart err', e); container.innerHTML = '<div class="text-muted">Gagal memuat penghasilan.</div>'; }
}

async function renderRevenuePerMonth(container, year){
  container.innerHTML = '';
  try{
    const items = await fetchRevenueItems();
    // filter items by year
    const months = Array.from({length:12}, (_,i) => ({ key: String(i+1).padStart(2,'0'), value: 0 }));
    items.forEach(it => {
      const d = new Date(it.tgl);
      if (isNaN(d)) return;
      if (d.getFullYear() !== Number(year)) return;
      const m = d.getMonth();
      months[m].value += Number(it.subtotal) || 0;
    });
    const total = months.reduce((s,m) => s + m.value, 0);
    if (!total){ container.innerHTML = '<div class="text-muted">Tidak ada data penghasilan untuk tahun ini.</div>'; return; }
    const width = Math.max(320, container.clientWidth || 400);
    const height = Math.max(160, 220);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width','100%'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const max = Math.max(...months.map(m => m.value), 1);
    const padLeft = 72; const padRight = 16; const padTop = 8; const padBottom = 36;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const barGap = 8;
    const barW = Math.floor(chartW / 12) - barGap;

    // draw y-axis ticks (rupiah) - 4 ticks: 0, 1/3, 2/3, maxRound
    const ticks = 4;
    const tickVals = [];
    for(let i=0;i<ticks;i++){ tickVals.push(Math.round((max * i) / (ticks-1))); }
    // round tick values to nearest nice number (e.g., 1000/10000)
    const nice = (v) => {
      if (v <= 0) return 0;
      const pow = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 2));
      return Math.round(v / pow) * pow;
    };
    const niceMax = nice(max) || max;
    const niceTicks = [];
    for(let i=0;i<ticks;i++){ niceTicks.push(Math.round((niceMax * i) / (ticks-1))); }

    // grid lines and tick labels
    niceTicks.forEach((tv, idx) => {
      const y = padTop + Math.round(chartH - (tv / niceMax) * chartH);
      // horizontal grid
      const line = document.createElementNS(svgNS, 'line'); line.setAttribute('x1', String(padLeft)); line.setAttribute('x2', String(width - padRight)); line.setAttribute('y1', String(y)); line.setAttribute('y2', String(y)); line.setAttribute('stroke', 'rgba(15,23,42,0.06)'); line.setAttribute('stroke-width','1'); svg.appendChild(line);
      const txt = document.createElementNS(svgNS, 'text'); txt.setAttribute('x','8'); txt.setAttribute('y', String(y + 4)); txt.setAttribute('font-size','11'); txt.setAttribute('fill','#475569'); txt.textContent = formatCurrency(tv); svg.appendChild(txt);
    });

    // bars and month labels (Indonesian short names)
    const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    months.forEach((m, i) => {
      const x = padLeft + i * (barW + barGap);
      const h = Math.round((m.value / niceMax) * chartH);
      const y = padTop + (chartH - h);
      const rect = document.createElementNS(svgNS, 'rect'); rect.setAttribute('x', String(x)); rect.setAttribute('y', String(y)); rect.setAttribute('width', String(barW)); rect.setAttribute('height', String(h)); rect.setAttribute('fill', '#6366F1'); rect.setAttribute('rx','4'); svg.appendChild(rect);
      const label = document.createElementNS(svgNS, 'text'); label.setAttribute('x', String(x + barW/2)); label.setAttribute('y', String(height - 10)); label.setAttribute('font-size','11'); label.setAttribute('fill','#475569'); label.setAttribute('text-anchor','middle'); label.textContent = monthNames[i]; svg.appendChild(label);
    });

  // create a tooltip for revenue bars
    container.style.position = container.style.position || 'relative';
    const revTooltip = document.createElement('div');
    revTooltip.className = 'revenue-tooltip';
    revTooltip.style.position = 'absolute';
    revTooltip.style.pointerEvents = 'none';
    revTooltip.style.display = 'none';
    revTooltip.style.background = 'white';
    revTooltip.style.border = '1px solid rgba(15,23,42,0.08)';
    revTooltip.style.boxShadow = '0 6px 18px rgba(2,6,23,0.08)';
    revTooltip.style.padding = '6px 8px';
    revTooltip.style.borderRadius = '6px';
    revTooltip.style.fontSize = '13px';
    revTooltip.style.zIndex = '12';
    container.appendChild(revTooltip);

    // attach hover handlers to bars (rect elements)
    const rects = Array.from(svg.querySelectorAll('rect'));
    rects.forEach((r, i) => {
      const val = months[i].value || 0;
      const month = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][i];
      r.setAttribute('data-value', String(val));
      r.setAttribute('data-month', month);
      r.setAttribute('role','img');
      r.setAttribute('aria-label', `${month} ${year}: ${formatCurrency(val)}`);
      r.style.cursor = 'pointer';
      r.addEventListener('mouseenter', (ev) => {
        revTooltip.innerHTML = `<div style="font-weight:600">${month} ${year}</div><div style="color:#475569;margin-top:4px">${formatCurrency(val)}</div>`;
        revTooltip.style.display = 'block';
        // position
        try{
          const rect = container.getBoundingClientRect();
          const x = ev.clientX - rect.left + 8; const y = ev.clientY - rect.top + 8;
          const tw = revTooltip.offsetWidth || 120; const th = revTooltip.offsetHeight || 28;
          const left = Math.min(Math.max(8, x), Math.max(8, rect.width - tw - 12));
          const top = Math.min(Math.max(8, y), Math.max(8, rect.height - th - 12));
          revTooltip.style.left = left + 'px';
          revTooltip.style.top = top + 'px';
        }catch(e){}
      });
      r.addEventListener('mousemove', (ev) => {
        try{
          const rect = container.getBoundingClientRect();
          const x = ev.clientX - rect.left + 8; const y = ev.clientY - rect.top + 8;
          const tw = revTooltip.offsetWidth || 120; const th = revTooltip.offsetHeight || 28;
          const left = Math.min(Math.max(8, x), Math.max(8, rect.width - tw - 12));
          const top = Math.min(Math.max(8, y), Math.max(8, rect.height - th - 12));
          revTooltip.style.left = left + 'px';
          revTooltip.style.top = top + 'px';
        }catch(e){}
      });
      r.addEventListener('mouseleave', () => { revTooltip.style.display = 'none'; });
    });

    container.appendChild(svg);
  }catch(e){ console.warn('renderRevenuePerMonth err', e); container.innerHTML = '<div class="text-muted">Gagal memuat penghasilan.</div>'; }
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
  // store mid-angle for explode direction
  const mid = (start + end) / 2;
  path.setAttribute('data-mid', String(mid));
  // tooltip-like title
  const title = document.createElementNS(svgNS, 'title'); title.textContent = `${d.kategori}: ${d.stock}`; path.appendChild(title);
  svg.appendChild(path);

    angle = end;
  });

  // interactive tooltip
  container.style.position = container.style.position || 'relative';
  // add a small bottom margin so the chart has breathing room
  container.style.marginBottom = container.style.marginBottom || '12px';
  const tooltip = document.createElement('div');
  tooltip.className = 'stock-tooltip';
  tooltip.style.position = 'absolute';
  tooltip.style.pointerEvents = 'none';
  tooltip.style.display = 'none';
  tooltip.style.background = 'white';
  tooltip.style.border = '1px solid rgba(15,23,42,0.08)';
  tooltip.style.boxShadow = '0 6px 18px rgba(2,6,23,0.08)';
  tooltip.style.padding = '6px 8px';
  tooltip.style.borderRadius = '6px';
  tooltip.style.fontSize = '13px';
  tooltip.style.maxWidth = '160px';
  tooltip.style.boxSizing = 'border-box';
  tooltip.style.zIndex = '10';
  container.appendChild(tooltip);

  // (removed center total label per UX request)

  // attach hover handlers and interaction
  const paths = Array.from(svg.querySelectorAll('path'));
  paths.forEach((path, idx) => {
  // read stored mid-angle for explode direction
  const mid = Number(path.getAttribute('data-mid')) || 0;
    path.style.transition = 'transform 0.18s ease, opacity 0.12s ease, stroke-width 0.12s ease';
    path.addEventListener('mouseenter', (ev) => {
      // dim others
      paths.forEach(p => { p.style.opacity = '0.35'; });
      path.style.opacity = '1';
      path.style.strokeWidth = '2';
      // explode outward
      const dx = Math.cos(mid) * 8; const dy = Math.sin(mid) * 8;
      path.setAttribute('transform', `translate(${dx} ${dy})`);
      // show tooltip
      try{
        const kategori = path.getAttribute('data-kategori') || '';
        const stock = Number(path.getAttribute('data-stock') || 0) || 0;
        // single-line detail: "KATEGORI — N barang" (no 'stok' word)
        tooltip.innerHTML = `<div style="font-weight:600;display:inline-block;margin-right:6px">${kategori}</div><div style="color:#475569;display:inline-block">${stock} barang</div>`;
        tooltip.style.whiteSpace = 'nowrap';
        // show first so we can measure offsetWidth/offsetHeight
        tooltip.style.display = 'block';
        const rect = container.getBoundingClientRect();
        const x = ev.clientX - rect.left + 12; const y = ev.clientY - rect.top + 12;
        // measure then clamp so it doesn't overflow right or bottom
        const tw = tooltip.offsetWidth || 120; const th = tooltip.offsetHeight || 28;
        const left = Math.min(Math.max(8, x), Math.max(8, rect.width - tw - 12));
        const top = Math.min(Math.max(8, y), Math.max(8, rect.height - th - 12));
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      }catch(e){}
    });
    path.addEventListener('mousemove', (ev) => {
      try{
        const rect = container.getBoundingClientRect();
        const x = ev.clientX - rect.left + 12; const y = ev.clientY - rect.top + 12;
        const tw = tooltip.offsetWidth || 120; const th = tooltip.offsetHeight || 28;
        const left = Math.min(Math.max(8, x), Math.max(8, rect.width - tw - 12));
        const top = Math.min(Math.max(8, y), Math.max(8, rect.height - th - 12));
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
      }catch(e){}
    });
    path.addEventListener('mouseleave', () => {
      // restore
      paths.forEach(p => { p.style.opacity = '1'; p.style.strokeWidth = '1'; p.removeAttribute('transform'); });
      tooltip.style.display = 'none';
    });
  });

  container.appendChild(svg);
}

// auto-init on DOM ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { initNav(); highlightActive(); initDashboard(); });
else { initNav(); highlightActive(); initDashboard(); }
