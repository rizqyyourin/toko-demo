// Simple development proxy to bypass CORS for Google Apps Script
// Usage:
// 1) set environment variable GAS_URL to your apps script URL or edit GAS_URL below
// 2) npm install express node-fetch@2 body-parser
// 3) node dev-proxy.js

const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycbzHKDDVU5fFbEG3e8HoZIq8cCvyBajkL8wsc8qOIjOg4P3sbLRC2GtITClGulA35v6P/exec';

app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// CORS headers for all responses
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Forward all requests to /api to the GAS endpoint
app.all('/api', async (req, res) => {
  try {
    // Build target URL, include query string for GET
    const url = GAS_URL + (req.method === 'GET' && Object.keys(req.query || {}).length ? ('?' + new URLSearchParams(req.query).toString()) : '');

    const fetchOpts = {
      method: req.method,
      headers: {
        'Accept': 'application/json',
        // Let GAS handle content-type; if we send JSON body, set application/json
        'Content-Type': 'application/json',
      },
      // body only for non-GET/HEAD
      body: ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body || {}),
    };

    const r = await fetch(url, fetchOpts);
    const text = await r.text();
    // try to parse JSON; if fails, send as text
    const contentType = r.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      res.status(r.status).json(JSON.parse(text));
    } else {
      res.status(r.status).send(text);
    }
  } catch (err) {
    console.error('proxy error', err);
    res.status(502).send({ error: String(err) });
  }
});

app.listen(PORT, () => console.log(`Dev proxy listening on http://localhost:${PORT} -> ${GAS_URL}`));
