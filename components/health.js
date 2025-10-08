import { API_BASE } from '../config/config.js';

const dots = Array.from(document.querySelectorAll('.health-dot'));
let online = false;

function updateDots(state) {
  for (const d of dots) {
    // preserve other layout classes, just toggle bg color
    d.classList.remove('bg-success', 'bg-muted');
    d.classList.add(state ? 'bg-success' : 'bg-muted');
    d.title = state ? 'Online' : 'Offline';
    d.setAttribute('aria-label', state ? 'Koneksi: online' : 'Koneksi: offline');
  }
}

async function ping() {
  try {
    const res = await fetch(`${API_BASE}?action=health`);
    if (!res.ok) throw new Error('no');
    await res.json();
    online = true;
    updateDots(true);
  } catch (err) {
    online = false;
    updateDots(false);
  }
}

ping();
setInterval(ping, 60_000);

export function isOnline() { return online; }
