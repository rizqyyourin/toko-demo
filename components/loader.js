let counter = 0;

// full-screen overlay loader appended once
const loader = document.createElement('div');
loader.id = 'global-loader';
// put loader below modals/toasts by using a modest z-index
loader.className = 'fixed inset-0 z-30 hidden items-center justify-center';
loader.setAttribute('aria-hidden', 'true');
loader.setAttribute('role', 'status');
loader.innerHTML = `
  <div class="absolute inset-0 bg-black/30 backdrop-blur-sm"></div>
  <div class="relative z-10 w-11/12 max-w-sm sm:w-56 p-6 bg-white/90 rounded-md shadow-lg flex flex-col items-center gap-4">
    <svg class="w-12 h-12 text-primary animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
    </svg>
    <div class="text-sm font-medium text-gray-800">Memuat...</div>
  </div>
`;

document.addEventListener('DOMContentLoaded', ()=>{
  if (!document.body.contains(loader)) document.body.appendChild(loader);
});

function showLoader(){
  counter = Math.max(0, counter) + 1;
  if (loader) {
    // ensure loader is present in DOM (in case showLoader is called before DOMContentLoaded handler ran)
    if (!document.body.contains(loader)) document.body.appendChild(loader);
    loader.classList.remove('hidden');
    loader.classList.add('flex');
    loader.setAttribute('aria-hidden','false');
    // ensure focus is not trapped but announced to assistive tech
    loader.setAttribute('aria-live','polite');
  }
}

function hideLoader(){
  counter = Math.max(0, counter - 1);
  if (counter <= 0 && loader) {
    loader.classList.add('hidden');
    loader.classList.remove('flex');
    loader.setAttribute('aria-hidden','true');
    counter = 0;
  }
}

export { showLoader, hideLoader };
