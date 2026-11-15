/**
 * header.js — KYT Unified Navigation Bar & Header Component
 * Drives both:
 * 1. The unified sticky header (for Trip Detail, Virtual Trips, etc.)
 * 2. The mobile frosted app-level toolbar (#main-toolbar) for View Trip, Curated Trips, Visited, etc.
 * 3. In-app Album modal dialog with close button across all pages.
 */

window.KYT = window.KYT || {};

KYT.header = (function() {
  'use strict';

  /**
   * Render or update the unified sticky top header.
   */
  function render(options = {}) {
    const containerId = typeof options.container === 'string' 
      ? options.container 
      : (options.container ? options.container.id : 'kyt-app-header');

    let el = document.getElementById(containerId);
    if (!el && options.container instanceof HTMLElement) {
      el = options.container;
    }
    if (!el) {
      el = document.querySelector('header[data-kyt-header]') || document.getElementById('vt-app-header') || document.querySelector('header');
    }
    if (!el) {
      console.warn('[KYT.header] Header container element not found for ID:', containerId);
      return;
    }

    const showLogo = options.showLogo !== false;
    const back = options.back || null;
    const title = options.title || '';
    const subtitle = options.subtitle || '';
    const icon = options.icon || null;
    const actions = Array.isArray(options.actions) ? options.actions : [];

    // Left navigation group
    let leftHtml = '';

    // 1. Logo
    if (showLogo) {
      leftHtml += `
        <a href="index.html" title="KYT Home" class="shrink-0 hover:scale-105 active:scale-95 transition-transform flex items-center">
          <img src="./icons/KYT.jpg" alt="KYT Logo" class="h-8 w-auto rounded-lg shadow-xs object-contain">
        </a>
      `;
    }

    // 2. Divider if logo is present and there is a back button or title
    if (showLogo && (back || title)) {
      leftHtml += `<div class="h-4 w-px bg-slate-200 shrink-0"></div>`;
    }

    // 3. Back button (takes precedence if configured) or Title
    if (back) {
      const backLabel = back.label || 'Back';
      const backTitle = back.title || backLabel;
      if (back.href) {
        leftHtml += `
          <a href="${back.href}" id="kyt-header-back-btn" class="flex items-center gap-1.5 text-sm font-bold text-slate-700 hover:text-blue-600 active:scale-95 transition-all truncate" title="${backTitle}">
            <i data-lucide="arrow-left" class="w-4 h-4 shrink-0"></i>
            <span class="truncate">${backLabel}</span>
          </a>
        `;
      } else {
        leftHtml += `
          <button type="button" id="kyt-header-back-btn" class="flex items-center gap-1.5 text-sm font-bold text-slate-700 hover:text-blue-600 active:scale-95 transition-all truncate" title="${backTitle}">
            <i data-lucide="arrow-left" class="w-4 h-4 shrink-0"></i>
            <span class="truncate">${backLabel}</span>
          </button>
        `;
      }
    } else if (title) {
      const iconHtml = icon ? `<i data-lucide="${icon}" class="w-5 h-5 text-blue-600 shrink-0"></i>` : '';
      if (subtitle) {
        leftHtml += `
          <div class="min-w-0">
            <h1 class="text-sm sm:text-base font-black text-slate-800 tracking-tight flex items-center gap-1.5 truncate">
              ${iconHtml}
              <span class="truncate">${title}</span>
            </h1>
            <p class="text-[10px] text-slate-400 font-medium truncate">${subtitle}</p>
          </div>
        `;
      } else {
        leftHtml += `
          <h1 class="text-base sm:text-lg font-black text-slate-800 tracking-tight flex items-center gap-2 truncate">
            ${iconHtml}
            <span class="truncate">${title}</span>
          </h1>
        `;
      }
    }

    // Right actions group
    let rightHtml = '';
    actions.forEach((act, idx) => {
      const actId = act.id || `kyt-header-action-${idx}`;
      const actLabel = act.label ? `<span class="text-xs font-bold">${act.label}</span>` : '';
      const actIcon = act.icon ? `<i data-lucide="${act.icon}" class="w-3.5 h-3.5 shrink-0"></i>` : '';
      const actClass = act.className || 'flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors px-3 py-1.5 rounded-full shadow-xs active:scale-95';
      const actTitle = act.title || act.label || '';

      if (act.href) {
        rightHtml += `
          <a href="${act.href}" id="${actId}" class="${actClass}" title="${actTitle}">
            ${actIcon} ${actLabel}
          </a>
        `;
      } else {
        rightHtml += `
          <button type="button" id="${actId}" class="${actClass}" title="${actTitle}">
            ${actIcon} ${actLabel}
          </button>
        `;
      }
    });

    // Populate header container HTML
    el.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        ${leftHtml}
      </div>
      <div class="flex items-center gap-2 shrink-0 ml-3">
        ${rightHtml}
      </div>
    `;

    // Bind event handlers
    if (back && typeof back.onClick === 'function') {
      const backBtn = el.querySelector('#kyt-header-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', (e) => {
          e.preventDefault();
          back.onClick(e);
        });
      }
    }

    actions.forEach((act, idx) => {
      if (typeof act.onClick === 'function') {
        const actId = act.id || `kyt-header-action-${idx}`;
        const actBtn = el.querySelector(`#${actId}`);
        if (actBtn) {
          actBtn.addEventListener('click', (e) => {
            e.preventDefault();
            act.onClick(e);
          });
        }
      }
    });

    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /**
   * Render the floating app-level frosted toolbar (#main-toolbar)
   * Used on: view_trip.html, curated_trips.html, visited.html
   * 
   * @param {string|HTMLElement} [container='main-toolbar'] - ID or element
   * @param {Object} [options]
   * @param {string} [options.active='view'] - Active tab: 'view' | 'curated' | 'visited' | 'virtual'
   */
  function renderMainToolbar(container = 'main-toolbar', options = {}) {
    let el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) {
      el = document.getElementById('main-toolbar');
    }
    if (!el) {
      console.warn('[KYT.header] Toolbar container not found for ID:', container);
      return;
    }

    const active = options.active || 'view';

    // Style the outer container if not already styled
    if (!document.getElementById('kyt-toolbar-css')) {
      // Very narrow phones (320 px): the full-size toolbar is about 357 px wide and cut Live off the screen. Tighten it.
      const st = document.createElement('style');
      st.id = 'kyt-toolbar-css';
      st.textContent = '.kyt-toolbar a,.kyt-toolbar button{transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease}' +
        '.kyt-toolbar a:active,.kyt-toolbar button:active{transform:scale(.94)}' +
        '@media (hover:hover){.kyt-toolbar a:hover,.kyt-toolbar button:hover{transform:translateY(-2px)}}' +
        '@media (prefers-reduced-motion:reduce){.kyt-toolbar a,.kyt-toolbar button{transition:none}}' +
        '@media (max-width: 359px){.kyt-toolbar{padding-left:.375rem!important;padding-right:.375rem!important;gap:.25rem}' +
        '.kyt-toolbar>div{gap:.25rem!important}.kyt-toolbar a,.kyt-toolbar button{padding-left:.25rem!important;padding-right:.25rem!important;min-width:0!important}' +
        '.kyt-toolbar>div>a:first-child{width:36px!important;height:36px!important}}';
      document.head.appendChild(st);
    }
    el.className = 'kyt-toolbar w-full max-w-md mx-auto flex justify-between items-center z-[60] bg-white/50 backdrop-blur-md rounded-2xl p-2 border border-white/60 shadow-sm mt-4 sm:mt-8 px-3 sm:px-4 mb-3 relative';

    // Determine right button
    let rightBtnHtml = '';
    if (active === 'view') {
      rightBtnHtml = `
        <button type="button" id="btn-edit-trip" onclick="window.location.href='configure_trip.html'" class="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white rounded-xl shadow-sm text-kyt-subtext hover:text-kyt-text active:scale-90 transition-all border border-slate-100 min-w-[42px]" title="Edit Itinerary">
          <i data-lucide="settings-2" class="w-4 h-4"></i>
          <span class="text-[9px] font-bold text-slate-400 leading-none">Edit</span>
        </button>
      `;
    } else {
      rightBtnHtml = `
        <a href="view_trip.html" id="kyt-nav-live" class="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white rounded-xl shadow-sm text-kyt-accent hover:text-blue-600 active:scale-90 transition-all border border-slate-100 min-w-[42px]" title="View Current Trip">
          <i data-lucide="plane" class="w-4 h-4"></i>
          <span class="text-[9px] font-bold text-slate-400 leading-none">Live</span>
        </a>
      `;
    }

    el.innerHTML = `
      <div class="flex items-center gap-1.5 sm:gap-2">
        <!-- Home Logo -->
        <a href="index.html" class="shrink-0 bg-white rounded-xl shadow-sm hover:scale-105 active:scale-95 transition-transform border border-slate-100 overflow-hidden flex items-center justify-center w-[44px] h-[44px]" title="Home">
          <img src="icons/KYT.jpg" alt="KYT" class="w-full h-full object-contain rounded-xl">
        </a>

        <!-- Trips -->
        <a href="virtual_trip.html" id="kyt-nav-trips" class="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white rounded-xl shadow-sm ${active === 'virtual' ? 'text-blue-600 ring-2 ring-blue-500/20' : 'text-kyt-accent'} hover:text-blue-600 active:scale-90 transition-all border border-slate-100 min-w-[42px]" title="My Virtual Trips">
          <i data-lucide="compass" class="w-4 h-4"></i>
          <span class="text-[9px] font-bold ${active === 'virtual' ? 'text-blue-600' : 'text-slate-400'} leading-none">Trips</span>
        </a>

        <!-- Curated -->
        <a href="curated_trips.html" id="kyt-nav-curated" class="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white rounded-xl shadow-sm ${active === 'curated' ? 'text-blue-600 ring-2 ring-blue-500/20' : 'text-kyt-accent'} hover:text-blue-600 active:scale-90 transition-all border border-slate-100 min-w-[42px]" title="AI Curated Trips">
          <i data-lucide="sparkles" class="w-4 h-4"></i>
          <span class="text-[9px] font-bold ${active === 'curated' ? 'text-blue-600' : 'text-slate-400'} leading-none">Curated</span>
        </a>

        <!-- Album -->
        <button type="button" id="kyt-nav-album" class="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white rounded-xl shadow-sm text-kyt-accent hover:text-blue-600 active:scale-90 transition-all border border-slate-100 min-w-[42px]" title="Memory Book">
          <i data-lucide="images" class="w-4 h-4"></i>
          <span class="text-[9px] font-bold text-slate-400 leading-none">Album</span>
        </button>

        <!-- Passport -->
        <a href="visited.html" id="kyt-nav-passport" class="flex flex-col items-center gap-0.5 px-2 py-1.5 bg-white rounded-xl shadow-sm ${active === 'visited' ? 'text-blue-600 ring-2 ring-blue-500/20' : 'text-kyt-accent'} hover:text-blue-600 active:scale-90 transition-all border border-slate-100 min-w-[42px]" title="Digital Passport">
          <i data-lucide="stamp" class="w-4 h-4"></i>
          <span class="text-[9px] font-bold ${active === 'visited' ? 'text-blue-600' : 'text-slate-400'} leading-none">Passport</span>
        </a>
      </div>

      <!-- Save: opens Save & Open; the dot shows there are changes not yet saved to a file -->
      <button type="button" id="kyt-nav-save" data-kyt-backup class="relative flex flex-col items-center gap-0.5 px-1.5 py-1.5 bg-white rounded-xl shadow-sm text-kyt-accent hover:text-blue-600 active:scale-90 transition-all border border-slate-100 min-w-[38px]" title="Save your trips to a file">
        <i data-lucide="save" class="w-4 h-4"></i>
        <span class="text-[9px] font-bold text-slate-400 leading-none">Save</span>
        <span data-kyt-save-dot style="display:none;position:absolute;top:3px;right:5px;width:8px;height:8px;border-radius:9999px;background:#F59E0B;border:1.5px solid #fff"></span>
      </button>

      <!-- Right Action -->
      ${rightBtnHtml}
    `;

    // Wire Album button click
    const albumBtn = el.querySelector('#kyt-nav-album') || el.querySelector('#btn-open-album');
    if (albumBtn) {
      albumBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openAlbumModal();
      });
    }

    if (window.KYT && KYT.backup && KYT.backup.bind) KYT.backup.bind(el);
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  /**
   * Open the Memory Album modal dialog.
   * Works on any page.
   */
  function openAlbumModal() {
    let modal = document.getElementById('kyt-album-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'kyt-album-modal';
      modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] hidden flex flex-col items-center justify-center p-3 sm:p-6 animate-fade-in';
      modal.innerHTML = `
        <div class="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200">
          <header class="w-full flex justify-between items-center py-4 px-6 bg-white border-b border-slate-200 shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <i data-lucide="images" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-lg font-black text-slate-800 leading-tight">Memory Album</h3>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Trip Journal & Memories</p>
              </div>
            </div>
            <button type="button" id="kyt-album-close-btn" class="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all active:scale-90" title="Close Album">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </header>
          <div id="kyt-album-body" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"></div>
          <div class="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
            <p class="text-xs text-slate-400 font-medium">Auto-saved offline in KYT</p>
            <button type="button" id="kyt-album-print-btn" class="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm">
              <i data-lucide="printer" class="w-4 h-4"></i> Print / PDF
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#kyt-album-close-btn').onclick = closeAlbumModal;
      modal.querySelector('#kyt-album-print-btn').onclick = () => window.print();
      modal.onclick = (e) => { if (e.target === modal) closeAlbumModal(); };
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeAlbumModal();
      });
    }

    // Populate album content
    const bodyEl = modal.querySelector('#kyt-album-body');
    let tripName = 'My Trip';
    let tripCover = null;
    let steps = [];

    if (window.KYT && window.KYT.store && typeof window.KYT.store.get === 'function') {
      const st = window.KYT.store.get();
      tripName = st.tripName || tripName;
      tripCover = st.tripCoverImage;
      steps = st.stepsData || [];
    } else {
      try {
        tripName = localStorage.getItem('kyt_tripName') || 'My Trip';
        tripCover = localStorage.getItem('kyt_tripCoverImage') || null;
        steps = JSON.parse(localStorage.getItem('kyt_stepsData') || '[]');
      } catch(e) {}
    }

    if (!steps || steps.length === 0) {
      bodyEl.innerHTML = `
        <div class="text-center py-12 px-4">
          <div class="text-5xl mb-3">📸</div>
          <h4 class="font-extrabold text-slate-800 text-lg mb-1">Your Travel Memory Book</h4>
          <p class="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed mb-4">
            As you complete steps, add notes, and photos to your trip, they will appear here as a personal memory book!
          </p>
          <a href="view_trip.html" class="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-600 font-bold text-xs rounded-xl hover:bg-blue-100 transition-colors">
            <i data-lucide="plane" class="w-3.5 h-3.5"></i> Go to Current Trip
          </a>
        </div>
      `;
    } else {
      let stepsHtml = steps.map((s, idx) => {
        let photosHtml = '';
        if (s.memories && s.memories.length > 0) {
          photosHtml = `
            <div class="grid grid-cols-2 gap-2 mt-3">
              ${s.memories.map(m => `<img src="${m}" class="w-full h-32 object-cover rounded-xl border border-slate-100 shadow-xs">`).join('')}
            </div>
          `;
        }
        return `
          <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <div class="flex items-center gap-2 mb-1.5">
              <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-bold text-xs flex items-center justify-center">${idx + 1}</span>
              <h4 class="text-sm font-extrabold text-slate-800 truncate">${s.title || 'Step'}</h4>
            </div>
            ${s.where ? `<p class="text-xs text-slate-500 font-medium ml-8 flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3 text-slate-400"></i> ${s.where}</p>` : ''}
            ${s.notes ? `<p class="text-xs text-slate-600 font-normal italic ml-8 mt-1">${s.notes}</p>` : ''}
            ${photosHtml}
          </div>
        `;
      }).join('');

      bodyEl.innerHTML = `
        <div class="space-y-4">
          <div class="p-5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-sm">
            <p class="text-[10px] font-bold uppercase tracking-widest text-blue-200 mb-1">Active Journey</p>
            <h2 class="text-2xl font-black">${tripName}</h2>
            <p class="text-xs text-blue-100 mt-1">${steps.length} activities planned</p>
          </div>
          <div class="space-y-3">
            ${stepsHtml}
          </div>
        </div>
      `;
    }

    modal.classList.remove('hidden');
    if (window.lucide) {
      lucide.createIcons({ root: modal });
    }
  }

  function closeAlbumModal() {
    const modal = document.getElementById('kyt-album-modal');
    if (modal) modal.classList.add('hidden');
    const legacy = document.getElementById('memory-card-view');
    if (legacy) legacy.classList.add('hidden');
  }

  return {
    render: render,
    renderMainToolbar: renderMainToolbar,
    openAlbum: openAlbumModal,
    closeAlbum: closeAlbumModal
  };
})();

