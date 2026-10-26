window.KYT = window.KYT || {};
window.KYT.social = (() => {
  const socialModal      = document.getElementById('social-celebration-modal');
  const btnCloseSocial   = document.getElementById('btn-close-social');
  const btnGenerateCard  = document.getElementById('btn-generate-card');
  const memoryCardView   = document.getElementById('memory-card-view');
  const memoryCardCanvas = document.getElementById('memory-card-canvas');
  const btnCloseCard     = document.getElementById('btn-close-card');
  const btnDownloadCard  = document.getElementById('btn-download-card');

  function showCelebrationModal() {
    if (socialModal) {
      socialModal.classList.remove('hidden');
      socialModal.classList.add('flex');
    }
    if (window.lucide) lucide.createIcons();
  }

  function hideCelebrationModal() {
    if (socialModal) {
      socialModal.classList.add('hidden');
      socialModal.classList.remove('flex');
    }
  }

  function checkCompletion() {
    const { stepsData } = KYT.store.get();
    if (stepsData.length > 0 && stepsData.every(s => s.status === 'done')) {
      showCelebrationModal();
    }
  }

  const catMap = {
    'plane':        { label: 'Travel',  color: '#0369A1', bg: '#E0F2FE' },
    'bed':          { label: 'Stay',    color: '#4338CA', bg: '#E0E7FF' },
    'utensils':     { label: 'Food',    color: '#C2410C', bg: '#FFEDD5' },
    'landmark':     { label: 'Place',   color: '#BE123C', bg: '#FFE4E6' },
    'waves':        { label: 'Water',   color: '#0369A1', bg: '#CFFAFE' },
    'tree-pine':    { label: 'Nature',  color: '#047857', bg: '#D1FAE5' },
    'ticket':       { label: 'Event',   color: '#A21CAF', bg: '#FAE8FF' },
    'shopping-bag': { label: 'Shop',    color: '#BE185D', bg: '#FCE7F3' },
    'camera':       { label: 'Sight',   color: '#6D28D9', bg: '#EDE9FE' },
    'coffee':       { label: 'Break',   color: '#B45309', bg: '#FEF3C7' }
  };

  // ─── Smart Photo Grid ────────────────────────────────────────────────────────
  // Photos always shown at natural aspect ratio — never cropped.
  // 1 photo → full-width; 2+ → 2-col grid; 5+ → hero + 2-col strip.
  function buildPhotoGrid(images) {
    if (!images || images.length === 0) return '';

    const imgStyle = 'width:100%;height:auto;display:block;border-radius:12px;border:1px solid #f1f5f9;box-shadow:0 1px 4px rgba(0,0,0,0.06);';
    const count = images.length;

    if (count === 1) {
      return `<div style="margin-top:12px;margin-bottom:8px;">
        <img src="${images[0]}" style="${imgStyle}max-width:100%;">
      </div>`;
    }

    // For 2+ photos: 2-column grid, images at natural ratio within their column
    // Hero (first) goes full-width if count is odd ≥ 5
    let html = '<div style="margin-top:12px;margin-bottom:8px;">';

    if (count >= 5) {
      // Hero row
      html += `<div style="margin-bottom:8px;">
        <img src="${images[0]}" style="${imgStyle}">
      </div>`;
      // Remaining in 2-col
      const rest = images.slice(1);
      for (let i = 0; i < rest.length; i += 2) {
        html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
        html += `<div style="flex:1;min-width:0;"><img src="${rest[i]}" style="${imgStyle}"></div>`;
        if (rest[i + 1]) {
          html += `<div style="flex:1;min-width:0;"><img src="${rest[i + 1]}" style="${imgStyle}"></div>`;
        } else {
          html += '<div style="flex:1;min-width:0;"></div>';
        }
        html += '</div>';
      }
    } else {
      // 2-col grid for 2–4 photos
      for (let i = 0; i < count; i += 2) {
        html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
        html += `<div style="flex:1;min-width:0;"><img src="${images[i]}" style="${imgStyle}"></div>`;
        if (images[i + 1]) {
          html += `<div style="flex:1;min-width:0;"><img src="${images[i + 1]}" style="${imgStyle}"></div>`;
        } else {
          html += '<div style="flex:1;min-width:0;"></div>';
        }
        html += '</div>';
      }
    }

    html += '</div>';
    return html;
  }



  // ─── PDF: Collect ALL images from all steps, compress to base64 ──────────────
  function dataUrlToBase64(dataUrl) {
    // Strip the "data:image/...;base64," prefix
    return dataUrl.split(',')[1] || dataUrl;
  }

  function compressPhotoForPDF(dataUrl, maxDim = 900, quality = 0.78) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else                 { width = Math.round(width * maxDim / height);  height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        // Always output JPEG for consistency in pdfMake
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl); // fallback
      img.src = dataUrl;
    });
  }

  // ─── Album HTML View ─────────────────────────────────────────────────────────
  async function generateMemoryCard() {
    const { tripName, tripCoverImage, stepsData } = KYT.store.get();
    if (memoryCardView) memoryCardView.classList.remove('hidden');

    if (stepsData.length === 0) {
      memoryCardCanvas.innerHTML = `
        <div class="flex flex-col items-center justify-center w-full min-h-[400px] text-center px-6">
          <i data-lucide="map" class="w-12 h-12 text-slate-300 mb-4"></i>
          <h4 class="text-xl font-bold text-slate-600 mb-2">No Steps Found</h4>
          <p class="text-sm text-slate-400 max-w-sm mx-auto">Build your itinerary first to generate a beautiful printable Memory Book!</p>
        </div>`;
      if (window.lucide) lucide.createIcons({ root: memoryCardCanvas });
      return;
    }

    memoryCardCanvas.innerHTML = '<p class="text-center text-slate-500 w-full animate-pulse my-12">Building your Memory Book…</p>';

    const sortedSteps = [...stepsData].sort((a, b) => a.targetTime - b.targetTime);
    const startDate = sortedSteps[0].targetTime;
    const endDate   = sortedSteps[sortedSteps.length - 1].targetTime;

    const fmtShort = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const fmtLong  = d => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const fmtTime  = d => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateRangeStr = startDate.toDateString() === endDate.toDateString()
      ? fmtShort(startDate)
      : `${fmtShort(startDate)} – ${fmtShort(endDate)}`;

    // Group by day
    const days = [];
    const allDates = [...new Set(sortedSteps.map(s => s.targetTime.toDateString()))];
    let curDate = null, curGroup = null;
    let totalPhotos = 0;

    sortedSteps.forEach(step => {
      const dStr = step.targetTime.toDateString();
      if (dStr !== curDate) {
        curDate  = dStr;
        curGroup = { dateLongStr: fmtLong(step.targetTime), dayNum: allDates.indexOf(dStr) + 1, steps: [] };
        days.push(curGroup);
      }
      curGroup.steps.push(step);
      if (step.memories) totalPhotos += step.memories.length;
    });

    let html = '';

    // COVER PAGE
    html += `
      <div class="flex flex-col items-center justify-center min-h-[85vh] text-center py-12 px-4">
        <div class="flex flex-col items-center mb-8 opacity-70">
          <img src="./icons/KYT.jpg" class="w-12 h-12 rounded-xl mb-3 shadow-md object-contain" alt="KYT Logo">
          <p class="font-bold tracking-[0.15em] text-slate-400 text-xs uppercase">KYT &mdash; Know Your Travel</p>
        </div>
        <div class="w-full h-64 md:h-[420px] rounded-3xl overflow-hidden mb-10 shadow-xl border border-slate-200">
          ${tripCoverImage
            ? `<img src="${tripCoverImage}" class="w-full h-full object-cover">`
            : `<div class="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center"><span class="text-7xl">🌍</span></div>`
          }
        </div>
        <p class="text-blue-600 font-bold tracking-[0.2em] uppercase mb-3 text-sm">Memory Journal</p>
        <h1 class="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 leading-tight max-w-3xl">${tripName}</h1>
        <p class="text-slate-500 font-semibold text-base md:text-lg mb-10">${dateRangeStr}&nbsp;&nbsp;·&nbsp;&nbsp;${days.length} Days&nbsp;&nbsp;·&nbsp;&nbsp;${totalPhotos} Photos</p>
        <div class="mt-auto flex flex-col items-center opacity-60 text-xs text-slate-400">
          <p class="font-semibold mb-1">vividnova.com/kyt/</p>
          <p class="max-w-sm text-center leading-relaxed">No accounts, no tracking — your data never leaves your browser.</p>
        </div>
      </div>`;

    // DAILY CHAPTERS
    days.forEach(day => {
      let stepsHtml = '';
      day.steps.forEach(s => {
        const c = catMap[s.icon] || catMap['camera'];
        stepsHtml += `
          <div class="mb-10 pl-8 border-l-[3px] border-slate-100 relative pb-2">
            <div class="absolute -left-[18px] top-0 w-9 h-9 rounded-full flex items-center justify-center ring-4 ring-white shadow-sm" style="background:${c.bg};color:${c.color};">
              <i data-lucide="${s.icon}" class="w-4 h-4 stroke-[2.5px]"></i>
            </div>
            <div class="mb-1 pt-1">
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">${fmtTime(s.targetTime)}&nbsp;&nbsp;·&nbsp;&nbsp;${c.label}</p>
              <h3 class="text-xl md:text-2xl font-bold text-slate-900">${s.title}</h3>
              ${s.where ? `<p class="text-slate-500 font-semibold mt-1 text-sm">${s.where.split(',')[0]}</p>` : ''}
              ${s.notes ? `<p class="text-slate-500 mt-2 text-sm md:text-base italic max-w-2xl leading-relaxed">${s.notes}</p>` : ''}
            </div>
            ${s.memories && s.memories.length > 0 ? buildPhotoGrid(s.memories) : ''}
          </div>`;
      });

      html += `
        <div class="pt-8 md:pt-12 pb-8" style="page-break-before:always;break-before:page;">
          <div class="mb-10 border-b-2 border-slate-100 pb-6">
            <p class="text-blue-600 font-bold tracking-[0.2em] uppercase mb-2 text-sm">Day ${day.dayNum}</p>
            <h2 class="text-3xl md:text-4xl font-extrabold text-slate-900">${day.dateLongStr}</h2>
          </div>
          <div class="ml-2 md:ml-6">${stepsHtml}</div>
        </div>`;
    });

    memoryCardCanvas.innerHTML = html;
    if (window.lucide) lucide.createIcons({ root: memoryCardCanvas });
  }

  // ─── PDF Download ─────────────────────────────────────────────────────────────
  async function downloadPDF() {
    const originalText = btnDownloadCard.innerHTML;
    btnDownloadCard.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Building PDF…';
    btnDownloadCard.disabled = true;
    if (window.lucide) lucide.createIcons({ root: btnDownloadCard });

    await new Promise(r => setTimeout(r, 80)); // let UI breathe

    try {
      const data = KYT.store.get();
      const sortedSteps = [...data.stepsData].sort((a, b) => a.targetTime - b.targetTime);

      const fmtTime  = d => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const fmtLong  = d => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

      // ── Load & compress logo ──────────────────────────────────────────────────
      let logoBase64 = null;
      try {
        const res = await fetch('./icons/KYT.jpg');
        const blob = await res.blob();
        const raw = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        logoBase64 = raw; // already a data URL
      } catch (e) { console.warn('Logo unavailable for PDF', e); }

      // ── Pre-compress ALL photos in parallel ───────────────────────────────────
      // This is the most important improvement: we compress photos before handing
      // them to pdfMake so the PDF isn't bloated and rendering doesn't stall.
      for (const step of sortedSteps) {
        if (step.memories && step.memories.length > 0) {
          step._compressedMemories = await Promise.all(
            step.memories.map(m => compressPhotoForPDF(m))
          );
        }
      }

      // ── Count stats ───────────────────────────────────────────────────────────
      let totalPhotos = 0;
      sortedSteps.forEach(s => { if (s.memories) totalPhotos += s.memories.length; });
      const startDate = sortedSteps[0].targetTime;
      const endDate   = sortedSteps[sortedSteps.length - 1].targetTime;
      const fmtShort  = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const dateRangeStr = startDate.toDateString() === endDate.toDateString()
        ? fmtShort(startDate)
        : `${fmtShort(startDate)} – ${fmtShort(endDate)}`;

      const allDates = [...new Set(sortedSteps.map(s => s.targetTime.toDateString()))];

      // ── Build pdfMake document definition ────────────────────────────────────
      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [50, 70, 50, 60],
        info: { title: `${data.tripName} — Memory Journal` },
        footer: (currentPage, pageCount) => ({
          text: `KYT · Know Your Travel · vividnova.com/kyt/ · Page ${currentPage} of ${pageCount}`,
          alignment: 'center',
          fontSize: 8,
          color: '#94a3b8',
          margin: [0, 16, 0, 0],
          bold: false
        }),
        content: [],
        styles: {
          header:     { fontSize: 30, bold: true,  alignment: 'center', margin: [0, 16, 0, 6],   color: '#0F172A' },
          subheader:  { fontSize: 13, bold: false, alignment: 'center', margin: [0, 0,  0, 40],  color: '#64748B' },
          dayLabel:   { fontSize: 10, bold: true,  color: '#2563EB',    margin: [0, 32, 0, 4],   characterSpacing: 2 },
          dayTitle:   { fontSize: 22, bold: true,  color: '#0F172A',    margin: [0, 0,  0, 20] },
          stepTime:   { fontSize: 9,  bold: true,  color: '#94a3b8',    margin: [0, 18, 0, 2],   characterSpacing: 1 },
          stepTitle:  { fontSize: 16, bold: true,  color: '#1E293B',    margin: [0, 2,  0, 4] },
          stepWhere:  { fontSize: 10, bold: true,  color: '#64748B',    margin: [0, 0,  0, 4],   italics: false },
          stepNotes:  { fontSize: 11,              color: '#334155',    margin: [0, 4,  0, 12],  italics: true  },
        },
        defaultStyle: { font: 'Roboto', lineHeight: 1.4 }
      };

      // ── Cover page ────────────────────────────────────────────────────────────
      if (logoBase64) {
        docDefinition.content.push({ image: logoBase64, width: 44, alignment: 'center', margin: [0, 0, 0, 8] });
      }
      docDefinition.content.push({
        text: 'KYT — KNOW YOUR TRAVEL',
        alignment: 'center', fontSize: 9, bold: true, color: '#94a3b8', characterSpacing: 2, margin: [0, 0, 0, 32]
      });

      if (data.tripCoverImage) {
        try {
          const compressed = await compressPhotoForPDF(data.tripCoverImage, 1200, 0.85);
          docDefinition.content.push({ image: compressed, fit: [495, 280], alignment: 'center', margin: [0, 0, 0, 32] });
        } catch (e) { /* skip cover if broken */ }
      }

      docDefinition.content.push({ text: data.tripName, style: 'header' });
      docDefinition.content.push({ text: `Memory Journal  ·  ${dateRangeStr}  ·  ${allDates.length} Days  ·  ${totalPhotos} Photos`, style: 'subheader' });
      docDefinition.content.push({
        text: [
          { text: 'vividnova.com/kyt/\n', link: 'https://vividnova.com/kyt/', color: '#3B82F6', decoration: 'underline' },
          { text: 'No accounts, no tracking — your data never leaves your browser.', color: '#94a3b8', fontSize: 9, italics: true }
        ],
        alignment: 'center', margin: [40, 0, 40, 60]
      });

      // ── Daily chapters ────────────────────────────────────────────────────────
      let currentDayStr = null;
      let isFirstDay = true;

      sortedSteps.forEach(step => {
        const dStr = step.targetTime.toDateString();
        if (dStr !== currentDayStr) {
          currentDayStr = dStr;
          const dayNum  = allDates.indexOf(dStr) + 1;
          const dayLong = fmtLong(step.targetTime);

          // FIX 1: Group DAY label + date title + divider into ONE unbreakable stack
          // so they are never separated across pages.
          const dayHeaderStack = {
            stack: [
              { text: `DAY ${dayNum}`, style: 'dayLabel' },
              { text: dayLong, style: 'dayTitle' },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: '#E2E8F0' }], margin: [0, 0, 0, 16] }
            ],
            unbreakable: true
          };
          if (!isFirstDay) {
            dayHeaderStack.pageBreak = 'before';
            isFirstDay = false;
          } else {
            isFirstDay = false;
          }
          docDefinition.content.push(dayHeaderStack);
        }

        // Build step header elements
        const stepHeader = [];
        stepHeader.push({ text: fmtTime(step.targetTime).toUpperCase(), style: 'stepTime' });
        stepHeader.push({ text: step.title, style: 'stepTitle' });
        if (step.where) stepHeader.push({ text: step.where.split(',')[0], style: 'stepWhere' });
        if (step.notes) stepHeader.push({ text: step.notes, style: 'stepNotes' });

        const photos = step._compressedMemories;

        if (!photos || photos.length === 0) {
          // No photos — simple unbreakable header block with divider
          stepHeader.push({
            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: '#F1F5F9' }],
            margin: [0, 12, 0, 0]
          });
          docDefinition.content.push({ stack: stepHeader, unbreakable: true });

        } else if (photos.length === 1) {
          // FIX 2: Single photo — keep header + photo together, unbreakable
          stepHeader.push({ image: photos[0], fit: [495, 360], alignment: 'center', margin: [0, 10, 0, 24] });
          docDefinition.content.push({ stack: stepHeader, unbreakable: true });

        } else {
          // FIX 3: Multiple photos — header + FIRST photo row together (unbreakable),
          // then remaining rows each individually unbreakable to prevent mid-image splits.
          const firstRow = {
            columns: [
              { image: photos[0], fit: [235, 240], margin: [0, 0, 8, 8] },
              photos[1]
                ? { image: photos[1], fit: [235, 240], margin: [0, 0, 0, 8] }
                : { text: '', width: 235 }
            ]
          };
          // Push header + first pair as one unbreakable block
          docDefinition.content.push({
            stack: [...stepHeader, firstRow],
            unbreakable: true
          });

          // Remaining pairs — each row is its own unbreakable block
          for (let i = 2; i < photos.length; i += 2) {
            const row = {
              columns: [
                { image: photos[i], fit: [235, 240], margin: [0, 0, 8, 8] },
                photos[i + 1]
                  ? { image: photos[i + 1], fit: [235, 240], margin: [0, 0, 0, 8] }
                  : { text: '', width: 235 }
              ],
              unbreakable: true
            };
            docDefinition.content.push(row);
          }
          docDefinition.content.push({ text: '', margin: [0, 0, 0, 12] });
        }
      });

      // ── Generate & share/download ─────────────────────────────────────────────
      const fileName = data.tripName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_journal.pdf';
      const pdfDoc   = pdfMake.createPdf(docDefinition);

      if (navigator.userAgent.match(/iPhone|iPad|iPod|Android/i) && navigator.share) {
        pdfDoc.getBlob(blob => {
          const file = new File([blob], fileName, { type: 'application/pdf' });
          navigator.share({ files: [file], title: `${data.tripName} — Memory Journal` }).catch(console.error);
        });
      } else {
        pdfDoc.download(fileName);
      }

    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      btnDownloadCard.innerHTML = originalText;
      btnDownloadCard.disabled  = false;
      if (window.lucide) lucide.createIcons({ root: btnDownloadCard });
    }
  }

  // ─── Wire events ──────────────────────────────────────────────────────────────
  if (btnCloseSocial)  btnCloseSocial.addEventListener('click', hideCelebrationModal);
  if (btnGenerateCard) btnGenerateCard.addEventListener('click', generateMemoryCard);
  if (btnCloseCard)    btnCloseCard.addEventListener('click', () => {
    if (memoryCardView) memoryCardView.classList.add('hidden');
  });
  if (btnDownloadCard) btnDownloadCard.addEventListener('click', downloadPDF);

  return { checkCompletion, openAlbum: generateMemoryCard };
})();

