let idCounter = 1;

function getOrCreateStack() {
  let s = document.getElementById('toast-stack');
  if (s) return s;
  try {
    s = document.createElement('div');
    s.id = 'toast-stack';
    s.className = 'fixed bottom-4 right-4 z-70 flex flex-col gap-2';
    document.body.appendChild(s);
    return s;
  } catch (e) {
    return null;
  }
}

export function showToast(message, { duration = 1000 } = {}) {
  const stack = getOrCreateStack();
  const id = idCounter++;
  const el = document.createElement('div');
  el.className = 'min-w-[200px] max-w-sm bg-surface border border-border text-text shadow-sm rounded-md p-3 text-sm opacity-100';
  el.textContent = message;
  el.dataset.id = id;
  if (stack) {
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add('opacity-100'));
    setTimeout(() => {
      el.style.transition = 'opacity .18s ease, transform .18s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 220);
    }, duration);
  } else {
    // fallback: log to console if we can't append to DOM
    console.warn('[toast] fallback, message:', message);
  }
  return id;
}

export function clearToasts() { const s = document.getElementById('toast-stack'); if (s) s.innerHTML = ''; }
