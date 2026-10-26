/* Page script for visited.html, moved out of the HTML so HTML auto-formatters cannot corrupt it. Loaded as a classic script at the same position. */
      if (window.KYT && window.KYT.header) {
      KYT.header.renderMainToolbar('main-toolbar', { active: 'visited' });
      }

      const container = document.getElementById('cards-container');
      const filterSelect = document.getElementById('filter-select');
      const sortSelect = document.getElementById('sort-select');
      const searchInput = document.getElementById('search-input');
      const btnClearSearch = document.getElementById('btn-clear-search');
      const resultsCountEl = document.getElementById('results-count');

      // Floating counter + jump to top: visible once the hero has scrolled away, bottom right within thumb reach.
      const floatBtn = document.createElement('button');
      floatBtn.type = 'button'; floatBtn.id = 'passport-float';
      floatBtn.style.cssText = 'position:fixed;left:14px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:70;display:none;align-items:center;gap:8px;padding:12px 16px;min-height:48px;border:0;border-radius:999px;background:#0F172A;color:#fff;font:800 15px system-ui,-apple-system,sans-serif;box-shadow:0 10px 24px rgba(15,23,42,.4);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .18s ease';
      document.body.appendChild(floatBtn);
      floatBtn.addEventListener('click', () => {
        const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      });
      let lastFloatCount = null;
      function updateFloatingCounter(visited, total) {
        floatBtn.innerHTML = `<span style="background:#22C55E;color:#052E16;border-radius:999px;padding:2px 9px;font-size:14px">${visited}</span><span>visited</span><span aria-hidden="true" style="font-size:18px;line-height:1">&uarr;</span>`;
        floatBtn.setAttribute('aria-label', `${visited} of ${total} cities visited. Back to top.`);
        if (lastFloatCount !== null && lastFloatCount !== visited && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
          floatBtn.style.transform = 'scale(1.12)'; setTimeout(() => { floatBtn.style.transform = ''; }, 180);
        }
        lastFloatCount = visited;
      }
      function placeFloat() { floatBtn.style.display = window.scrollY > 520 ? 'inline-flex' : 'none'; }
      window.addEventListener('scroll', placeFloat, { passive: true });
      placeFloat();

      window.unmarkVisited = function(cityId) {
      if (window.PassportStore.lockCity(cityId)) {
      renderCities();
      }
      };

      window.markVisited = function(cityId) {
      if (window.PassportStore.unlockCity(cityId)) {
      renderCities();
      }
      };

      window.updateDate = function(cityId, newDate) {
      window.PassportStore.updateDate(cityId, newDate);
      };

      // Status + text-search filtering, shared by the grid and by the filter sheet's live counts
      function baseList(allCities) {
      let cities = [...allCities];
      const filterVal = filterSelect ? filterSelect.value : 'all';
      const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
      if (filterVal === 'visited') cities = cities.filter(c => c.visited);
      else if (filterVal === 'unvisited') cities = cities.filter(c => !c.visited);
      if (query) {
      cities = cities.filter(c => {
      if (c.name && c.name.toLowerCase().includes(query)) return true;
      if ((c.desc || c.notes || c.description || '').toLowerCase().includes(query)) return true;
      if (c.state && c.state.toLowerCase().includes(query)) return true;
      if (c.district && c.district.toLowerCase().includes(query)) return true;
      if (c.aliases && c.aliases.some(a => a.toLowerCase().includes(query))) return true;
      return false;
      });
      }
      return cities;
      }

      function renderCities() {
      if (!container) return;
      container.innerHTML = '';
      const allCities = window.PassportStore.getPassportCities();
      const totalCitiesCount = allCities.length;
      const visitedCount = allCities.filter(c => c.visited).length;

      // Update Prominent Visited Counter and Progress
      const verifiedCountEl = document.getElementById('verified-count');
      if (verifiedCountEl) {
      verifiedCountEl.textContent = `${visitedCount} Visited`;
      }
      const progressPercent = totalCitiesCount > 0 ? Math.round((visitedCount / totalCitiesCount) * 100) : 0;
      const progressEl = document.getElementById('verified-progress');
      if (progressEl) {
      progressEl.textContent = `${progressPercent}% of India Explored (${visitedCount} of ${totalCitiesCount})`;
      }
      updateFloatingCounter(visitedCount, totalCitiesCount);
      PassportExtras.renderStrength(document.getElementById('passport-strength'), allCities);
      const shareBtn = document.getElementById('btn-share-passport');
      if (shareBtn) { shareBtn.disabled = visitedCount === 0; shareBtn.title = visitedCount === 0 ? 'Stamp a city first' : ''; }
      const progressBar = document.getElementById('verified-progress-bar');
      if (progressBar) {
      progressBar.style.width = `${Math.min(100, Math.max(progressPercent, visitedCount > 0 ? 3 : 0))}%`;
      }

      if (searchInput && totalCitiesCount) {
      searchInput.placeholder = `Search ${totalCitiesCount}+ cities, states, or aliases (e.g. Kashi, Ooty, Goa)...`;
      }

      const filterVal = filterSelect ? filterSelect.value : 'all';
      const sortVal = sortSelect ? sortSelect.value : 'default';
      const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
      let cities = baseList(allCities);

      // 0. Active Explorer Quest filter (alters the city view to show the cities within)
      const visitedSet = new Set(allCities.filter(c => c.visited).map(c => c.id));
      const activeQuest = PassportExtras.getActiveQuest();
      if (activeQuest) {
        cities = cities.filter(c => activeQuest.cityIds.includes(c.id));
      }

      // 1. City-attribute filters (vibe, setting, effort, food, region, state)
      cities = PassportExtras.apply(cities);
      PassportExtras.renderChips(document.getElementById('active-filters'), document.getElementById('btn-open-filters'), document.getElementById('btn-open-quests'));

      // 3. Sorting
      if (sortVal === 'alpha') {
      cities.sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortVal === 'recent') {
      cities.sort((a, b) => {
      const tA = a.visited ? new Date(a.date).getTime() || 1 : 0;
      const tB = b.visited ? new Date(b.date).getTime() || 1 : 0;
      return tB - tA;
      });
      } else if (query) {
      // When searching in default mode, rank exact/prefix matches first
      cities.sort((a, b) => {
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

      // 4. Update results count indicator and Quest Explainer section
      const questCardEl = document.getElementById('quest-explainer-card');
      const questIconEl = document.getElementById('quest-explainer-icon');
      const questTitleEl = document.getElementById('quest-explainer-title');
      const questDescEl = document.getElementById('quest-explainer-desc');
      const questStatsEl = document.getElementById('quest-explainer-stats');

      if (activeQuest && questCardEl) {
        questCardEl.classList.remove('hidden');
        if (questTitleEl) questTitleEl.textContent = activeQuest.title;
        if (questDescEl) questDescEl.textContent = activeQuest.subtitle;
        if (questIconEl) questIconEl.setAttribute('data-lucide', activeQuest.icon || 'compass');

        // Calculate progress within this quest
        const qTotal = activeQuest.cityIds.length;
        const qSeen = activeQuest.cityIds.filter(id => visitedSet.has(id)).length;
        const qPct = qTotal > 0 ? Math.round((qSeen / qTotal) * 100) : 0;
        const isComplete = qSeen === qTotal && qTotal > 0;

        if (questStatsEl) {
          if (isComplete) {
            questStatsEl.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs font-black bg-amber-400 text-slate-900 shadow-2xs">🏆 Completed (${qTotal}/${qTotal})</span>`;
          } else if (qSeen > 0) {
            questStatsEl.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-2xs">${qSeen}/${qTotal} stamped (${qPct}%)</span>`;
          } else {
            questStatsEl.innerHTML = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-white border border-blue-200 text-slate-500">${qTotal} destinations</span>`;
          }
        }
      } else if (questCardEl) {
        questCardEl.classList.add('hidden');
      }

      if (resultsCountEl) {
      const questTitle = activeQuest ? `"${activeQuest.title}"` : '';
      if (activeQuest && PassportExtras.activeCount()) {
      resultsCountEl.textContent = `Showing ${cities.length} destinations in ${questTitle} matching your filters` + (query ? ` and "${query}"` : '');
      } else if (activeQuest) {
      if (filterVal === 'visited') {
      resultsCountEl.textContent = `Showing ${cities.length} visited destinations in ${questTitle}` + (query ? ` matching "${query}"` : '');
      } else if (filterVal === 'unvisited') {
      resultsCountEl.textContent = `Showing ${cities.length} unvisited destinations in ${questTitle}` + (query ? ` matching "${query}"` : '');
      } else {
      resultsCountEl.textContent = `Showing ${cities.length} destinations in ${questTitle}` + (query ? ` matching "${query}"` : '');
      }
      } else if (PassportExtras.activeCount()) {
      resultsCountEl.textContent = `Showing ${cities.length} matching your filters` + (query ? ` and "${query}"` : '');
      } else if (query) {
      resultsCountEl.textContent = `Showing ${cities.length} matching "${query}"`;
      } else if (filterVal === 'visited') {
      resultsCountEl.textContent = `Showing ${cities.length} visited cities`;
      } else if (filterVal === 'unvisited') {
      resultsCountEl.textContent = `Showing ${cities.length} unvisited cities`;
      } else {
      resultsCountEl.textContent = `Showing all ${cities.length} destinations`;
      }
      }

      // 5. Render cards or empty state
      if (cities.length === 0) {
      container.innerHTML = `
      <div class="col-span-full py-12 px-4 text-center bg-white rounded-2xl border border-dashed border-slate-200">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
          <i data-lucide="search-x" class="w-6 h-6"></i>
        </div>
        <h4 class="text-base font-bold text-slate-700">No destinations found</h4>
        <p class="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Try searching for another city name, state, or clearing your filter.</p>
        <button type="button" id="btn-reset-search-empty" class="mt-4 px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors cursor-pointer">
          Clear Search
        </button>
      </div>
      `;
      const resetBtn = document.getElementById('btn-reset-search-empty');
      if (resetBtn && searchInput) {
      resetBtn.addEventListener('click', () => {
      searchInput.value = '';
      if (btnClearSearch) btnClearSearch.classList.add('hidden');
      renderCities();
      });
      }
      } else {
      const cardHtml = city => KYT.ui.renderCityCard(city, { variant: 'passport' });
      container.innerHTML = sortVal === 'state'
      ? PassportExtras.renderGrouped(cities, cardHtml, !!query || PassportExtras.activeCount() > 0 || filterVal !== 'all')
      : cities.map(cardHtml).join('');
      }

      if (window.lucide) lucide.createIcons();
      }

      // Attach event listeners
      if (filterSelect) filterSelect.addEventListener('change', renderCities);
      if (sortSelect) sortSelect.addEventListener('change', renderCities);

      if (searchInput) {
      searchInput.addEventListener('input', () => {
      if (btnClearSearch) {
      btnClearSearch.classList.toggle('hidden', !searchInput.value);
      }
      renderCities();
      });
      }

      if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
      if (searchInput) {
      searchInput.value = '';
      btnClearSearch.classList.add('hidden');
      searchInput.focus();
      renderCities();
      }
      });
      }

      // Filters sheet, active chips, state groups, share
      PassportExtras.init({ onChange: renderCities, getCities: () => baseList(window.PassportStore.getPassportCities()) });
      const btnQuests = document.getElementById('btn-open-quests');
      if (btnQuests) btnQuests.addEventListener('click', () => PassportExtras.openQuestsSheet());
      const btnClearQuest = document.getElementById('btn-clear-quest');
      if (btnClearQuest) {
        btnClearQuest.addEventListener('click', () => {
          PassportExtras.setActiveQuest(null);
          renderCities();
        });
      }
      document.getElementById('btn-open-filters').addEventListener('click', () => PassportExtras.openSheet());
      document.getElementById('active-filters').addEventListener('click', e => {
      if (e.target.closest('[data-rm-all]')) PassportExtras.resetFilters();
      else { const b = e.target.closest('[data-rm-g]'); if (!b) return; PassportExtras.removeChip(b.dataset.rmG, b.dataset.rmK); }
      renderCities();
      });
      container.addEventListener('click', e => {
      const t = e.target.closest('[data-state-toggle]');
      if (t) { PassportExtras.toggleState(t.dataset.stateToggle); renderCities(); }
      });
      document.getElementById('btn-share-passport').addEventListener('click', () => PassportExtras.openShare(window.PassportStore.getPassportCities()));

      // Initial render
      renderCities();

      // ── City detail sheet (same slide-over as the trip pages) ─────────────────────────────────────
      (function () {
      const overlay = document.getElementById('city-detail-overlay');
      const mainBtn = document.getElementById('cd-btn-add-main');
      const stamped = id => { const c = window.PassportStore.getPassportCities().find(x => x.id === id); return !!(c && c.visited); };
      function syncMain(id) {
      if (!mainBtn) return;
      const on = stamped(id);
      mainBtn.dataset.cityId = id;
      mainBtn.className = 'shrink-0 shadow-lg font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all flex items-center gap-1.5 ' +
      (on ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-rose-500/10 hover:bg-rose-100' : 'bg-blue-600 text-white shadow-blue-600/30 hover:bg-blue-700');
      mainBtn.innerHTML = on ? '<i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Undo Visit' : '<i data-lucide="check-circle-2" class="w-3.5 h-3.5"></i> Mark Visited';
      if (window.lucide) lucide.createIcons();
      }
      KYT.ui.cityDetail.configure({
      mode: 'explore',
      onPrimaryAction: id => { stamped(id) ? window.unmarkVisited(id) : window.markVisited(id); syncMain(id); }
      });
      const open = (id, push) => { KYT.ui.cityDetail.open(id, push); syncMain(id); };
      container.addEventListener('click', e => {
      if (e.target.closest('button, a, input, select, label, [data-state-toggle]')) return;      // card buttons keep their own behaviour
      const card = e.target.closest('[data-city-id]');
      if (card) open(card.dataset.cityId, true);
      });
      const nearby = document.getElementById('cd-nearby-list');
      if (nearby) nearby.addEventListener('click', e => { const n = e.target.closest('[data-nearby-id]'); if (n) open(n.dataset.nearbyId, true); });
      const close = () => KYT.ui.cityDetail.close(true);
      document.getElementById('btn-close-city-detail').addEventListener('click', close);
      document.getElementById('btn-back-city-detail').addEventListener('click', () => window.history.back());
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
      window.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close(); });
      window.addEventListener('popstate', () => {
      const id = new URLSearchParams(window.location.search).get('city');
      if (id) open(id, false); else if (!overlay.classList.contains('hidden')) KYT.ui.cityDetail.close(false);
      });
      document.getElementById('btn-share-city').addEventListener('click', () => {
      const t = document.getElementById('cd-title'), url = new URL(window.location.href); url.searchParams.set('city', t.dataset.cityId);
      const data = { title: `${t.textContent} - KYT Destination`, text: `Explore ${t.textContent} on KYT: attractions, travel styles, and nearby gems!`, url: url.toString() };
      if (navigator.share) navigator.share(data).catch(() => {}); else if (navigator.clipboard) navigator.clipboard.writeText(url.toString()).catch(() => {});
      });
      const initial = new URLSearchParams(window.location.search).get('city');
      if (initial) open(initial, false);
      })();
