/* Page script for curated_trips.html, moved out of the HTML so HTML auto-formatters cannot corrupt it. Loaded as a classic script at the same position. */

// Fallback if data/curated_trips.js was not loaded
if (!window.KYT_CURATED_TRIPS || !window.KYT_CURATED_TRIPS.length) {
  console.warn("Curated trips not loaded from data/, trying admin/ fallback");
  const s = document.createElement('script');
  s.src = './admin/curated_trips.js';
  document.head.appendChild(s);
}

// Exact Travel Styles matching virtual_trip.html TASTE_FIELDS.intent with custom header gradients
const TRAVEL_STYLES = {
  spiritual: {
    label: 'Spiritual',
    icon: 'landmark',
    bg: 'bg-amber-500/20',
    text: 'text-amber-200',
    border: 'border-amber-400/30',
    headerGradient: 'bg-gradient-to-tr from-amber-950 via-amber-900 to-amber-800'
  },
  cultural: {
    label: 'Cultural',
    icon: 'building-2',
    bg: 'bg-blue-500/20',
    text: 'text-blue-200',
    border: 'border-blue-400/30',
    headerGradient: 'bg-gradient-to-tr from-blue-950 via-indigo-900 to-blue-800'
  },
  adventure: {
    label: 'Adventure',
    icon: 'mountain',
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-200',
    border: 'border-emerald-400/30',
    headerGradient: 'bg-gradient-to-tr from-emerald-950 via-emerald-900 to-teal-800'
  },
  culinary: {
    label: 'Culinary',
    icon: 'utensils',
    bg: 'bg-rose-500/20',
    text: 'text-rose-200',
    border: 'border-rose-400/30',
    headerGradient: 'bg-gradient-to-tr from-rose-950 via-rose-900 to-orange-900'
  },
  mixed: {
    label: 'Mixed',
    icon: 'compass',
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-200',
    border: 'border-indigo-400/30',
    headerGradient: 'bg-gradient-to-tr from-slate-900 via-indigo-950 to-blue-900'
  }
};

let currentScope = 'trips'; // 'trips' | 'cities' | 'all'
let currentFilter = 'all'; // for curated trips travel styles
let currentStateFilter = 'all'; // for cities
let currentSearch = '';
let currentSelectedTrip = null;

function resolveCity(ref) {
  if (!ref) return null;
  if (typeof ref === 'object' && ref.id) return ref;
  const s = String(ref).trim().toLowerCase();
  const list = window.KYT_CITIES || [];
  return list.find(c => (c.id && c.id.toLowerCase() === s) || (c.name && c.name.toLowerCase() === s)) || null;
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.KYT && window.KYT.header) {
    KYT.header.renderMainToolbar('main-toolbar', { active: 'curated' });
  }

  // Update scope counts in badge pills
  const trips = window.KYT_CURATED_TRIPS || [];
  const cities = window.KYT_CITIES || [];
  const tripsBadge = document.getElementById('scope-trips-badge');
  const citiesBadge = document.getElementById('scope-cities-badge');
  if (tripsBadge) tripsBadge.textContent = trips.length;
  if (citiesBadge) citiesBadge.textContent = cities.length;

  setupCityDetailSlideOver();
  setupScopeTabs();
  setupFilters();
  setupSearch();
  setupStatePills();

  renderAllViews();

  // Handle URL deep-linking (?city= or ?curated=)
  const params = new URLSearchParams(window.location.search);
  const deepCity = params.get('city');
  const deepCurated = params.get('curated') || params.get('tripId');
  if (deepCity && window.KYT && KYT.ui && KYT.ui.cityDetail) {
    setTimeout(() => KYT.ui.cityDetail.open(deepCity, false), 150);
  } else if (deepCurated) {
    setTimeout(() => openTripDetail(deepCurated), 150);
  }

  window.addEventListener('popstate', (e) => {
    const p = new URLSearchParams(window.location.search);
    const cId = p.get('city');
    if (cId) {
      if (window.KYT && KYT.ui && KYT.ui.cityDetail) KYT.ui.cityDetail.open(cId, false);
    } else {
      if (window.KYT && KYT.ui && KYT.ui.cityDetail) KYT.ui.cityDetail.close(false);
    }
  });

  lucide.createIcons();
});

