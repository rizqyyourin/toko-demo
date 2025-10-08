import { getList } from './api.js';

// Utilities for parsing and normalizing dates from penjualan rows.
// Exports:
//  - fetchPenjualanMeta(opts) -> { rows, metaByKey, getIsoForKey(key), getMetaForKey(key) }
//  - parseDateToISO(str) -> 'YYYY-MM-DD' or null
//  - normalizeKey(str) -> uppercase trimmed string

function normalizeKey(v){ try{ if(v==null) return ''; return String(v).trim().toUpperCase(); }catch(e){ return ''; } }

function parseDateToISO(input){ try{
    if(!input && input !== 0) return null;
    const s = String(input).trim();
    if(!s) return null;
    // handle ISO timestamp (with time) by converting to local date
    // e.g. '2024-12-31T17:00:00.000Z' -> local date '2025-01-01' if timezone +7
    const isoTimestampMatch = s.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$/);
    if(isoTimestampMatch){
      try{
        const d = new Date(s);
        if(!isNaN(d)){
          const yy = d.getFullYear(); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0');
          return `${yy}-${mm}-${dd}`;
        }
      }catch(e){}
    }
    // already date-only ISO-like (YYYY-MM-DD)
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if(isoMatch) return isoMatch[1];
    // dd/mm/yy or dd/mm/yyyy
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if(m){
      let dd = m[1].padStart(2,'0');
      let mm = m[2].padStart(2,'0');
      let yy = m[3]; if(yy.length === 2) yy = '20' + yy;
      return `${yy}-${mm}-${dd}`;
    }
    // try Date parse fallback
    const d = new Date(s);
    if(!isNaN(d)) return d.toISOString().slice(0,10);
    return null;
  }catch(e){ return null; }
}

function isoWeek(dt){ const t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate())); const dayNum = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(t.getUTCFullYear(),0,1)); return Math.ceil((((t - yearStart) / 86400000) + 1)/7); }

export async function fetchPenjualanMeta(opts = {}){
  const useCache = opts.useCache !== false;
  const res = await getList('penjualan', { useCache });
  const rows = (res && res.data) ? res.data : [];

  // metaByKey maps normalized keys (ID_NOTA/ID/NOTA and other stringy values) -> meta { iso, year, month, week }
  const metaByKey = new Map();

  rows.forEach(p => {
    // find a date value in common fields
    const candidates = [p.TGL, p.TANGGAL, p.tgl, p.Tanggal, p.DATE, p.date, p.createdAt];
    let iso = null;
    for(const c of candidates){ if(!c) continue; const parsed = parseDateToISO(c); if(parsed){ iso = parsed; break; } }
    // if still null, try scanning all string fields for a date-like value (best-effort)
    if(!iso){
      Object.keys(p).some(k => {
        try{
          const v = p[k]; if(v==null) return false; const pv = String(v).trim(); if(!pv) return false; const parsed = parseDateToISO(pv); if(parsed){ iso = parsed; return true; } return false;
        }catch(e){ return false; }
      });
    }
    let meta = null;
    if(iso){ const d = new Date(iso + 'T00:00:00'); if(!isNaN(d)){ meta = { iso, year: d.getFullYear(), month: d.getMonth(), week: isoWeek(d) }; } }

    // collect keys to index: typical nota/id fields + any small string/number fields
    const keys = new Set();
    if(p.ID_NOTA) keys.add(p.ID_NOTA);
    if(p.ID) keys.add(p.ID);
    if(p.NOTA) keys.add(p.NOTA);
    Object.keys(p).forEach(k=>{ try{ const v = p[k]; if(v!=null && (typeof v === 'string' || typeof v === 'number')){ const s = String(v).trim(); if(s.length>0 && s.length<60) keys.add(s); } }catch(e){} });

    keys.forEach(kv => {
      const nk = normalizeKey(kv);
      if(!nk) return;
      // only set meta if we have a parsed date; otherwise ensure the key exists (set to null) so presence is known
      if(meta) metaByKey.set(nk, meta);
      else if(!metaByKey.has(nk)) metaByKey.set(nk, null);
    });
  });

  return {
    rows,
    metaByKey,
    getIsoForKey(key){ if(!key) return null; const k = normalizeKey(key); const m = metaByKey.get(k); return m && m.iso ? m.iso : null; },
    getMetaForKey(key){ if(!key) return null; const k = normalizeKey(key); return metaByKey.get(k) || null; }
  };
}

// Example usage (in comments):
// import { fetchPenjualanMeta } from '../services/penjualan-dates.js';
// const meta = await fetchPenjualanMeta();
// const iso = meta.getIsoForKey('NOTA_123'); // -> '2025-10-08' or null
// const m = meta.getMetaForKey('NOTA_123'); // -> { iso, year, month, week } or null

export default { fetchPenjualanMeta, parseDateToISO, normalizeKey };
