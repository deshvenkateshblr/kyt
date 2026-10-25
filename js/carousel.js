/**
 * carousel.js — Hero card rendering, navigation, and swipe gestures
 */

window.KYT = window.KYT || {};

window.KYT.carousel = (() => {
  const cardEl     = document.getElementById('hero-card');
  const trackEl    = document.getElementById('carousel-track');
  const btnPrev    = document.getElementById('btn-prev');
  const btnNext    = document.getElementById('btn-next');
  const titleEl    = document.getElementById('main-trip-title');
  const coverBg    = document.getElementById('main-cover-bg');
  const notesWrap  = document.getElementById('main-trip-notes-wrap');
  const notesEl    = document.getElementById('main-trip-notes');
  const positionEl = document.getElementById('step-position-indicator');

  // ── Cover image background ────────────────────────────────────────────────
  function updateCoverBg() {
    const { tripCoverImage } = KYT.store.get();
    if (tripCoverImage) {
      coverBg.style.backgroundImage = `url('${tripCoverImage}')`;
      coverBg.classList.remove('hidden');
    } else {
      coverBg.style.backgroundImage = '';
      coverBg.classList.add('hidden');
    }
  }

  // ── Trip notes ────────────────────────────────────────────────────────────
  function updateTripNotes() {
    const { tripNotes } = KYT.store.get();
    if (tripNotes && tripNotes.trim()) {
      notesEl.textContent = tripNotes;
      notesWrap.classList.remove('hidden');
    } else {
      notesWrap.classList.add('hidden');
    }
  }

  // ── Attachment pills ──────────────────────────────────────────────────────
  function buildAttachmentsHTML(step, stepIdx) {
    return step.attachments.map((att, i) => {
      const safeName = KYT.utils.escapeHTML(att.name || 'Attachment');
      if (att.type === 'file') {
        return `
          <a href="#" onclick="KYT.fileViewer.open(event,${stepIdx},${i})"
             class="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors shadow-sm">
            <i data-lucide="file" class="w-3.5 h-3.5 text-kyt-accent shrink-0"></i>
            <span class="text-[12px] font-semibold text-slate-700 truncate max-w-[140px]">${safeName}</span>
          </a>`;
      }
      const safeUrl = (att.url && /^https?:\/\//i.test(att.url)) ? KYT.utils.escapeHTML(att.url) : '#';
      return `
        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer"
           class="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors shadow-sm">
          <i data-lucide="link" class="w-3.5 h-3.5 text-kyt-accent shrink-0"></i>
          <span class="text-[12px] font-semibold text-slate-700 truncate max-w-[140px]">${safeName}</span>
        </a>`;
    }).join('');
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  function renderEmpty() {
    cardEl.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center p-6 h-full min-h-[350px]">
        <div class="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6">
          <i data-lucide="map" class="w-10 h-10 text-kyt-accent"></i>
        </div>
        <h3 class="text-2xl font-extrabold text-kyt-text mb-2">No steps yet</h3>
        <p class="text-slate-500 mb-8 font-medium">Start building your itinerary to get contextual next steps.</p>
        <button onclick="KYT.config.openConfigView()"
                class="px-8 py-4 bg-kyt-accent text-white font-extrabold rounded-2xl shadow-lg shadow-blue-500/30 hover:bg-blue-600 active:scale-[0.98] transition-all flex items-center gap-2">
          <i data-lucide="settings-2" class="w-5 h-5"></i> Configure Trip
        </button>
      </div>`;
    btnPrev.disabled = true;
    btnNext.disabled = true;
    lucide.createIcons();
  }

  // ── Main render ───────────────────────────────────────────────────────────
  function renderCard(direction = null) {
    const { tripName, stepsData, currentIndex } = KYT.store.get();
    titleEl.textContent = tripName;
    positionEl.textContent = stepsData.length > 0 ? `Step ${currentIndex + 1} of ${stepsData.length}` : '';
    updateCoverBg();
    updateTripNotes();

    if (stepsData.length === 0) { renderEmpty(); return; }

    const step    = stepsData[currentIndex];
    const stepIdx = currentIndex;

    const exactStr    = KYT.clock.formatTimeExact(step.targetTime);
    const relativeStr = KYT.clock.getRelativeTimeString(step.targetTime);

    const mapLink = (step.mapUrl && step.mapUrl.trim())
      ? step.mapUrl
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(step.where || '')}`;

    const onBtnClass   = step.status === 'on'   ? 'vcr-on-active'   : 'vcr-inactive';
    const doneBtnClass = step.status === 'done' ? 'vcr-done-active' : 'vcr-inactive';

    let relColor = 'text-kyt-accent';
    if (step.status === 'done')            relColor = 'text-kyt-subtext';
    else if (step.targetTime < new Date()) relColor = 'text-rose-500';

    const statusBadge = step.status === 'on'
      ? `<div class="flex items-center gap-2">
           <span class="text-[10px] font-bold text-kyt-accent uppercase tracking-widest">In Progress</span>
           <span class="flex h-3 w-3 relative">
             <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-kyt-accent opacity-75"></span>
             <span class="relative inline-flex rounded-full h-3 w-3 bg-kyt-accent"></span>
           </span>
         </div>`
      : step.status === 'done'
      ? `<div class="flex items-center gap-1.5">
           <span class="text-[10px] font-bold text-kyt-done uppercase tracking-widest">Completed</span>
           <i data-lucide="check-circle" class="w-5 h-5 text-kyt-done"></i>
         </div>`
      : '';

    const notesSection = step.notes
      ? `<div class="mb-4">
           <p class="text-[11px] font-bold text-kyt-subtext uppercase tracking-widest mb-1.5">Notes</p>
           <p class="text-[14px] text-slate-700 leading-relaxed font-medium">${KYT.utils.escapeHTML(step.notes)}</p>
         </div>` : '';

    const attachmentsSection = step.attachments && step.attachments.length > 0
      ? `<div class="mb-4"><div class="flex flex-wrap gap-2">${buildAttachmentsHTML(step, stepIdx)}</div></div>` : '';

    // NEW: Live Memories Section
    const memoriesArr = step.memories || [];
    const memoriesHtml = memoriesArr.length > 0 
      ? `<div class="flex gap-2 overflow-x-auto no-scrollbar py-1">
           ${memoriesArr.map((m, i) => `
             <div class="relative group shrink-0 w-16 h-16">
               <img src="${m}" class="w-16 h-16 rounded-xl object-cover border border-slate-200 shadow-sm">
               <button data-action="delete-memory" data-index="${i}" class="absolute -top-1.5 -right-1.5 bg-white border border-slate-200 p-0.5 rounded-full text-red-500 shadow-sm hover:scale-110 active:scale-95 transition-all">
                 <i data-lucide="x" class="w-3.5 h-3.5"></i>
               </button>
             </div>
           `).join('')}
         </div>` : '';
         
    const memoriesSection = `
      <div class="mb-4">
        <div class="flex items-center justify-between mb-2">
          <p class="text-[11px] font-bold text-kyt-subtext uppercase tracking-widest">Live Memories</p>
          <div class="flex flex-col items-end">
            <button class="text-kyt-accent hover:text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide uppercase transition-colors" data-action="add-memory">
              <i data-lucide="camera" class="w-3.5 h-3.5"></i> Add Photo
            </button>
            <p class="kyt-paste-hint text-[9px] text-slate-400 font-medium mt-1 pr-1">or Ctrl+V to paste</p>
          </div>
        </div>
        ${memoriesHtml}
      </div>`;

    cardEl.innerHTML = `
      <div class="flex-1 flex flex-col">
        <div class="flex justify-end items-center mb-5 h-6">${statusBadge}</div>

        <div class="flex items-center gap-4 mb-6">
          <div class="p-3 bg-blue-50 text-kyt-accent rounded-2xl shrink-0">
            <i data-lucide="${KYT.utils.escapeHTML(step.icon || 'map-pin')}" class="w-8 h-8"></i>
          </div>
          <h3 class="text-2xl font-extrabold text-kyt-text leading-tight">${KYT.utils.escapeHTML(step.title)}</h3>
        </div>

        <div class="space-y-4 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div class="flex items-start gap-3">
            <i data-lucide="clock" class="w-5 h-5 text-kyt-subtext mt-0.5 shrink-0"></i>
            <div>
              <p class="text-[13px] font-bold text-kyt-subtext uppercase tracking-wide mb-0.5">When</p>
              <div class="flex items-baseline gap-2 flex-wrap">
                <p class="text-[16px] font-extrabold text-kyt-text">${exactStr}</p>
                <p class="text-[13px] font-bold ${relColor} bg-white px-2 py-0.5 rounded-md shadow-sm border border-slate-100">${relativeStr}</p>
              </div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <i data-lucide="map-pin" class="w-5 h-5 text-kyt-subtext mt-0.5 shrink-0"></i>
            <div class="flex-1">
              <p class="text-[13px] font-bold text-kyt-subtext uppercase tracking-wide mb-0.5">Where</p>
              <div class="flex items-center justify-between gap-2">
                <p class="text-[15px] font-bold text-kyt-text">${KYT.utils.escapeHTML(step.where || '—')}</p>
                <a href="${KYT.utils.escapeHTML(mapLink)}" target="_blank" rel="noopener noreferrer"
                   class="shrink-0 bg-blue-100/50 text-kyt-accent hover:bg-blue-100 p-2 rounded-xl transition-colors flex items-center gap-1.5 shadow-sm border border-blue-200/50">
                  <span class="text-[10px] font-extrabold uppercase tracking-wider">Map</span>
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                </a>
              </div>
            </div>
          </div>
        </div>

        ${notesSection}
        ${attachmentsSection}
        ${memoriesSection}
        <div class="flex-grow"></div>

        <div class="mt-4 pt-6 border-t-2 border-slate-100/60 flex justify-center gap-6 px-1 pb-2">
          <button class="vcr-btn ${onBtnClass} w-24 h-24 rounded-[1.25rem] flex flex-col items-center justify-center gap-2" data-action="toggle-on">
            <i data-lucide="play" class="w-6 h-6 ${step.status === 'on' ? 'fill-current' : 'fill-slate-300'}"></i>
            <span class="text-[11px] font-extrabold uppercase tracking-widest">On</span>
          </button>
          <button class="vcr-btn ${doneBtnClass} w-24 h-24 rounded-[1.25rem] flex flex-col items-center justify-center gap-2" data-action="toggle-done">
            <i data-lucide="square" class="w-5 h-5 ${step.status === 'done' ? 'fill-current' : 'fill-slate-300'}"></i>
            <span class="text-[11px] font-extrabold uppercase tracking-widest">Done</span>
          </button>
        </div>
      </div>`;

    // Animate
    cardEl.classList.remove('animate-slide-in-right', 'animate-slide-in-left', 'animate-pop');
    void cardEl.offsetWidth;
    if      (direction === 'right') cardEl.classList.add('animate-slide-in-right');
    else if (direction === 'left')  cardEl.classList.add('animate-slide-in-left');
    else                            cardEl.classList.add('animate-pop');

    lucide.createIcons();
    updateNavButtons();
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  function updateNavButtons() {
    const { stepsData, currentIndex } = KYT.store.get();
    btnPrev.disabled = currentIndex === 0;
    btnNext.disabled = currentIndex === stepsData.length - 1;
    
    const btnFirst = document.getElementById('btn-main-first');
    const btnLast = document.getElementById('btn-main-last');
    if (btnFirst) btnFirst.disabled = currentIndex === 0;
    if (btnLast) btnLast.disabled = currentIndex === stepsData.length - 1;
  }

  function goNext() {
    const { stepsData, currentIndex } = KYT.store.get();
    if (currentIndex < stepsData.length - 1) {
      KYT.store.setCurrentIndex(currentIndex + 1);
      renderCard('right');
    }
  }

  function goPrev() {
    const { currentIndex } = KYT.store.get();
    if (currentIndex > 0) {
      KYT.store.setCurrentIndex(currentIndex - 1);
      renderCard('left');
    }
  }

  function goFirst() {
    const { currentIndex } = KYT.store.get();
    if (currentIndex > 0) {
      KYT.store.setCurrentIndex(0);
      renderCard('left');
    }
  }

  function goLast() {
    const { stepsData, currentIndex } = KYT.store.get();
    if (currentIndex < stepsData.length - 1) {
      KYT.store.setCurrentIndex(stepsData.length - 1);
      renderCard('right');
    }
  }

  // ── Image Compression Helper ────────────────────────────────────────────────
  function compressImage(file, maxWidth = 1600, quality = 0.95) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Memory Upload Handler ─────────────────────────────────────────────────
  const memoryInput = document.getElementById('memory-upload-input');
  memoryInput.addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    
    const { stepsData, currentIndex } = KYT.store.get();
    const step = stepsData[currentIndex];
    const memories = step.memories || [];
    
    // Process all files
    for (const file of files) {
      try {
        const base64 = await compressImage(file);
        memories.push(base64);
      } catch(err) {
        console.error("Failed to compress image:", err);
      }
    }
    
    KYT.store.updateStep(currentIndex, { memories });
    KYT.store.saveData();
    renderCard();
    memoryInput.value = ''; // reset
  });

  // ── VCR button handler ────────────────────────────────────────────────────
  cardEl.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.action) return;

    const action = btn.dataset.action;
    
    if (action === 'add-memory') {
      memoryInput.click();
      return;
    }

    const { stepsData, currentIndex } = KYT.store.get();

    if (action === 'delete-memory') {
      const idx = parseInt(btn.dataset.index, 10);
      const step = stepsData[currentIndex];
      if (step.memories) {
        step.memories.splice(idx, 1);
        KYT.store.updateStep(currentIndex, { memories: step.memories });
        KYT.store.saveData();
        renderCard();
      }
      return;
    }

    const status = stepsData[currentIndex].status;

    if      (action === 'toggle-on')   KYT.store.updateStep(currentIndex, { status: status === 'on'   ? 'todo' : 'on'   });
    else if (action === 'toggle-done') KYT.store.updateStep(currentIndex, { status: status === 'done' ? 'todo' : 'done' });

    KYT.store.saveData();

    requestAnimationFrame(() => {
      renderCard();
      
      // Phase 2: Check if trip is fully complete
      if (KYT.social && typeof KYT.social.checkCompletion === 'function') {
        KYT.social.checkCompletion();
      }

      if (action === 'toggle-done' && KYT.store.get().stepsData[currentIndex].status === 'done') {
        if (currentIndex < KYT.store.get().stepsData.length - 1) setTimeout(goNext, 600);
      }
    });
  });

  btnNext.addEventListener('click', goNext);
  btnPrev.addEventListener('click', goPrev);

  const btnFirst = document.getElementById('btn-main-first');
  const btnLast = document.getElementById('btn-main-last');
  if (btnFirst) btnFirst.addEventListener('click', goFirst);
  if (btnLast) btnLast.addEventListener('click', goLast);

  // ── Touch swipe ───────────────────────────────────────────────────────────
  let touchStartX = 0;
  trackEl.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  trackEl.addEventListener('touchend',   e => {
    const delta = e.changedTouches[0].screenX - touchStartX;
    if (delta < -50) goNext();
    if (delta >  50) goPrev();
  }, { passive: true });

  // Refresh card on clock tick
  document.addEventListener('kyt:tick', () => renderCard());

  // ── Clipboard Paste Support ───────────────────────────────────────────────
  document.addEventListener('paste', async (e) => {
    // Intercept only if an input/textarea is NOT actively focused
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return; 
    }
    
    const { stepsData, currentIndex } = KYT.store.get();
    if (!stepsData || stepsData.length === 0) return;

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    const imageFiles = [];
    for (let index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        imageFiles.push(item.getAsFile());
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();

    const step = stepsData[currentIndex];
    const memories = step.memories || [];
    
    // Process all pasted images
    let added = false;
    for (const file of imageFiles) {
      try {
        const base64 = await compressImage(file);
        memories.push(base64);
        added = true;
      } catch(err) {
        console.error("Failed to process clipboard image:", err);
      }
    }
    
    if (added) {
      KYT.store.updateStep(currentIndex, { memories });
      KYT.store.saveData();
      renderCard();
    }
  });

  return { renderCard };
})();