function setupCityDetailSlideOver() {
  if (window.KYT && window.KYT.ui && window.KYT.ui.cityDetail) {
    KYT.ui.cityDetail.configure({
      mode: 'explore',
      onPrimaryAction: (cityId) => {
        window.location.href = `virtual_trip.html?city=${encodeURIComponent(cityId)}`;
      }
    });

    const btnCloseCity = document.getElementById('btn-close-city-detail');
    const btnBackCity = document.getElementById('btn-back-city-detail');
    const btnShareCity = document.getElementById('btn-share-city');
    const cityOverlay = document.getElementById('city-detail-overlay');

    if (btnCloseCity) btnCloseCity.addEventListener('click', () => KYT.ui.cityDetail.close(true));
    if (btnBackCity) btnBackCity.addEventListener('click', () => window.history.back());
    if (cityOverlay) {
      cityOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'city-detail-overlay') KYT.ui.cityDetail.close(true);
      });
    }

    if (btnShareCity) {
      btnShareCity.addEventListener('click', () => {
        const titleEl = document.getElementById('cd-title');
        const cityId = titleEl ? titleEl.dataset.cityId : null;
        if (!cityId) return;
        const url = new URL(window.location.href);
        url.searchParams.set('city', cityId);
        const shareData = {
          title: `${titleEl.textContent} Travel Guide — KYT`,
          text: `Explore ${titleEl.textContent} on KYT with travel videos, attractions & guidelines!`,
          url: url.toString()
        };
        if (navigator.share) {
          navigator.share(shareData).catch(() => {});
        } else {
          navigator.clipboard.writeText(url.toString())
            .then(() => alert('City guide link copied to clipboard!'))
            .catch(() => {});
        }
      });
    }

    const nearbyList = document.getElementById('cd-nearby-list');
    if (nearbyList) {
      nearbyList.addEventListener('click', (e) => {
        const nCard = e.target.closest('[data-nearby-id]');
        if (nCard) {
          KYT.ui.cityDetail.open(nCard.dataset.nearbyId, true);
        }
      });
    }
  }
}

function setupScopeTabs() {
  const tabs = document.querySelectorAll('.scope-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const scope = tab.dataset.scope;
      if (scope === currentScope) return;
      currentScope = scope;

      tabs.forEach(t => {
        const isActive = t === tab;
        t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        if (isActive) {
          t.classList.add('bg-white', 'text-slate-900', 'shadow-xs', 'font-black');
          t.classList.remove('text-slate-600', 'font-bold');
        } else {
          t.classList.remove('bg-white', 'text-slate-900', 'shadow-xs', 'font-black');
          t.classList.add('text-slate-600', 'font-bold');
        }
      });

      renderAllViews();
    });
  });
}

function setupFilters() {
  const pills = document.querySelectorAll('#filter-pills .filter-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => {
        p.classList.remove('active', 'bg-slate-900', 'text-white');
        p.classList.add('bg-white', 'text-slate-700');
      });
      pill.classList.add('active', 'bg-slate-900', 'text-white');
      pill.classList.remove('bg-white', 'text-slate-700');

      currentFilter = pill.dataset.filter || 'all';
      renderAllViews();
    });
  });
}

function setupStatePills() {
  const stateContainer = document.getElementById('state-pills');
  if (!stateContainer) return;

  const cities = window.KYT_CITIES || [];
  const stateCounts = {};
  cities.forEach(c => {
    if (c.state) stateCounts[c.state] = (stateCounts[c.state] || 0) + 1;
  });

  const sortedStates = Object.keys(stateCounts).sort((a, b) => stateCounts[b] - stateCounts[a]).slice(0, 8);

  stateContainer.innerHTML = `
    <button data-state="all" class="state-pill active px-4 py-2 rounded-xl text-xs font-black bg-slate-900 text-white shadow-xs transition-all shrink-0 cursor-pointer">All States</button>
  ` + sortedStates.map(st => `
    <button data-state="${st}" class="state-pill px-3 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all shrink-0 cursor-pointer">
      ${st} <span class="text-[10px] text-slate-400 font-semibold">(${stateCounts[st]})</span>
    </button>
  `).join('');

  stateContainer.querySelectorAll('.state-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      stateContainer.querySelectorAll('.state-pill').forEach(p => {
        p.classList.remove('active', 'bg-slate-900', 'text-white');
        p.classList.add('bg-white', 'text-slate-700');
      });
      pill.classList.add('active', 'bg-slate-900', 'text-white');
      pill.classList.remove('bg-white', 'text-slate-700');

      currentStateFilter = pill.dataset.state || 'all';
      renderAllViews();
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('explore-search');
  const clearBtn = document.getElementById('explore-search-clear');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    currentSearch = (e.target.value || '').trim();
    if (clearBtn) clearBtn.classList.toggle('hidden', !currentSearch);
    renderAllViews();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      currentSearch = '';
      clearBtn.classList.add('hidden');
      searchInput.focus();
      renderAllViews();
    });
  }
}

