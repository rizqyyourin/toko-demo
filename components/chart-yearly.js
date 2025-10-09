// Safe, lazy-loaded Chart.js wrapper
// Usage: const inst = await mountYearlyChart(containerElement, data, opts)
// inst.destroy() to remove

const CHART_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';

function loadScriptOnce(src, timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.Chart) return resolve(window.Chart);
    const existing = Array.from(document.scripts).find(s => s.src && s.src.indexOf(src) !== -1);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Chart));
      existing.addEventListener('error', () => reject(new Error('Chart script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    let timer = setTimeout(() => { s.remove(); reject(new Error('Chart.js load timeout')); }, timeout);
    s.addEventListener('load', () => { clearTimeout(timer); resolve(window.Chart); });
    s.addEventListener('error', (e) => { clearTimeout(timer); reject(new Error('Chart.js failed to load')); });
    document.head.appendChild(s);
  });
}

export async function mountYearlyChart(container, data = {}, { year = null } = {}){
  if (!container) throw new Error('container required');

  // create holder
  const wrap = document.createElement('div');
  wrap.className = 'mt-4 p-3 bg-white rounded shadow-sm';
  const header = document.createElement('div');
  header.className = 'mb-2 text-sm text-muted';
  header.textContent = 'Grafik Penjualan (muat saat diminta)';
  wrap.appendChild(header);

  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 300;
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  let chart = null;
  try {
    await loadScriptOnce(CHART_CDN);
    if (!window.Chart) throw new Error('Chart global not found after load');

    // Prepare monthly totals from provided data.perNotaItemsSum and penjualan
    const perNota = data.perNotaItemsSum || {};
    const pen = data.penjualan || [];
    const now = new Date();
    const selYear = year || (now.getFullYear());
    const months = new Array(12).fill(0);

    // build penjualan map by canonical key -> row
    const penMap = {};
    pen.forEach(p => {
      const key = String(p.ID_NOTA || p.NOTA || p.NOMOR || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      penMap[key] = p;
    });

    Object.keys(perNota).forEach(k => {
      const notaKey = String(k).toUpperCase().replace(/[^0-9A-Z]/g, '');
      const pRow = penMap[notaKey];
      if (!pRow) return;
      const t = pRow.TGL || pRow.TANGGAL || pRow.tgl || '';
      let mon = null;
      try {
        const m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) { const yyyy = Number(m[1]); if (yyyy === selYear) mon = Number(m[2]) - 1; }
        else {
          const mm = String(t).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
          if (mm) { let yy = mm[3]; if (yy.length === 2) yy = '20' + yy; const yyyy = Number(yy); if (yyyy === selYear) mon = Number(mm[2]) - 1; }
        }
      } catch(e){}
      if (mon == null) return;
      months[mon] += Number(perNota[k] || 0);
    });

    const labels = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const ctx = canvas.getContext('2d');
    // eslint-disable-next-line no-undef
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ label: `Penjualan ${selYear}`, data: months, backgroundColor: 'rgba(99,102,241,0.9)' }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { ticks: { callback: (v) => {
          try { return Number(v).toLocaleString('id-ID'); } catch(e) { return v; }
        } } } },
        plugins: { legend: { display: false } }
      }
    });

    // wrap instance for destruction
    const inst = {
      chart,
      destroy(){ try{ chart && chart.destroy(); } catch(e){} if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
    return inst;
  } catch (err) {
    // graceful fallback: show message and return a no-op destroy
    console.warn('[chart-yearly] failed to mount chart', err);
    const errMsg = document.createElement('div');
    errMsg.className = 'text-sm text-red-600';
    errMsg.textContent = 'Gagal memuat grafik. Coba lagi nanti.';
    wrap.appendChild(errMsg);
    return { destroy(){ if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
  }
}

export default { mountYearlyChart };
