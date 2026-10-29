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
    tasteRoot: document.getElementById('vt-taste'),
    selectedCitiesRoot: document.getElementById('vt-selected-cities'),
    emptyCitiesMsg: document.getElementById('vt-empty-cities'),
    btnBuild: document.getElementById('btn-vt-build'),
    citySearchInput: document.getElementById('vt-city-search'),
    cityListRoot: document.getElementById('vt-city-list'),

    // Stay Modal
    stayModal: document.getElementById('vt-stay-modal'),
    stayModalDialog: document.getElementById('vt-stay-modal-dialog'),
    btnCloseStayModal: document.getElementById('btn-close-stay-modal'),
    btnCancelStayModal: document.getElementById('btn-cancel-stay-modal'),
    btnConfirmStayModal: document.getElementById('btn-modal-confirm-build'),
    modalDurationVal: document.getElementById('vt-modal-duration-val'),
    modalDurationHint: document.getElementById('vt-modal-duration-hint'),
    btnModalDurationMinus: document.getElementById('btn-modal-duration-minus'),
    btnModalDurationPlus: document.getElementById('btn-modal-duration-plus'),
    modalNightStaysList: document.getElementById('vt-modal-night-stays-list'),

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
  function getActiveTrip() { return vtrips.find(t => t.id === currentTripId); }
  function ensureActiveTrip() {
    let trip = getActiveTrip();
    if (!trip) {
      trip = {
        id: Date.now().toString(),
        name: 'My Trip',
        originCity: getRememberedOrigin(),
        cities: [],
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

  // "From Mumbai · 3 days · Mixed · Any food · Standard", shown on the plan screen
  function tripSummaryText(trip) {
    const nameOf = id => { const c = window.KYT_CITIES && window.KYT_CITIES.find(x => x.id === id); return c ? c.name : id; };
    const parts = [];
    if (trip.originCity === '0' || trip.originCity === 'already_there') parts.push('Starts in the destination');
    else if (trip.originCity) parts.push('From ' + nameOf(trip.originCity));
    const d = trip.duration || (trip.cities && trip.cities.length) || 1;
    parts.push(`${d} day${d > 1 ? 's' : ''}`);
    ['intent', 'diet', 'pace'].forEach(k => {
      const o = (TASTE_FIELDS[k] || []).find(x => x.id === (trip.taste || {})[k]);
      if (o) parts.push(o.label);
    });
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
        // On the plan, "back" is the trip (setup is one tap away inside the plan); on setup it is the plan
        // if there is one, else My Trips.
        if (subnavBackLabel) subnavBackLabel.textContent = (hasPlan || screen === 'builder') ? 'View Trip' : 'My Trips';
        if (subnavBack) {
          subnavBack.onclick = (e) => {
            e.preventDefault();
            if (trip && (hasPlan || screen === 'builder')) {
              window.location.href = `trip_detail.html?id=${encodeURIComponent(trip.id)}`;
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

  function sanitizeOrRegenerateSteps(trip) {
    if (!trip || !trip.steps || trip.steps.length === 0) return;
    // Preserve curated trip blueprints and AI-refined trips without overwriting them
    if (trip.curatedId || (trip.id && trip.id.startsWith('ai_')) || trip.isAiRefined) return;

    const days = {};
    trip.steps.forEach(s => {
      const d = s.dayId != null ? s.dayId : 1;
      if (!days[d]) days[d] = [];
      days[d].push(s);
    });

    let needsRegen = false;
    Object.keys(days).forEach(dId => {
      if (Number(dId) > 1) {
        const travelIdx = days[dId].findIndex(s => s.phase === 'Morning' && s.title && (s.title.startsWith('Travel to ') || s.title.startsWith('Day Excursion:')));
        if (travelIdx > 0) {
          needsRegen = true;
        }
      }
    });

    if (needsRegen) {
      trip.steps = generateSteps(trip);
      saveVTrips();
    }
  }

  window.regenerateVirtualTripSteps = function () {
    const trip = getActiveTrip();
    if (!trip) return;
    trip.steps = generateSteps(trip);
    saveVTrips();
    renderBuilder();
  };

  function openBuilder() {
    const trip = getActiveTrip();
    if (trip) sanitizeOrRegenerateSteps(trip);
    renderBuilder();
    showScreen('builder');
  }

  // --- Duration & Stay Modal ---
  function openStayModal() {
    const trip = getActiveTrip();
    if (!trip || !trip.cities || trip.cities.length === 0) {
      alert("Please add at least one city first.");
      return;
    }
    const modal = document.getElementById('vt-stay-modal');
    const dialog = document.getElementById('vt-stay-modal-dialog');
    if (!modal) return;

    trip.duration = trip.duration || trip.cities.length || 1;
    saveVTrips();

    renderStayModal();

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
      modal.classList.remove('opacity-0');
      if (dialog) {
        dialog.classList.remove('scale-95');
        dialog.classList.add('scale-100');
      }
    });
  }

  function closeStayModal() {
    const modal = document.getElementById('vt-stay-modal');
    const dialog = document.getElementById('vt-stay-modal-dialog');
    if (!modal) return;

    modal.classList.add('opacity-0');
    if (dialog) {
      dialog.classList.add('scale-95');
      dialog.classList.remove('scale-100');
    }
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 200);
    // Days or stays may have changed: bring the Days row and the header up to date.
    const trip = getActiveTrip();
    if (trip && currentScreen === 'canvas') {
      renderStaysSummary(trip);
    }
  }

  window.openStayModal = openStayModal;
  window.closeStayModal = closeStayModal;

  function renderStayModal() {
    const trip = getActiveTrip();
    if (!trip) return;

    const durationVal = document.getElementById('vt-modal-duration-val');
    const durationHint = document.getElementById('vt-modal-duration-hint');
    const listRoot = document.getElementById('vt-modal-night-stays-list');

    trip.duration = trip.duration || trip.cities.length || 1;
    if (durationVal) durationVal.textContent = trip.duration;

    if (durationHint) {
      if (trip.duration === trip.cities.length) {
        durationHint.textContent = `${trip.duration} days for ${trip.cities.length} cities (1 day / city)`;
      } else if (trip.duration > trip.cities.length) {
        durationHint.textContent = `${trip.duration} days for ${trip.cities.length} cities (relaxed pacing)`;
      } else {
        durationHint.textContent = `${trip.duration} days for ${trip.cities.length} cities (packed pacing)`;
      }
    }

    if (!listRoot) return;

    if (!trip.nightStays) trip.nightStays = {};
    const activeCityObjs = trip.cities.map(cId => window.KYT_CITIES ? window.KYT_CITIES.find(c => c.id === cId) : null).filter(Boolean);

    let nightStaysHtml = '';
    for (let dayIdx = 0; dayIdx < trip.duration; dayIdx++) {
      const dayId = dayIdx + 1;
      const dayCity = activeCityObjs[dayIdx] || activeCityObjs[activeCityObjs.length - 1];
      if (!dayCity) continue;

      let prevStayId;
      if (dayIdx === 0) {
        prevStayId = (trip.originCity && trip.originCity !== 'already_there' && activeCityObjs[0] && trip.originCity === activeCityObjs[0].id) ? trip.originCity : (activeCityObjs[0]?.id || 'pune');
      } else {
        prevStayId = trip.nightStays[dayId - 1] || activeCityObjs[Math.min(dayIdx - 1, activeCityObjs.length - 1)]?.id;
      }

      if (!trip.nightStays[dayId]) {
        if (dayIdx === 0) {
          trip.nightStays[dayId] = dayCity.id;
        } else {
          const dist = (window.KYT_DISTANCE_MATRIX && window.KYT_DISTANCE_MATRIX[prevStayId]) ? window.KYT_DISTANCE_MATRIX[prevStayId][dayCity.id] : null;
          if (dist != null && dist <= 130 && prevStayId !== 'overnight_travel') {
            trip.nightStays[dayId] = prevStayId;
          } else {
            trip.nightStays[dayId] = dayCity.id;
          }
        }
      }

      const currentStay = trip.nightStays[dayId];
      const prevCityObj = window.KYT_CITIES ? window.KYT_CITIES.find(c => c.id === prevStayId) : null;
      const stayCityObj = window.KYT_CITIES ? window.KYT_CITIES.find(c => c.id === currentStay) : null;
      const stayCityName = stayCityObj ? stayCityObj.name : currentStay;

      let statusBadge = '';
      if (currentStay === 'overnight_travel') {
        statusBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md mt-1"><i data-lucide="moon" class="w-3 h-3 text-purple-600"></i> Overnight Travel</span>`;
      } else if (currentStay === prevStayId && dayCity.id !== prevStayId) {
        statusBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md mt-1"><i data-lucide="car" class="w-3 h-3 text-amber-600"></i> Day Excursion from ${prevCityObj ? prevCityObj.name : 'base'} (returns to ${prevCityObj ? prevCityObj.name : 'hotel'} for night)</span>`;
      } else if (currentStay === dayCity.id && dayCity.id !== prevStayId) {
        statusBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md mt-1"><i data-lucide="hotel" class="w-3 h-3 text-blue-600"></i> Move hotel: sleep in ${dayCity.name}</span>`;
      } else if (currentStay !== dayCity.id) {
        statusBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md mt-1"><i data-lucide="hotel" class="w-3 h-3 text-indigo-600"></i> Evening Transfer (Explore ${dayCity.name} → Sleep in ${stayCityName})</span>`;
      } else {
        statusBadge = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md mt-1"><i data-lucide="home" class="w-3 h-3 text-emerald-600"></i> Staying in ${dayCity.name}</span>`;
      }

      let selectOptions = activeCityObjs.map(c => {
        const selected = currentStay === c.id ? 'selected' : '';
        return `<option value="${c.id}" ${selected}>🏨 Stay in ${c.name}</option>`;
      }).join('');
      selectOptions += `<option value="overnight_travel" ${currentStay === 'overnight_travel' ? 'selected' : ''}>🌙 Overnight Travel</option>`;

      nightStaysHtml += `
        <div class="p-3 bg-white rounded-xl border border-slate-200 transition-all hover:border-slate-300 shadow-xs">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 shrink-0">Day ${dayId}</span>
              <span class="text-xs font-bold text-slate-800 truncate">${dayCity.name}</span>
            </div>
            <div class="relative shrink-0">
              <select data-day-id="${dayId}" class="vt-modal-night-stay-select text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-6 py-1.5 focus:ring-2 focus:ring-blue-500 cursor-pointer appearance-none hover:bg-slate-100 transition-colors">
                ${selectOptions}
              </select>
              <i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"></i>
            </div>
          </div>
          <div>${statusBadge}</div>
        </div>
      `;
    }

    listRoot.innerHTML = nightStaysHtml;
    if (window.lucide) lucide.createIcons();
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

  // "2 days · stay in Jaipur, Udaipur" for the Days row
  function renderStaysSummary(trip) {
    const el = document.getElementById('vt-stays-summary');
    if (!el) return;
    const days = trip.duration || (trip.cities && trip.cities.length) || 1;
    const nameOf = (id) => {
      if (id === 'overnight_travel') return 'overnight travel';
      const c = window.KYT_CITIES ? window.KYT_CITIES.find(x => x.id === id) : null;
      return c ? c.name : id;
    };
    let ids;
    if (trip.nightStays && Object.keys(trip.nightStays).length) {
      ids = Object.keys(trip.nightStays).map(Number).filter(d => d >= 1 && d <= days).sort((a, b) => a - b).map(d => trip.nightStays[d]);
    } else {
      ids = (trip.cities || []).slice(0, days);
    }
    const names = [...new Set(ids.map(nameOf))];
    el.textContent = `${days} day${days > 1 ? 's' : ''}` + (names.length ? ` · stay in ${names.join(', ')}` : '');
  }

  // --- Rendering Canvas ---
  function renderCanvas() {
    const trip = getActiveTrip();
    if (!trip) return;

    DOM.editNameInput.value = trip.name;
    populateOriginSelector(trip.originCity || '');
    updateOriginDesc(trip);

    // Style: every choice is visible with what it means, so nothing needs to be opened to understand it.
    DOM.tasteRoot.innerHTML = Object.keys(TASTE_FIELDS).map(key => {
      const info = TASTE_INFO[key];
      const chips = TASTE_FIELDS[key].map(opt => {
        const isOn = trip.taste[key] === opt.id;
        const classes = isOn
          ? "vt-chip bg-blue-600 text-white font-bold px-3 py-1.5 rounded-full text-xs shadow-sm whitespace-nowrap"
          : "vt-chip bg-white text-slate-600 border border-slate-200 font-medium px-3 py-1.5 rounded-full text-xs hover:bg-slate-50 whitespace-nowrap";
        return `<button type="button" class="${classes}" data-field="${key}" data-id="${opt.id}" aria-pressed="${isOn}">${opt.label}</button>`;
      }).join('');
      const cur = TASTE_FIELDS[key].find(o => o.id === trip.taste[key]);
      return `<div>
        <div class="flex items-baseline justify-between gap-2 mb-1.5">
          <span class="text-[11px] font-black uppercase tracking-wider text-slate-500">${info.title}</span>
          <span class="text-[11px] text-slate-400 text-right">${cur && info.hints[cur.id] ? info.hints[cur.id] : ''}</span>
        </div>
        <div class="flex gap-1.5 flex-wrap">${chips}</div>
      </div>`;
    }).join('');

    // Destinations come first: the panel is a picker while choosing and collapses to the route once set.
    if (setupTripId !== trip.id) {
      setupTripId = trip.id;
      pickerOpen = trip.cities.length === 0;
    }
    if (trip.cities.length === 0) pickerOpen = true;
    const hasCities = trip.cities.length > 0;

    const badge = document.getElementById('vt-city-count-badge');
    if (badge) badge.textContent = hasCities ? `· ${trip.cities.length} selected` : '';
    renderStaysSummary(trip);
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
      DOM.btnBuild.innerHTML = `<i data-lucide="calendar" class="w-4 h-4"></i> Open Day Plan (${trip.steps.length} stops)`;
    } else {
      DOM.btnBuild.innerHTML = `<i data-lucide="wand-2" class="w-4 h-4"></i> Generate Day Plan`;
    }

    DOM.selectedCitiesRoot.innerHTML = trip.cities.map((cId, idx) => {
      const city = window.KYT_CITIES.find(c => c.id === cId);
      const name = city ? KYT.utils.escapeHTML(city.name) : KYT.utils.escapeHTML(cId);
      const isFirst = idx === 0;
      const isLast = idx === trip.cities.length - 1;
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

      const matched = (city.beats || []).filter(b => beatMatches(b, trip.taste)).sort((a, b) => (a.hour || 0) - (b.hour || 0));

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

  // Rebuilds the plan after cities, days, stays or the start change. Stops the traveller added, and
  // suggested stops they edited or moved, are kept where the day and the stop still exist.
  function regeneratePlan(trip) {
    const old = trip.steps || [];
    const fresh = generateSteps(trip);
    const edited = new Map();
    old.filter(s => s.edited && s.src && !s.custom).forEach(s => edited.set(s.dayId + '|' + s.src, s));
    const added = old.filter(s => s.custom);
    if (!edited.size && !added.length) return fresh;

    const out = fresh.map(s => edited.get(s.dayId + '|' + s.title) || s);
    const days = new Set(fresh.map(s => s.dayId));
    added.forEach(s => { if (days.has(s.dayId)) out.push(s); });

    const order = [];
    const byDay = {};
    out.forEach(s => {
      if (!byDay[s.dayId]) { byDay[s.dayId] = []; order.push(s.dayId); }
      byDay[s.dayId].push(s);
    });
    const at = s => (s.hour || 0) * 60 + (s.minute || 0);
    return order.flatMap(d => byDay[d].map((s, k) => ({ s, k })).sort((a, b) => at(a.s) - at(b.s) || a.k - b.k).map(x => x.s));
  }

  // ── Editing the plan: move, edit, add and delete stops ───────────────────────
  let stepEditCtx = null;
  const pad2 = n => String(n).padStart(2, '0');

  function setStepTime(step, h, m) {
    step.hour = h;
    step.minute = m;
    step.phase = KYT.ui.hourToPhase(h);
    step.suggestedTime = KYT.ui.formatSuggestedTime(h, m, step.phase);
  }

  // A suggested stop the traveller touched remembers what it was, so a rebuild can find it again.
  function markEdited(step) {
    step.edited = true;
    if (!step.custom && !step.src) step.src = step.title;
  }

  function dayIndexes(trip, dayId) {
    return trip.steps.map((s, k) => (s.dayId === dayId ? k : -1)).filter(k => k >= 0);
  }

  function sortDay(trip, dayId) {
    const idxs = dayIndexes(trip, dayId);
    const at = s => (s.hour || 0) * 60 + (s.minute || 0);
    const sorted = idxs.map((i, k) => ({ s: trip.steps[i], k })).sort((a, b) => at(a.s) - at(b.s) || a.k - b.k).map(x => x.s);
    idxs.forEach((i, k) => { trip.steps[i] = sorted[k]; });
  }

  window.moveVirtualTripStep = function (stepId, dir) {
    const trip = getActiveTrip();
    if (!trip || !trip.steps) return;
    const i = trip.steps.findIndex(s => s.id === stepId);
    if (i < 0) return;
    const idxs = dayIndexes(trip, trip.steps[i].dayId);
    const pos = idxs.indexOf(i);
    const tgt = pos + dir;
    if (tgt < 0 || tgt >= idxs.length) return;
    const a = trip.steps[idxs[pos]];
    const b = trip.steps[idxs[tgt]];
    // The two stops trade places and trade times, so the day stays in time order.
    const ta = { h: a.hour, m: a.minute };
    const tb = { h: b.hour, m: b.minute };
    trip.steps[idxs[pos]] = b;
    trip.steps[idxs[tgt]] = a;
    setStepTime(a, tb.h, tb.m);
    setStepTime(b, ta.h, ta.m);
    markEdited(a);
    markEdited(b);
    saveVTrips();
    renderBuilder();
  };

  // The catalog city a day is spent in, as the generator picks it
  function cityForDay(trip, dayId) {
    const pace = trip.taste && trip.taste.pace;
    const cities = (trip.cities || []).map(id => window.KYT_CITIES.find(c => c.id === id))
      .filter(c => c && !(c.skipOnPace && c.skipOnPace.includes(pace)));
    if (!cities.length) return null;
    return cities[Math.min(Math.max(dayId - 1, 0), cities.length - 1)];
  }

  function stepModalEl() { return document.getElementById('vt-step-modal'); }

  function closeStepEditor() {
    const m = stepModalEl();
    if (m) m.classList.add('hidden');
    stepEditCtx = null;
  }

  function openStepEditor(ctx) {
    const trip = getActiveTrip();
    const m = stepModalEl();
    if (!trip || !m) return;
    stepEditCtx = ctx;
    const $ = id => document.getElementById(id);
    const err = $('vt-step-error');
    if (err) err.classList.add('hidden');
    const pickWrap = $('vt-step-pick-wrap');
    const pick = $('vt-step-pick');

    if (ctx.mode === 'edit') {
      const step = trip.steps.find(s => s.id === ctx.stepId);
      if (!step) return;
      $('vt-step-modal-title').textContent = 'Edit stop';
      $('vt-step-title').value = step.title || '';
      $('vt-step-time').value = step.hour != null ? `${pad2(step.hour)}:${pad2(step.minute || 0)}` : '';
      $('vt-step-where').value = step.where || '';
      $('vt-step-notes').value = step.notes || '';
      pickWrap.classList.add('hidden');
    } else {
      $('vt-step-modal-title').textContent = ctx.dayId === 0 ? 'Add a stop to Day 0' : `Add a stop to Day ${ctx.dayId}`;
      const daySteps = trip.steps.filter(s => s.dayId === ctx.dayId);
      const last = daySteps.reduce((mx, s) => Math.max(mx, (s.hour || 0) * 60 + (s.minute || 0)), 9 * 60);
      const next = Math.min(21 * 60 + 30, last + 60);
      $('vt-step-title').value = '';
      $('vt-step-time').value = `${pad2(Math.floor(next / 60))}:${pad2(next % 60)}`;
      $('vt-step-where').value = '';
      $('vt-step-notes').value = '';

      const city = cityForDay(trip, ctx.dayId);
      const used = new Set(trip.steps.map(s => s.title));
      const options = city ? (city.beats || []).filter(b => !used.has(b.title)) : [];
      ctx.options = options;
      if (options.length) {
        $('vt-step-pick-city').textContent = city.name;
        pick.innerHTML = '<option value="">Choose an attraction…</option>' +
          options.map((b, k) => `<option value="${k}">${KYT.utils.escapeHTML(b.title)}</option>`).join('');
        pickWrap.classList.remove('hidden');
      } else {
        pickWrap.classList.add('hidden');
      }
    }
    m.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { const t = $('vt-step-title'); if (t) t.focus(); }, 50);
  }

  window.editVirtualTripStep = id => openStepEditor({ mode: 'edit', stepId: id });
  window.addVirtualTripStep = dayId => openStepEditor({ mode: 'add', dayId: Number(dayId) });

  function saveStepEditor() {
    const trip = getActiveTrip();
    const ctx = stepEditCtx;
    if (!trip || !ctx) return;
    const $ = id => document.getElementById(id);
    const title = $('vt-step-title').value.trim();
    if (!title) {
      $('vt-step-error').classList.remove('hidden');
      $('vt-step-title').focus();
      return;
    }
    const where = $('vt-step-where').value.trim();
    const notes = $('vt-step-notes').value.trim();
    const time = $('vt-step-time').value;
    const parts = /^(\d{1,2}):(\d{2})$/.exec(time || '');
    const mapsFor = (step, city) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((where || title) + ' ' + (city || step.cityName || ''))}`;

    if (ctx.mode === 'edit') {
      const step = trip.steps.find(s => s.id === ctx.stepId);
      if (!step) return closeStepEditor();
      markEdited(step);
      step.title = title;
      step.notes = notes;
      if (where !== (step.where || '')) {
        step.where = where;
        step.mapsUrl = mapsFor(step);
      }
      if (parts) setStepTime(step, parseInt(parts[1], 10), parseInt(parts[2], 10));
      sortDay(trip, step.dayId);
    } else {
      const city = cityForDay(trip, ctx.dayId);
      const dayStep = trip.steps.find(s => s.dayId === ctx.dayId);
      const cityName = (dayStep && dayStep.cityName) || (city && city.name) || '';
      const beatSel = $('vt-step-pick').value;
      const beat = (beatSel !== '' && ctx.options && ctx.options[Number(beatSel)]) || null;
      const fromCatalog = beat && beat.title === title ? beat : null;
      const step = {
        id: Date.now().toString() + '_c' + Math.floor(Math.random() * 1e4),
        dayId: ctx.dayId,
        cityName,
        title,
        notes,
        where: where || (fromCatalog && fromCatalog.where) || cityName,
        mapsUrl: (fromCatalog && fromCatalog.mapsUrl) || '',
        icon: (fromCatalog && fromCatalog.icon) || 'map-pin',
        custom: true
      };
      if (!step.mapsUrl) step.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((step.where || title) + ' ' + cityName)}`;
      setStepTime(step, parts ? parseInt(parts[1], 10) : 12, parts ? parseInt(parts[2], 10) : 0);
      const idxs = dayIndexes(trip, ctx.dayId);
      const insertAt = idxs.length ? idxs[idxs.length - 1] + 1 : trip.steps.length;
      trip.steps.splice(insertAt, 0, step);
      sortDay(trip, ctx.dayId);
    }
    saveVTrips();
    closeStepEditor();
    renderBuilder();
  }

  function appendCitySteps(trip, cityId) {
    if (!trip.steps) trip.steps = [];
    trip.duration = Math.max(trip.duration || 0, trip.cities.length);
    trip.steps = regeneratePlan(trip);
  }

  // --- Rendering Builder ---
  window.deleteVirtualTripStep = function (stepId) {
    const trip = getActiveTrip();
    if (!trip || !trip.steps) return;
    trip.steps = trip.steps.filter(s => s.id !== stepId);
    saveVTrips();
    renderBuilder();
  };

  function renderBuilder() {
    const trip = getActiveTrip();
    if (!trip || !trip.steps) return;

    if (DOM.editNameInput) DOM.editNameInput.value = trip.name;

    // Hand-curated blueprints keep their own wording; every generated plan carries the explainer.
    let html = `
      <div class="flex items-center gap-2 flex-wrap bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2.5 shadow-xs">
        <p class="w-full text-xs font-bold text-slate-600 leading-snug">${KYT.utils.escapeHTML(tripSummaryText(trip))}</p>
        <button type="button" id="btn-vt-edit-setup" class="text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors cursor-pointer">Edit cities &amp; setup</button>
        <button type="button" id="btn-vt-reset-plan" class="ml-auto text-[11px] font-bold text-slate-500 hover:text-rose-600 px-2 py-1.5 rounded-full transition-colors cursor-pointer">Reset plan</button>
      </div>
      ${trip.curatedId ? '' : KYT.ui.renderGeneratedPlanNotice()}
      <p class="text-[11px] text-slate-500 px-1">Use the arrows to reorder a day, the pencil to edit a stop and <strong>Add stop</strong> to add one. Your changes are kept when you adjust cities or days.</p>
    `;

    // Group steps by dayId
    const days = {};
    trip.steps.forEach(step => {
      const dId = step.dayId != null ? step.dayId : 1;
      if (!days[dId]) days[dId] = [];
      days[dId].push(step);
    });

    if (Object.keys(days).length === 0) {
      html += `
        <div class="text-center p-6 bg-white rounded-2xl border border-slate-100 mt-4">
          <div class="text-3xl mb-3">🔍</div>
          <p class="text-sm font-bold text-slate-700 mb-1">No matching activities</p>
          <p class="text-xs text-slate-400 mb-4">Your travel style filters out all activities for these cities. Try changing your travel style or adding different cities.</p>
          <button onclick="KYT.virtualTrips.editCanvas()" class="text-xs font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100">← Edit Plan</button>
        </div>`;
    } else {
      Object.keys(days).map(Number).sort((a, b) => a - b).forEach(dayId => {
        const cityName = days[dayId][0].cityName;
        const isDay0 = dayId === 0;

        const dayList = days[dayId];
        const stepsHtml = dayList.map((beat, k) =>
          KYT.ui.renderStepCard(beat, { variant: 'builder', isFirst: k === 0, isLast: k === dayList.length - 1 })
        ).join('');

        const dayBadge = isDay0
          ? `<span class="text-[10px] font-black text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-widest">Day 0: Travel & Arrival</span>`
          : `<span class="text-[10px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full uppercase tracking-widest">Day ${dayId}</span>`;

        html += `
          <div class="mb-5">
            <div class="flex items-center gap-2 mb-2">
              ${dayBadge}
              <span class="text-[11px] font-bold text-slate-500 truncate">${KYT.utils.escapeHTML(cityName)}</span>
              <button type="button" onclick="addVirtualTripStep(${dayId})"
                class="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 transition-colors cursor-pointer" title="Add a stop to this day">
                <i data-lucide="plus" class="w-3 h-3"></i> Add stop
              </button>
            </div>
            <div class="relative">${stepsHtml}</div>
          </div>
        `;
      });
    }

    const totalSteps = trip.steps.length;
    const totalDays = Object.keys(days).filter(k => Number(k) !== 0).length || Object.keys(days).length;
    html += `
      <div class="sticky bottom-0 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-t border-slate-200 mt-4 flex items-center gap-3 z-10">
        <p class="flex-1 min-w-0 text-xs text-slate-500 leading-snug"><strong class="text-slate-800">${totalSteps} activities</strong> · ${totalDays} day${totalDays > 1 ? 's' : ''}</p>
        <button type="button" onclick="KYT.virtualTrips.useAsMyTrip('${trip.id}')"
           class="shrink-0 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-extrabold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-sm">
          <i data-lucide="plane-takeoff" class="w-4 h-4"></i>
          Start this trip
        </button>
      </div>
    `;

    DOM.itineraryListRoot.innerHTML = html;
    const btnEditSetup = document.getElementById('btn-vt-edit-setup');
    if (btnEditSetup) btnEditSetup.addEventListener('click', () => openCanvas(currentTripId));
    const btnResetPlan = document.getElementById('btn-vt-reset-plan');
    if (btnResetPlan) btnResetPlan.addEventListener('click', () => {
      if (confirm('Reset the whole plan to the suggested one? Stops you edited or added will be lost.')) {
        trip.steps = generateSteps(trip);
        saveVTrips();
        renderBuilder();
      }
    });
    if (window.lucide) lucide.createIcons();
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
        if (!tripToUse.cities.includes(cId)) {
          tripToUse.cities.push(cId);
          if (tripToUse.steps && tripToUse.steps.length > 0) {
            appendCitySteps(tripToUse, cId);
          } else {
            tripToUse.steps = null;
          }
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
    if (!trip.cities.includes(cityId)) {
      trip.cities.push(cityId);
      if (trip.steps && trip.steps.length > 0) {
        appendCitySteps(trip, cityId);
      } else {
        trip.steps = null;
      }
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
          DOM.originCitySelect.classList.remove('ring-2', 'ring-red-400');
          if (trip.steps && trip.steps.length > 0) {
            trip.steps = regeneratePlan(trip);
          }
          saveVTrips();
          updateOriginDesc(trip);
          renderPrefsSummary(trip);
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
    const btnStaysRow = document.getElementById('btn-vt-stays-row');
    if (btnStaysRow) btnStaysRow.addEventListener('click', () => openStayModal());

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
      const pickSel = document.getElementById('vt-step-pick');
      if (pickSel) {
        pickSel.addEventListener('change', () => {
          const b = stepEditCtx && stepEditCtx.options && stepEditCtx.options[Number(pickSel.value)];
          if (!b) return;
          document.getElementById('vt-step-title').value = b.title || '';
          document.getElementById('vt-step-where').value = b.where || '';
          document.getElementById('vt-step-notes').value = b.notes || '';
          if (b.hour != null) document.getElementById('vt-step-time').value = `${pad2(b.hour)}:00`;
          document.getElementById('vt-step-error').classList.add('hidden');
        });
      }
    }


    if (DOM.tasteRoot) {
      DOM.tasteRoot.addEventListener('click', e => {
        const chip = e.target.closest('.vt-chip');
        if (!chip) return;
        const trip = getActiveTrip();
        if (trip) {
          trip.taste[chip.dataset.field] = chip.dataset.id;
          if (!trip.steps || trip.steps.length === 0) {
            trip.steps = null;
          }
          saveVTrips();
          renderCanvas();
        }
      });
    }

    if (DOM.selectedCitiesRoot) {
      DOM.selectedCitiesRoot.addEventListener('click', e => {
        const leftBtn = e.target.closest('.btn-move-city-left');
        if (leftBtn) {
          e.stopPropagation();
          const idx = parseInt(leftBtn.dataset.index, 10);
          const trip = getActiveTrip();
          if (trip && idx > 0) {
            const temp = trip.cities[idx - 1];
            trip.cities[idx - 1] = trip.cities[idx];
            trip.cities[idx] = temp;
            trip.steps = regeneratePlan(trip);
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
            const temp = trip.cities[idx + 1];
            trip.cities[idx + 1] = trip.cities[idx];
            trip.cities[idx] = temp;
            trip.steps = regeneratePlan(trip);
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
            trip.cities = trip.cities.filter(c => c !== delBtn.dataset.id);
            if (trip.steps && trip.steps.length > 0) {
              trip.steps = regeneratePlan(trip);
            } else {
              trip.steps = null;
            }
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

    // ── Stay Modal Controls ──
    const stayModalEl = document.getElementById('vt-stay-modal');
    if (stayModalEl) {
      stayModalEl.addEventListener('click', (e) => {
        if (e.target === stayModalEl) closeStayModal();
      });
    }

    const btnCloseStay = document.getElementById('btn-close-stay-modal');
    if (btnCloseStay) btnCloseStay.addEventListener('click', closeStayModal);

    const btnCancelStay = document.getElementById('btn-cancel-stay-modal');
    if (btnCancelStay) btnCancelStay.addEventListener('click', closeStayModal);

    const btnMinusModal = document.getElementById('btn-modal-duration-minus');
    if (btnMinusModal) {
      btnMinusModal.addEventListener('click', () => {
        const trip = getActiveTrip();
        if (trip && (trip.duration || trip.cities.length) > 1) {
          trip.duration = (trip.duration || trip.cities.length) - 1;
          if (trip.nightStays) delete trip.nightStays[trip.duration + 1];
          saveVTrips();
          renderStayModal();
        }
      });
    }

    const btnPlusModal = document.getElementById('btn-modal-duration-plus');
    if (btnPlusModal) {
      btnPlusModal.addEventListener('click', () => {
        const trip = getActiveTrip();
        if (trip) {
          trip.duration = Math.min(30, (trip.duration || trip.cities.length || 1) + 1);
          saveVTrips();
          renderStayModal();
        }
      });
    }

    const modalStaysList = document.getElementById('vt-modal-night-stays-list');
    if (modalStaysList) {
      modalStaysList.addEventListener('change', e => {
        const select = e.target.closest('.vt-modal-night-stay-select');
        if (select) {
          const dayId = parseInt(select.dataset.dayId, 10);
          const trip = getActiveTrip();
          if (trip) {
            if (!trip.nightStays) trip.nightStays = {};
            trip.nightStays[dayId] = select.value;
            saveVTrips();
            renderStayModal();
          }
        }
      });
    }

    const btnConfirmStay = document.getElementById('btn-modal-confirm-build');
    if (btnConfirmStay) {
      btnConfirmStay.addEventListener('click', () => {
        const trip = getActiveTrip();
        if (trip) {
          closeStayModal();
          trip.steps = regeneratePlan(trip);
          saveVTrips();
          openBuilder();
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
          if (trip && !trip.cities.includes(addBtn.dataset.id)) {
            trip.cities.push(addBtn.dataset.id);
            if (trip.steps && trip.steps.length > 0) {
              appendCitySteps(trip, addBtn.dataset.id);
            } else {
              trip.steps = null;
            }
            saveVTrips();
            if (DOM.citySearchInput) DOM.citySearchInput.value = '';
            renderCanvas();
          }
          return;
        }

        const cityCard = e.target.closest('article[data-city-id]');
        if (cityCard && !e.target.closest('.vt-attraction-pill') && !e.target.closest('.vt-attraction-detail') && !e.target.closest('a')) {
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
          DOM.originCitySelect.classList.add('ring-2', 'ring-red-400');
          if (DOM.originDesc) DOM.originDesc.textContent = 'Choose where you start first';
          DOM.originCitySelect.scrollIntoView({ block: 'center', behavior: 'smooth' });
          DOM.originCitySelect.focus();
          return;
        }
        // The card already holds everything the plan needs (start, days, stays, style): no dialog, straight
        // to the plan, where it can be edited.
        if (!(trip.steps && trip.steps.length > 0)) {
          trip.duration = trip.duration || trip.cities.length || 1;
          renderStayModal();   // fills in a sensible place to sleep for each day
          trip.steps = regeneratePlan(trip);
          saveVTrips();
        }
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
                appendCitySteps(newTrip, extraC);
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
    regenerateSteps: window.regenerateVirtualTripSteps,
    generateSteps,
    openStayModal,
    closeStayModal
  };

  window.openStayModal = openStayModal;
  window.closeStayModal = closeStayModal;
  if (window.KYT) window.KYT.virtualTrips = api;

  return api;
})();