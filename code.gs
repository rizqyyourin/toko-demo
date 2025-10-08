/***********************
 * CONFIG
 ***********************/
const SPREADSHEET_ID = '1yJ7J-tW_-PrXrJBovgdanpnzP_37rFPhIgUCwEwFJvM'; // <— PUNYAMU
const API_KEY = ''; // opsional: jika ingin header X-API-KEY

// Definisi tabel: nama sheet, header, dan kolom kunci (untuk update/delete)
const TABLES = {
  pelanggan: {
    sheet: 'PELANGGAN',
    headers: ['ID_PELANGGAN','NAMA','DOMISILI','JENIS_KELAMIN'],
    keyCols: ['ID_PELANGGAN']
  },
  barang: {
    sheet: 'BARANG',
    // add STOCK column to track available inventory
    headers: ['KODE','NAMA','KATEGORI','HARGA','STOCK'],
    keyCols: ['KODE']
  },
  penjualan: {
    sheet: 'PENJUALAN',
    headers: ['ID_NOTA','TGL','KODE_PELANGGAN','SUBTOTAL'],
    keyCols: ['ID_NOTA']
  },
  item_penjualan: {
    sheet: 'ITEM_PENJUALAN',
    headers: ['NOTA','KODE_BARANG','QTY'],
    keyCols: ['NOTA','KODE_BARANG'] // composite key
  },
};

/***********************
 * MENU (untuk dipicu dari Spreadsheet)
 * — gunakan getActiveSpreadsheet() agar tidak error openById
 ***********************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Toko Tools')
    .addItem('Create Headers + Seed Dummy', 'seedAll')
    .addItem('Clear Data (Keep Headers)', 'clearAllBelowHeader')
    .addToUi();
}

// Seeder: buat/normalize header & isi data dummy (tahun 2025)
function seedAll() {
  // PELANGGAN
  setHeadersAndRows_Menu(
    'PELANGGAN',
    TABLES.pelanggan.headers,
    [
      ['PELANGGAN_1','ANDI','JAK-UT','PRIA'],
      ['PELANGGAN_2','BUDI','JAK-BAR','PRIA'],
      ['PELANGGAN_3','JOHAN','JAK-SEL','PRIA'],
      ['PELANGGAN_4','SINTHA','JAK-TIM','WANITA'],
      ['PELANGGAN_5','ANTO','JAK-UT','PRIA'],
      ['PELANGGAN_6','BUJANG','JAK-BAR','PRIA'],
      ['PELANGGAN_7','JOWAN','JAK-SEL','PRIA'],
      ['PELANGGAN_8','SINTIA','JAK-TIM','WANITA'],
      ['PELANGGAN_9','BUTET','JAK-BAR','WANITA'],
      ['PELANGGAN_10','JONNY','JAK-SEL','WANITA'],
    ]
  );

  // BARANG
  setHeadersAndRows_Menu(
    'BARANG',
    TABLES.barang.headers,
    [
      // KODE, NAMA, KATEGORI, HARGA, STOCK
      ['BRG_1','PEN','ATK',15000,50],
      ['BRG_2','PENSIL','ATK',10000,100],
      ['BRG_3','PAYUNG','RT',70000,20],
      ['BRG_4','PANCI','MASAK',110000,10],
      ['BRG_5','SAPU','RT',40000,30],
      ['BRG_6','KIPAS','ELEKTRONIK',200000,15],
      ['BRG_7','KUALI','MASAK',120000,12],
      ['BRG_8','SIKAT','RT',30000,40],
      ['BRG_9','GELAS','RT',25000,25],
      ['BRG_10','PIRING','RT',35000,18],
    ]
  );

  // PENJUALAN (2025)
  setHeadersAndRows_Menu(
    'PENJUALAN',
    TABLES.penjualan.headers,
    [
      ['NOTA_1','01/01/25','PELANGGAN_1',50000],
      ['NOTA_2','01/01/25','PELANGGAN_2',200000],
      ['NOTA_3','01/01/25','PELANGGAN_3',430000],
      ['NOTA_4','02/01/25','PELANGGAN_7',120000],
      ['NOTA_5','02/01/25','PELANGGAN_4',70000],
      ['NOTA_6','03/01/25','PELANGGAN_8',230000],
      ['NOTA_7','03/01/25','PELANGGAN_9',390000],
      ['NOTA_8','03/01/25','PELANGGAN_5',65000],
      ['NOTA_9','04/01/25','PELANGGAN_2',40000],
      ['NOTA_10','05/01/25','PELANGGAN_10',90000],
    ]
  );

  // ITEM_PENJUALAN
  setHeadersAndRows_Menu(
    'ITEM_PENJUALAN',
    TABLES.item_penjualan.headers,
    [
      ['NOTA_1','BRG_1',2],['NOTA_1','BRG_2',2],
      ['NOTA_2','BRG_6',1],
      ['NOTA_3','BRG_4',1],['NOTA_3','BRG_7',1],['NOTA_3','BRG_6',1],
      ['NOTA_4','BRG_9',2],['NOTA_4','BRG_10',2],
      ['NOTA_5','BRG_3',1],
      ['NOTA_6','BRG_7',1],['NOTA_6','BRG_5',1],['NOTA_6','BRG_3',1],
      ['NOTA_7','BRG_5',1],['NOTA_7','BRG_6',1],['NOTA_7','BRG_7',1],['NOTA_7','BRG_8',1],
      ['NOTA_8','BRG_5',1],['NOTA_8','BRG_9',1],
      ['NOTA_9','BRG_5',10],
      ['NOTA_10','BRG_2',3],['NOTA_10','BRG_1',1],
    ]
  );
}

// Clear: hapus baris data, header tetap
function clearAllBelowHeader() {
  const names = ['PELANGGAN','BARANG','PENJUALAN','ITEM_PENJUALAN'];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  names.forEach(n => {
    let sh = ss.getSheetByName(n);
    if (sh) clearBelowHeader_(sh);
  });
}

/***********************
 * WEB APP (REST-like API)
 * — gunakan openById agar konsisten ketika dipanggil dari luar
 ***********************/
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    if (API_KEY && params['X-API-KEY'] !== API_KEY) {
      return json({ ok:false, error:'Unauthorized' }, 401);
    }

    const action = (params.action || 'health').toLowerCase();

    if (action === 'health') {
      return json({ ok:true, status:'healthy' });
    }

    if (action === 'list') {
      const tableCfg = getTableCfg(params.table);
      const data = readAll_Web(tableCfg);
      return json({ ok:true, data });
    }

    return json({ ok:false, error:'Unsupported GET action' }, 400);
  } catch (err) {
    return json({ ok:false, error: String(err) }, 500);
  }
}

