import { API_BASE } from '../config/config.js';
import { showLoader, hideLoader } from '../components/loader.js';
import { showToast } from '../components/toast.js';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_STORAGE_KEY = 'toko_cache_v1';
const cache = new Map(); // table -> {ts, data}

function loadCacheFromStorage(){
  try{
    // prefer sessionStorage (per-tab), fallback to localStorage if empty
    let raw = null;
    try { raw = sessionStorage.getItem(CACHE_STORAGE_KEY); } catch(e) { raw = null; }
    if (!raw) {
      try { raw = localStorage.getItem(CACHE_STORAGE_KEY); } catch(e) { raw = null; }
    }
    console.debug('[api] loadCacheFromStorage found (session/local):', !!raw);
    if(!raw) return;
    const obj = JSON.parse(raw || '{}');
    for(const k of Object.keys(obj||{})){
      const v = obj[k];
      if(v && typeof v.ts === 'number' && Array.isArray(v.data)) cache.set(k, v);
    }
  }catch(e){ /* ignore parse errors */ }
}

function persistCacheToStorage(){
  try{
    const obj = {};
    for(const [k,v] of cache.entries()) obj[k] = v;
    const raw = JSON.stringify(obj);
    try{ sessionStorage.setItem(CACHE_STORAGE_KEY, raw); }catch(e){ /* ignore */ }
    try{ localStorage.setItem(CACHE_STORAGE_KEY, raw); }catch(e){ /* ignore */ }
  }catch(e){ /* ignore storage errors */ }
}

// initialize from sessionStorage so cache survives page navigation within same tab
// initialize from sessionStorage so cache survives page navigation within same tab
let cacheReady = Promise.resolve();
if (typeof window !== 'undefined' && window.sessionStorage) {
  cacheReady = (async () => { loadCacheFromStorage(); })();
}

async function fetchJSON(url, opts = {}) {
  showLoader();
  try {
    // if running on localhost, allow a local dev proxy at http://localhost:3000/api
    const loc = typeof location !== 'undefined' ? location : null;
    let target = url;
    if (loc && (loc.hostname === '127.0.0.1' || loc.hostname === 'localhost' || loc.port === '5500')) {
      // route through proxy
      try {
        const u = new URL(url);
        // For GET requests include the original query string so proxy can forward it
        const proxyBase = (loc.protocol || 'http:') + '//' + (loc.hostname || 'localhost') + ':3000/api';
        target = proxyBase + (u.search || '');
      } catch (e) { target = url; }
    }
    try {
      const res = await fetch(target, opts);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      console.error('[api] fetch failed for', target, err);
      // If we attempted to use a local proxy, fall back to direct URL once
      if (target !== url) {
        try {
          const res2 = await fetch(url, opts);
          if (!res2.ok) throw new Error(`HTTP ${res2.status}`);
          return res2.json();
        } catch (err2) {
          console.error('[api] fallback direct fetch failed for', url, err2);
          throw err2;
        }
      }
      throw err;
    }
  } finally {
    hideLoader();
  }
}

export async function getList(table, { useCache = true } = {}) {
  // ensure any persisted cache has been loaded to memory before checking
  await cacheReady;
  const key = table;
  const now = Date.now();
  if (useCache && cache.has(key)) {
    const { ts, data } = cache.get(key);
    const fresh = (now - ts) < CACHE_TTL;
    console.debug('[api] cache check', key, 'fresh=', fresh, 'ts=', ts);
    if (fresh) return { fromCache: true, data };
  } else {
    console.debug('[api] no cache for', key);
  }
  const url = `${API_BASE}?table=${encodeURIComponent(table)}&action=list`;
  try {
    const json = await fetchJSON(url);
    const data = Array.isArray(json) ? json : (json.data || []);
    cache.set(key, { ts: Date.now(), data });
    persistCacheToStorage();
    console.debug('[api] fetched & cached', key, 'len=', Array.isArray(data)?data.length:0);
    return { fromCache: false, data };
  } catch (err) {
    console.error('[api] getList fetch failed for', key, err);
    // if we have stale cache, return it rather than failing hard
    if (cache.has(key)) {
      const existing = cache.get(key);
      showToast('Gagal memuat dari server — menampilkan data cache.', { duration: 3500 });
      return { fromCache: true, data: existing.data };
    }
    // otherwise show a guidance toast and return empty data
    showToast('Gagal memuat data dari server. Periksa koneksi atau jalankan dev-proxy pada http://localhost:3000 jika sedang develop (lihat console).', { duration: 6000 });
    return { fromCache: false, data: [] };
  }
}

export async function create(table, payload) {
  const body = { table, action: 'create', payload };
  // send as form-encoded to avoid CORS preflight (Apps Script supports form-encoded)
  const form = new URLSearchParams();
  Object.keys(body).forEach(k => form.append(k, typeof body[k] === 'string' ? body[k] : JSON.stringify(body[k])));
  const json = await fetchJSON(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  bustCache(table);
  return json;
}

export async function update(table, payload) {
  const body = { table, action: 'update', payload };
  const form = new URLSearchParams();
  Object.keys(body).forEach(k => form.append(k, typeof body[k] === 'string' ? body[k] : JSON.stringify(body[k])));
  const json = await fetchJSON(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  bustCache(table);
  return json;
}

export async function remove(table, payload) {
  const body = { table, action: 'delete', payload };
  const form = new URLSearchParams();
  Object.keys(body).forEach(k => form.append(k, typeof body[k] === 'string' ? body[k] : JSON.stringify(body[k])));
  const json = await fetchJSON(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  bustCache(table);
  return json;
}

export function bustCache(table) {
  cache.delete(table);
  try{ persistCacheToStorage(); }catch(e){}
}

export async function prefetchTables(tables = []) {
  for (const t of tables) {
    getList(t, { useCache: false }).catch(() => {});
  }
}

export function cacheInfo() {
  const info = {};
  for (const [k, v] of cache.entries()) info[k] = { ts: v.ts, len: v.data.length };
  return info;
}

export { CACHE_TTL };