function renderAllViews() {
  const showTrips = currentScope === 'trips' || currentScope === 'all';
  const showCities = currentScope === 'cities' || currentScope === 'all';

  const tripsSection = document.getElementById('trips-section');
  const citiesSection = document.getElementById('cities-section');
  const tripsHeader = document.getElementById('trips-section-header');
  const citiesHeader = document.getElementById('cities-section-header');
  const filterPills = document.getElementById('filter-pills');
  const statePills = document.getElementById('state-pills');

  if (tripsSection) tripsSection.classList.toggle('hidden', !showTrips);
  if (citiesSection) citiesSection.classList.toggle('hidden', !showCities);
  if (tripsHeader) tripsHeader.classList.toggle('hidden', currentScope !== 'all');
  if (citiesHeader) citiesHeader.classList.toggle('hidden', currentScope !== 'all');

  if (filterPills) filterPills.classList.toggle('hidden', currentScope === 'cities');
  if (statePills) statePills.classList.toggle('hidden', currentScope !== 'cities');

  const filteredTrips = filterCuratedTrips();
  const filteredCities = filterCities();

  if (showTrips) renderCuratedTrips(filteredTrips);
  if (showCities) renderCitiesGrid(filteredCities);

  updateCountDisplay(filteredTrips, filteredCities);
  lucide.createIcons();
}

function filterCuratedTrips() {
  const trips = window.KYT_CURATED_TRIPS || [];
  let filtered = trips;

  if (currentFilter !== 'all') {
    filtered = filtered.filter(t => (t.taste?.intent || 'mixed').toLowerCase() === currentFilter.toLowerCase());
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(t => {
      const titleMatch = (t.title || '').toLowerCase().includes(q);
      const taglineMatch = (t.tagline || '').toLowerCase().includes(q);
      const originMatch = (t.originName || t.originCity || '').toLowerCase().includes(q);
      const trackMatch = (t.track || '').toLowerCase().includes(q);
      const citiesMatch = (t.cities || []).some(c => c.toLowerCase().includes(q));
      const highlightsMatch = (t.highlights || []).some(h => h.toLowerCase().includes(q));
      return titleMatch || taglineMatch || originMatch || trackMatch || citiesMatch || highlightsMatch;
    });
  }

  return filtered;
}

function filterCities() {
  const cities = window.KYT_CITIES || [];
  let filtered = cities;

  if (currentStateFilter !== 'all') {
    filtered = filtered.filter(c => (c.state || '').toLowerCase() === currentStateFilter.toLowerCase());
  }

  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(c => {
      const nameMatch = (c.name || '').toLowerCase().includes(q);
      const stateMatch = (c.state || '').toLowerCase().includes(q);
      const aliasesMatch = (c.aliases || []).some(a => a.toLowerCase().includes(q));
      const descMatch = (c.notes || c.description || '').toLowerCase().includes(q);
      const beatsMatch = (c.beats || []).some(b =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.where || '').toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q)
      );
      return nameMatch || stateMatch || aliasesMatch || descMatch || beatsMatch;
    });
  }

  return filtered;
}