function doPost(e) {
  try {
    const body = parseBody(e);
    const method = (body._method || body.method || 'POST').toUpperCase();
    const hdrKey = (body.apiKey || '');
    if (API_KEY && hdrKey !== API_KEY) {
      return json({ ok:false, error:'Unauthorized' }, 401);
    }

    const action = (body.action
      || (method === 'PUT' ? 'update'
          : method === 'DELETE' ? 'delete' : 'create')).toLowerCase();

    const tableCfg = getTableCfg(body.table);
    const payload = body.payload || {};

    if (action === 'create') {
      const row = mapObjectToRow(tableCfg, payload);
      appendOne_Web(tableCfg, row);
      return json({ ok:true, data: payload });
    }
    if (action === 'update') {
      updateByKey_Web(tableCfg, payload);
      return json({ ok:true, data: payload });
    }
    if (action === 'delete') {
      deleteByKey_Web(tableCfg, payload);
      return json({ ok:true });
    }

    return json({ ok:false, error:'Unsupported action' }, 400);
  } catch (err) {
    return json({ ok:false, error: String(err) }, 500);
  }
}

/***********************
 * HELPERS — Spreadsheet accessors
 ***********************/
// WEB: pakai ID (dipanggil dari luar)
function ssWeb() {
  // Jika ada error (misal run manual), fallback ke active untuk debugging
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}
// MENU: pakai active (dipicu dari spreadsheet yang sama)
function ssMenu() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// --- untuk MENU (seed/clear)
function setHeadersAndRows_Menu(sheetName, headers, rows) {
  const ss = ssMenu();
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  ensureHeaders_(sh, headers);
  if (rows && rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function clearBelowHeader_(sh) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
}

// Ensure BARANG has STOCK column and backfill missing values with 0
function ensureStockColumn() {
  const ss = ssMenu();
  const sh = ss.getSheetByName('BARANG');
  if (!sh) return;
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  const idx = headers.indexOf('STOCK');
  if (idx >= 0) return; // already present
  // add STOCK as last column
  sh.getRange(1, headers.length + 1).setValue('STOCK');
}

function backfillStockIfMissing() {
  const ss = ssMenu();
  const sh = ss.getSheetByName('BARANG');
  if (!sh) return;
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return;
  const headers = data[0];
  const stockIdx = headers.indexOf('STOCK');
  if (stockIdx < 0) return;
  const rows = data.slice(1);
  const updates = [];
  rows.forEach((r, i) => {
    const val = r[stockIdx];
    if (val === '' || val === null || val === undefined) updates.push([0]); else updates.push([r[stockIdx]]);
  });
  if (updates.length) sh.getRange(2, stockIdx+1, updates.length, 1).setValues(updates);
}

function ensureHeaders_(sh, headers) {
  const w = headers.length;
  const first = sh.getRange(1, 1, 1, w).getValues()[0];
  const same = headers.every((h, i) => (first[i] || '').toString().trim() === h);
  if (!same) {
    sh.clear();
    sh.getRange(1, 1, 1, w).setValues([headers]);
  }
}

// --- untuk WEB (API)
function getSheet_Web(name) {
  const s = ssWeb();
  let sh = s.getSheetByName(name);
  if (!sh) sh = s.insertSheet(name);
  return sh;
}

function readAll_Web(tableCfg) {
  const sh = getSheet_Web(tableCfg.sheet);
  ensureHeaders_(sh, tableCfg.headers);
  const rng = sh.getDataRange().getValues();
  if (rng.length <= 1) return [];
  const headers = rng[0];
  return rng.slice(1)
    .filter(r => r.some(c => c !== '' && c !== null))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => o[h] = r[i]);
      return o;
    });
}

