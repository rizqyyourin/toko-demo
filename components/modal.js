// Simple accessible modal with focus trap
let openModalEl = null;
let lastFocused = null;

function focusableElements(container) {
  return Array.from(container.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.hasAttribute('disabled'));
}

export function createModal({ title = '', content = null, onClose = null } = {}) {
  const overlay = document.createElement('div');
  // ensure modal overlay is above the loader
  overlay.className = 'fixed inset-0 bg-black/20 flex items-center justify-center z-60';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  // add horizontal margin on small screens so modal content isn't edge-to-edge
  // and make panel relative so the close button can be absolutely positioned.
  // increase max width so forms (like penjualan) have more room on wider screens
  panel.className = 'relative w-full max-w-2xl mx-4 sm:mx-0 bg-surface border border-border rounded-lg shadow-sm p-4 sm:p-6 overflow-visible';
  panel.innerHTML = `<h3 class="text-lg font-semibold mb-4">${title}</h3>`;
  if (typeof content === 'string') {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = content;
    panel.appendChild(wrapper);
  } else if (content instanceof Node) {
    panel.appendChild(content);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'absolute top-3 right-3 text-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-primary rounded';
  closeBtn.innerHTML = '✕';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', () => close());

  overlay.appendChild(panel);
  panel.appendChild(closeBtn);

  function keyHandler(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const focusables = focusableElements(panel);
      if (focusables.length === 0) { e.preventDefault(); return; }
      const idx = focusables.indexOf(document.activeElement);
      if (e.shiftKey) {
        if (idx === 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
      } else {
        if (idx === focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
      }
    }
  }

  function open() {
    if (openModalEl) return;
    lastFocused = document.activeElement;
    document.body.appendChild(overlay);
    openModalEl = overlay;
    document.addEventListener('keydown', keyHandler);
    // focus first
    setTimeout(() => {
      const f = focusableElements(panel)[0] || panel;
      f.focus();
    }, 10);
  }

  function close() {
    if (!openModalEl) return;
    document.removeEventListener('keydown', keyHandler);
    overlay.remove();
    openModalEl = null;
    if (lastFocused) lastFocused.focus();
    if (typeof onClose === 'function') onClose();
  }

  return { open, close, panel, overlay };
}