function updateCountDisplay(trips, cities) {
  const countEl = document.getElementById('trip-count');
  if (!countEl) return;

  if (currentScope === 'trips') {
    countEl.textContent = `Showing ${trips.length} trip${trips.length === 1 ? '' : 's'}`;
  } else if (currentScope === 'cities') {
    const totalBeats = cities.reduce((acc, c) => acc + (c.beats ? c.beats.length : 0), 0);
    countEl.textContent = `Showing ${cities.length} cities (${totalBeats} attractions)`;
  } else {
    countEl.textContent = `Showing ${trips.length} trips · ${cities.length} cities`;
  }

  const tripsCountHeader = document.getElementById('trips-section-count');
  const citiesCountHeader = document.getElementById('cities-section-count');
  if (tripsCountHeader) tripsCountHeader.textContent = `${trips.length} Itineraries`;
  if (citiesCountHeader) citiesCountHeader.textContent = `${cities.length} Cities`;
}

function renderCuratedTrips(filtered) {
  const container = document.getElementById('trips-grid');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
        <i data-lucide="compass" class="w-10 h-10 text-slate-300 mx-auto mb-3"></i>
        <h4 class="text-base font-bold text-slate-700">No curated trips matching your filter</h4>
        <p class="text-xs text-slate-400 mt-1">Try clearing your search query or selecting 'All Trips'.</p>
      </div>
    `;
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
        
        <!-- Card Header Tinted by Travel Style -->
        <div class="h-32 ${style.headerGradient} p-4 relative flex flex-col justify-between overflow-hidden shadow-inner">
          <div class="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
          
          <div class="flex items-center justify-between z-10">
            <span class="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 backdrop-blur-md text-white border border-white/20">
              ${trip.durationDays} Days • Idea
            </span>
            
            <!-- Travel Style Tag -->
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
          <button onclick="event.stopPropagation(); openTripDetail('${trip.id}')" class="w-full py-2.5 px-4 rounded-xl bg-slate-900 group-hover:bg-blue-600 active:scale-98 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            <span>Preview Idea</span>
          </button>
        </div>

      </div>
    `;
  }).join('');
}