function appendOne_Web(tableCfg, rowArray) {
  const sh = getSheet_Web(tableCfg.sheet);
  ensureHeaders_(sh, tableCfg.headers);
  sh.appendRow(rowArray);
}

function updateByKey_Web(tableCfg, payload) {
  const sh = getSheet_Web(tableCfg.sheet);
  ensureHeaders_(sh, tableCfg.headers);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const keyIdxs = tableCfg.keyCols.map(k => headers.indexOf(k));
  const keyVals = tableCfg.keyCols.map(k => payload[k]);

  const idx = rows.findIndex(r => keyIdxs.every((kIdx, i) => String(r[kIdx]) === String(keyVals[i])));
  if (idx < 0) throw new Error('Key not found');

  const newRow = mapObjectToRow(tableCfg, payload);
  sh.getRange(idx + 2, 1, 1, headers.length).setValues([newRow]);
}

function deleteByKey_Web(tableCfg, payload) {
  const sh = getSheet_Web(tableCfg.sheet);
  ensureHeaders_(sh, tableCfg.headers);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1);
  const keyIdxs = tableCfg.keyCols.map(k => headers.indexOf(k));
  const keyVals = tableCfg.keyCols.map(k => payload[k]);

  const idx = rows.findIndex(r => keyIdxs.every((kIdx, i) => String(r[kIdx]) === String(keyVals[i])));
  if (idx < 0) throw new Error('Key not found');
  sh.deleteRow(idx + 2);
}

/***********************
 * HELPERS — routing, mapping, JSON
 ***********************/
function getTableCfg(name) {
  if (!name) throw new Error('Missing table');
  const key = String(name).toLowerCase();
  const cfg = TABLES[key];
  if (!cfg) throw new Error('Unknown table: ' + name);
  return cfg;
}

function mapObjectToRow(tableCfg, obj) {
  // menjaga urutan kolom sesuai headers
  return tableCfg.headers.map(h => (obj[h] !== undefined ? obj[h] : ''));
}

function parseBody(e) {
  if (!e || !e.postData) return {};
  const type = e.postData.type || '';
  const raw = e.postData.contents || '';
  if (/application\/json/i.test(type)) {
    return JSON.parse(raw || '{}');
  }
  // form-encoded
  const params = {};
  raw.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  // if payload was sent as a JSON string in the form, parse it
  if (params.payload) {
    try { params.payload = JSON.parse(params.payload); } catch (e) { /* leave as-is */ }
  }
  return params;
}

function json(obj, statusCode) {
  // Apps Script ContentService tidak bisa set status code custom untuk web app;
  // kembalikan JSON biasa. Umumnya fetch dari origin lain tetap bisa.
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
