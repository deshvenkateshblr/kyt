/* Page script for curated_trips.html, moved out of the HTML so HTML auto-formatters cannot corrupt it. Loaded as a classic script at the same position. */
    // Fallback if data/curated_trips.js was not loaded
    if (!window.KYT_CURATED_TRIPS || !window.KYT_CURATED_TRIPS.length) {
      console.warn("Curated trips not loaded from data/, trying admin/ fallback");
      const s = document.createElement('script');
      s.src = './admin/curated_trips.js';
      document.head.appendChild(s);
    }

    // Exact Travel Styles matching virtual_trip.html TASTE_FIELDS.intent
    const TRAVEL_STYLES = {
      spiritual: { label: 'Spiritual', icon: 'landmark', bg: 'bg-amber-500/20', text: 'text-amber-200', border: 'border-amber-400/30' },
      cultural:  { label: 'Cultural',  icon: 'building-2', bg: 'bg-blue-500/20',  text: 'text-blue-200',  border: 'border-blue-400/30' },
      adventure: { label: 'Adventure', icon: 'mountain',   bg: 'bg-emerald-500/20', text: 'text-emerald-200', border: 'border-emerald-400/30' },
      culinary:  { label: 'Culinary',  icon: 'utensils',   bg: 'bg-rose-500/20',   text: 'text-rose-200',   border: 'border-rose-400/30' },
      mixed:     { label: 'Mixed',     icon: 'compass',    bg: 'bg-indigo-500/20', text: 'text-indigo-200', border: 'border-indigo-400/30' }
    };

    let currentSelectedTrip = null;

    document.addEventListener('DOMContentLoaded', () => {
      if (window.KYT && window.KYT.header) {
        KYT.header.renderMainToolbar('main-toolbar', { active: 'curated' });
      }
      renderCuratedTrips('all');
      setupFilters();
      lucide.createIcons();
    });

    function renderCuratedTrips(filter = 'all') {
      const container = document.getElementById('trips-grid');
      const countEl = document.getElementById('trip-count');
      const trips = window.KYT_CURATED_TRIPS || [];

      let filtered = trips;
      if (filter !== 'all') {
        filtered = trips.filter(t => (t.taste?.intent || 'mixed').toLowerCase() === filter.toLowerCase());
      }

      if (countEl) {
        countEl.textContent = `Showing ${filtered.length} trip${filtered.length === 1 ? '' : 's'}`;
      }

      if (!filtered.length) {
        container.innerHTML = `
          <div class="col-span-full py-12 text-center bg-white rounded-3xl border border-slate-200 p-8">
            <i data-lucide="compass" class="w-10 h-10 text-slate-300 mx-auto mb-3"></i>
            <h4 class="text-base font-bold text-slate-700">No trips matching this travel style</h4>
            <p class="text-xs text-slate-400 mt-1">Try selecting 'All Trips' to see available curated concepts.</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      container.innerHTML = filtered.map(trip => {
        const intentKey = (trip.taste?.intent || 'mixed').toLowerCase();
        const style = TRAVEL_STYLES[intentKey] || TRAVEL_STYLES.mixed;
        const diet = trip.taste?.diet || 'any';
        const pace = trip.taste?.pace || 'standard';
        const totalSteps = (trip.days || []).reduce((acc, d) => acc + (d.steps ? d.steps.length : 0), 0);

        return `
          <div onclick="openTripDetail('${trip.id}')"
               class="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5 transition-all flex flex-col overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
               role="button"
               tabindex="0"
               title="Click to preview ${trip.title}"
               onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTripDetail('${trip.id}');}">
            
            <!-- Card Header Pattern -->
            <div class="h-32 bg-gradient-to-tr from-blue-900 via-indigo-900 to-slate-800 p-4 relative flex flex-col justify-between overflow-hidden">
              <div class="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
              
              <div class="flex items-center justify-between z-10">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 backdrop-blur-md text-white border border-white/20">
                  ${trip.durationDays} Days • Idea
                </span>
                
                <!-- Travel Style Tag (Exactly matching virtual_trip.html) -->
                <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${style.bg} ${style.text} border ${style.border} backdrop-blur-md shadow-xs flex items-center gap-1.5">
                  <i data-lucide="${style.icon}" class="w-3 h-3"></i> ${style.label}
                </span>
              </div>

              <div class="z-10 flex items-center gap-1.5 text-white/90 text-xs font-bold">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-amber-300"></i>
                <span>From ${trip.originName ? trip.originName.toUpperCase() : 'BENGALURU'}</span>
                <span class="opacity-40">•</span>
                <span>${trip.track || 'Getaway'}</span>
              </div>
            </div>

            <!-- Card Body -->
            <div class="p-5 flex-1 flex flex-col justify-between gap-4">
              <div>
                <h3 class="text-lg font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-tight mb-1.5">
                  ${trip.title}
                </h3>
                <p class="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">
                  ${trip.tagline || ''}
                </p>
              </div>

              <!-- Highlights Snapshot -->
              ${trip.highlights && trip.highlights.length ? `
                <div class="space-y-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">Highlights:</span>
                  ${trip.highlights.slice(0, 2).map(h => `
                    <div class="flex items-start gap-1.5 text-xs text-slate-700 font-medium">
                      <i data-lucide="check" class="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5"></i>
                      <span class="line-clamp-1">${h}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}

              <!-- Travel Options Snapshot -->
              ${trip.transport && trip.transport.note ? `
                <div class="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                  <i data-lucide="train-front" class="w-3.5 h-3.5 text-indigo-500 shrink-0"></i>
                  <span class="truncate">${trip.transport.note}</span>
                </div>
              ` : ''}

              <!-- Taste tags -->
              <div class="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                <span class="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-[10px] font-bold capitalize">${style.label}</span>
                <span class="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold capitalize">${diet}</span>
                <span class="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-bold capitalize">${pace} pace</span>
                <span class="ml-auto text-[11px] font-bold text-slate-400">${totalSteps} suggested stops</span>
              </div>

              <!-- Card Action: Preview ONLY -->
              <button onclick="event.stopPropagation(); openTripDetail('${trip.id}')" class="w-full py-2.5 px-4 rounded-xl bg-slate-900 group-hover:bg-blue-600 active:scale-98 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 shadow-xs">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                <span>Preview Idea</span>
              </button>
            </div>

          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    function setupFilters() {
      const pills = document.querySelectorAll('.filter-pill');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          pills.forEach(p => {
            p.classList.remove('active', 'bg-slate-900', 'text-white');
            p.classList.add('bg-white', 'text-slate-700');
          });
          pill.classList.add('active', 'bg-slate-900', 'text-white');
          pill.classList.remove('bg-white', 'text-slate-700');
          renderCuratedTrips(pill.dataset.filter);
        });
      });
    }

    // Modal Interaction
    function openTripDetail(tripId) {
      const trips = window.KYT_CURATED_TRIPS || [];
      const trip = trips.find(t => t.id === tripId);
      if (!trip) return;
      currentSelectedTrip = trip;

      const intentKey = (trip.taste?.intent || 'mixed').toLowerCase();
      const style = TRAVEL_STYLES[intentKey] || TRAVEL_STYLES.mixed;

      document.getElementById('modal-title').textContent = trip.title;
      document.getElementById('modal-tagline').textContent = trip.tagline || '';
      document.getElementById('modal-duration-badge').textContent = `${trip.durationDays} Days • Idea`;
      document.getElementById('modal-style-badge').textContent = style.label;

      // Highlights
      const hList = document.getElementById('modal-highlights');
      hList.innerHTML = (trip.highlights || []).map(h => `
        <li class="flex items-start gap-2">
          <i data-lucide="check" class="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5"></i>
          <span>${h}</span>
        </li>
      `).join('');

      // Transport
      const tText = document.getElementById('modal-transport');
      tText.textContent = trip.transport?.note || 'Transit options by road, train, or flight.';

      // Days timeline
      const daysContainer = document.getElementById('modal-days');
      daysContainer.innerHTML = (trip.days || []).map(d => {
        const stepsHtml = (d.steps || []).map(s =>
          KYT.ui.renderStepCard(s, { variant: 'curated-preview' })
        ).join('');

        return `
          <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
            <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
              <span class="px-2 py-0.5 bg-blue-600 text-white rounded-md text-[10px] font-black uppercase tracking-wider">Day ${d.day}</span>
              <h5 class="text-xs font-bold text-slate-800">${d.title || 'Sightseeing'}</h5>
            </div>
            <div class="mt-2">
              ${stepsHtml}
            </div>
          </div>
        `;
      }).join('');

      // Tips
      const tipsList = document.getElementById('modal-tips');
      tipsList.innerHTML = (trip.tips || []).map(tip => `
        <li class="flex items-start gap-2">
          <i data-lucide="info" class="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5"></i>
          <span>${tip}</span>
        </li>
      `).join('');

      // Open Modal
      const modal = document.getElementById('detail-modal');
      const panel = document.getElementById('detail-panel');
      modal.classList.remove('hidden');
      setTimeout(() => {
        modal.classList.remove('opacity-0');
        panel.classList.remove('translate-x-full');
      }, 10);

      lucide.createIcons();
    }

    function closeModal() {
      const modal = document.getElementById('detail-modal');
      const panel = document.getElementById('detail-panel');
      modal.classList.add('opacity-0');
      panel.classList.add('translate-x-full');
      setTimeout(() => {
        modal.classList.add('hidden');
      }, 300);
    }

    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') closeModal();
    });

    // "Open in Virtual Trips to Edit" handler from Drawer
    document.getElementById('btn-open-virtual-trips').addEventListener('click', () => {
      if (!currentSelectedTrip) return;

      try {
        const vtrips = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]');
        const newVTrip = (window.KYT?.ui?.convertCuratedTripToVirtual)
          ? KYT.ui.convertCuratedTripToVirtual(currentSelectedTrip)
          : null;

        if (!newVTrip) throw new Error('convertCuratedTripToVirtual failed');

        // If a version of this curated idea is already stored, update it; otherwise append
        const existingIdx = vtrips.findIndex(t => t.curatedId === currentSelectedTrip.id);
        if (existingIdx >= 0) {
          vtrips[existingIdx] = newVTrip;
        } else {
          vtrips.push(newVTrip);
        }

        if (window.KYT && KYT.backup) { if (!KYT.backup.safeSet('kyt_virtual_trips', JSON.stringify(vtrips))) return; } else localStorage.setItem('kyt_virtual_trips', JSON.stringify(vtrips));

        // Open directly in virtual_trip.html with ID
        window.location.href = `virtual_trip.html?id=${newVTrip.id}`;
      } catch (err) {
        console.error("Could not load idea into Virtual Trips", err);
        window.location.href = 'virtual_trip.html';
      }
    });

    // Share Idea from Preview Modal
    const shareCuratedBtn = document.getElementById('btn-share-curated-idea');
    if (shareCuratedBtn) {
      shareCuratedBtn.addEventListener('click', () => {
        if (!currentSelectedTrip) return;
        const url = new URL(window.location.href);
        url.pathname = url.pathname.replace(/\/[^\/]*$/, '/trip_detail.html');
        url.search = '';
        url.searchParams.set('trip', currentSelectedTrip.title);
        url.searchParams.set('cities', (currentSelectedTrip.cities && currentSelectedTrip.cities.length) ? currentSelectedTrip.cities.join(',') : 'tirupati');
        const tasteCodeMap = { intent: { mixed:'m', spiritual:'s', cultural:'c', adventure:'a', culinary:'u' }, diet: { any:'a', veg:'v', jain:'j', satvik:'k' }, pace: { short:'h', standard:'s', deep:'d' } };
        const t = currentSelectedTrip.taste || {};
        const tCode = (tasteCodeMap.intent[t.intent] || 's') + (tasteCodeMap.diet[t.diet] || 'v') + (tasteCodeMap.pace[t.pace] || 's');
        url.searchParams.set('taste', tCode);
        url.searchParams.set('curated', currentSelectedTrip.id);

        const shareData = {
          title: `Check out ${currentSelectedTrip.title} on KYT`,
          text: `Explore this curated travel concept on KYT!`,
          url: url.toString()
        };
        if (navigator.share) {
          navigator.share(shareData).catch(err => console.log('Error sharing:', err));
        } else {
          navigator.clipboard.writeText(url.toString())
            .then(() => alert('Trip link copied to clipboard!'))
            .catch(err => console.error('Error copying link:', err));
        }
      });
    }
