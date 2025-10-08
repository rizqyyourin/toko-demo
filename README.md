# Toko - Single File SPA

This is a single-page vanilla HTML/CSS/JS application using Tailwind Play CDN. It consumes a Google Apps Script JSON API.

Structure
- `index.html` - main single HTML file
- `assets/styles.css` - tiny overrides and skeleton styles
- `config/config.js` - API_BASE constant
- `services/api.js` - fetch + in-memory cache (TTL 5 minutes)
- `components/*` - UI helper components (toast, modal, table, skeleton, tabs, health)
- `tabs/*` - per-tab controllers (pelanggan, barang, penjualan, item-penjualan)

How to run
Just open `index.html` in a browser (serve over http recommended for modules). If using a local server, from repo root run:

```powershell
# from d:/Aplikasi/laragon/www/toko
python -m http.server 8000
# then open http://localhost:8000 in browser
```

Notes
- Caching: 5 minutes in-memory per table. Refresh button busts cache per tab.
- CRUD available for Pelanggan and Barang; Penjualan & Item Penjualan are read-only.
- Tabs are deep-linkable (#pelanggan, #barang, #penjualan, #item-penjualan).
- Tailwind Play CDN used; no build step.

