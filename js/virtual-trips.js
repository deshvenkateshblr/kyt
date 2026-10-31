/**
 * virtual-trips.js — Manage Planned / Virtual Trips & Taste Profile
 * Stage 1: Hub (Trip List)
 * Stage 2: Canvas (Select Cities & Taste)
 * Stage 3: Builder (Auto-bucket into days, save state)
 *
 * Uses KYT.ui (js/ui-components.js) for unified City Cards, Step Cards,
 * Curated Trip Blueprint conversion, and City Detail Slide-Over.
 */

window.KYT = window.KYT || {};

KYT.virtualTrips = (function () {
  const STORAGE_KEY_VTRIPS = 'kyt_virtual_trips';
  const MOBILITY_RANK = { easy: 1, walk: 2, trek: 3 };

  const TASTE_FIELDS = {
    intent: [
      { id: 'mixed', label: 'Mixed' },
      { id: 'spiritual', label: 'Spiritual' },
      { id: 'cultural', label: 'Cultural' },
      { id: 'adventure', label: 'Adventure' },
      { id: 'culinary', label: 'Culinary' }
    ],
    diet: [
      { id: 'any', label: 'Any food' },
      { id: 'veg', label: 'Vegetarian' },
      { id: 'jain', label: 'Jain' },
      { id: 'satvik', label: 'No onion-garlic' }
    ],
    pace: [
      { id: 'short', label: 'Short' },
      { id: 'standard', label: 'Standard' },
      { id: 'deep', label: 'Deep' }
    ]
  };

  // What each choice means, shown beside it
  const TASTE_INFO = {
    intent: { title: 'Interests', hints: {
      mixed: 'A bit of everything: sights, food, culture',
      spiritual: 'Temples, ghats, pilgrimage stops',
      cultural: 'Forts, museums, heritage and crafts',
      adventure: 'Outdoors, treks, active days',
      culinary: 'Local food and markets first' } },
    diet: { title: 'Food', hints: {
      any: 'No restriction on food stops',
      veg: 'Vegetarian places only',
      jain: 'Jain-friendly food only',
      satvik: 'No onion or garlic' } },
    pace: { title: 'Pace', hints: {
      short: 'Only the quick highlights',
      standard: 'Main sights at an easy pace',
      deep: 'Longer, slower stops with more time at each' } }
  };

  const DEFAULT_TASTE = { intent: 'mixed', diet: 'any', pace: 'standard' };

  const POPULAR_ORIGINS = [
    { id: 'bengaluru', name: 'Bengaluru (Bangalore)' },
    { id: 'delhi', name: 'Delhi / NCR' },
    { id: 'mumbai', name: 'Mumbai' },
    { id: 'chennai', name: 'Chennai' },
    { id: 'hyderabad', name: 'Hyderabad' },
    { id: 'kolkata', name: 'Kolkata' },
    { id: 'pune', name: 'Pune' },
    { id: 'ahmedabad', name: 'Ahmedabad' }
  ];

  let vtrips = [];
  let currentTripId = null;

  const DOM = {
    view: document.getElementById('virtual-trips-view'),
    title: document.getElementById('vt-header-title'),
    btnClose: document.getElementById('btn-close-virtual-trips'),

    // Screens
    screenHub: document.getElementById('vt-screen-hub'),
    screenCanvas: document.getElementById('vt-screen-canvas'),
    screenBuilder: document.getElementById('vt-screen-builder'),

    // Hub
    newNameInput: document.getElementById('vt-new-name'),
    btnCreate: document.getElementById('btn-vt-create'),
    listRoot: document.getElementById('vt-list'),

    // Canvas
    editNameInput: document.getElementById('vt-edit-name'),
    originCitySelect: document.getElementById('vt-origin-city'),
    originDesc: document.getElementById('vt-origin-desc'),
    selectedCitiesRoot: document.getElementById('vt-selected-cities'),
    emptyCitiesMsg: document.getElementById('vt-empty-cities'),
    btnBuild: document.getElementById('btn-vt-build'),
    citySearchInput: document.getElementById('vt-city-search'),
    cityListRoot: document.getElementById('vt-city-list'),

    // Builder
    itineraryListRoot: document.getElementById('vt-itinerary-list')
  };

  // --- Storage ---
  function loadVTrips() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_VTRIPS) || '[]');
    } catch (e) { return []; }
  }
  // Where the traveller starts from is asked once, then remembered for the next trip.
  const ORIGIN_MEMORY_KEY = 'kyt_last_origin';
  function getRememberedOrigin() { try { return localStorage.getItem(ORIGIN_MEMORY_KEY) || ''; } catch (e) { return ''; } }
  function rememberOrigin(id) { try { if (id) localStorage.setItem(ORIGIN_MEMORY_KEY, id); } catch (e) { /* storage unavailable */ } }
  function saveVTrips() {
    const json = JSON.stringify(vtrips);
    if (window.KYT && KYT.backup) return KYT.backup.safeSet(STORAGE_KEY_VTRIPS, json);
    try { localStorage.setItem(STORAGE_KEY_VTRIPS, json); return true; } catch (e) { alert('Your last change could not be saved: this device is out of space.'); return false; }
  }
  function getActiveTrip() { const t = vtrips.find(x => x.id === currentTripId); return t ? ensureDays(t) : t; }
  function ensureActiveTrip() {
    let trip = getActiveTrip();
    if (!trip) {
      trip = {
        id: Date.now().toString(),
        name: 'My Trip',
        originCity: getRememberedOrigin(),
        cities: [],
        days: [],
        taste: { ...DEFAULT_TASTE },
        steps: null
      };
      vtrips.push(trip);
      currentTripId = trip.id;
      saveVTrips();
    }
    if (trip.originCity === undefined) trip.originCity = '';
    return trip;
  }

  // --- Actions ---
  function createNewTrip() {
    const name = DOM.newNameInput.value.trim();
    if (!name) {
      DOM.newNameInput.classList.add('ring-2', 'ring-red-400');
      DOM.newNameInput.placeholder = 'Give your trip a name first';
      DOM.newNameInput.focus();
      return;
    }
    const origin = (DOM.originCitySelect && DOM.originCitySelect.value) || getRememberedOrigin();
    const newTrip = {
      id: Date.now().toString(),
      name,
      originCity: origin,
      cities: [],
      days: [],
      taste: { ...DEFAULT_TASTE },
      steps: null
    };
    vtrips.push(newTrip);
    saveVTrips();
    DOM.newNameInput.value = '';
    openCanvas(newTrip.id);
  }

  function deleteTrip(id) {
    vtrips = vtrips.filter(t => t.id !== id);
    saveVTrips();
    renderHub();
  }

  // --- Attraction Detail Expansion (Inline on Library Card) ---
  function expandAttractionDetail(cityId, attraction) {
    document.querySelectorAll('.vt-attraction-detail').forEach(detail => {
      detail.classList.add('hidden');
      detail.classList.remove('animate-expand');
    });

    const cityCard = document.querySelector(`article[data-city-id="${cityId}"]`);
    if (!cityCard) return;

    const detailSection = cityCard.querySelector('.vt-attraction-detail');
    if (!detailSection) return;

    detailSection.classList.remove('animate-expand');

    const titleEl = detailSection.querySelector('.vt-detail-title');
    if (titleEl) titleEl.textContent = attraction.title || 'Attraction';

    const whereEl = detailSection.querySelector('.vt-detail-where');
    if (whereEl) whereEl.textContent = attraction.where || 'Location TBD';

    const timeEl = detailSection.querySelector('.vt-detail-time');
    if (timeEl) {
      const hour = attraction.hour != null ? String(attraction.hour).padStart(2, '0') : '--';
      timeEl.textContent = hour + ':00';
    }

    const intentEl = detailSection.querySelector('.vt-detail-intent');
    if (intentEl) {
      const intents = attraction.intent || ['cultural'];
      const iconMap = { spiritual: 'heart', cultural: 'compass', adventure: 'mountain', culinary: 'utensils' };
      const colorMap = { spiritual: 'purple', cultural: 'blue', adventure: 'emerald', culinary: 'orange' };

      intentEl.innerHTML = intents.map(intent => {
        const icon = iconMap[intent] || 'map-pin';
        const color = colorMap[intent] || 'slate';
        return `<span class="inline-flex items-center gap-1 bg-${color}-50 border-${color}-200 border text-${color}-700 text-[10px] font-semibold px-2.5 py-1 rounded-lg">
                  <i data-lucide="${icon}" class="w-3 h-3"></i> ${intent.charAt(0).toUpperCase() + intent.slice(1)}
                </span>`;
      }).join('');
    }

    const paceEl = detailSection.querySelector('.vt-detail-pace');
    if (paceEl) {
      const paces = attraction.pace || ['standard'];
      paceEl.innerHTML = paces.map(pace => {
        if (window.KYT && KYT.ui && KYT.ui.renderPaceBadge) {
          return KYT.ui.renderPaceBadge(pace);
        }
        const labels = { short: '⚡ Short (< 1 hour)', standard: '🚶 Standard (1-2 hours)', deep: '🔍 Deep Dive (2+ hours)' };
        return `<span class="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-semibold px-2.5 py-1 rounded-lg">
                  ${labels[pace] || pace}
                </span>`;
      }).join('');
    }

    const mobilityEl = detailSection.querySelector('.vt-detail-mobility');
    if (mobilityEl) {
      const mobilityLabels = { easy: '✅ Easy Access', walk: '🚶 Walking Required', trek: '⛰️ Trek/Strenuous' };
      mobilityEl.textContent = mobilityLabels[attraction.mobility] || (attraction.mobility || 'Easy');
    }

    const dietSection = detailSection.querySelector('.vt-detail-dietary');
    const dietEl = detailSection.querySelector('.vt-detail-diet');
    if (attraction.diet && attraction.diet.length > 0 && !attraction.diet.includes('any')) {
      if (dietSection) dietSection.classList.remove('hidden');
      if (dietEl) {
        dietEl.innerHTML = attraction.diet.map(d => {
          const labels = { veg: '🥬 Vegetarian', jain: '🌾 Jain', satvik: '🧘 Satvik (no onion/garlic)', any: 'All diets' };
          return `<span class="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-[10px] font-semibold px-2.5 py-1 rounded-lg">
                    ${labels[d] || d}
                  </span>`;
        }).join('');
      }
    } else {
      if (dietSection) dietSection.classList.add('hidden');
    }

    const notesEl = detailSection.querySelector('.vt-detail-notes');
    if (notesEl) {
      notesEl.textContent = attraction.notes || 'Explore this attraction and soak in the experience.';
    }

    detailSection.classList.remove('hidden');
    void detailSection.offsetHeight;
    detailSection.classList.add('animate-expand');
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
      detailSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  // --- Share Trip ---
  function shareCurrentTrip() {
    const trip = getActiveTrip();
    if (!trip || !trip.cities.length) return alert('Add some cities to share this trip!');

    const url = new URL(window.location.href);
    url.pathname = url.pathname.replace(/\/[^\/]*$/, '/trip_detail.html');
    url.search = '';
    url.searchParams.set('trip', trip.name || 'Shared Trip');
    url.searchParams.set('cities', trip.cities.join(','));
    url.searchParams.set('taste', encodeTaste(trip.taste));
    if (trip.curatedId) {
      url.searchParams.set('curated', trip.curatedId);
    }
    if (trip.originCity === 'already_there') {
      url.searchParams.set('origin', '0');
    } else if (trip.originCity) {
      const c = (window.KYT && KYT.ui && KYT.ui.resolveCity) ? KYT.ui.resolveCity(trip.originCity) : null;
      url.searchParams.set('origin', c && c.code ? c.code : trip.originCity);
    }
    url.searchParams.set('days', String(trip.duration || trip.cities.length || 1));
    if (trip.id) {
      url.searchParams.set('id', trip.id);
    }

    const shareData = {
      title: `Check out my ${trip.name} on KYT`,
      text: `I planned a trip on KYT! Check out my itinerary for ${trip.cities.length} cities.`,
      url: url.toString()
    };

    if (navigator.share) {
      navigator.share(shareData).catch(err => console.log('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(url.toString())
        .then(() => alert('Trip link copied to clipboard!'))
        .catch(err => console.error('Error copying link:', err));
    }
  }

  // --- Screens ---
  let currentScreen = 'hub';

  // "From Mumbai · 3 days", shown on the plan screen
  function tripSummaryText(trip) {
    const nameOf = id => { const c = window.KYT_CITIES && window.KYT_CITIES.find(x => x.id === id); return c ? c.name : id; };
    const parts = [];
    if (trip.originCity === '0' || trip.originCity === 'already_there') parts.push('Starts in the destination');
    else if (trip.originCity) parts.push('From ' + nameOf(trip.originCity));
    const d = trip.duration || (trip.cities && trip.cities.length) || 1;
    parts.push(`${d} day${d > 1 ? 's' : ''}`);
    return parts.join(' · ');
  }

  function showScreen(screen) {
    currentScreen = screen;
    DOM.screenHub.classList.add('hidden');
    DOM.screenCanvas.classList.add('hidden');
    DOM.screenCanvas.classList.remove('flex');
    DOM.screenBuilder.classList.add('hidden');

    const subnavBar = document.getElementById('vt-subnav-bar');
    const subnavBack = document.getElementById('vt-subnav-back');
    const subnavBackLabel = document.getElementById('vt-subnav-back-label');
    const subnavShare = document.getElementById('vt-subnav-share');

    if (window.KYT && KYT.header) {
      KYT.header.renderMainToolbar('main-toolbar', { active: 'virtual' });
    }

    if (screen === 'hub') {
      DOM.screenHub.classList.remove('hidden');
      if (subnavBar) subnavBar.classList.add('hidden');
    } else {
      if (screen === 'canvas') {
        DOM.screenCanvas.classList.remove('hidden');
        DOM.screenCanvas.classList.add('flex');
      } else {
        DOM.screenBuilder.classList.remove('hidden');
      }
      const trip = getActiveTrip();
      const hasPlan = Boolean(trip && trip.steps && trip.steps.length > 0);
      if (subnavBar) {
        subnavBar.classList.remove('hidden');
        // With steps, "back" is the trip's plan page; without any, it is the screen before this one.
        if (subnavBackLabel) subnavBackLabel.textContent = hasPlan ? 'View Trip' : (screen === 'builder' ? 'Setup' : 'My Trips');
        if (subnavBack) {
          subnavBack.onclick = (e) => {
            e.preventDefault();
            const t = getActiveTrip();
            if (t && t.steps && t.steps.length) {
              window.location.href = `trip_detail.html?id=${encodeURIComponent(t.id)}`;
            } else if (screen === 'builder' && t) {
              openCanvas(t.id);
            } else {
              openHub();
            }
          };
        }
        if (subnavShare) {
          subnavShare.onclick = (e) => { e.preventDefault(); shareCurrentTrip(); };
        }
      }
      syncEmptyTripControls(trip);
    }

    if (window.lucide) lucide.createIcons();
  }

  function openHub() {
    currentTripId = null;
    setupTripId = null;
    renderHub();
    showScreen('hub');
  }

  function openCanvas(id) {
    currentTripId = id;
    renderCanvas();
    showScreen('canvas');
  }

  function openBuilder() {
    const trip = getActiveTrip();
    if (!trip) return;
    renderBuilder();
    showScreen('builder');
  }

  // --- Rendering Hub ---
  function renderHub() {
    if (vtrips.length === 0) {
      DOM.listRoot.innerHTML = `
        <div class="text-center p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div class="text-5xl mb-4">🧭</div>
          <h3 class="font-black text-slate-800 text-lg mb-2">Plan Your Dream Trip</h3>
          <p class="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto mb-4">
            Pick cities, set your travel style, and KYT builds your day-by-day itinerary automatically.
          </p>
          <p class="text-xs text-slate-400">Type a trip name above to get started ↑</p>
        </div>`;
      return;
    }

    DOM.listRoot.innerHTML = vtrips.map(vt => {
      let citiesPreview = vt.cities.map(cId => {
        const city = window.KYT_CITIES.find(c => c.id === cId);
        return city ? city.name : 'Unknown';
      }).join(', ');
      if (!citiesPreview) citiesPreview = 'No cities added yet.';

      const badge = vt.steps && vt.steps.length > 0 ? `<span class="bg-green-100 text-green-700 text-[9px] px-2 py-0.5 rounded uppercase font-bold ml-2 shrink-0">Built</span>` : '';

      return `
        <article class="vt-card cursor-pointer bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-blue-300 transition-colors" data-id="${vt.id}">
          <div class="flex justify-between items-start mb-1">
            <h3 class="font-black text-slate-800 text-lg flex items-center">${KYT.utils.escapeHTML(vt.name)} ${badge}</h3>
            <button class="btn-del-vt p-1 -m-1 text-slate-300 hover:text-rose-500 transition-colors" data-id="${vt.id}" title="Delete Trip">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
          <p class="text-xs font-bold text-slate-500 mt-1 line-clamp-1"><i data-lucide="map-pin" class="w-3 h-3 inline"></i> ${citiesPreview}</p>
        </article>
      `;
    }).join('');
  }

  function populateOriginSelector(currentOrigin) {
    if (!DOM.originCitySelect) return;
    if (DOM.originCitySelect.children.length === 0) {
      let html = `<option value="" disabled>Where are you starting from?</option>`;
      html += `<option value="already_there">📍 Already in destination (No Day 0 travel)</option>`;
      html += `<optgroup label="Popular Starting Hubs">`;
      POPULAR_ORIGINS.forEach(o => {
        html += `<option value="${o.id}">${o.name}</option>`;
      });
      html += `</optgroup>`;

      if (window.KYT_CITIES && window.KYT_CITIES.length) {
        const popularIds = new Set(POPULAR_ORIGINS.map(o => o.id));
        const others = window.KYT_CITIES
          .filter(c => !popularIds.has(c.id))
          .sort((a, b) => a.name.localeCompare(b.name));

        html += `<optgroup label="All Cities">`;
        others.forEach(c => {
          html += `<option value="${c.id}">${c.name}</option>`;
        });
        html += `</optgroup>`;
      }

      DOM.originCitySelect.innerHTML = html;
    }

    DOM.originCitySelect.value = currentOrigin || '';
  }

  function updateOriginDesc(trip) {
    if (!DOM.originDesc) return;
    const origin = trip.originCity || '';
    const firstCity = trip.cities && trip.cities.length ? trip.cities[0] : null;
    // Said only when it helps: the start is missing, or there is no travel day to plan.
    DOM.originDesc.classList.remove('text-rose-600', 'font-semibold');
    DOM.originDesc.classList.add('italic', 'text-slate-400');
    if (!origin) {
      DOM.originDesc.textContent = 'Needed to plan your journey there';
    } else if (origin === 'already_there' || (firstCity && origin === firstCity)) {
      DOM.originDesc.textContent = 'Day 1 starts directly in the destination';
    } else {
      DOM.originDesc.textContent = '';
    }
    if (DOM.originCitySelect) {
      DOM.originCitySelect.classList.toggle('border-amber-400', !origin);
      DOM.originCitySelect.classList.toggle('border-slate-200', Boolean(origin));
    }
  }

  // The Style line shows the current choices; the chips behind it stay closed until asked for, and Done
  // closes them. Changing trips closes them too.
  let setupTripId = null;   // the trip the Setup screen was last drawn for
  let pickerOpen = true;    // destinations picker open (choosing) or collapsed (route set)


  // An empty trip has nothing to plan, share or review yet. Those controls are not shown until a first
  // destination is added, so nothing sits greyed out without saying why.
  function syncEmptyTripControls(trip) {
    const hasContent = Boolean(trip && ((trip.cities && trip.cities.length > 0) || (trip.steps && trip.steps.length > 0)));
    const share = document.getElementById('vt-subnav-share');
    if (share) { share.classList.toggle('hidden', !hasContent); share.classList.toggle('flex', hasContent); }
  }

  // --- Rendering Canvas ---
  function renderCanvas() {
    const trip = getActiveTrip();
    if (!trip) return;

    DOM.editNameInput.value = trip.name;
    populateOriginSelector(trip.originCity || '');
    updateOriginDesc(trip);

    // Destinations come first: the panel is a picker while choosing and collapses to the route once set.
    if (setupTripId !== trip.id) {
      setupTripId = trip.id;
      pickerOpen = trip.cities.length === 0;
    }
    if (trip.cities.length === 0) pickerOpen = true;
    const hasCities = trip.cities.length > 0;

    const badge = document.getElementById('vt-city-count-badge');
    if (badge) badge.textContent = hasCities ? `· ${trip.cities.length} selected` : '';
    syncEmptyTripControls(trip);

    const show = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('hidden', !on); };
    show('vt-picker', pickerOpen);
    show('vt-trip-card', !pickerOpen);
    show('btn-vt-dest-edit', hasCities && !pickerOpen);
    show('vt-canvas-bar', hasCities);
    DOM.emptyCitiesMsg.classList.toggle('hidden', hasCities);

    const btnDone = document.getElementById('btn-vt-dest-done');
    if (btnDone) {
      btnDone.classList.toggle('hidden', !(hasCities && pickerOpen));
      btnDone.classList.toggle('flex', hasCities && pickerOpen);
      btnDone.textContent = `Continue · ${trip.cities.length} selected`;
    }
    DOM.btnBuild.classList.toggle('hidden', !(hasCities && !pickerOpen));
    if (trip.steps && trip.steps.length > 0) {
      DOM.btnBuild.innerHTML = `<i data-lucide="calendar" class="w-4 h-4"></i> Open Day Plan (${trip.steps.length} steps)`;
    } else {
      DOM.btnBuild.innerHTML = `<i data-lucide="calendar" class="w-4 h-4"></i> Plan the days`;
    }

    DOM.selectedCitiesRoot.innerHTML = trip.cities.map((cId, idx) => {
      const city = window.KYT_CITIES.find(c => c.id === cId);
      const name = city ? KYT.utils.escapeHTML(city.name) : KYT.utils.escapeHTML(cId);
      // Once there are steps, days are tied to their cities, so the order is changed in the Day Plan instead.
      const canMove = !(trip.steps && trip.steps.length);
      const isFirst = idx === 0 || !canMove;
      const isLast = idx === trip.cities.length - 1 || !canMove;
      return `
        <div class="vt-selected-city-chip inline-flex items-center gap-1.5 bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-full text-sm font-bold shadow-sm animate-pop cursor-pointer hover:bg-blue-100 transition-colors" data-city-id="${KYT.utils.escapeHTML(cId)}">
          <span class="text-xs text-blue-500 font-extrabold">${idx + 1}.</span>
          <span>${name}</span>
          <div class="inline-flex items-center gap-0.5 ml-1">
            ${!isFirst ? `<button type="button" class="btn-move-city-left hover:bg-blue-200 p-0.5 rounded-full transition-colors text-blue-600" data-index="${idx}" title="Move Earlier"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i></button>` : ''}
            ${!isLast ? `<button type="button" class="btn-move-city-right hover:bg-blue-200 p-0.5 rounded-full transition-colors text-blue-600" data-index="${idx}" title="Move Later"><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>` : ''}
            <button type="button" class="btn-del-city hover:bg-rose-100 hover:text-rose-600 p-0.5 rounded-full transition-colors text-slate-400 ml-0.5" data-id="${KYT.utils.escapeHTML(cId)}" title="Remove"><i data-lucide="x" class="w-3 h-3"></i></button>
          </div>
        </div>
      `;
    }).join('');

    if (pickerOpen) renderCityLibrary();
    if (window.lucide) lucide.createIcons();
  }

  function renderCityLibrary() {
    const trip = getActiveTrip();
    if (!trip) return;

    if (DOM.citySearchInput && window.KYT_CITIES && window.KYT_CITIES.length) {
      DOM.citySearchInput.placeholder = `Search ${window.KYT_CITIES.length}+ destinations...`;
    }

    const query = (DOM.citySearchInput.value || '').toLowerCase().trim();

    const available = window.KYT_CITIES.filter(c => {
      if (!query) return true;
      if (c.name.toLowerCase().includes(query)) return true;
      if ((c.notes || c.description || '').toLowerCase().includes(query)) return true;
      if (c.aliases && c.aliases.some(a => a.toLowerCase().includes(query))) return true;
      return false;
    });

    if (query) {
      available.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (aName === query && bName !== query) return -1;
        if (aName !== query && bName === query) return 1;
        const aStarts = aName.startsWith(query);
        const bStarts = bName.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return 0;
      });
    }

    if (available.length === 0) {
      DOM.cityListRoot.innerHTML = `<div class="text-center text-slate-400 text-sm py-4">No cities found.</div>`;
      return;
    }

    const card = city => KYT.ui.renderCityCard(city, { variant: 'library', isAdded: trip.cities.includes(city.id) });
    const label = text => `<p class="text-[11px] font-black uppercase tracking-wider text-slate-400 pt-1">${text}</p>`;

    // Once a destination is picked, the places closest to the latest one come first.
    let html;
    const anchorId = trip.cities[trip.cities.length - 1];
    const row = !query && anchorId && window.KYT_DISTANCE_MATRIX && window.KYT_DISTANCE_MATRIX[anchorId];
    if (row) {
      const near = Object.entries(row)
        .filter(([id]) => !trip.cities.includes(id))
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => available.find(c => c.id === id))
        .filter(Boolean)
        .slice(0, 8);
      const nearIds = new Set(near.map(c => c.id));
      const anchor = window.KYT_CITIES.find(c => c.id === anchorId);
      html = (near.length ? label(`Near ${KYT.utils.escapeHTML(anchor ? anchor.name : '')}`) + near.map(card).join('') + label('All destinations') : '') +
        available.filter(c => !nearIds.has(c.id)).map(card).join('');
    } else {
      html = available.map(card).join('');
    }
    DOM.cityListRoot.innerHTML = html;

    if (window.lucide) lucide.createIcons();

    document.querySelectorAll('.vt-attraction-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cityId = pill.dataset.cityId;
        const attractionIndex = parseInt(pill.dataset.attractionIndex, 10);
        const city = window.KYT_CITIES.find(c => c.id === cityId);
        if (city && city.beats && city.beats[attractionIndex]) {
          expandAttractionDetail(cityId, city.beats[attractionIndex]);
        }
      });
    });
  }

  // --- Logic Matching ---
  function dietAllows(beatDiet, selected) {
    if (!beatDiet || !beatDiet.length) return true;
    if (selected === 'any') return true;
    if (selected === 'jain') return beatDiet.includes('jain');
    if (selected === 'satvik') return beatDiet.includes('satvik') || beatDiet.includes('jain');
    if (selected === 'veg') return beatDiet.includes('veg') || beatDiet.includes('jain') || beatDiet.includes('satvik');
    return true;
  }

  function beatMatches(beat, t) {
    if (t.intent !== 'mixed') {
      const intents = beat.intent || ['any'];
      if (!intents.includes('any') && !intents.includes(t.intent)) return false;
    }
    if (!dietAllows(beat.diet, t.diet)) return false;
    const paces = beat.pace || ['short', 'standard', 'deep'];
    if (!paces.includes(t.pace)) return false;
    return true;
  }

  // ── Time-of-day awareness for generated days (TODO P0.2) ─────────────────────
  // A beat whose title names a time of day ("sunrise", "morning prayers", "sunset", "dinner")
  // keeps that time of day. Returns the window [min, max] (in hours) and a preferred start,
  // or null for a beat that can happen at any time.
  const LUNCH_TITLE_RE = /\b(lunch|thali|sadya|biryani)\b/i;
  const LUNCH_HINT_RE = /lunch|chaat|thali|food|sweets|petha/i;
  const DINNER_HINT_RE = /dinner|food|thali|dhabha/i;

  function isLunchBeat(beat) {
    const hr = Number(beat.hour);
    if (LUNCH_TITLE_RE.test(beat.title || '')) return true;
    return hr >= 12 && hr < 15 && (beat.icon === 'utensils' || LUNCH_HINT_RE.test(beat.title || ''));
  }

  function isDinnerBeat(beat) {
    return Number(beat.hour) >= 18 && (beat.icon === 'utensils' || DINNER_HINT_RE.test(beat.title || ''));
  }

  function beatTimeWindow(beat) {
    const t = String(beat.title || '').toLowerCase();
    const hr = (beat.hour != null && !isNaN(Number(beat.hour))) ? Number(beat.hour) : null;
    const win = (kind, min, max, fallback) => ({
      kind, min, max, pref: Math.min(max, Math.max(min, hr != null ? hr : fallback))
    });
    if (/\b(sunrise|dawn|daybreak|early[- ]morning|mangla aarti)\b/.test(t)) return win('dawn', 5, 8, 6);
    if (/\bmorning\b/.test(t)) return win('morning', 6, 11, 8);
    if (/\bsunset\b/.test(t)) return win('sunset', 16.5, 19, 17.5);
    if (/\b(dusk|twilight|evening|aarti)\b/.test(t)) return win('evening', 17.5, 20.5, 18.5);
    if (/\b(light (&|and) (water|sound)|sound (&|and) light|laser|light show|light ceremony)\b/.test(t)) return win('show', 18.5, 21.5, 19);
    if (/\b(night|midnight)\b/.test(t)) return win('night', 19.5, 22, 20);
    if (/\bdinner\b/.test(t) || isDinnerBeat(beat)) return win('dinner', 18.5, 21.5, 20);
    if (/\bbrunch\b/.test(t)) return win('brunch', 10.5, 12.5, 11);
    if (isLunchBeat(beat)) return win('lunch', 11.5, 15, 13);
    return null;
  }

  function hoursToHM(t) {
    let h = Math.floor(t + 1e-9);
    let m = Math.round((t - h) * 60);
    if (m >= 60) { h += 1; m = 0; }
    return { h, m };
  }

  /**
   * Lays one day's catalog beats on a timeline so that no two steps start together, a beat that
   * names a time of day keeps it, and the day never holds two lunches. A beat that cannot fit
   * its time of day on this day (a sunrise on a day spent in transit) is left out of the day
   * rather than shown at the wrong hour.
   *
   * ctx: floor (earliest start), timedCap / flowCap (latest start of a time-bound / ordinary beat),
   *      flowStart, useHints, anchors (hours already taken), lunchPref, genericDinner ({pref, max} | null)
   * Returns { items: [{ beat, t }], lunchAt, dinnerAt } with hours as decimals.
   */
  function layoutDayBeats(matched, ctx) {
    const blocked = [];                      // open intervals in which no new step may start
    const block = (t, after = 0.5) => blocked.push([t - 0.5, t + after]);
    const isFree = x => !blocked.some(([lo, hi]) => x > lo + 1e-9 && x < hi - 1e-9);
    const pickNear = (pref, lo, hi, dir) => {
      for (let k = 0; k <= 48; k++) {
        const step = Math.ceil(k / 2) * 0.25;
        const cand = k === 0 ? pref : pref + ((k % 2 === 1) ? dir : -dir) * step;
        if (cand < lo - 1e-9 || cand > hi + 1e-9) continue;
        if (isFree(cand)) return cand;
      }
      return null;
    };
    ctx.anchors.forEach(t => block(t));

    const items = [];
    const timed = matched.map(b => ({ b, w: beatTimeWindow(b) })).filter(x => x.w)
      .sort((x, y) => x.w.pref - y.w.pref);
    let lunchPlaced = false, dinnerPlaced = false;
    timed.forEach(({ b, w }) => {
      const lo = Math.max(w.min, ctx.floor), hi = Math.min(w.max, ctx.timedCap);
      if (lo > hi) return;
      const later = w.kind === 'morning' || w.kind === 'lunch' || w.kind === 'brunch';
      const t = pickNear(Math.min(hi, Math.max(lo, w.pref)), lo, hi, later ? 1 : -1);
      if (t == null) return;
      block(t, w.kind === 'lunch' ? 1.0 : 0.5);
      items.push({ beat: b, t });
      if (w.kind === 'lunch') lunchPlaced = true;
      if (isDinnerBeat(b) && t >= 18) dinnerPlaced = true;
    });

    let lunchAt = null;
    if (!lunchPlaced) {
      lunchAt = pickNear(ctx.lunchPref, 12, 15, 1);
      if (lunchAt == null) lunchAt = pickNear(ctx.lunchPref, 11.5, 15.5, 1);
      if (lunchAt != null) block(lunchAt, 1.0);
    }
    let dinnerAt = null;
    if (ctx.genericDinner && !dinnerPlaced) {
      const g = ctx.genericDinner;
      dinnerAt = pickNear(g.pref, 18.5, g.max, -1);
      if (dinnerAt == null) dinnerAt = pickNear(g.pref, 18, 22, -1);
      if (dinnerAt == null) dinnerAt = g.pref;
      block(dinnerAt);
    }

    const flow = matched.filter(b => !beatTimeWindow(b));
    const span = ctx.flowCap - ctx.flowStart;
    let spacing = 1.5;
    if (flow.length > 1 && (flow.length - 1) * spacing > span) {
      spacing = Math.max(1.0, Math.floor((span / (flow.length - 1)) * 4) / 4);
    }
    let cursor = ctx.flowStart;
    flow.forEach(b => {
      const hr = (b.hour != null && !isNaN(Number(b.hour))) ? Number(b.hour) : null;
      const cap = (hr != null && hr >= 18) ? ctx.timedCap : ctx.flowCap;
      let t = (ctx.useHints && hr != null && hr >= 9) ? Math.max(cursor, hr) : cursor;
      for (let guard = 0; !isFree(t) && guard < 80; guard++) t += 0.25;
      if (t > cap + 1e-9) return;
      block(t);
      items.push({ beat: b, t });
      cursor = t + spacing;
    });

    items.sort((x, y) => x.t - y.t);
    return { items, lunchAt, dinnerAt };
  }

  function generateSteps(trip) {
    let steps = [];
    let stepCounter = 0;

    const activeCities = trip.cities.map(cId => window.KYT_CITIES.find(c => c.id === cId)).filter(c => {
      if (!c) return false;
      return !(c.skipOnPace && c.skipOnPace.includes(trip.taste.pace));
    });

    if (activeCities.length === 0) return [];

    const dietName = { veg: 'Vegetarian', jain: 'Jain', satvik: 'Satvik', any: 'Local' }[trip.taste?.diet] || 'Local';
    const originCityId = trip.originCity || 'already_there';
    const firstCity = activeCities[0];

    const isAlreadyThere = originCityId === 'already_there' || originCityId === firstCity.id;

    const originCityObj = window.KYT_CITIES ? window.KYT_CITIES.find(c => c.id === originCityId) : null;
    const originName = originCityObj ? originCityObj.name : (originCityId === 'delhi' ? 'Delhi' : (originCityId.charAt(0).toUpperCase() + originCityId.slice(1)));

    // ── Day 0: Travel & Arrival from origin city to first city ──
    if (!isAlreadyThere) {
      const driveUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originName + ' India')}&destination=${encodeURIComponent(firstCity.name + ' India')}&travelmode=driving`;

      steps.push({
        id: Date.now().toString() + '_' + (++stepCounter),
        dayId: 0,
        cityName: firstCity.name,
        title: `Travel from ${originName} to ${firstCity.name} & Arrival`,
        notes: `Travel from ${originName} to ${firstCity.name} and check in to your stay. Activities for today are fluid depending on your time of arrival—take it easy, unpack, and settle in.`,
        where: `${originName} to ${firstCity.name}`,
        mapsUrl: driveUrl,
        icon: 'car',
        phase: 'Arrival',
        suggestedTime: 'Flexible Arrival',
        hour: 16,
        minute: 0
      });
    }

    // ── Day 1 and subsequent days ──
    const numDays = trip.duration || activeCities.length;
    for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
      let daySteps = [];
      const dayId = dayIdx + 1;
      const isFirstDay = dayIdx === 0;
      const isLastDay = dayIdx === numDays - 1;
      const city = activeCities[dayIdx] || activeCities[activeCities.length - 1];

      let prevStayCityId;
      if (isFirstDay) {
        prevStayCityId = isAlreadyThere ? (trip.originCity !== 'already_there' ? trip.originCity : firstCity.id) : firstCity.id;
      } else {
        prevStayCityId = (trip.nightStays && trip.nightStays[dayId - 1]) || activeCities[Math.min(dayIdx - 1, activeCities.length - 1)]?.id || firstCity.id;
      }

      let tonightStay = (trip.nightStays && trip.nightStays[dayId]);
      if (!tonightStay) {
        if (isFirstDay) {
          tonightStay = city.id;
        } else {
          const dist = (window.KYT_DISTANCE_MATRIX && window.KYT_DISTANCE_MATRIX[prevStayCityId]) ? window.KYT_DISTANCE_MATRIX[prevStayCityId][city.id] : null;
          if (dist != null && dist <= 130 && prevStayCityId !== 'overnight_travel') {
            tonightStay = prevStayCityId;
          } else {
            tonightStay = city.id;
          }
        }
      }

      const prevStayCityObj = window.KYT_CITIES ? window.KYT_CITIES.find(c => c.id === prevStayCityId) : null;
      const prevBaseName = prevStayCityObj ? prevStayCityObj.name : (prevStayCityId === 'delhi' ? 'Delhi' : (prevStayCityId ? (prevStayCityId.charAt(0).toUpperCase() + prevStayCityId.slice(1)) : 'Base'));

      const stayCityObj = window.KYT_CITIES ? window.KYT_CITIES.find(c => c.id === tonightStay) : null;
      const stayCityName = stayCityObj ? stayCityObj.name : (tonightStay === 'delhi' ? 'Delhi' : (tonightStay ? (tonightStay.charAt(0).toUpperCase() + tonightStay.slice(1)) : city.name));

      const isExcursion = !isFirstDay && (city.id !== prevStayCityId) && (tonightStay === prevStayCityId);
      const isMorningTransfer = !isFirstDay && (city.id !== prevStayCityId) && (tonightStay !== prevStayCityId) && (prevStayCityId !== 'overnight_travel');
      const isOvernightTravel = tonightStay === 'overnight_travel';
      const isEveningTransfer = !isExcursion && !isOvernightTravel && (tonightStay !== city.id);
      // On the final day of a trip that ends away from home the traveller goes home tonight:
      // there is no second base to move to and no night to stay.
      const returningToday = isLastDay && !isAlreadyThere && !isOvernightTravel;
      const eveningTransfer = isEveningTransfer && !returningToday;

      // Interests are a preference, food rules are not: when a city has little for the chosen interest
      // (fewer than three stops), top the day up with its other sights, still within the food choice.
      let matched = (city.beats || []).filter(b => beatMatches(b, trip.taste));
      if (matched.length < 3 && trip.taste.intent !== 'culinary') {   // a food-led trip stays food-led
        const have = new Set(matched.map(b => b.title));
        const extra = (city.beats || []).filter(b => !have.has(b.title) && beatMatches(b, { ...trip.taste, intent: 'mixed' }));
        matched = matched.concat(extra.slice(0, 3 - matched.length));
      }
      matched.sort((a, b) => (a.hour || 0) - (b.hour || 0));

      // ── PHASE 1: MORNING ──
      if (prevStayCityId === 'overnight_travel') {
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `Morning Arrival in ${city.name}`,
          notes: `Arrive in ${city.name} following overnight travel. Check in to your stay, freshen up, and get ready to explore!`,
          where: `${city.name} Station / Transit Hub`,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Hotels in ' + city.name)}`,
          icon: 'compass',
          phase: 'Morning',
          suggestedTime: 'Morning (~08:00 AM)',
          hour: 8,
          minute: 0
        });

        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `Morning Refreshment & Breakfast`,
          notes: `Enjoy a traditional ${dietName.toLowerCase()} breakfast and freshen up before starting your day.`,
          where: city.name,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Breakfast restaurants in ' + city.name)}`,
          icon: 'coffee',
          phase: 'Morning',
          suggestedTime: 'Morning (~08:45 AM)',
          hour: 8,
          minute: 45
        });
      } else if (isExcursion) {
        const driveUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(prevBaseName + ' India')}&destination=${encodeURIComponent(city.name + ' India')}&travelmode=driving`;
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `Day Excursion: Drive to ${city.name}`,
          notes: `Morning drive from your stay in ${prevBaseName} to explore ${city.name}. Click Map for driving directions.`,
          where: `${prevBaseName} to ${city.name}`,
          mapsUrl: driveUrl,
          icon: 'car',
          phase: 'Morning',
          suggestedTime: 'Morning Transit (~07:30 AM)',
          hour: 7,
          minute: 30
        });
      } else if (isMorningTransfer) {
        const driveUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(prevBaseName + ' India')}&destination=${encodeURIComponent(city.name + ' India')}&travelmode=driving`;
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `Travel to ${city.name}`,
          notes: `Journey from ${prevBaseName} to ${city.name}. Click Map for driving directions and routes.`,
          where: `${prevBaseName} to ${city.name}`,
          mapsUrl: driveUrl,
          icon: 'car',
          phase: 'Morning',
          suggestedTime: 'Morning Transit (~07:30 AM)',
          hour: 7,
          minute: 30
        });

        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `Hotel Check-in & Freshen Up in ${city.name}`,
          notes: `Check in to your stay in ${city.name}, drop luggage, and freshen up before exploring.`,
          where: `${city.name} Hotel / Stay`,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Hotels in ' + city.name)}`,
          icon: 'hotel',
          phase: 'Morning',
          suggestedTime: 'Morning (~11:30 AM)',
          hour: 11,
          minute: 30
        });
      } else {
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `Morning Refreshment & Breakfast`,
          notes: `Enjoy a traditional ${dietName.toLowerCase()} breakfast and hot filter coffee or chai before starting your day.`,
          where: city.name,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Breakfast restaurants in ' + city.name)}`,
          icon: 'coffee',
          phase: 'Morning',
          suggestedTime: 'Morning (~08:30 AM)',
          hour: 8,
          minute: 30
        });
      }

      // ── PHASE 2: MIDDAY & DAYTIME SIGHTSEEING ──
      // The morning is free for sightseeing unless it is spent in transit (excursion drive or a
      // base transfer). A beat that names a time of day keeps it; one that cannot fit today is left out.
      const isArrivalMorning = prevStayCityId === 'overnight_travel';
      const morningFree = isArrivalMorning || !(isExcursion || isMorningTransfer);
      const dayEndsEarly = isExcursion || eveningTransfer;
      const fixedAnchors = daySteps.map(s => s.hour + (s.minute || 0) / 60);
      if (isOvernightTravel) fixedAnchors.push(21.5);
      else if (isExcursion) fixedAnchors.push(18, 20);
      else if (eveningTransfer) fixedAnchors.push(18, 20.5);

      const layout = layoutDayBeats(matched, {
        floor: isArrivalMorning ? 9.5 : (morningFree ? 5 : 12.5),
        flowStart: morningFree ? 10.0 : 13.5,
        flowCap: dayEndsEarly ? 17.0 : (isOvernightTravel ? 18.0 : 18.5),
        timedCap: dayEndsEarly ? 17.0 : (isOvernightTravel ? 18.0 : (returningToday ? 19.5 : 20.5)),
        useHints: morningFree,
        anchors: fixedAnchors,
        lunchPref: morningFree ? 13.0 : 12.5,
        genericDinner: dayEndsEarly ? null : { pref: isOvernightTravel ? 19.5 : 20.0, max: 21.0 }
      });

      if (layout.lunchAt != null) {
        const lh = hoursToHM(layout.lunchAt);
        const lPhase = KYT.ui.hourToPhase(lh.h);
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `${dietName} Lunch in ${city.name}`,
          notes: `Savour authentic regional cuisine and thali meals at a popular local eatery in ${city.name}.`,
          where: city.name,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dietName + ' Lunch in ' + city.name)}`,
          icon: 'utensils',
          phase: lPhase,
          suggestedTime: KYT.ui.formatSuggestedTime(lh.h, lh.m, lPhase),
          hour: lh.h,
          minute: lh.m
        });
      }

      layout.items.forEach(({ beat, t }) => {
        const { h, m } = hoursToHM(t);
        const phase = KYT.ui.hourToPhase(h);
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: beat.title,
          notes: beat.notes || '',
          where: beat.where || city.name,
          mapsUrl: beat.mapsUrl || '',
          icon: beat.icon || 'map-pin',
          phase: phase,
          suggestedTime: KYT.ui.formatSuggestedTime(h, m, phase),
          hour: h,
          minute: m
        });
      });

      // ── PHASE 3: EVENING & NIGHT STAY ──
      if (isOvernightTravel) {
        if (layout.dinnerAt != null) {
          const dh = hoursToHM(layout.dinnerAt);
          daySteps.push({
            id: Date.now().toString() + '_' + (++stepCounter),
            dayId: dayId,
            cityName: city.name,
            title: `Early Dinner & Refreshment in ${city.name}`,
            notes: `Early dinner and freshen up before heading to your departure hub.`,
            where: city.name,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Dinner restaurants in ' + city.name)}`,
            icon: 'utensils',
            phase: KYT.ui.hourToPhase(dh.h),
            suggestedTime: KYT.ui.formatSuggestedTime(dh.h, dh.m),
            hour: dh.h,
            minute: dh.m
          });
        }

        const nextCityObj = activeCities[dayIdx + 1];
        const destTitle = nextCityObj ? nextCityObj.name : originName;
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: city.name,
          title: `Overnight Travel to ${destTitle}`,
          notes: `Check out, head to your transit departure hub, and begin your overnight travel to ${destTitle}. Rest comfortably on the journey!`,
          where: `${city.name} to ${destTitle}`,
          mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(city.name + ' India')}&destination=${encodeURIComponent(destTitle + ' India')}`,
          icon: 'moon',
          phase: 'Evening',
          suggestedTime: 'Night Travel (~21:30 PM)',
          hour: 21,
          minute: 30
        });

      } else if (isExcursion) {
        const returnDriveUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(city.name + ' India')}&destination=${encodeURIComponent(prevBaseName + ' India')}&travelmode=driving`;
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: prevBaseName,
          title: `Return Drive to ${prevBaseName} Stay Base`,
          notes: `Wrap up your excursion in ${city.name} and return to your hotel base in ${prevBaseName}.`,
          where: `${city.name} to ${prevBaseName}`,
          mapsUrl: returnDriveUrl,
          icon: 'car',
          phase: 'Evening',
          suggestedTime: 'Evening Transit (~18:00 PM)',
          hour: 18,
          minute: 0
        });

        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: prevBaseName,
          title: returningToday ? `Dinner in ${prevBaseName}` : `Dinner & Night Stay in ${prevBaseName}`,
          notes: returningToday
            ? `Wind down after your excursion with dinner in ${prevBaseName} before the journey home.`
            : `Wind down after your excursion with dinner in ${prevBaseName} and rest at your hotel.`,
          where: prevBaseName,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Dinner restaurants in ' + prevBaseName)}`,
          icon: 'utensils',
          phase: 'Evening',
          suggestedTime: 'Evening (~20:00 PM)',
          hour: 20,
          minute: 0
        });

      } else if (eveningTransfer) {
        const transferUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(city.name + ' India')}&destination=${encodeURIComponent(stayCityName + ' India')}&travelmode=driving`;
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: stayCityName,
          title: `Travel to ${stayCityName}`,
          notes: `Wrap up sightseeing in ${city.name} and journey to ${stayCityName} where you will be staying tonight. Click Map for driving directions.`,
          where: `${city.name} to ${stayCityName}`,
          mapsUrl: transferUrl,
          icon: 'car',
          phase: 'Evening',
          suggestedTime: 'Evening Transit (~18:00 PM)',
          hour: 18,
          minute: 0
        });

        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: stayCityName,
          title: `Hotel Check-in, Dinner & Overnight Stay in ${stayCityName}`,
          notes: `Check in to your hotel in ${stayCityName}, enjoy dinner, and rest for the night.`,
          where: `${stayCityName} Hotel / Stay`,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Hotels in ' + stayCityName)}`,
          icon: 'hotel',
          phase: 'Evening',
          suggestedTime: 'Evening (~20:30 PM)',
          hour: 20,
          minute: 30
        });

      } else {
        if (layout.dinnerAt != null) {
          const dh = hoursToHM(layout.dinnerAt);
          daySteps.push({
            id: Date.now().toString() + '_' + (++stepCounter),
            dayId: dayId,
            cityName: city.name,
            title: returningToday ? `Dinner in ${city.name}` : `Dinner & Overnight Stay in ${city.name}`,
            notes: returningToday
              ? `Enjoy a last dinner in ${city.name} and soak in the evening atmosphere before the journey home.`
              : `Wind down with dinner and soak in the evening atmosphere of ${city.name}.`,
            where: city.name,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Dinner restaurants in ' + city.name)}`,
            icon: 'utensils',
            phase: KYT.ui.hourToPhase(dh.h),
            suggestedTime: KYT.ui.formatSuggestedTime(dh.h, dh.m),
            hour: dh.h,
            minute: dh.m
          });
        }
      }

      // ── PHASE 4: RETURN JOURNEY ON FINAL DAY ──
      if (returningToday) {
        const returnOriginCityName = isExcursion ? prevBaseName : city.name;
        const lastStepAt = Math.max(0, ...daySteps.map(s => s.hour + (s.minute || 0) / 60));
        const rh = hoursToHM(Math.max(21.0, Math.ceil((lastStepAt + 1.0) * 4) / 4));
        daySteps.push({
          id: Date.now().toString() + '_' + (++stepCounter),
          dayId: dayId,
          cityName: returnOriginCityName,
          title: `Return Journey to ${originName}`,
          notes: `Wrap up your trip from ${returnOriginCityName} and begin your journey back to ${originName}. Safe travels and pack your memories!`,
          where: `${returnOriginCityName} to ${originName}`,
          mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(returnOriginCityName + ' India')}&destination=${encodeURIComponent(originName + ' India')}&travelmode=driving`,
          icon: 'car',
          phase: 'Evening',
          suggestedTime: KYT.ui.formatSuggestedTime(rh.h, rh.m, 'Evening'),
          hour: rh.h,
          minute: rh.m
        });
      }

      daySteps.sort((a, b) => ((a.hour || 0) * 60 + (a.minute || 0)) - ((b.hour || 0) * 60 + (b.minute || 0)));
      // Safety net: no two steps of a day start at the same time.
      for (let i = 1; i < daySteps.length; i++) {
        const prevAt = daySteps[i - 1].hour * 60 + (daySteps[i - 1].minute || 0);
        const at = daySteps[i].hour * 60 + (daySteps[i].minute || 0);
        if (at <= prevAt) {
          const bumped = hoursToHM((prevAt + 15) / 60);
          daySteps[i].hour = bumped.h;
          daySteps[i].minute = bumped.m;
          daySteps[i].phase = KYT.ui.hourToPhase(bumped.h);
          daySteps[i].suggestedTime = KYT.ui.formatSuggestedTime(bumped.h, bumped.m, daySteps[i].phase);
        }
      }
      steps = steps.concat(daySteps);
    }

    return steps;
  }

  // ── Plan model ───────────────────────────────────────────────────────────────
  // A trip is an ordered list of cities and a list of days; each day belongs to one city. Steps hang off
  // a day and come in three types: a stop (something to see or eat), a stay (where you sleep) and a
  // travel step (getting between places). Nothing is generated unless the traveller asks for it.
  const TRAVEL_TITLE_RE = /^(Travel from|Travel to|Day Excursion|Overnight Travel to|Return Drive|Return Journey)/;
  const MODE_META = {
    road:   { icon: 'car',   label: 'by road',  gm: 'driving' },
    train:  { icon: 'train', label: 'by train', gm: 'transit' },
    bus:    { icon: 'bus',   label: 'by bus',   gm: 'transit' },
    flight: { icon: 'plane', label: 'by air',   gm: '' },
    other:  { icon: 'route', label: '',         gm: '' }
  };

  function cityById(id) { return (window.KYT_CITIES || []).find(c => c.id === id) || null; }
  function cityByName(name) {
    const n = String(name || '').trim().toLowerCase();
    return n ? ((window.KYT_CITIES || []).find(c => c.name.toLowerCase() === n) || null) : null;
  }
  function placeName(id) {
    const c = cityById(id);
    if (c) return c.name;
    const o = POPULAR_ORIGINS.find(x => x.id === id);
    return o ? o.name.replace(/ \(.*\)| \/ NCR/g, '') : (id || '');
  }
  function kmBetween(a, b) {
    const m = window.KYT_DISTANCE_MATRIX;
    if (!m || !a || !b) return null;
    const d = (m[a] && m[a][b]) != null ? m[a][b] : (m[b] && m[b][a]);
    return d != null ? d : null;
  }
  function syncDuration(trip) {
    trip.duration = (trip.days || []).filter(d => d.id >= 1).length || (trip.cities && trip.cities.length) || 1;
  }

  /** Every trip has `days` and every step a type; older trips are upgraded the first time they are read. */
  function ensureDays(trip) {
    if (!trip) return trip;
    if (Array.isArray(trip.steps)) trip.steps.forEach(st => { if (!st.type) st.type = 'stop'; });
    if (!Array.isArray(trip.days)) {
      const cities = trip.cities || [];
      const steps = trip.steps || [];
      const days = [];
      if (steps.length) {
        const dayOf = st => (st.dayId != null ? Number(st.dayId) : 1);
        [...new Set(steps.map(dayOf))].sort((a, b) => a - b).forEach(id => {
          const first = steps.find(st => dayOf(st) === id);
          const named = cityByName(first && first.cityName);
          const fallback = cities[Math.min(Math.max(id - 1, 0), Math.max(cities.length - 1, 0))] || '';
          days.push({ id, cityId: named ? named.id : fallback });
        });
      } else {
        const n = Math.max(trip.duration || 0, cities.length);
        for (let i = 0; i < n; i++) days.push({ id: i + 1, cityId: cities[Math.min(i, cities.length - 1)] });
      }
      trip.days = days;
    }
    syncDuration(trip);
    return trip;
  }

  function sortedDays(trip) { return (trip.days || []).slice().sort((a, b) => a.id - b.id); }
  function dayCity(trip, dayId) {
    const d = (trip.days || []).find(x => x.id === dayId);
    return cityById(d && d.cityId) || cityById((trip.cities || [])[0]) || null;
  }
  function stepsOfDay(trip, dayId) { return (trip.steps || []).filter(s => Number(s.dayId) === dayId); }

  function addDay(trip, cityId) {
    const next = (trip.days || []).reduce((m, d) => Math.max(m, d.id), 0) + 1;
    trip.days.push({ id: next, cityId });
    syncDuration(trip);
    return next;
  }
  function removeDay(trip, dayId) {
    trip.days = trip.days.filter(d => d.id !== dayId);
    trip.steps = (trip.steps || []).filter(s => Number(s.dayId) !== dayId);
    if (dayId >= 1) {
      trip.days.forEach(d => { if (d.id > dayId) d.id -= 1; });
      trip.steps.forEach(s => { if (Number(s.dayId) > dayId) s.dayId = Number(s.dayId) - 1; });
    }
    syncDuration(trip);
  }
  function addCityToTrip(trip, cityId) {
    if (trip.cities.includes(cityId)) return false;
    ensureDays(trip);
    trip.cities.push(cityId);
    addDay(trip, cityId);
    return true;
  }
  function removeCityFromTrip(trip, cityId) {
    ensureDays(trip);
    trip.cities = trip.cities.filter(c => c !== cityId);
    trip.days.filter(d => d.cityId === cityId && d.id >= 1).map(d => d.id).sort((a, b) => b - a)
      .forEach(id => removeDay(trip, id));
    if (!trip.steps || !trip.steps.length) trip.steps = null;
  }

  /** Swap two neighbouring cities before any step exists; their days follow, one day per city. */
  function swapCities(trip, i, j) {
    const t = trip.cities[i]; trip.cities[i] = trip.cities[j]; trip.cities[j] = t;
    const days = sortedDays(trip).filter(d => d.id >= 1);
    if (days.length === trip.cities.length) days.forEach((d, k) => { d.cityId = trip.cities[k]; });
  }

  function sortAllSteps(trip) {
    if (!trip.steps) return;
    const key = s => Number(s.dayId) * 10000 + (s.hour || 0) * 60 + (s.minute || 0);
    trip.steps = trip.steps.map((s, i) => [s, i]).sort((a, b) => key(a[0]) - key(b[0]) || a[1] - b[1]).map(x => x[0]);
  }

  // ── "Suggest a plan": the generator fills only the days that have nothing in them yet ──────────
  /** Where to sleep each night when nothing has been chosen: stay put within about 130 km, else move. */
  function defaultNightStays(trip) {
    const cities = (trip.cities || []).map(cityById).filter(Boolean);
    const stays = {};
    const n = trip.duration || cities.length || 1;
    for (let i = 0; i < n; i++) {
      const dayId = i + 1;
      const dayCityObj = cities[i] || cities[cities.length - 1];
      if (!dayCityObj) continue;
      if (i === 0) { stays[dayId] = dayCityObj.id; continue; }
      const prev = stays[dayId - 1];
      const dist = prev && prev !== 'overnight_travel' ? kmBetween(prev, dayCityObj.id) : null;
      // A place reached on foot or needing acclimatisation is never a day trip: sleep there.
      const gated = KYT.ui.accessInfo(dayCityObj)?.gated;
      stays[dayId] = (dist != null && dist <= 130 && !gated) ? prev : dayCityObj.id;
    }
    return stays;
  }

  function suggestPlan(trip) {
    ensureDays(trip);
    const cityIds = [...new Set(trip.days.filter(d => d.id >= 1).map(d => d.cityId).filter(Boolean))];
    const temp = { ...trip, cities: cityIds.length ? cityIds : trip.cities, steps: null, nightStays: null };
    temp.nightStays = defaultNightStays(temp);
    const filled = new Set((trip.steps || []).map(s => Number(s.dayId)));
    const known = new Set(trip.days.map(d => d.id));
    let added = 0;
    generateSteps(temp).forEach(st => {
      const d = Number(st.dayId);
      if (filled.has(d)) return;
      if (d === 0 && !known.has(0)) { trip.days.unshift({ id: 0, cityId: cityIds[0] || '' }); known.add(0); }
      if (!known.has(d)) return;
      st.type = TRAVEL_TITLE_RE.test(st.title) ? 'travel' : 'stop';
      (trip.steps = trip.steps || []).push(st);
      added++;
    });
    if (added) trip.suggested = true;
    sortAllSteps(trip);
    return added;
  }

  // ── Steps: create, edit, move, delete ────────────────────────────────────────────────────────
  const pad2 = n => String(n).padStart(2, '0');
  let stepEditCtx = null;
  let activeDayId = null;      // the day tab that is open
  let styleOpen = false;       // the "style of suggestions" chips are shown
  let builderTripId = null;

  function setStepTime(step, h, m) {
    step.hour = h;
    step.minute = m;
    step.phase = KYT.ui.hourToPhase(h);
    step.suggestedTime = KYT.ui.formatSuggestedTime(h, m, step.phase);
  }
  function newStepId() { return Date.now().toString() + '_n' + Math.floor(Math.random() * 1e5); }
  function mapsSearch(q) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`; }
  function travelTitle(from, to, mode, overnight) {
    const m = (MODE_META[mode] || MODE_META.other).label;
    return `${overnight ? 'Overnight travel' : 'Travel'}: ${from} to ${to}${m ? ' ' + m : ''}`;
  }
  function travelMapsUrl(from, to, mode) {
    const gm = (MODE_META[mode] || MODE_META.other).gm;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}` + (gm ? `&travelmode=${gm}` : '');
  }
  /** No two steps of a day start at the same minute: nudge by a quarter hour. */
  function freeTime(trip, dayId, h, m) {
    const taken = new Set(stepsOfDay(trip, dayId).map(s => (s.hour || 0) * 60 + (s.minute || 0)));
    let t = h * 60 + m;
    while (taken.has(t) && t < 23 * 60 + 45) t += 15;
    return { h: Math.floor(t / 60), m: t % 60 };
  }
  function pushStep(trip, step, h, m) {
    const t = freeTime(trip, step.dayId, h, m);
    setStepTime(step, t.h, t.m);
    if (!trip.steps) trip.steps = [];
    trip.steps.push(step);
    sortAllSteps(trip);
  }

  function addBeatStep(trip, dayId, beatIndex) {
    const city = dayCity(trip, dayId);
    const beat = suggestionsFor(trip, dayId).all[beatIndex];
    if (!beat || !city) return;
    pushStep(trip, {
      id: newStepId(), dayId, cityName: city.name, type: 'stop', title: beat.title, notes: beat.notes || '',
      where: beat.where || city.name, mapsUrl: beat.mapsUrl || mapsSearch((beat.where || beat.title) + ' ' + city.name),
      icon: beat.icon || 'map-pin', src: beat.title
    }, beat.hour != null ? beat.hour : 10, 0);
    saveVTrips();
    renderBuilder();
  }

  function addStayStep(trip, dayId, place) {
    const city = dayCity(trip, dayId);
    if (!city) return;
    pushStep(trip, {
      id: newStepId(), dayId, cityName: city.name, type: 'stay', title: `Stay in ${place || city.name}`, notes: '',
      where: place || city.name, mapsUrl: mapsSearch(`hotels in ${place || city.name}`), icon: 'bed-double'
    }, 21, 0);
    saveVTrips();
    renderBuilder();
  }

  window.moveVirtualTripStep = function (stepId, dir) {
    const trip = getActiveTrip();
    if (!trip || !trip.steps) return;
    const i = trip.steps.findIndex(s => s.id === stepId);
    if (i < 0) return;
    const day = stepsOfDay(trip, Number(trip.steps[i].dayId));
    const k = day.findIndex(s => s.id === stepId);
    const other = day[k + dir];
    if (!other) return;
    const a = trip.steps[i];
    const ta = { h: a.hour, m: a.minute }, tb = { h: other.hour, m: other.minute };
    setStepTime(a, tb.h, tb.m);
    setStepTime(other, ta.h, ta.m);
    sortAllSteps(trip);
    saveVTrips();
    renderBuilder();
  };

  window.deleteVirtualTripStep = function (stepId) {
    const trip = getActiveTrip();
    if (!trip || !trip.steps) return;
    trip.steps = trip.steps.filter(s => s.id !== stepId);
    if (!trip.steps.length) trip.steps = null;
    saveVTrips();
    renderBuilder();
  };

  window.editVirtualTripStep = id => openStepEditor({ mode: 'edit', stepId: id });

  function stepModalEl() { return document.getElementById('vt-step-modal'); }
  function closeStepEditor() {
    const m = stepModalEl();
    if (m) m.classList.add('hidden');
    stepEditCtx = null;
  }

  /** ctx: { mode: 'add' | 'edit', kind: 'stop' | 'travel' | 'stay', dayId | stepId, prefill? } */
  function openStepEditor(ctx) {
    const trip = getActiveTrip();
    const m = stepModalEl();
    if (!trip || !m) return;
    const $ = id => document.getElementById(id);
    let step = null;
    if (ctx.mode === 'edit') {
      step = (trip.steps || []).find(s => s.id === ctx.stepId);
      if (!step) return;
      ctx.kind = step.type || 'stop';
      ctx.dayId = Number(step.dayId);
    }
    stepEditCtx = ctx;
    const kind = ctx.kind;
    const pre = ctx.prefill || {};
    $('vt-step-error').classList.add('hidden');
    $('vt-fields-stop').classList.toggle('hidden', kind !== 'stop');
    $('vt-fields-travel').classList.toggle('hidden', kind !== 'travel');
    $('vt-fields-stay').classList.toggle('hidden', kind !== 'stay');
    $('vt-step-where-wrap').classList.toggle('hidden', kind !== 'stop');
    $('vt-step-time-label').textContent = kind === 'travel' ? 'Leaves' : (kind === 'stay' ? 'Check-in' : 'When');
    const noun = { stop: 'stop', travel: 'travel', stay: 'stay' }[kind];
    $('vt-step-modal-title').textContent = ctx.mode === 'edit' ? `Edit ${noun}` :
      `Add ${kind === 'stop' ? 'a stop' : (kind === 'stay' ? 'a stay' : 'travel')} to Day ${ctx.dayId}`;

    const set = (id, v) => { $(id).value = v == null ? '' : v; };
    if (step) {
      set('vt-step-title', step.title);
      set('vt-step-where', step.where);
      set('vt-travel-from', step.from); set('vt-travel-to', step.to);
      set('vt-travel-mode', step.mode || 'road'); set('vt-travel-duration', step.duration);
      $('vt-travel-overnight').checked = Boolean(step.overnight);
      set('vt-stay-place', step.where === (dayCity(trip, ctx.dayId) || {}).name ? '' : step.where);
      set('vt-step-time', step.hour != null ? `${pad2(step.hour)}:${pad2(step.minute || 0)}` : '');
      set('vt-step-notes', step.notes);
    } else {
      set('vt-step-title', ''); set('vt-step-where', '');
      set('vt-travel-from', pre.from); set('vt-travel-to', pre.to);
      set('vt-travel-mode', pre.mode || 'road'); set('vt-travel-duration', '');
      $('vt-travel-overnight').checked = Boolean(pre.overnight);
      set('vt-stay-place', '');
      const dflt = kind === 'stay' ? 21 * 60 : (kind === 'travel' ? (pre.hour != null ? pre.hour * 60 : 9 * 60) : 12 * 60);
      const t = freeTime(trip, ctx.dayId, Math.floor(dflt / 60), dflt % 60);
      set('vt-step-time', `${pad2(t.h)}:${pad2(t.m)}`);
      set('vt-step-notes', '');
    }
    fillPlaceList(trip);
    updateTravelHint();
    m.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    const first = { stop: 'vt-step-title', travel: 'vt-travel-from', stay: 'vt-stay-place' }[kind];
    setTimeout(() => { const t = $(first); if (t) t.focus(); }, 50);
  }

  /** Type-ahead for From and To: the trip's own cities first, then every destination and the popular starting points. */
  function fillPlaceList(trip) {
    const dl = document.getElementById('vt-place-list');
    if (!dl) return;
    const names = [];
    const add = n => { if (n && !names.includes(n)) names.push(n); };
    (trip.cities || []).forEach(id => add(placeName(id)));
    if (trip.originCity && trip.originCity !== 'already_there' && trip.originCity !== '0') add(placeName(trip.originCity));
    (window.KYT_CITIES || []).forEach(c => add(c.name));
    POPULAR_ORIGINS.forEach(o => add(o.name));
    dl.innerHTML = names.map(n => `<option value="${KYT.utils.escapeHTML(n)}"></option>`).join('');
  }

  /** "About 170 km apart" under the From / To fields, when both are places we know. */
  function updateTravelHint() {
    const hint = document.getElementById('vt-travel-hint');
    if (!hint) return;
    const from = cityByName(document.getElementById('vt-travel-from').value) ||
      POPULAR_ORIGINS.find(o => o.name.toLowerCase().startsWith(document.getElementById('vt-travel-from').value.trim().toLowerCase()) && document.getElementById('vt-travel-from').value.trim());
    const to = cityByName(document.getElementById('vt-travel-to').value);
    const km = from && to ? kmBetween(from.id, to.id) : null;
    hint.textContent = km != null ? `About ${km} km apart by road. Check live times in Google Maps.` : '';
    const link = document.getElementById('vt-travel-maps');
    if (link) {
      const f = document.getElementById('vt-travel-from').value.trim(), t = document.getElementById('vt-travel-to').value.trim();
      link.classList.toggle('hidden', !(f && t));
      if (f && t) link.href = travelMapsUrl(f, t, document.getElementById('vt-travel-mode').value);
    }
  }

  function saveStepEditor() {
    const trip = getActiveTrip();
    const ctx = stepEditCtx;
    if (!trip || !ctx) return;
    const $ = id => document.getElementById(id);
    const kind = ctx.kind;
    const val = id => $(id).value.trim();
    const parts = /^(\d{1,2}):(\d{2})$/.exec($('vt-step-time').value || '');
    const fail = (msg, focusId) => {
      $('vt-step-error').textContent = msg;
      $('vt-step-error').classList.remove('hidden');
      // the message sits under the first field; make sure it is shown for travel too
      if (kind !== 'stop') $('vt-step-error').parentElement.insertAdjacentElement('afterend', $('vt-step-error'));
      $(focusId).focus();
    };
    const city = dayCity(trip, ctx.dayId);
    const cityName = (city && city.name) || '';
    let fields;
    if (kind === 'stop') {
      if (!val('vt-step-title')) return fail('Give the stop a name.', 'vt-step-title');
      const where = val('vt-step-where');
      fields = { title: val('vt-step-title'), where, mapsUrl: mapsSearch((where || val('vt-step-title')) + ' ' + cityName), icon: 'map-pin' };
    } else if (kind === 'travel') {
      if (!val('vt-travel-from') || !val('vt-travel-to')) return fail('Say where you travel from and to.', val('vt-travel-from') ? 'vt-travel-to' : 'vt-travel-from');
      const mode = $('vt-travel-mode').value;
      const overnight = $('vt-travel-overnight').checked;
      fields = {
        title: travelTitle(val('vt-travel-from'), val('vt-travel-to'), mode, overnight), overnight, from: val('vt-travel-from'), to: val('vt-travel-to'),
        mode, duration: val('vt-travel-duration'), where: val('vt-travel-to'),
        mapsUrl: travelMapsUrl(val('vt-travel-from'), val('vt-travel-to'), mode), icon: (MODE_META[mode] || MODE_META.other).icon
      };
    } else {
      const place = val('vt-stay-place');
      fields = { title: `Stay in ${place || cityName}`, where: place || cityName, mapsUrl: mapsSearch(`hotels in ${place || cityName}`), icon: 'bed-double' };
    }
    fields.notes = val('vt-step-notes');

    if (ctx.mode === 'edit') {
      const step = (trip.steps || []).find(s => s.id === ctx.stepId);
      if (!step) return closeStepEditor();
      Object.assign(step, fields);
      if (parts) setStepTime(step, parseInt(parts[1], 10), parseInt(parts[2], 10));
    } else {
      const h = parts ? parseInt(parts[1], 10) : 12, mi = parts ? parseInt(parts[2], 10) : 0;
      const step = Object.assign({ id: newStepId(), dayId: ctx.dayId, cityName, type: kind }, fields);
      if (!trip.steps) trip.steps = [];
      setStepTime(step, h, mi);
      trip.steps.push(step);
    }
    sortAllSteps(trip);
    saveVTrips();
    closeStepEditor();
    renderBuilder();
  }

  // ── The Day Plan: one tab per day ───────────────────────────────────────────────────────────
  const TIME_OF_DAY = h => (h < 12 ? 'Morning' : (h < 17 ? 'Afternoon' : 'Evening'));
  const EFFORT_LABEL = { easy: 'Easy', walk: 'Some walking', moderate: 'Moderate', hard: 'Demanding', trek: 'Trek' };

  /** The city's attractions that are not in the plan yet: ones that fit the chosen style first. */
  function suggestionsFor(trip, dayId) {
    const city = dayCity(trip, dayId);
    const used = new Set((trip.steps || []).map(s => s.src || s.title));
    const beats = city ? (city.beats || []).filter(b => !used.has(b.title)) : [];
    const fits = beats.filter(b => beatMatches(b, trip.taste)).sort((a, b) => (a.hour || 0) - (b.hour || 0));
    const others = beats.filter(b => !fits.includes(b)).sort((a, b) => (a.hour || 0) - (b.hour || 0));
    return { fits, others, all: fits.concat(others), city };
  }

  function dayHints(trip, day) {
    const esc = KYT.utils.escapeHTML;
    const hints = [];
    const city = dayCity(trip, day.id);
    if (!city || day.id < 1) return hints;
    const days = sortedDays(trip).filter(d => d.id >= 1);
    const idx = days.findIndex(d => d.id === day.id);
    const mine = stepsOfDay(trip, day.id);
    const origin = trip.originCity && trip.originCity !== 'already_there' && trip.originCity !== '0' ? trip.originCity : '';
    const fromId = idx > 0 ? days[idx - 1].cityId : origin;
    const prevSteps = idx > 0 ? stepsOfDay(trip, days[idx - 1].id) : [];
    const travelTo = (list, name) => list.some(s => s.type === 'travel' && s.to === name);
    const hasTravelIn = !mine.some(s => s.type === 'travel' && s.to === city.name) && !travelTo(prevSteps, city.name);
    const hintData = (from, to, km, hour, extra = '') =>
      `data-hint="travel" data-from="${esc(from)}" data-to="${esc(to)}" data-km="${km == null ? '' : km}" data-hour="${hour}"${extra}`;
    if (fromId && fromId !== city.id && hasTravelIn) {
      const km = kmBetween(fromId, city.id);
      hints.push({ key: 'travel', icon: 'route', text: `Travel from ${placeName(fromId)} to ${city.name}`, sub: km != null ? `about ${km} km` : '',
        data: hintData(placeName(fromId), city.name, km, 6) });
    }
    const isLast = idx === days.length - 1;
    const next = !isLast ? days[idx + 1] : null;
    const nextCity = next && next.cityId && next.cityId !== city.id ? cityById(next.cityId) : null;
    const leavesToday = nextCity && mine.some(s => s.type === 'travel' && s.to === nextCity.name);
    if (nextCity && !leavesToday) {
      const km = kmBetween(city.id, nextCity.id);
      hints.push({ key: 'travel-next', icon: 'route', text: `Travel to ${nextCity.name} for Day ${next.id}`, sub: km != null ? `about ${km} km` : '',
        data: hintData(city.name, nextCity.name, km, 17) });
      hints.push({ key: 'overnight', icon: 'moon', text: `Overnight travel to ${nextCity.name}`, sub: km != null ? `about ${km} km, sleep on the way` : 'sleep on the way',
        data: hintData(city.name, nextCity.name, km, 21, ' data-overnight="1"') });
    }
    if (isLast && origin && origin !== city.id && !mine.some(s => s.type === 'travel' && s.to === placeName(origin))) {
      const km = kmBetween(city.id, origin);
      hints.push({ key: 'return', icon: 'route', text: `Travel back to ${placeName(origin)}`, sub: km != null ? `about ${km} km` : '',
        data: hintData(city.name, placeName(origin), km, 18) });
    }
    if (!isLast && !mine.some(s => s.type === 'stay') && !mine.some(s => s.type === 'travel' && s.overnight)) {
      hints.push({ key: 'stay', icon: 'bed-double', text: `Stay in ${city.name} tonight`, sub: '', data: 'data-hint="stay"' });
    }
    return hints;
  }

  function syncBackButton(trip) {
    const label = document.getElementById('vt-subnav-back-label');
    if (!label || currentScreen !== 'builder') return;
    label.textContent = trip && trip.steps && trip.steps.length ? 'View Trip' : 'Setup';
  }

  function renderBuilder() {
    const trip = getActiveTrip();
    if (!trip) return;
    ensureDays(trip);
    const esc = KYT.utils.escapeHTML;
    if (DOM.editNameInput) DOM.editNameInput.value = trip.name;
    if (builderTripId !== trip.id) { builderTripId = trip.id; activeDayId = null; styleOpen = false; }
    const days = sortedDays(trip);
    syncBackButton(trip);

    if (!days.length) {
      DOM.itineraryListRoot.innerHTML = `
        <div class="text-center p-6 bg-white rounded-2xl border border-slate-100">
          <p class="text-sm font-bold text-slate-700 mb-1">No days yet</p>
          <p class="text-xs text-slate-400 mb-4">Choose a destination first, and a day is added for it.</p>
          <button type="button" id="btn-vt-edit-setup" class="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100 cursor-pointer">Choose destinations</button>
        </div>`;
      return;
    }
    if (activeDayId == null || !days.some(d => d.id === activeDayId)) activeDayId = (days.find(d => d.id >= 1) || days[0]).id;
    const day = days.find(d => d.id === activeDayId);
    const city = dayCity(trip, day.id);
    const mine = stepsOfDay(trip, day.id);
    const totalSteps = (trip.steps || []).length;
    const emptyDays = days.some(d => stepsOfDay(trip, d.id).length === 0);
    const btn = 'text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors cursor-pointer';

    // 1. Summary and the two trip-wide actions
    let html = `
      <div class="flex items-center gap-2 flex-wrap bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2.5 shadow-xs">
        <p class="w-full text-xs font-bold text-slate-600 leading-snug">${esc(tripSummaryText(trip))}</p>
        <button type="button" id="btn-vt-edit-setup" class="${btn} text-blue-600 bg-blue-50 hover:bg-blue-100">Edit cities &amp; start</button>
        ${emptyDays ? `<button type="button" id="btn-vt-suggest" class="${btn} text-indigo-700 bg-indigo-50 hover:bg-indigo-100 inline-flex items-center gap-1"><i data-lucide="wand-2" class="w-3 h-3"></i> Suggest a plan</button>` : ''}
        ${totalSteps ? `<button type="button" id="btn-vt-reset-plan" class="${btn} ml-auto text-slate-500 hover:text-rose-600">Clear plan</button>` : ''}
      </div>
      ${trip.suggested && !trip.curatedId ? KYT.ui.renderGeneratedPlanNotice() : ''}
    `;

    // 2. Day tabs
    html += `<div id="vt-day-tabs" role="tablist" class="sticky -top-4 z-20 flex items-stretch gap-1.5 overflow-x-auto -mx-4 px-4 py-2 bg-slate-50/95 backdrop-blur border-b border-slate-200/70">` +
      days.map(d => {
        const c = cityById(d.cityId);
        const on = d.id === day.id;
        const n = stepsOfDay(trip, d.id).length;
        return `<button type="button" role="tab" aria-selected="${on}" data-day-id="${d.id}"
          class="shrink-0 text-left px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${on ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}">
          <span class="block text-xs font-extrabold leading-tight">${d.id === 0 ? 'Day 0' : 'Day ' + d.id}${n ? ` <span class="${on ? 'text-blue-100' : 'text-slate-400'} font-bold">· ${n}</span>` : ''}</span>
          <span class="block text-[10px] font-semibold leading-tight ${on ? 'text-blue-100' : 'text-slate-400'} max-w-[7.5rem] truncate">${esc(c ? c.name : '')}</span>
        </button>`;
      }).join('') +
      `<button type="button" id="btn-vt-add-day" class="shrink-0 px-3 py-1.5 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-500 hover:text-blue-600 hover:border-blue-300 cursor-pointer" aria-label="Add a day">+ Day</button></div>`;

    // 3. The open day: city, planned steps, hints, add buttons
    const cityOptions = trip.cities.map(id => { const c = cityById(id); return c ? `<option value="${esc(c.id)}"${c.id === (city && city.id) ? ' selected' : ''}>${esc(c.name)}</option>` : ''; }).join('');
    const locked = mine.length > 0;
    html += `
      <section id="vt-day-panel" class="space-y-3" data-day-id="${day.id}">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-black text-slate-800 shrink-0">${day.id === 0 ? 'Day 0: Travel &amp; Arrival' : 'Day ' + day.id}</h2>
          <div class="relative min-w-0">
            <select id="vt-day-city" aria-label="City for this day" ${locked ? 'disabled title="Remove this day\'s steps to change its city"' : ''}
              class="appearance-none bg-white border border-slate-200 rounded-lg pl-2.5 pr-7 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${locked ? 'opacity-70' : 'cursor-pointer'}">${cityOptions}</select>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"></i>
          </div>
          ${days.length > 1 ? `<button type="button" id="btn-vt-remove-day" class="ml-auto ${btn} text-slate-400 hover:text-rose-600">Remove day</button>` : ''}
        </div>`;

    if (mine.length) {
      html += `<div class="relative">${mine.map((st, k) => KYT.ui.renderStepCard(st, { variant: 'builder', isFirst: k === 0, isLast: k === mine.length - 1 })).join('')}</div>`;
    } else {
      html += `<p id="vt-day-empty" class="text-xs text-slate-500 bg-white/70 border border-dashed border-slate-300 rounded-xl px-3.5 py-3">Nothing planned for this day yet. Pick from the suggestions below, or add your own.</p>`;
    }

    html += KYT.ui.renderAccessNote(city, 'vt-day-access');

    const hints = dayHints(trip, day);
    if (hints.length) {
      html += `<div id="vt-day-hints" class="space-y-1.5">` + hints.map(h => `
        <button type="button" ${h.data} class="w-full flex items-center gap-2.5 text-left px-3 py-2 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 transition-colors cursor-pointer">
          <i data-lucide="${h.icon}" class="w-4 h-4 text-indigo-500 shrink-0"></i>
          <span class="flex-1 min-w-0 text-xs font-bold text-indigo-900">${esc(h.text)}${h.sub ? ` <span class="font-medium text-indigo-500">· ${esc(h.sub)}</span>` : ''}</span>
          <span class="text-[11px] font-bold text-indigo-600 shrink-0">Add +</span>
        </button>`).join('') + `</div>`;
    }

    html += `
        <div class="flex flex-wrap gap-1.5">
          <button type="button" id="btn-vt-add-own" class="${btn} bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 inline-flex items-center gap-1"><i data-lucide="plus" class="w-3 h-3"></i> Add your own stop</button>
          <button type="button" id="btn-vt-add-travel" class="${btn} bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"><i data-lucide="route" class="w-3 h-3"></i> Add travel</button>
          <button type="button" id="btn-vt-add-stay" class="${btn} bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"><i data-lucide="bed-double" class="w-3 h-3"></i> Add a stay</button>
        </div>`;

    // 4. Suggestions for this day's city, in the chosen style
    const sg = suggestionsFor(trip, day.id);
    const row = (b, i) => {
      const effort = EFFORT_LABEL[b.mobility] || '';
      const diet = Array.isArray(b.diet) && !b.diet.includes('any') ? b.diet.map(x => ({ veg: 'Veg', jain: 'Jain', satvik: 'No onion-garlic' }[x] || x)).join(' / ') : '';
      const badge = t => `<span class="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">${esc(t)}</span>`;
      return `
        <div class="flex items-start gap-2.5 p-3 bg-white rounded-xl border border-slate-100">
          <div class="p-1.5 bg-slate-50 text-slate-500 rounded-lg shrink-0"><i data-lucide="${esc(b.icon || 'map-pin')}" class="w-4 h-4"></i></div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-slate-800 leading-tight">${esc(b.title)}</p>
            <div class="flex flex-wrap items-center gap-1 mt-1">${badge(TIME_OF_DAY(b.hour != null ? b.hour : 10))}${effort ? badge(effort) : ''}${diet ? badge(diet) : ''}</div>
            ${b.notes ? `<p class="text-[11px] text-slate-500 leading-snug mt-1 line-clamp-2">${esc(b.notes)}</p>` : ''}
          </div>
          <button type="button" data-add-beat="${i}" class="shrink-0 ${btn} bg-blue-600 text-white hover:bg-blue-700" aria-label="Add ${esc(b.title)}">Add +</button>
        </div>`;
    };
    const t = trip.taste || DEFAULT_TASTE;
    const styleLine = ['intent', 'diet', 'pace'].map(k => (TASTE_FIELDS[k].find(o => o.id === t[k]) || {}).label).filter(Boolean).join(' · ');
    html += `
        <div class="pt-1">
          <p class="text-xs font-black uppercase text-slate-700 tracking-wider">${city ? 'Things to do in ' + esc(city.name) : 'Suggestions'}</p>
          <button type="button" id="btn-vt-style-toggle" class="mt-1 mb-2 -ml-1 ${btn} text-slate-500 hover:text-blue-600 inline-flex items-center gap-1" aria-expanded="${styleOpen}"><i data-lucide="sliders" class="w-3 h-3"></i> Sorted for ${esc(styleLine)} · ${styleOpen ? 'Hide' : 'Change'}</button>
          ${styleOpen ? `<div id="vt-taste" class="space-y-3 bg-white rounded-xl border border-slate-100 p-3 mb-2">${Object.keys(TASTE_FIELDS).map(key => {
            const info = TASTE_INFO[key];
            const cur = TASTE_FIELDS[key].find(o => o.id === t[key]);
            return `<div><div class="flex items-baseline justify-between gap-2 mb-1.5"><span class="text-[11px] font-black uppercase tracking-wider text-slate-500">${info.title}</span><span class="text-[11px] text-slate-400 text-right">${cur && info.hints[cur.id] ? info.hints[cur.id] : ''}</span></div>
              <div class="flex gap-1.5 flex-wrap">${TASTE_FIELDS[key].map(o => `<button type="button" data-field="${key}" data-id="${o.id}" aria-pressed="${t[key] === o.id}"
                class="vt-chip px-3 py-1.5 rounded-full text-xs whitespace-nowrap cursor-pointer ${t[key] === o.id ? 'bg-blue-600 text-white font-bold shadow-sm' : 'bg-white text-slate-600 border border-slate-200 font-medium hover:bg-slate-50'}">${o.label}</button>`).join('')}</div></div>`;
          }).join('')}<p class="text-[11px] text-slate-400">Style only sorts the suggestions. Nothing is hidden.</p></div>` : ''}
          <div id="vt-suggestions" class="space-y-2">
            ${sg.all.length ? sg.fits.map((b, i) => row(b, i)).join('') +
              (sg.fits.length && sg.others.length ? `<p class="text-[11px] font-black uppercase tracking-wider text-slate-400 pt-1">More in ${esc(city.name)}</p>` : '') +
              sg.others.map((b, i) => row(b, sg.fits.length + i)).join('')
              : `<p class="text-xs text-slate-500 bg-white/70 border border-dashed border-slate-300 rounded-xl px-3.5 py-3">${city ? 'Everything we list for ' + esc(city.name) + ' is already in your plan.' : 'Choose a city for this day.'} Add your own stops above.</p>`}
          </div>
        </div>
      </section>`;

    // 5. Bottom bar: while a day is still empty the next step is that day; viewing and starting the trip wait until every day has something
    const planDays = days.filter(d => d.id >= 1).length;
    const emptyPlanDays = days.filter(d => d.id >= 1 && stepsOfDay(trip, d.id).length === 0);
    const nextEmpty = emptyPlanDays.find(d => d.id > day.id && d.id !== day.id) || emptyPlanDays.find(d => d.id !== day.id) || emptyPlanDays[0];
    const summary = `<p class="flex-1 min-w-0 text-xs text-slate-500 leading-snug"><strong class="text-slate-800">${totalSteps} ${totalSteps === 1 ? 'activity' : 'activities'}</strong> · ${planDays} day${planDays > 1 ? 's' : ''}${emptyPlanDays.length ? ` · ${emptyPlanDays.length} to plan` : ''}</p>`;
    const barCls = 'sticky bottom-0 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-t border-slate-200 mt-4 flex items-center gap-3 z-10';
    const primary = 'shrink-0 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer';
    if (nextEmpty && mine.length === 0) {
      html += `<div id="vt-bottom-bar" class="${barCls}">${summary}</div>`;
    } else if (nextEmpty) {
      html += `
      <div id="vt-bottom-bar" class="${barCls}">${summary}
        <button type="button" id="btn-vt-next-day" data-day-id="${nextEmpty.id}" class="${primary}">Plan Day ${nextEmpty.id}<i data-lucide="arrow-right" class="w-4 h-4"></i></button>
      </div>`;
    } else {
      html += `
      <div id="vt-bottom-bar" class="${barCls}">${summary}
        <button type="button" onclick="KYT.virtualTrips.useAsMyTrip('${esc(trip.id)}')"
           class="shrink-0 text-xs font-bold text-slate-500 hover:text-blue-700 underline underline-offset-2 cursor-pointer px-1 py-2">Start this trip</button>
        <button type="button" id="btn-vt-view-trip" class="${primary}"><i data-lucide="eye" class="w-4 h-4"></i>View trip</button>
      </div>`;
    }

    DOM.itineraryListRoot.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  }

  /** One delegated handler for everything inside the Day Plan. */
  function onBuilderClick(e) {
    const trip = getActiveTrip();
    if (!trip) return;
    const t = e.target;
    const q = sel => t.closest(sel);
    const nextDayBtn = q('#btn-vt-next-day');
    if (nextDayBtn) { activeDayId = Number(nextDayBtn.dataset.dayId); renderBuilder(); const sc = document.getElementById('vt-screen-builder'); if (sc) sc.scrollTop = 0; return; }
    if (q('#btn-vt-view-trip')) { window.location.href = `trip_detail.html?id=${encodeURIComponent(trip.id)}`; return; }
    const dayTab = q('[data-day-id][role="tab"]');
    if (dayTab) { activeDayId = Number(dayTab.dataset.dayId); renderBuilder(); return; }
    if (q('#btn-vt-add-day')) {
      const days = sortedDays(trip);
      const last = days[days.length - 1];
      activeDayId = addDay(trip, last ? last.cityId : trip.cities[0]);
      saveVTrips(); renderBuilder(); return;
    }
    if (q('#btn-vt-remove-day')) {
      const n = stepsOfDay(trip, activeDayId).length;
      if (n && !confirm(`Remove Day ${activeDayId} and its ${n} step${n > 1 ? 's' : ''}?`)) return;
      removeDay(trip, activeDayId);
      if (!trip.steps || !trip.steps.length) trip.steps = null;
      activeDayId = null; saveVTrips(); renderBuilder(); return;
    }
    if (q('#btn-vt-edit-setup')) { openCanvas(trip.id); return; }
    if (q('#btn-vt-suggest')) { suggestPlan(trip); saveVTrips(); renderBuilder(); return; }
    if (q('#btn-vt-reset-plan')) {
      if (confirm('Clear every stop, stay and travel step from this plan? Your cities and days stay.')) {
        trip.steps = null; trip.suggested = false; saveVTrips(); renderBuilder();
      }
      return;
    }
    if (q('#btn-vt-add-own')) { openStepEditor({ mode: 'add', kind: 'stop', dayId: activeDayId }); return; }
    if (q('#btn-vt-add-travel')) {
      const c = dayCity(trip, activeDayId);
      openStepEditor({ mode: 'add', kind: 'travel', dayId: activeDayId, prefill: { to: c ? c.name : '' } });
      return;
    }
    if (q('#btn-vt-add-stay')) { openStepEditor({ mode: 'add', kind: 'stay', dayId: activeDayId }); return; }
    if (q('#btn-vt-style-toggle')) { styleOpen = !styleOpen; renderBuilder(); return; }
    const chip = q('#vt-taste .vt-chip');
    if (chip) { trip.taste[chip.dataset.field] = chip.dataset.id; saveVTrips(); renderBuilder(); return; }
    const addBeat = q('[data-add-beat]');
    if (addBeat) { addBeatStep(trip, activeDayId, Number(addBeat.dataset.addBeat)); return; }
    const hint = q('[data-hint]');
    if (hint) {
      if (hint.dataset.hint === 'stay') { addStayStep(trip, activeDayId); return; }
      const km = hint.dataset.km === '' ? null : Number(hint.dataset.km);
      openStepEditor({
        mode: 'add', kind: 'travel', dayId: activeDayId,
        prefill: { from: hint.dataset.from, to: hint.dataset.to, mode: km != null && km > 700 ? 'flight' : (km != null && (km > 350 || hint.dataset.overnight === '1') ? 'train' : 'road'),
          hour: hint.dataset.hour ? Number(hint.dataset.hour) : 9, overnight: hint.dataset.overnight === '1' }
      });
    }
  }
  function onBuilderChange(e) {
    const trip = getActiveTrip();
    if (!trip) return;
    if (e.target.id === 'vt-day-city') {
      const d = trip.days.find(x => x.id === activeDayId);
      if (d) { d.cityId = e.target.value; saveVTrips(); renderBuilder(); }
    }
  }

  function editCanvas() {
    openCanvas(currentTripId);
  }

  // ─── Navigation & City Detail Slide-Over Delegation ───────────────────────────
  function openView() { window.location.href = 'virtual_trip.html'; }
  function closeView() { window.location.href = 'index.html'; }

  function openCityDetail(cityId, pushHistory = true) {
    KYT.ui.cityDetail.open(cityId, pushHistory, {
      mode: 'add',
      isCityAdded: (cId) => {
        const trip = getActiveTrip();
        return Boolean(trip && trip.cities.includes(cId));
      },
      onPrimaryAction: (cId) => {
        const tripToUse = ensureActiveTrip();
        if (addCityToTrip(tripToUse, cId)) {
          saveVTrips();
          if (DOM.citySearchInput) DOM.citySearchInput.value = '';
          renderCanvas();
        }
      }
    });
  }

  function closeCityDetail(pushHistory = true) {
    KYT.ui.cityDetail.close(pushHistory);
  }

  function addNearby(cityId) {
    const trip = ensureActiveTrip();
    if (addCityToTrip(trip, cityId)) {
      saveVTrips();
      renderCanvas();

      const currentCityId = document.getElementById('cd-title')?.dataset.cityId;
      if (currentCityId) {
        openCityDetail(currentCityId, false);
      }
    }
  }

  const tasteCodeMap = {
    intent: { mixed: 'm', spiritual: 's', nature: 'n', cultural: 'c', adventure: 'a', culinary: 'u' },
    diet: { any: 'a', veg: 'v', jain: 'j', satvik: 'k' },
    pace: { short: 'h', standard: 's', deep: 'd', relaxed: 'r', fast: 'f' }
  };
  const reverseTasteCodeMap = {
    intent: { m: 'mixed', s: 'spiritual', n: 'nature', c: 'cultural', a: 'adventure', u: 'culinary' },
    diet: { a: 'any', v: 'veg', j: 'jain', k: 'satvik' },
    pace: { h: 'short', s: 'standard', d: 'deep', r: 'relaxed', f: 'fast' }
  };

  function encodeTaste(taste) {
    return (tasteCodeMap.intent[taste.intent] || 'm') +
      (tasteCodeMap.diet[taste.diet] || 'a') +
      (tasteCodeMap.pace[taste.pace] || 's');
  }

  function decodeTaste(code) {
    if (!code || code.length !== 3) return ['mixed', 'any', 'standard'];
    return [
      reverseTasteCodeMap.intent[code[0]] || 'mixed',
      reverseTasteCodeMap.diet[code[1]] || 'any',
      reverseTasteCodeMap.pace[code[2]] || 'standard'
    ];
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    vtrips = loadVTrips();

    if (DOM.btnClose) DOM.btnClose.addEventListener('click', closeView);

    const btnOpen = document.getElementById('btn-open-virtual-trips');
    if (btnOpen) {
      const fresh = btnOpen.cloneNode(true);
      btnOpen.replaceWith(fresh);
      fresh.addEventListener('click', openView);
    }

    // ── Hub ──
    if (DOM.newNameInput) DOM.newNameInput.addEventListener('input', () => DOM.newNameInput.classList.remove('ring-2', 'ring-red-400'));
    if (DOM.btnCreate) DOM.btnCreate.addEventListener('click', createNewTrip);
    if (DOM.newNameInput) {
      DOM.newNameInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') createNewTrip();
      });
    }

    if (DOM.listRoot) {
      DOM.listRoot.addEventListener('click', e => {
        const delBtn = e.target.closest('.btn-del-vt');
        if (delBtn) { e.stopPropagation(); deleteTrip(delBtn.dataset.id); return; }
        const card = e.target.closest('.vt-card');
        if (card) {
          const trip = vtrips.find(t => t.id === card.dataset.id);
          if (trip && (!trip.steps || trip.steps.length === 0)) {
            openCanvas(trip.id);
          } else {
            window.location.href = 'trip_detail.html?id=' + card.dataset.id;
          }
        }
      });
    }

    // ── Canvas ──
    if (DOM.editNameInput) {
      DOM.editNameInput.addEventListener('change', e => {
        const trip = getActiveTrip();
        if (trip) { trip.name = e.target.value.trim() || 'Untitled Trip'; saveVTrips(); }
      });
    }

    if (DOM.originCitySelect) {
      DOM.originCitySelect.addEventListener('change', e => {
        const trip = getActiveTrip();
        if (trip) {
          trip.originCity = e.target.value;
          rememberOrigin(trip.originCity);
          DOM.originCitySelect.classList.remove('ring-2', 'ring-rose-300', 'border-rose-500');
          updateOriginDesc(trip);
          saveVTrips();
        }
      });
    }

    // Destinations: Continue collapses the picker into the route; Add or reorder opens it again.
    const btnDestDone = document.getElementById('btn-vt-dest-done');
    if (btnDestDone) {
      btnDestDone.addEventListener('click', () => {
        pickerOpen = false;
        renderCanvas();
        DOM.screenCanvas.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    const btnDestEdit = document.getElementById('btn-vt-dest-edit');
    if (btnDestEdit) {
      btnDestEdit.addEventListener('click', () => {
        pickerOpen = true;
        renderCanvas();
        const picker = document.getElementById('vt-picker');
        if (picker) picker.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    }


    // Add / edit a stop
    const stepModal = stepModalEl();
    if (stepModal) {
      stepModal.addEventListener('click', e => { if (e.target === stepModal) closeStepEditor(); });
      const bindClick = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
      bindClick('btn-close-step-modal', closeStepEditor);
      bindClick('btn-cancel-step-modal', closeStepEditor);
      bindClick('btn-save-vt-step', saveStepEditor);
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !stepModal.classList.contains('hidden')) closeStepEditor(); });
      const titleInput = document.getElementById('vt-step-title');
      if (titleInput) {
        titleInput.addEventListener('input', () => document.getElementById('vt-step-error').classList.add('hidden'));
        titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveStepEditor(); } });
      }
      ['vt-travel-mode'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('change', updateTravelHint); });
      const overnightEl = document.getElementById('vt-travel-overnight');
      if (overnightEl) overnightEl.addEventListener('change', () => {
        const t = document.getElementById('vt-step-time');
        if (overnightEl.checked && t && t.value && Number(t.value.slice(0, 2)) < 17) t.value = '21:00';
      });
      ['vt-travel-from', 'vt-travel-to'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => { document.getElementById('vt-step-error').classList.add('hidden'); updateTravelHint(); });
        el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveStepEditor(); } });
      });
    }

    // The Day Plan: one delegated click and change handler
    if (DOM.itineraryListRoot) {
      DOM.itineraryListRoot.addEventListener('click', onBuilderClick);
      DOM.itineraryListRoot.addEventListener('change', onBuilderChange);
    }


    if (DOM.selectedCitiesRoot) {
      DOM.selectedCitiesRoot.addEventListener('click', e => {
        const leftBtn = e.target.closest('.btn-move-city-left');
        if (leftBtn) {
          e.stopPropagation();
          const idx = parseInt(leftBtn.dataset.index, 10);
          const trip = getActiveTrip();
          if (trip && idx > 0) {
            swapCities(trip, idx - 1, idx);
            saveVTrips();
            renderCanvas();
          }
          return;
        }

        const rightBtn = e.target.closest('.btn-move-city-right');
        if (rightBtn) {
          e.stopPropagation();
          const idx = parseInt(rightBtn.dataset.index, 10);
          const trip = getActiveTrip();
          if (trip && idx < trip.cities.length - 1) {
            swapCities(trip, idx, idx + 1);
            saveVTrips();
            renderCanvas();
          }
          return;
        }

        const delBtn = e.target.closest('.btn-del-city');
        if (delBtn) {
          e.stopPropagation();
          const trip = getActiveTrip();
          if (trip) {
            ensureDays(trip);
            const doomed = trip.days.filter(d => d.cityId === delBtn.dataset.id).reduce((n, d) => n + stepsOfDay(trip, d.id).length, 0);
            if (doomed && !confirm(`Remove this city and the ${doomed} step${doomed > 1 ? 's' : ''} planned in it?`)) return;
            removeCityFromTrip(trip, delBtn.dataset.id);
            saveVTrips();
            renderCanvas();
          }
          return;
        }

        const cityChip = e.target.closest('.vt-selected-city-chip');
        if (cityChip) {
          openCityDetail(cityChip.dataset.cityId);
        }
      });
    }

    if (DOM.citySearchInput) {
      DOM.citySearchInput.addEventListener('input', () => renderCityLibrary());
    }

    if (DOM.cityListRoot) {
      DOM.cityListRoot.addEventListener('click', e => {
        const addBtn = e.target.closest('.btn-add-city');
        if (addBtn) {
          e.stopPropagation();
          const trip = getActiveTrip();
          if (trip && addCityToTrip(trip, addBtn.dataset.id)) {
            saveVTrips();
            if (DOM.citySearchInput) DOM.citySearchInput.value = '';
            renderCanvas();
          }
          return;
        }

        const cityCard = e.target.closest('article[data-city-id]');
        if (cityCard && !e.target.closest('.vt-attraction-pill') && !e.target.closest('.vt-attraction-detail') && !e.target.closest('a:not(.city-videos-link)')) {
          openCityDetail(cityCard.dataset.cityId);
        }
      });
    }

    // ── City Detail Slide-Over Events ──
    const btnCloseCD = document.getElementById('btn-close-city-detail');
    if (btnCloseCD) {
      btnCloseCD.addEventListener('click', () => closeCityDetail(true));
    }

    const btnBackCD = document.getElementById('btn-back-city-detail');
    if (btnBackCD) {
      btnBackCD.addEventListener('click', () => window.history.back());
    }

    const cdOverlay = document.getElementById('city-detail-overlay');
    if (cdOverlay) {
      cdOverlay.addEventListener('click', (e) => {
        if (e.target === cdOverlay) closeCityDetail(true);
      });
    }

    const nearbyListEl = document.getElementById('cd-nearby-list');
    if (nearbyListEl) {
      nearbyListEl.addEventListener('click', (e) => {
        const addNearbyBtn = e.target.closest('.btn-nearby-add');
        if (addNearbyBtn) {
          e.stopPropagation();
          addNearby(addNearbyBtn.dataset.nearbyAdd);
          return;
        }
        const nCard = e.target.closest('[data-nearby-id]');
        if (nCard) {
          openCityDetail(nCard.dataset.nearbyId, true);
        }
      });
    }

    if (DOM.btnBuild) {
      DOM.btnBuild.addEventListener('click', () => {
        const trip = getActiveTrip();
        if (!trip) return;
        if (!trip.originCity && DOM.originCitySelect) {
          // Never guess where the traveller is starting from.
          // Say plainly what is missing, on the field itself: red outline, a short shake and a red line
          // under it that stays until a start is chosen.
          DOM.originCitySelect.classList.remove('border-amber-400');
          DOM.originCitySelect.classList.add('ring-2', 'ring-rose-300', 'border-rose-500');
          DOM.originCitySelect.classList.remove('vt-shake'); void DOM.originCitySelect.offsetWidth; DOM.originCitySelect.classList.add('vt-shake');
          if (DOM.originDesc) {
            DOM.originDesc.textContent = 'Choose where you start from to plan the days';
            DOM.originDesc.classList.remove('italic', 'text-slate-400');
            DOM.originDesc.classList.add('text-rose-600', 'font-semibold');
          }
          DOM.originCitySelect.scrollIntoView({ block: 'center', behavior: 'smooth' });
          DOM.originCitySelect.focus();
          return;
        }
        // Straight to the Day Plan: one tab per day, nothing generated unless asked for.
        openBuilder();
      });
    }

    const btnShareTrip = document.getElementById('btn-share-trip');
    if (btnShareTrip) {
      btnShareTrip.addEventListener('click', () => shareCurrentTrip());
    }

    const btnShareCity = document.getElementById('btn-share-city');
    if (btnShareCity) {
      btnShareCity.addEventListener('click', () => {
        const titleEl = document.getElementById('cd-title');
        const cityId = titleEl?.dataset.cityId;
        if (!cityId) return;

        const url = new URL(window.location.href);
        url.pathname = url.pathname.replace(/\/[^\/]*$/, '/virtual_trip.html');
        url.searchParams.set('city', cityId);

        const shareData = {
          title: `Check out ${titleEl.textContent} on KYT`,
          text: `Explore ${titleEl.textContent} and plan your virtual trip!`,
          url: url.toString()
        };

        if (navigator.share) {
          navigator.share(shareData).catch(err => console.log('Error sharing:', err));
        } else {
          navigator.clipboard.writeText(url.toString())
            .then(() => alert('Link copied to clipboard!'))
            .catch(err => console.error('Error copying link:', err));
        }
      });
    }

    window.addEventListener('popstate', () => {
      const p = new URLSearchParams(window.location.search);
      const cId = p.get('city');
      if (cId) {
        openCityDetail(cId, false);
      } else {
        closeCityDetail(false);
      }
    });

    const params = new URLSearchParams(window.location.search);
    const sharedCity = params.get('city');
    const sharedCities = params.get('cities');
    const sharedTripName = params.get('trip');
    const sharedTaste = params.get('taste');
    const localTripId = params.get('id');

    if (window.location.pathname.includes('virtual_trip.html')) {
      openHub();

      let activeTripId = localTripId;
      const aiParam = params.get('ai');
      if (aiParam && (!activeTripId || !vtrips.some(t => t.id === activeTripId))) {
        try {
          const aiData = (window.KYT && KYT.ui && KYT.ui.decodeAiTrip) ? KYT.ui.decodeAiTrip(aiParam) : null;
          if (aiData) {
            const importedVTrip = KYT.ui.convertCuratedTripToVirtual(aiData, activeTripId || ('ai_' + Date.now().toString(36)));
            if (importedVTrip) {
              importedVTrip.isAiRefined = true;
              vtrips.unshift(importedVTrip);
              saveVTrips();
              activeTripId = importedVTrip.id;
            }
          }
        } catch(e) {}
      }

      const screenParam = params.get('screen');
      if (activeTripId && vtrips.some(t => t.id === activeTripId)) {
        const url = new URL(window.location.href);
        url.searchParams.delete('id');
        url.searchParams.delete('ai');
        url.searchParams.delete('screen');
        window.history.replaceState({}, '', url.toString());

        setTimeout(() => {
          currentTripId = activeTripId;
          const targetTrip = vtrips.find(t => t.id === activeTripId);
          if (screenParam === 'builder') {
            openBuilder();
          } else if (screenParam === 'canvas') {
            openCanvas(activeTripId);
          } else if (targetTrip && targetTrip.steps && targetTrip.steps.length > 0) {
            openBuilder();
          } else {
            openCanvas(activeTripId);
          }
        }, 50);
      } else if (sharedCities) {
        try {
          if (!confirm(`Do you want to import the shared trip: "${sharedTripName || 'Shared Trip'}"?`)) {
            const url = new URL(window.location.href);
            url.searchParams.delete('trip');
            url.searchParams.delete('cities');
            url.searchParams.delete('taste');
            url.searchParams.delete('curated');
            url.searchParams.delete('origin');
            url.searchParams.delete('days');
            window.history.replaceState({}, '', url.toString());
            return;
          }
          const sharedCurated = params.get('curated');
          const sharedOrigin = params.get('origin');
          const sharedDays = parseInt(params.get('days'), 10);
          const tasteParts = sharedTaste && sharedTaste.length === 3 ? decodeTaste(sharedTaste) : (sharedTaste ? sharedTaste.split('|') : ['mixed', 'any', 'standard']);
          const fullCities = sharedCities.split(',').map(code => {
            const c = KYT.ui.resolveCity(code);
            return c ? c.id : code;
          });

          const resolvedOrigin = (sharedOrigin === '0' || sharedOrigin === 'already_there')
            ? 'already_there'
            : (((window.KYT && KYT.ui && KYT.ui.resolveCity) ? KYT.ui.resolveCity(sharedOrigin)?.id : null) || sharedOrigin || 'already_there');
          const resolvedDuration = (!isNaN(sharedDays) && sharedDays > 0) ? sharedDays : fullCities.length;

          let newTrip = null;
          const curatedObj = (sharedCurated && window.KYT_CURATED_TRIPS)
            ? window.KYT_CURATED_TRIPS.find(t => t.id === sharedCurated)
            : null;

          if (curatedObj) {
            newTrip = KYT.ui.convertCuratedTripToVirtual(curatedObj, Date.now().toString());
            if (sharedTripName) newTrip.name = sharedTripName;
            newTrip.cities = fullCities;
            if (sharedOrigin) newTrip.originCity = resolvedOrigin;
            if (!isNaN(sharedDays) && sharedDays > 0) newTrip.duration = sharedDays;
            if (sharedTaste) {
              newTrip.taste = {
                intent: tasteParts[0] || newTrip.taste.intent,
                diet: tasteParts[1] || newTrip.taste.diet,
                pace: tasteParts[2] || newTrip.taste.pace
              };
            }
            if (Array.isArray(curatedObj.cities)) {
              const extraCities = fullCities.filter(c => !curatedObj.cities.includes(c));
              extraCities.forEach(extraC => {
                ensureDays(newTrip);
                addDay(newTrip, extraC);
              });
            }
          } else {
            newTrip = {
              id: Date.now().toString(),
              name: sharedTripName || 'Shared Trip',
              originCity: resolvedOrigin,
              duration: resolvedDuration,
              cities: fullCities,
              taste: {
                intent: tasteParts[0] || 'mixed',
                diet: tasteParts[1] || 'any',
                pace: tasteParts[2] || 'standard'
              },
              steps: null,
              curatedId: ''
            };
          }

          vtrips.push(newTrip);
          saveVTrips();

          const url = new URL(window.location.href);
          url.searchParams.delete('trip');
          url.searchParams.delete('cities');
          url.searchParams.delete('taste');
          url.searchParams.delete('curated');
          url.searchParams.delete('origin');
          url.searchParams.delete('days');
          window.history.replaceState({}, '', url.toString());

          currentTripId = newTrip.id;
          if (newTrip.steps && newTrip.steps.length > 0) {
            openBuilder();
          } else {
            openCanvas(newTrip.id);
          }
        } catch (e) {
          console.error("Failed to parse shared trip", e);
        }
      }
    }

    if (sharedCity) {
      setTimeout(() => {
        openCityDetail(sharedCity, false);
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /** Make this plan the live trip. The shared flow asks for the start date; it is never assumed. */
  async function useAsMyTrip(tripId) {
    const trip = vtrips.find(t => t.id === tripId);
    if (!trip) return;
    await KYT.ui.startTripLive(trip);
  }

  const api = {
    open: openView,
    close: closeView,
    editCanvas,
    openBuilder,
    expandAttractionDetail,
    openCityDetail,
    addNearby,
    useAsMyTrip,
    generateSteps,
    suggestPlan
  };

  if (window.KYT) window.KYT.virtualTrips = api;

  return api;
})();