function renderCitiesGrid(filtered) {
  const container = document.getElementById('cities-grid');
  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
        <i data-lucide="building-2" class="w-10 h-10 text-slate-300 mx-auto mb-3"></i>
        <h4 class="text-base font-bold text-slate-700">No destination guides found</h4>
        <p class="text-xs text-slate-400 mt-1">Try searching another city name, state, or attraction.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(city => {
    const beats = city.beats || [];
    const beatCount = beats.length;

    // Check if query matched a specific beat/attraction
    let matchedBeatTitle = null;
    if (currentSearch && beats.length > 0) {
      const q = currentSearch.toLowerCase();
      const mb = beats.find(b =>
        (b.title || '').toLowerCase().includes(q) ||
        (b.where || '').toLowerCase().includes(q) ||
        (b.notes || '').toLowerCase().includes(q)
      );
      if (mb) matchedBeatTitle = mb.title;
    }

    const hasVideos = window.KYT_CITY_VIDEOS && window.KYT_CITY_VIDEOS[city.id] && window.KYT_CITY_VIDEOS[city.id].length > 0;
    const hasBYG = Boolean(city.beforeYouGo);

    return `
      <div data-city-id="${city.id}"
           onclick="if(window.KYT&&KYT.ui&&KYT.ui.cityDetail)KYT.ui.cityDetail.open('${city.id}', true)"
           class="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-400 hover:-translate-y-0.5 transition-all flex flex-col overflow-hidden group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
           role="button"
           tabindex="0"
           title="Click to explore ${city.name} City Guide"
           onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();if(window.KYT&&KYT.ui&&KYT.ui.cityDetail)KYT.ui.cityDetail.open('${city.id}', true);}">

        <!-- City Card Header -->
        <div class="p-5 pb-3 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              <span class="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                ${city.state || 'India'}
              </span>
              ${hasVideos ? `
                <span class="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <i data-lucide="video" class="w-3 h-3 text-rose-500"></i> Video Guides
                </span>
              ` : ''}
              ${hasBYG ? `
                <span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <i data-lucide="shield-alert" class="w-3 h-3 text-amber-500"></i> Before You Go
                </span>
              ` : ''}
            </div>
            <h3 class="text-xl font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">
              ${city.name}
            </h3>
            ${city.aliases && city.aliases.length ? `
              <p class="text-[11px] text-slate-400 font-medium mt-0.5">(${city.aliases.slice(0, 3).join(', ')})</p>
            ` : ''}
          </div>

          <div class="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:border-blue-200 transition-colors shrink-0">
            <i data-lucide="${city.icon || 'map-pin'}" class="w-5 h-5"></i>
          </div>
        </div>

        <!-- City Body -->
        <div class="p-5 flex-1 flex flex-col justify-between gap-3">
          <p class="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">
            ${city.notes || city.description || 'A rich Indian destination to explore with handpicked attractions and local nuances.'}
          </p>

          <!-- Matched Beat Badge -->
          ${matchedBeatTitle ? `
            <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
              <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-600 shrink-0"></i>
              <span class="truncate">Matches: ${matchedBeatTitle}</span>
            </div>
          ` : ''}

          <!-- Attractions Preview -->
          ${beats.length > 0 ? `
            <div class="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1.5">
              <div class="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                <span>Top Sights:</span>
                <span>${beatCount} place${beatCount === 1 ? '' : 's'}</span>
              </div>
              ${beats.slice(0, 3).map(b => `
                <div class="flex items-start gap-1.5 text-xs text-slate-700 font-medium">
                  <i data-lucide="${b.icon || 'map-pin'}" class="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5"></i>
                  <span class="truncate flex-1">${b.title}</span>
                  ${b.suggestedTime ? `<span class="text-[10px] text-slate-400 font-bold tabular-nums shrink-0">${b.suggestedTime}</span>` : ''}
                </div>
              `).join('')}
              ${beatCount > 3 ? `
                <div class="text-[10px] text-slate-400 font-extrabold pt-0.5 text-right">
                  +${beatCount - 3} more attraction${beatCount - 3 === 1 ? '' : 's'}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <!-- Card Action -->
          <button onclick="event.stopPropagation(); if(window.KYT&&KYT.ui&&KYT.ui.cityDetail)KYT.ui.cityDetail.open('${city.id}', true);" class="w-full mt-2 py-2.5 px-4 rounded-xl bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-700 font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer">
            <span>Explore City Guide</span>
            <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
          </button>
        </div>

      </div>
    `;
  }).join('');
}

// Modal Interaction for Curated Trips
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

  // Render clickable destination cities bar
  const citiesBar = document.getElementById('modal-cities-bar');
  if (citiesBar) {
    const cityList = (trip.cities || []).map(resolveCity).filter(Boolean);
    if (cityList.length > 0) {
      citiesBar.innerHTML = `
        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mr-1">City Guides:</span>
        ` + cityList.map(c => `
          <button type="button" onclick="if(window.KYT&&KYT.ui&&KYT.ui.cityDetail)KYT.ui.cityDetail.open('${c.id}', true);" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 transition-all cursor-pointer" title="Open ${c.name} city guide">
            <i data-lucide="map-pin" class="w-3 h-3 text-blue-500"></i>
            <span>${c.name}</span>
            <span class="text-[10px] text-blue-500 font-medium">(${c.beats ? c.beats.length : 0} spots)</span>
          </button>
        `).join('');
    } else {
      citiesBar.innerHTML = '';
    }
  }

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

  // Before You Go & Destination Guidelines
  const bygContainer = document.getElementById('modal-byg-container');
  if (bygContainer) {
    if (window.KYT && window.KYT.ui && typeof window.KYT.ui.renderTripBeforeYouGo === 'function') {
      bygContainer.innerHTML = KYT.ui.renderTripBeforeYouGo(trip, window.KYT_CITIES, {
        title: 'Before You Go & Destination Guidelines'
      });
    } else {
      bygContainer.innerHTML = '';
    }
  }

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

    if (window.KYT && KYT.backup) {
      if (!KYT.backup.safeSet('kyt_virtual_trips', JSON.stringify(vtrips))) return;
    } else {
      localStorage.setItem('kyt_virtual_trips', JSON.stringify(vtrips));
    }

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
    const tasteCodeMap = {
      intent: { mixed:'m', spiritual:'s', cultural:'c', adventure:'a', culinary:'u' },
      diet: { any:'a', veg:'v', jain:'j', satvik:'k' },
      pace: { short:'h', standard:'s', deep:'d' }
    };
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
