/**
 * passport-extras.js — extras for visited.html
 *   1. Derived city attributes + the "Filters" sheet (vibe, setting, effort, food, region, state)
 *   2. Subtle, collapsible group-by-state rendering
 *   3. India Explorer Passport level (Bronze / Silver / Gold), breadth meters, and the share card (canvas image)
 *
 * Everything is derived from data already in data/cities.js; nothing is stored except the optional share name.
 */
window.PassportExtras = (function () {
  'use strict';

  // ── 1. Derived attributes ────────────────────────────────────────────────────────────────────
  const REGION_OF = {
    'Delhi': 'North', 'Punjab': 'North', 'Haryana': 'North', 'Himachal Pradesh': 'North', 'Uttarakhand': 'North',
    'Jammu and Kashmir': 'North', 'Ladakh': 'North', 'Chandigarh': 'North', 'Uttar Pradesh': 'North', 'Rajasthan': 'North',
    'Gujarat': 'West', 'Maharashtra': 'West', 'Goa': 'West',
    'Madhya Pradesh': 'Central', 'Chhattisgarh': 'Central',
    'Karnataka': 'South', 'Kerala': 'South', 'Tamil Nadu': 'South', 'Andhra Pradesh': 'South', 'Telangana': 'South', 'Puducherry': 'South',
    'West Bengal': 'East', 'Odisha': 'East', 'Bihar': 'East', 'Jharkhand': 'East',
    'Assam': 'North-East', 'Meghalaya': 'North-East', 'Arunachal Pradesh': 'North-East', 'Sikkim': 'North-East', 'Nagaland': 'North-East',
    'Andaman and Nicobar Islands': 'Islands', 'Lakshadweep': 'Islands'
  };
  const REGIONS = ['North', 'South', 'East', 'West', 'Central', 'North-East', 'Islands'];

  // Setting (coast / hills / plains) is data: each city in data/cities.js carries `"setting"`. The catalog `icon` is only a display
  // symbol and cannot tell hills from plains, so it is not used here.

  // Filter groups. Each option: key -> label; a city's `attrs` lists the keys it has.
  const GROUPS = [
    { id: 'vibe', label: 'Vibe', options: { spiritual: 'Spiritual', heritage: 'Heritage & culture', nature: 'Nature & beaches', adventure: 'Adventure', foodie: 'Foodie' } },
    { id: 'setting', label: 'Setting', options: { coast: 'Coast & backwaters', hills: 'Hills & forest' } },
    { id: 'effort', label: 'Effort', options: { easy: 'Easy going', trek: 'Has a trek' } },
    { id: 'food', label: 'Food', options: { veg: 'Veg / satvik', jain: 'Jain-friendly' } },
    { id: 'region', label: 'Region', options: Object.fromEntries(REGIONS.map(r => [r, r])) }
  ];

  // PassportStore hands us slim city objects; the raw data (beats, original icon) comes from KYT_CITIES.
  let srcById = null;
  const src = city => { if (!srcById) srcById = new Map((window.KYT_CITIES || []).map(c => [c.id, c])); return srcById.get(city.id) || city; };

  const cache = new Map();
  function attrs(city) {
    if (cache.has(city.id)) return cache.get(city.id);
    city = src(city);
    const beats = city.beats || [];
    const has = (k, f) => beats.some(b => [].concat(b[f] || []).includes(k));
    // vibe, setting and effort are data: each city in data/cities.js carries "vibes", "setting" and "effort". Food comes from the diet tags on its attractions.
    const a = { vibe: [].concat(city.vibes || []), setting: [], effort: [city.effort === 'trek' ? 'trek' : 'easy'], food: [], region: [] };
    if (city.setting === 'coast') a.setting.push('coast');
    if (city.setting === 'hills') a.setting.push('hills');
    if (has('veg', 'diet') || has('satvik', 'diet')) a.food.push('veg');
    if (has('jain', 'diet')) a.food.push('jain');
    if (REGION_OF[city.state]) a.region.push(REGION_OF[city.state]);
    cache.set(city.id, a);
    return a;
  }

  const filters = { vibe: new Set(), setting: new Set(), effort: new Set(), food: new Set(), region: new Set(), state: '' };
  const stateOf = c => c.state || 'Other';
  const activeCount = () => GROUPS.reduce((n, g) => n + filters[g.id].size, 0) + (filters.state ? 1 : 0);

  function matches(city, skipGroup) {
    const a = attrs(city);
    for (const g of GROUPS) {
      if (g.id === skipGroup || !filters[g.id].size) continue;
      if (!a[g.id].some(k => filters[g.id].has(k))) return false;   // OR inside a group
    }
    if (filters.state && skipGroup !== 'state' && stateOf(city) !== filters.state) return false;
    return true;                                                  // AND across groups
  }
  const apply = cities => cities.filter(c => matches(c));

  // ── Group by state ───────────────────────────────────────────────────────────────────────────
  const openStates = new Set();
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** Slim, collapsible state rows. `expandAll` is used while searching or filtering. */
  function renderGrouped(cities, cardHtml, expandAll) {
    const groups = new Map();
    cities.forEach(c => { const s = stateOf(c); (groups.get(s) || groups.set(s, []).get(s)).push(c); });
    const rows = [...groups.entries()].map(([state, list]) => ({ state, list, seen: list.filter(c => c.visited).length }))
      .sort((a, b) => b.seen - a.seen || a.state.localeCompare(b.state));
    return rows.map(({ state, list, seen }) => {
      const open = expandAll || openStates.has(state);
      const pct = Math.round(seen / list.length * 100);
      return `<div class="col-span-full">
        <button type="button" data-state-toggle="${esc(state)}" aria-expanded="${open}"
          class="w-full flex items-center gap-3 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-left hover:bg-slate-50 transition-colors">
          <span class="text-slate-400 text-xs transition-transform ${open ? 'rotate-90' : ''}" aria-hidden="true">&#9656;</span>
          <span class="flex-1 min-w-0 text-[13px] font-bold text-slate-700 truncate">${esc(state)}</span>
          <span class="w-14 h-1.5 rounded-full bg-slate-100 overflow-hidden shrink-0"><span class="block h-full rounded-full bg-amber-400" style="width:${pct}%"></span></span>
          <span class="text-[11px] font-bold ${seen ? 'text-amber-600' : 'text-slate-400'} tabular-nums w-9 text-right shrink-0">${seen}/${list.length}</span>
        </button>
      </div>${open ? list.map(cardHtml).join('') : ''}`;
    }).join('');
  }
  function toggleState(state) { openStates.has(state) ? openStates.delete(state) : openStates.add(state); }

  // ── Filter sheet + active chips ──────────────────────────────────────────────────────────────
  let onChange = () => {}, getCities = () => [];

  function chip(group, key, label, count, on) {
    return `<button type="button" data-g="${group}" data-k="${esc(key)}" aria-pressed="${on}"
      class="px-3 py-1.5 rounded-full border text-[13px] font-semibold transition-colors ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}">${esc(label)} <span class="${on ? 'text-blue-100' : 'text-slate-400'} font-medium">${count}</span></button>`;
  }

  function sheetBody() {
    const all = getCities();
    const states = [...new Set(all.map(stateOf))].sort();
    let html = GROUPS.map(g => `
      <div class="mb-5"><p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">${g.label}</p>
        <div class="flex flex-wrap gap-2">${Object.entries(g.options).map(([k, label]) => {
          const count = all.filter(c => attrs(c)[g.id].includes(k) && matches(c, g.id)).length;
          return chip(g.id, k, label, count, filters[g.id].has(k));
        }).join('')}</div></div>`).join('');
    html += `<div class="mb-2"><p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">State</p>
      <select id="pf-state" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700">
        <option value="">Any state</option>${states.map(s => `<option value="${esc(s)}" ${filters.state === s ? 'selected' : ''}>${esc(s)} (${all.filter(c => stateOf(c) === s && matches(c, 'state')).length})</option>`).join('')}
      </select></div>`;
    return html;
  }

  function refreshSheet() {
    const body = document.getElementById('pf-body'); if (!body) return;
    const top = body.scrollTop; body.innerHTML = sheetBody(); body.scrollTop = top;
    document.getElementById('pf-show').textContent = `Show ${apply(getCities()).length} cities`;
  }

  function ensureSheet() {
    if (document.getElementById('pf-overlay')) return;
    const el = document.createElement('div');
    el.id = 'pf-overlay';
    el.className = 'hidden fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center';
    el.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl" role="dialog" aria-modal="true" aria-label="Filter cities">
        <div class="flex items-center justify-between px-5 pt-5 pb-3"><h3 class="text-lg font-extrabold text-slate-900">Filter cities</h3>
          <button type="button" id="pf-close" class="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close">&#10005;</button></div>
        <div id="pf-body" class="px-5 pb-2 overflow-y-auto"></div>
        <div class="flex gap-3 px-5 py-4 border-t border-slate-100">
          <button type="button" id="pf-reset" class="px-4 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm">Reset</button>
          <button type="button" id="pf-show" class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm">Show cities</button></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('#pf-close') || e.target.closest('#pf-show')) return closeSheet();
      if (e.target.closest('#pf-reset')) { resetFilters(); refreshSheet(); return changed(); }
      const b = e.target.closest('[data-g]');
      if (b) { const s = filters[b.dataset.g]; s.has(b.dataset.k) ? s.delete(b.dataset.k) : s.add(b.dataset.k); refreshSheet(); changed(); }
    });
    el.addEventListener('change', e => { if (e.target.id === 'pf-state') { filters.state = e.target.value; refreshSheet(); changed(); } });
  }
  function openSheet() {
    ensureSheet();
    refreshSheet();
    document.getElementById('pf-overlay').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
  function closeSheet() {
    const o = document.getElementById('pf-overlay');
    if (o) o.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
  function resetFilters() {
    GROUPS.forEach(g => filters[g.id].clear());
    filters.state = '';
    activeQuestId = null;
  }

  function labelFor(gid, key) { const g = GROUPS.find(x => x.id === gid); return g ? g.options[key] : key; }
  function renderChips(el, btn, questBtn) {
    const n = activeCount();
    if (btn) { const badge = btn.querySelector('[data-badge]'); if (badge) { badge.textContent = n; badge.classList.toggle('hidden', !n); } }
    if (questBtn) {
      const qBadge = questBtn.querySelector('[data-quest-badge]');
      if (qBadge) {
        qBadge.classList.toggle('hidden', !activeQuestId);
      }
      questBtn.classList.toggle('border-blue-600', !!activeQuestId);
      questBtn.classList.toggle('bg-blue-50', !!activeQuestId);
      questBtn.classList.toggle('text-blue-700', !!activeQuestId);
    }
    if (!el) return;
    const items = [];
    GROUPS.forEach(g => filters[g.id].forEach(k => items.push([g.id, k, labelFor(g.id, k)])));
    if (filters.state) items.push(['state', filters.state, filters.state]);
    el.classList.toggle('hidden', !items.length);
    el.innerHTML = items.map(([g, k, l]) => `<button type="button" data-rm-g="${g}" data-rm-k="${esc(k)}" class="shrink-0 inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">${esc(l)} <span aria-hidden="true" class="text-blue-400">&#10005;</span></button>`).join('') +
      (items.length > 1 ? `<button type="button" data-rm-all class="shrink-0 text-xs font-bold text-slate-400 px-2 cursor-pointer">Clear all</button>` : '');
  }
  function removeChip(g, k) {
    if (g === 'quest') activeQuestId = null;
    else if (g === 'state') filters.state = '';
    else filters[g].delete(k);
  }

  function changed() { onChange(); }
  function init(opts) { onChange = opts.onChange; getCities = opts.getCities; }

  // ── 3. Share card: dashboard header, level sticker, the app's seal, and the list of stamped cities ──────────
  const W = 1080, H = 1350, NAVY = '#1e1b4b', ORANGE = '#f97316', CREAM = '#fff7ed', INK = '#e11d48';

  /** Three levels. Silver at 8 cities; Gold at 25 cities or 10 states & UTs. Edit here to re-tune. */
  const LEVELS = [
    { id: 'bronze', title: 'Bronze', line: 'Your passport is open', c1: '#e9b98a', c2: '#c27a3a', min: 0 },
    { id: 'silver', title: 'Silver', line: 'Properly well travelled', c1: '#f1f5f9', c2: '#a8b3c4', min: 8 },
    { id: 'gold', title: 'Gold', line: 'India, well and truly covered', c1: '#fde68a', c2: '#f5b014', min: 25 }
  ];
  const GOLD_STATES = 10;

  function persona(visited) {
    const cities = visited.length, states = new Set(visited.map(stateOf)).size;
    let i = 0;
    if (cities >= LEVELS[2].min || states >= GOLD_STATES) i = 2;
    else if (cities >= LEVELS[1].min) i = 1;
    const lv = LEVELS[i], next = LEVELS[i + 1];
    return { ...lv, label: lv.title.toUpperCase(), level: i + 1, next: next ? { title: next.title, need: Math.max(1, next.min - cities) } : null };
  }

  function stats(all, visited) {
    const states = new Set(visited.map(stateOf)), allStates = new Set(all.map(stateOf));
    return { cities: visited.length, total: all.length, states: states.size, totalStates: allStates.size, pct: Math.round(visited.length / all.length * 100) };
  }

  /** Landscape of a city: coast, hills, or plains (neither). */
  const landscape = c => { const s = attrs(c).setting; return s.includes('coast') ? 'Coast' : s.includes('hills') ? 'Hills' : 'Plains'; };

  /**
   * "Passport strength": how broad the stamps are, as progress meters. Each meter counts distinct values reached
   * out of the values that exist in the catalog, and `missing` names what would fill the next segment.
   */
  function meters(all, visited) {
    const VIBES = { spiritual: 'Spiritual', heritage: 'Heritage', nature: 'Nature', adventure: 'Adventure', foodie: 'Foodie' };
    const dims = [
      { id: 'states', label: 'States & UTs', pick: c => [stateOf(c)] },
      { id: 'regions', label: 'Regions', pick: c => attrs(c).region, order: REGIONS },
      { id: 'vibes', label: 'Experiences', pick: c => attrs(c).vibe, order: Object.keys(VIBES), name: k => VIBES[k] },
      { id: 'landscapes', label: 'Landscapes', pick: c => [landscape(c)], order: ['Coast', 'Hills', 'Plains'] }
    ];
    return dims.map(d => {
      const universe = new Set(all.flatMap(d.pick)), got = new Set(visited.flatMap(d.pick));
      const nm = d.name || (k => k);
      const items = d.order ? d.order.filter(k => universe.has(k)).map(k => ({ name: nm(k), on: got.has(k) })) : null;   // named chips (not for the 30 states)
      return { id: d.id, label: d.label, got: got.size, of: universe.size, items, missing: items ? items.filter(i => !i.on).map(i => i.name) : [] };
    });
  }

  /** In-page strength panel for the hero: level chip, four segmented meters, and one nudge toward the next segment. */
  let strengthOpen = null;                                      // null = never toggled: open on wide screens, closed on phones
  function renderStrength(el, all) {
    if (!el) return;
    const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
    const desktop = mq('(min-width: 1024px)');                    // side-by-side header: the panel is always open there
    const wasOpen = desktop || (strengthOpen !== null ? strengthOpen : mq('(min-width: 640px)'));
    const visited = all.filter(c => c.visited), P = persona(visited), M = meters(all, visited);
    const medal = { bronze: 'from-amber-200 to-amber-600', silver: 'from-slate-100 to-slate-400', gold: 'from-yellow-200 to-amber-400' }[P.id];
    const bar = m => { const n = 10, lit = Math.round(m.got / m.of * n);
      return `<div class="flex gap-1">${Array.from({ length: n }, (_, k) => `<span class="h-1.5 flex-1 rounded-full ${k < lit ? 'bg-amber-400' : 'bg-white/15'}"></span>`).join('')}</div>`; };
    const chips = m => `<div class="flex flex-wrap gap-1.5">${m.items.map(i => `<span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${i.on ? 'bg-amber-400 text-slate-900' : 'border border-white/20 text-slate-400'}">${esc(i.name)}</span>`).join('')}</div>`;
    const gap = M.find(m => m.missing.length && m.id !== 'states');
    const nudge = !visited.length ? 'Stamp your first city to start filling the meters.'
      : P.next ? `${P.next.need} more ${P.next.need === 1 ? 'city' : 'cities'} to ${P.next.title}.` : 'Gold level reached.';
    const tip = gap && visited.length ? ` Add ${gap.missing.slice(0, 2).map(k => k.toLowerCase()).join(' or ')} to fill ${gap.label}.` : '';
    el.innerHTML = `
      <details ${wasOpen ? 'open' : ''} class="group">
        <summary class="flex items-center gap-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden lg:cursor-default lg:pointer-events-none" data-level="${P.id}">
          <span class="w-8 h-8 rounded-full bg-gradient-to-br ${medal} text-slate-900 text-xs font-black flex items-center justify-center shadow ring-2 ring-white/30 shrink-0">${P.level}</span>
          <div class="text-left leading-tight flex-1 min-w-0"><div class="text-sm font-black text-white">${P.title} level <span class="text-[11px] font-semibold text-slate-400">· Passport strength</span></div><div class="text-[11px] font-semibold text-slate-300">${esc(nudge + tip)}</div></div>
          <span class="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 lg:hidden"><span class="group-open:hidden">Details</span><span class="hidden group-open:inline">Hide</span><span class="transition-transform group-open:rotate-90" aria-hidden="true">&#9656;</span></span>
        </summary>
        <div class="flex flex-col gap-3 text-left mt-3.5">${M.map(m => `
          <div data-meter="${m.id}"><div class="flex justify-between text-[11px] font-bold text-slate-200 mb-1.5"><span>${m.label}</span><span class="tabular-nums text-slate-300">${m.got}/${m.of}</span></div>
          ${m.items ? chips(m) : bar(m)}</div>`).join('')}</div>
      </details>`;
    const d = el.querySelector('details'); if (d) d.addEventListener('toggle', () => { if (!mq('(min-width: 1024px)')) strengthOpen = d.open; });
  }

  // ── 4. Explorer Quests Sheet (Selection List by Category) ──────────────────────────────────
  let activeQuestId = null;
  let activeQuestCategory = 'all';

  const ALL_QUESTS_ENTRY = {
    id: 'all',
    title: 'All Explorer Quests',
    subtitle: 'Curated thematic trails across spiritual, heritage, nature and regional journeys',
    icon: 'compass',
    category: 'all',
    get cityIds() {
      if (!window.KYT_QUESTS) return [];
      const set = new Set();
      window.KYT_QUESTS.forEach(q => q.cityIds.forEach(id => set.add(id)));
      return Array.from(set);
    }
  };

  function getActiveQuest() {
    if (!activeQuestId) return null;
    if (activeQuestId === 'all') return ALL_QUESTS_ENTRY;
    if (!window.KYT_QUEST_STORE) return null;
    return window.KYT_QUEST_STORE.getById(activeQuestId);
  }

  function setActiveQuest(id) {
    activeQuestId = (activeQuestId === id) ? null : (id || null);
  }

  function questsSheetBody() {
    const all = getCities();
    const visitedSet = new Set(all.filter(c => c.visited).map(c => c.id));
    const allQuests = window.KYT_QUEST_STORE ? window.KYT_QUEST_STORE.getAll() : [];
    const categories = window.KYT_QUEST_STORE ? window.KYT_QUEST_STORE.getCategories() : [];

    // 1. Category / Pillar Tabs
    let html = `<div class="mb-4">
      <p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Pillar / Category</p>
      <div class="flex flex-wrap gap-1.5" id="pq-cat-tabs">`;

    categories.forEach(cat => {
      const count = cat.id === 'all' ? allQuests.length : allQuests.filter(q => q.category === cat.id).length;
      const isActive = activeQuestCategory === cat.id;
      html += `<button type="button" data-pq-cat="${cat.id}"
        class="px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${isActive ? 'bg-slate-900 text-white shadow-2xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        ${cat.label} <span class="${isActive ? 'text-slate-300' : 'text-slate-400'} font-medium text-[11px]">${count}</span>
      </button>`;
    });
    html += `</div></div>`;

    // Active Quest Indicator / Clear Option (if one is already active)
    if (activeQuestId) {
      const cur = getActiveQuest();
      html += `<div class="mb-3.5 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <i data-lucide="check-circle-2" class="w-4 h-4 text-blue-600 shrink-0"></i>
          <span class="text-xs font-bold text-blue-900 truncate">Active: ${esc(cur?.title || '')}</span>
        </div>
        <button type="button" data-pq-id="" class="text-xs font-black text-blue-700 hover:text-blue-900 cursor-pointer underline shrink-0">Clear Quest</button>
      </div>`;
    }

    // 2. Quest Selection List (single scrollbar, spacious and readable)
    html += `<div>
      <p class="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Select a Quest</p>
      <div class="flex flex-col gap-2">`;

    // When in "all" category, show "All Explorer Quests" as the first selection item
    if (activeQuestCategory === 'all') {
      const isSelectedAll = activeQuestId === 'all';
      const allQuestCityIds = ALL_QUESTS_ENTRY.cityIds;
      const seenAll = allQuestCityIds.filter(id => visitedSet.has(id)).length;
      const totalAll = allQuestCityIds.length;
      let allBadgeHtml = '';
      if (seenAll === totalAll && totalAll > 0) {
        allBadgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-400 text-slate-900 shrink-0 shadow-2xs">🏆 ${totalAll}/${totalAll}</span>`;
      } else if (seenAll > 0) {
        allBadgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 shrink-0">${seenAll}/${totalAll} visited</span>`;
      }

      html += `<button type="button" data-pq-id="all"
        class="w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${isSelectedAll ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/20 shadow-xs' : 'bg-gradient-to-r from-blue-50/50 via-indigo-50/30 to-slate-50 border-blue-200/80 hover:bg-blue-50 hover:border-blue-300'}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl ${isSelectedAll ? 'bg-blue-600 text-white' : 'bg-white border border-blue-200 text-blue-600'} flex items-center justify-center shrink-0 shadow-2xs">
            <i data-lucide="compass" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-sm font-black text-slate-900 leading-snug">All Explorer Quests</div>
            <div class="text-xs font-semibold text-slate-500 mt-0.5">28 Quests · ${totalAll} destinations</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${allBadgeHtml}
          ${isSelectedAll ? `<i data-lucide="check-circle-2" class="w-5 h-5 text-blue-600 shrink-0"></i>` : `<i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 shrink-0"></i>`}
        </div>
      </button>`;
    }

    // Quest items in active category
    const filtered = window.KYT_QUEST_STORE ? window.KYT_QUEST_STORE.getByCategory(activeQuestCategory) : [];
    filtered.forEach(q => {
      const isSelected = activeQuestId === q.id;
      const seen = q.cityIds.filter(id => visitedSet.has(id)).length;
      const total = q.cityIds.length;
      const isComplete = seen === total;

      // Point 3: Summarized data ONLY where completed or partial (zero clutter if 0 visited)
      let badgeHtml = '';
      if (isComplete) {
        badgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-400 text-slate-900 shrink-0 shadow-2xs">🏆 ${total}/${total}</span>`;
      } else if (seen > 0) {
        badgeHtml = `<span class="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 shrink-0">${seen}/${total} visited</span>`;
      }

      html += `<button type="button" data-pq-id="${q.id}"
        class="w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 cursor-pointer ${isSelected ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/20 shadow-xs' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300'}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-10 h-10 rounded-xl ${isSelected ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'} flex items-center justify-center shrink-0 shadow-2xs">
            <i data-lucide="${q.icon}" class="w-5 h-5"></i>
          </div>
          <div class="min-w-0">
            <div class="text-sm font-black text-slate-800 leading-snug">${esc(q.title)}</div>
            <div class="text-xs font-semibold text-slate-400 mt-0.5">${q.cityIds.length} destinations</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          ${badgeHtml}
          ${isSelected ? `<i data-lucide="check-circle-2" class="w-5 h-5 text-blue-600 shrink-0"></i>` : `<i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 shrink-0"></i>`}
        </div>
      </button>`;
    });

    html += `</div></div>`;
    return html;
  }

  function refreshQuestsSheet() {
    const body = document.getElementById('pq-body');
    if (!body) return;
    const top = body.scrollTop;
    body.innerHTML = questsSheetBody();
    body.scrollTop = top;
    if (window.lucide) window.lucide.createIcons();
  }

  function ensureQuestsSheet() {
    if (document.getElementById('pq-overlay')) return;
    const el = document.createElement('div');
    el.id = 'pq-overlay';
    el.className = 'hidden fixed inset-0 z-[90] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center overflow-hidden';
    el.innerHTML = `
      <div class="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] sm:max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" role="dialog" aria-modal="true" aria-label="Explorer Quests">
        <div class="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h3 class="text-lg font-black text-slate-900 flex items-center gap-2">
              <i data-lucide="compass" class="w-5 h-5 text-blue-600"></i> Explorer Quests
            </h3>
            <p class="text-xs text-slate-500 font-medium mt-0.5">Choose a quest to explore its destinations</p>
          </div>
          <button type="button" id="pq-close" class="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer" aria-label="Close">&#10005;</button>
        </div>
        <div id="pq-body" class="p-5 overflow-y-auto overscroll-contain flex-1"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('#pq-close')) return closeQuestsSheet();
      const catBtn = e.target.closest('[data-pq-cat]');
      if (catBtn) {
        activeQuestCategory = catBtn.dataset.pqCat;
        refreshQuestsSheet();
        return;
      }
      const questBtn = e.target.closest('[data-pq-id]');
      if (questBtn) {
        const qid = questBtn.dataset.pqId;
        setActiveQuest(qid);
        closeQuestsSheet();
        changed();
      }
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const o = document.getElementById('pq-overlay');
        if (o && !o.classList.contains('hidden')) closeQuestsSheet();
      }
    });
  }

  function openQuestsSheet() {
    ensureQuestsSheet();
    refreshQuestsSheet();
    const o = document.getElementById('pq-overlay');
    if (o) o.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeQuestsSheet() {
    const o = document.getElementById('pq-overlay');
    if (o) o.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  /**
   * The app's "Been There Done That" seal, same geometry as the passport cards in ui-components.js:
   * viewBox 100, text on a r=35 circle starting at 9 o'clock (clockwise), 10.5 / 900 / letter-spacing 3.5,
   * inner ring r=24 (stroke 2, 40%), outer ring r=46 (stroke 2.5, dashed 4 2, 80%).
   */
  function drawSeal(ctx, cx, cy, size, color, rot, alpha = 1) {
    const k = size / 100;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(k, k); ctx.translate(-50, -50);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'butt';
    ctx.globalAlpha = 0.4 * alpha; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(50, 50, 24, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.8 * alpha; ctx.lineWidth = 2.5; ctx.setLineDash([4, 2]); ctx.beginPath(); ctx.arc(50, 50, 46, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
    ctx.font = '900 10.5px "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const R = 35, circ = 2 * Math.PI * R, SP = 3.5;
    let s = 0;
    for (const ch of 'BEEN THERE DONE THAT • ') {
      const w = ctx.measureText(ch).width, mid = s + w / 2;
      if (mid > circ) break;                                     // like the SVG, glyphs past the path end are not drawn
      const phi = Math.PI + mid / R;
      ctx.save(); ctx.translate(50 + R * Math.cos(phi), 50 + R * Math.sin(phi)); ctx.rotate(phi + Math.PI / 2);
      if (ch !== ' ') ctx.fillText(ch, 0, 0);
      ctx.restore();
      s += w + SP;
    }
    ctx.restore();
  }

  /**
   * Passport-page layout: names A-Z, flowing down columns. Picks the column count (3-6) and the largest font that fits
   * the box; as a last resort ends with "+N more".
   */
  function layoutColumns(ctx, names, width, height, F) {
    const n = names.length, gap = 20;
    let best = null;
    for (let cols = 3; cols <= 6; cols++) {
      const colW = (width - gap * (cols - 1)) / cols, rows = Math.ceil(n / cols);
      for (let size = 30; size >= 13; size--) {
        ctx.font = F(600, size);
        const lh = Math.round(size * 1.55);
        if (rows * lh > height) continue;
        if (Math.max(...names.map(x => ctx.measureText(x).width)) > colW) continue;
        if (!best || size > best.size) best = { cols, rows, size, lh, colW, gap, names };
        break;
      }
    }
    if (best) return best;
    const cols = 6, size = 13, lh = Math.round(size * 1.55), rows = Math.floor(height / lh), cap = cols * rows;
    ctx.font = F(600, size);
    return { cols, rows, size, lh, colW: (width - gap * 5) / 6, gap, names: n <= cap ? names : names.slice(0, cap - 1).concat(`+${n - cap + 1} more`) };
  }

  /** Level rosette: scalloped metal medal with the level name and 1-3 stars. */
  function drawLevelSeal(ctx, cx, cy, r, P, rot) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    const k = 28, path = rad => { ctx.beginPath(); for (let i = 0; i <= k * 2; i++) { const a = i / (k * 2) * Math.PI * 2, rr2 = i % 2 ? rad * 0.93 : rad; ctx[i ? 'lineTo' : 'moveTo'](rr2 * Math.cos(a), rr2 * Math.sin(a)); } ctx.closePath(); };
    ctx.fillStyle = NAVY; path(r + 4); ctx.save(); ctx.translate(7, 9); ctx.fill(); ctx.restore();
    const g = ctx.createLinearGradient(-r, -r, r, r); g.addColorStop(0, P.c1); g.addColorStop(.5, P.c2); g.addColorStop(1, P.c1);
    ctx.fillStyle = g; path(r); ctx.fill(); ctx.strokeStyle = NAVY; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = 'rgba(30,27,75,.55)'; ctx.lineWidth = 3; ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = NAVY; ctx.textAlign = 'center';
    ctx.font = `800 ${Math.round(r * 0.15)}px "Plus Jakarta Sans", system-ui, sans-serif`; ctx.fillText('EXPLORER', 0, -r * 0.38);
    ctx.font = `800 ${Math.round(r * 0.42)}px "Plus Jakarta Sans", system-ui, sans-serif`; ctx.fillText(P.title.toUpperCase(), 0, r * 0.14, r * 1.45);
    for (let i = 0; i < 3; i++) {                                 // stars: one per level reached
      const sx = (i - 1) * r * 0.3, sy = r * 0.5, R = r * 0.12;
      ctx.beginPath(); for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + j * Math.PI / 5, q = j % 2 ? R * 0.45 : R; ctx[j ? 'lineTo' : 'moveTo'](sx + q * Math.cos(a), sy + q * Math.sin(a)); } ctx.closePath();
      if (i < P.level) { ctx.fillStyle = NAVY; ctx.fill(); } else { ctx.strokeStyle = 'rgba(30,27,75,.45)'; ctx.lineWidth = 2.5; ctx.stroke(); }
    }
    ctx.restore();
  }

  // The app's real logo (same file as the home page header). Loaded once; `ready()` resolves when drawn output can include it.
  let logo = null, logoP = null;
  function ready() {
    if (logoP) return logoP;
    logoP = new Promise(res => { const im = new Image(); im.onload = () => { logo = im; res(); }; im.onerror = () => res(); im.src = './icons/KYT.jpg'; });
    return logoP;
  }

  /** Deterministic pseudo-random numbers, so the paper texture is the same every time the card is drawn. */
  const prng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  /** A sheet of paper on a desk: deckled edge, soft shadow, fibre grain. */
  function paperSheet(ctx) {
    const rnd = prng(20260);
    ctx.fillStyle = '#e8dcc8'; ctx.fillRect(0, 0, W, H);
    const m = 26, step = 7, pts = [];
    const edge = (x0, y0, x1, y1) => { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.round(len / step); let o = 0;
      for (let i = 0; i < n; i++) { o = Math.max(-2.4, Math.min(2.4, o + (rnd() - .5) * 1.8)); const t = i / n, nx = (y1 - y0) / len, ny = -(x1 - x0) / len;
        pts.push([x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o]); } };
    edge(m + 14, m, W - m - 14, m); edge(W - m, m + 14, W - m, H - m - 14); edge(W - m - 14, H - m, m + 14, H - m); edge(m, H - m - 14, m, m + 14);
    const path = () => { ctx.beginPath(); ctx.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
      for (let i = 1; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); } ctx.closePath(); };
    ctx.save(); ctx.shadowColor = 'rgba(70,45,10,.30)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 7;
    ctx.fillStyle = '#fffaf0'; path(); ctx.fill(); ctx.restore();
    ctx.save(); path(); ctx.clip();
    const pg = ctx.createLinearGradient(0, 0, W, H); pg.addColorStop(0, '#fffdf7'); pg.addColorStop(1, '#f8efdc'); ctx.fillStyle = pg; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 7000; i++) { ctx.fillStyle = `rgba(120,90,40,${(.03 + rnd() * .05).toFixed(3)})`; const r = .5 + rnd() * 1.1; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, r, 0, 7); ctx.fill(); }
    ctx.lineWidth = 1; for (let i = 0; i < 220; i++) { const x = rnd() * W, y = rnd() * H, a = rnd() * 6.28, l = 6 + rnd() * 16;
      ctx.strokeStyle = `rgba(140,110,60,${(.04 + rnd() * .05).toFixed(3)})`; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l / 2 + 3, y + Math.sin(a) * l / 2 - 3, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
    const glow = ctx.createLinearGradient(0, 0, 0, H); glow.addColorStop(0, 'rgba(255,255,255,0)'); glow.addColorStop(1, 'rgba(160,120,60,.10)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.save(); path(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(120,90,40,.35)'; ctx.stroke(); ctx.restore();
  }

  /** Dark-panel chips for a meter's named values; lit when stamped. Returns the y below the last row. */
  function drawChips(ctx, items, x, y, maxW, F) {
    const h = 28, gx = 6, gy = 6; ctx.font = F(700, 18); ctx.textAlign = 'left';
    let cx = x, cy = y;
    items.forEach(it => {
      const w = ctx.measureText(it.name).width + 22;
      if (cx > x && cx + w > x + maxW) { cx = x; cy += h + gy; }
      if (it.on) { ctx.fillStyle = '#fbbf24'; rr(ctx, cx, cy, w, h, 15); ctx.fill(); ctx.fillStyle = NAVY; }
      else { ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2; rr(ctx, cx + 1, cy + 1, w - 2, h - 2, 14); ctx.stroke(); ctx.fillStyle = 'rgba(199,210,254,.6)'; }
      ctx.fillText(it.name, cx + 11, cy + 20); cx += w + gx;
    });
    return cy + h;
  }

  function getTopQuests(visited, limit = 3) {
    const quests = window.KYT_QUESTS || [];
    if (!quests.length) return [];
    const visitedSet = new Set(visited.map(c => c.id));
    const scored = quests.map(q => {
      const got = q.cityIds.filter(id => visitedSet.has(id)).length;
      const total = q.cityIds.length;
      const pct = total ? got / total : 0;
      return {
        id: q.id,
        title: q.title,
        got,
        of: total,
        pct,
        completed: got === total && total > 0
      };
    });
    scored.sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      if (b.got !== a.got) return b.got - a.got;
      return 0;
    });
    return scored.slice(0, limit);
  }

  function drawCard(canvas, all, visited, name, showCities, showQuests = true) {
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const F = (w, s) => `${w} ${s}px "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif`;
    const S = stats(all, visited), P = persona(visited), M = meters(all, visited);
    ctx.textBaseline = 'alphabetic';

    // a sheet of paper: deckled edge, shadow, fibres
    paperSheet(ctx);

    // brand row: the real KYT logo and the feature name; the level seal sits in the top-right corner
    let bx0 = 84;
    if (logo) { const lh = 72, lw = Math.round(lh * logo.width / logo.height); ctx.drawImage(logo, 84, 62, lw, lh); bx0 = 84 + lw + 26; }
    else { ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = F(800, 44); ctx.fillText('KYT', 84, 118); bx0 = 200; }
    ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = F(800, 28); ctx.fillText('INDIA EXPLORER', bx0, 96);
    ctx.fillText('PASSPORT', bx0, 130);

    // ── dashboard header ─────────────────────────────────────────────────────────────────────
    const px = 70, py = 170, pw = W - 140, ph = 470;
    const g = ctx.createLinearGradient(px, py, px + pw, py + ph); g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#312e81');
    ctx.fillStyle = g; rr(ctx, px, py, pw, ph, 40); ctx.fill();

    const who = (name || '').trim();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    if (who) {
      ctx.font = '800 28px "Doto", "Courier New", monospace';
      try { ctx.letterSpacing = '1px'; } catch (e) {}
      ctx.fillText(who.toUpperCase(), px + 44, py + 60, 520);
      try { ctx.letterSpacing = '0px'; } catch (e) {}
    } else {
      ctx.font = F(800, 26);
      ctx.fillText('MY INDIA SO FAR', px + 44, py + 60);
    }

    const num = String(S.cities), nsz = num.length >= 3 ? 210 : 250;
    ctx.font = F(800, nsz); ctx.fillStyle = '#fff'; ctx.fillText(num, px + 44, py + 286);
    const nw = ctx.measureText(num).width;
    ctx.fillStyle = '#fff'; ctx.font = F(800, 36); ctx.fillText('cities stamped', px + 48, py + 338);
    const csw = ctx.measureText('cities stamped').width;
    ctx.fillStyle = '#a5b4fc'; ctx.font = F(600, 26); ctx.fillText(`of ${S.total}`, px + 48 + csw + 16, py + 338);

    // left column: progress to the next level
    const tx = Math.max(px + 44 + nw + 50, px + pw - 480), tw = px + pw - 44 - tx;
    const bx = px + 48, bw = Math.min(tx - 40 - bx, 420), by = py + 366;
    ctx.fillStyle = 'rgba(255,255,255,.15)'; rr(ctx, bx, by, bw, 16, 8); ctx.fill();
    const fw = S.cities ? Math.max(bw * S.cities / S.total, 24) : 0;
    if (fw) { const gg = ctx.createLinearGradient(bx, 0, bx + bw, 0); gg.addColorStop(0, '#fbbf24'); gg.addColorStop(.5, '#fcd34d'); gg.addColorStop(1, '#34d399'); ctx.fillStyle = gg; rr(ctx, bx, by, fw, 16, 8); ctx.fill(); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#c7d2fe'; ctx.font = F(600, 24);
    ctx.fillText(P.next ? `${P.next.need} more ${P.next.need === 1 ? 'city' : 'cities'} to reach ${P.next.title}` : 'Gold reached. Top level.', bx, py + 424, bw + 20);

    // right column: passport strength, with the named values as chips
    ctx.textAlign = 'left'; ctx.fillStyle = '#a5b4fc'; ctx.font = F(800, 20); ctx.fillText('PASSPORT STRENGTH', tx, py + 104);
    let y = py + 124;
    const metersToShow = showQuests ? M.filter(m => m.id === 'states' || m.id === 'regions') : M;
    metersToShow.forEach(m => {
      ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = F(700, 22); ctx.fillText(m.label, tx, y + 18);
      ctx.textAlign = 'right'; ctx.fillStyle = '#c7d2fe'; ctx.fillText(`${m.got}/${m.of}`, tx + tw, y + 18);
      if (m.items) y = drawChips(ctx, m.items, tx, y + 28, tw, F) + 12;
      else {
        const n = 10, lit = Math.round(m.got / m.of * n), gap = 6, sw = (tw - gap * (n - 1)) / n;
        for (let k = 0; k < n; k++) { ctx.fillStyle = k < lit ? '#fbbf24' : 'rgba(255,255,255,.16)'; rr(ctx, tx + k * (sw + gap), y + 30, sw, 11, 5); ctx.fill(); }
        y += 54;
      }
    });

    if (showQuests) {
      const topQuests = getTopQuests(visited, 3);
      if (topQuests.length) {
        y += 6;
        ctx.textAlign = 'left'; ctx.fillStyle = '#a5b4fc'; ctx.font = F(800, 18); ctx.fillText('TOP QUESTS', tx, y + 14);
        y += 24;
        topQuests.forEach(q => {
          ctx.textAlign = 'left';
          ctx.fillStyle = '#fff';
          ctx.font = F(700, 18);
          ctx.fillText(q.title, tx, y + 14, tw - 60);

          ctx.textAlign = 'right';
          ctx.fillStyle = q.completed ? '#34d399' : '#c7d2fe';
          ctx.font = F(700, 16);
          ctx.fillText(`${q.got}/${q.of}`, tx + tw, y + 14);

          // mini progress bar
          const barY = y + 22, barH = 6;
          ctx.fillStyle = 'rgba(255,255,255,.16)';
          rr(ctx, tx, barY, tw, barH, 3);
          ctx.fill();
          if (q.got > 0) {
            const fillW = Math.max(Math.round(tw * (q.got / q.of)), 8);
            ctx.fillStyle = q.completed ? '#34d399' : '#fbbf24';
            rr(ctx, tx, barY, fillW, barH, 3);
            ctx.fill();
          }
          y += 36;
        });
      }
    }

    // level seal in the top-right corner, overlapping the dashboard edge
    drawLevelSeal(ctx, W - 178, 160, 100, P, 0.12);

    // ── passport page: the app's big "Been There Done That" seal as the background, stamped cities in columns ──
    const gx = 70, gy = 662, gw = W - 140, gh = 622;
    ctx.save(); ctx.shadowColor = 'rgba(90,60,10,.20)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#fffefb'; rr(ctx, gx, gy, gw, gh, 22); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(120,90,40,.28)'; ctx.lineWidth = 2; rr(ctx, gx, gy, gw, gh, 22); ctx.stroke();
    ctx.save(); rr(ctx, gx, gy, gw, gh, 22); ctx.clip();
    if (showCities) drawSeal(ctx, W / 2, gy + gh / 2 + 18, 600, INK, -0.2, 0.16);
    else drawSeal(ctx, W / 2, gy + gh / 2, 520, INK, -0.2, 1);
    ctx.restore();

    if (showCities) {
      ctx.textAlign = 'left'; ctx.fillStyle = NAVY; ctx.font = F(800, 24); ctx.fillText(`STAMPED CITIES  ·  ${S.cities}`, gx + 40, gy + 58);
      ctx.strokeStyle = 'rgba(30,27,75,.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx + 40, gy + 78); ctx.lineTo(gx + gw - 40, gy + 78); ctx.stroke();
      const names = visited.map(c => c.name).sort((a, b) => a.localeCompare(b));
      const L = layoutColumns(ctx, names, gw - 80, gh - 112, F);
      ctx.fillStyle = '#1f2937'; ctx.font = F(600, L.size); ctx.textAlign = 'left';
      L.names.forEach((nm, i) => {
        const col = Math.floor(i / L.rows), row = i % L.rows;
        ctx.fillText(nm, gx + 40 + col * (L.colW + L.gap), gy + 78 + 18 + L.size + row * L.lh, L.colW);
      });
    }
    return S;
  }

  function openShare(all) {
    const visited = all.filter(c => c.visited);
    let overlay = document.getElementById('share-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'share-overlay';
      overlay.className = 'fixed inset-0 z-[95] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4';
      overlay.innerHTML = `
        <div class="bg-white rounded-3xl w-full max-w-sm max-h-[94vh] overflow-y-auto p-4 shadow-2xl" role="dialog" aria-modal="true" aria-label="Share your passport">
          <div class="flex items-center justify-between mb-3"><h3 class="text-base font-extrabold text-slate-900">Your share card</h3>
            <button type="button" id="sh-close" class="p-2 rounded-full bg-slate-100 text-slate-500" aria-label="Close">&#10005;</button></div>
          <canvas id="sh-canvas" class="w-full h-auto rounded-2xl border border-slate-200 bg-orange-50"></canvas>
          <div class="mt-3 space-y-2">
            <label class="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
              <input id="sh-inc-name" type="checkbox" checked class="w-4 h-4 accent-blue-600 rounded">
              <span>Include my name on card</span>
            </label>
            <div id="sh-name-wrap">
              <input id="sh-name" type="text" maxlength="29" placeholder="Enter your name" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
            <label class="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
              <input id="sh-quests" type="checkbox" checked class="w-4 h-4 accent-blue-600 rounded">
              <span>Include Explorer Quests</span>
            </label>
            <label class="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer select-none">
              <input id="sh-list" type="checkbox" checked class="w-4 h-4 accent-blue-600 rounded">
              <span>List my stamped cities</span>
            </label>
          </div>
          <p class="text-[11px] text-slate-400 mt-1">Untick to share only the numbers. Dates are never shown.</p>
          <div class="flex gap-2.5 mt-3"><button type="button" id="sh-save" class="flex-1 py-3 rounded-xl bg-slate-100 text-slate-800 font-bold text-sm">Save image</button>
            <button type="button" id="sh-share" class="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold text-sm">Share</button></div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('#sh-close')) overlay.classList.add('hidden'); });
    }
    overlay.classList.remove('hidden');
    const canvas = overlay.querySelector('#sh-canvas'), nameEl = overlay.querySelector('#sh-name');
    const incNameEl = overlay.querySelector('#sh-inc-name'), nameWrap = overlay.querySelector('#sh-name-wrap');
    const questsEl = overlay.querySelector('#sh-quests');
    const listEl = overlay.querySelector('#sh-list');

    let saved = ''; try { saved = localStorage.getItem('kyt_share_name') || ''; } catch (e) {}
    nameEl.value = saved;

    let savedInc = true;
    try {
      const stored = localStorage.getItem('kyt_share_inc_name');
      if (stored !== null) savedInc = stored === 'true';
    } catch (e) {}
    if (incNameEl) {
      incNameEl.checked = savedInc;
      if (nameWrap) nameWrap.classList.toggle('hidden', !savedInc);
    }

    let savedQuests = true;
    try {
      const storedQ = localStorage.getItem('kyt_share_quests');
      if (storedQ !== null) savedQuests = storedQ === 'true';
    } catch (e) {}
    if (questsEl) questsEl.checked = savedQuests;

    const getName = () => (incNameEl && incNameEl.checked ? nameEl.value.trim() : '');
    const showQuests = () => (questsEl ? questsEl.checked : true);
    const draw = () => drawCard(canvas, all, visited, getName(), listEl.checked, showQuests());
    if (incNameEl) {
      incNameEl.onchange = () => {
        try { localStorage.setItem('kyt_share_inc_name', incNameEl.checked ? 'true' : 'false'); } catch (e) {}
        if (nameWrap) nameWrap.classList.toggle('hidden', !incNameEl.checked);
        if (incNameEl.checked) nameEl.focus();
        draw();
      };
    }
    if (questsEl) {
      questsEl.onchange = () => {
        try { localStorage.setItem('kyt_share_quests', questsEl.checked ? 'true' : 'false'); } catch (e) {}
        draw();
      };
    }
    listEl.onchange = draw;
    const redraw = () => Promise.all([
      document.fonts && document.fonts.load ? Promise.all([
        ...['600', '700', '800'].map(w => document.fonts.load(w + ' 40px "Plus Jakarta Sans"')),
        document.fonts.load('800 28px "Doto"')
      ]).catch(() => {}) : null,
      ready()
    ]).then(draw);
    redraw();
    nameEl.oninput = () => { try { localStorage.setItem('kyt_share_name', nameEl.value); } catch (e) {} draw(); };
    const toBlob = () => new Promise(res => canvas.toBlob(res, 'image/png'));
    const download = async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(await toBlob()); a.download = 'my-india-kyt.png'; document.body.appendChild(a); a.click(); a.remove(); };
    overlay.querySelector('#sh-save').onclick = download;
    overlay.querySelector('#sh-share').onclick = async () => {
      const file = new File([await toBlob()], 'my-india-kyt.png', { type: 'image/png' });
      const text = `${visited.length} cities stamped on my India Explorer Passport (${persona(visited).title} level). Your turn: how much of India have you seen? vividnova.com/KYT`;
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'My India so far', text });
        else await download();
      } catch (e) { /* user cancelled the share sheet */ }
    };
  }

  return { init, apply, attrs, filters, activeCount, openSheet, closeSheet, resetFilters, removeChip, renderChips,
           renderGrouped, toggleState, openShare, drawCard, drawSeal, persona, stats, meters, renderStrength, ready, LEVELS,
           openQuestsSheet, closeQuestsSheet, getActiveQuest, setActiveQuest, getTopQuests };
})();
