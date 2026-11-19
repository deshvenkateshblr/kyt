const vm = require('vm');
const fs = require('fs');

const catCtx = { window: {} };
vm.createContext(catCtx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), catCtx);
const catalog = catCtx.window.KYT_CITIES || [];

const tripsCtx = { window: {} };
vm.createContext(tripsCtx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), tripsCtx);
const trips = tripsCtx.window.KYT_CURATED_TRIPS || [];

// Load the logic from test_synthesizer.js
const TYPE_META = {
  book:     { icon: 'ticket',        badge: 'Book ahead', bg: 'bg-blue-100 text-blue-800 border-blue-200' },
  booking:  { icon: 'ticket',        badge: 'Book ahead', bg: 'bg-blue-100 text-blue-800 border-blue-200' },
  dress:    { icon: 'shirt',         badge: 'Dress code', bg: 'bg-purple-100 text-purple-800 border-purple-200' },
  id:       { icon: 'user-check',    badge: 'ID required', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rule:     { icon: 'ban',           badge: 'Rules & lockers', bg: 'bg-rose-100 text-rose-800 border-rose-200' },
  rules:    { icon: 'ban',           badge: 'Rules & lockers', bg: 'bg-rose-100 text-rose-800 border-rose-200' },
  permit:   { icon: 'file-text',     badge: 'Permit', bg: 'bg-teal-100 text-teal-800 border-teal-200' },
  season:   { icon: 'calendar',      badge: 'When to visit', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  timing:   { icon: 'clock',         badge: 'Timings', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  other:    { icon: 'info',          badge: 'Notice', bg: 'bg-slate-100 text-slate-800 border-slate-200' }
};

function synthesizeTripBeforeYouGo(trip, catalog) {
  const cat = Array.isArray(catalog) ? catalog : [];
  const cMap = new Map();
  cat.forEach(c => {
    if (c && c.id) cMap.set(c.id, c);
    if (c && Array.isArray(c.aliases)) c.aliases.forEach(a => cMap.set(String(a).toLowerCase(), c));
  });

  const tripItems = [];
  const cityItems = [];
  const officialPortals = [];
  const seenTexts = new Set();

  if (Array.isArray(trip.beforeYouGo)) {
    trip.beforeYouGo.forEach(it => {
      const text = typeof it === 'string' ? it : (it && it.text ? it.text : '');
      const type = (typeof it === 'object' && it && (it.type || it.kind)) ? (it.type || it.kind).toLowerCase() : 'other';
      if (!text) return;
      const norm = text.toLowerCase().trim();
      if (seenTexts.has(norm)) return;
      seenTexts.add(norm);
      tripItems.push({ text, type, scope: 'trip' });
    });
  }

  const cityIds = new Set();
  (trip.cities || []).forEach(cid => cityIds.add(String(cid).toLowerCase()));
  (trip.days || []).forEach(d => {
    if (d.cityId) cityIds.add(String(d.cityId).toLowerCase());
  });

  cityIds.forEach(cid => {
    const city = cMap.get(cid);
    if (!city || !city.beforeYouGo) return;
    const b = city.beforeYouGo;

    if (b.official && /^https:\/\//.test(b.official)) {
      if (!officialPortals.some(p => p.url === b.official)) {
        officialPortals.push({
          cityId: city.id,
          cityName: city.name,
          url: b.official
        });
      }
    }

    (b.items || []).forEach(it => {
      const text = it.text || '';
      if (!text) return;
      const norm = text.toLowerCase().trim();
      if (seenTexts.has(norm)) return;
      seenTexts.add(norm);
      cityItems.push({
        text,
        type: (it.kind || 'rules').toLowerCase(),
        cityId: city.id,
        cityName: city.name,
        source: it.source || '',
        scope: 'city'
      });
    });
  });

  return {
    tripItems,
    cityItems,
    allItems: [...tripItems, ...cityItems],
    officialPortals
  };
}

const escapeHTML = str => String(str || '').replace(/[&<>'"]/g, tag => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[tag] || tag));

function renderTripBeforeYouGo(trip, catalog, options) {
  const opts = options || {};
  const data = synthesizeTripBeforeYouGo(trip, catalog);
  if (!data.allItems.length && !data.officialPortals.length) return '';

  const esc = escapeHTML;
  const link = (url, text) => /^https:\/\//.test(url || '')
    ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 underline font-semibold whitespace-nowrap ml-1">${esc(text)} &rarr;</a>` : '';

  const portalsHtml = data.officialPortals.length ? `
    <div class="mb-3.5 pb-3 border-b border-amber-200/60 flex flex-wrap items-center gap-2 text-xs">
      <span class="font-bold text-amber-950 flex items-center gap-1 text-[11px] uppercase tracking-wider">
        <i data-lucide="shield-check" class="w-3.5 h-3.5 text-emerald-600"></i> Official Portals:
      </span>
      <div class="flex flex-wrap gap-1.5">
        ${data.officialPortals.map(p => `
          <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 hover:text-emerald-950 font-bold rounded-lg border border-emerald-200/80 shadow-2xs text-[11px] transition-colors">
            <span>${esc(p.cityName)} Official Trust / Portal</span>
            <i data-lucide="external-link" class="w-3 h-3 text-emerald-600"></i>
          </a>
        `).join('')}
      </div>
    </div>
  ` : '';

  const itemsHtml = data.allItems.map(it => {
    const meta = TYPE_META[it.type] || TYPE_META.other;
    const cityBadge = it.cityName ? `<span class="font-bold text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded border border-amber-200/80 shrink-0">${esc(it.cityName)}</span>` : '';
    const typeBadge = `<span class="font-black uppercase text-[9px] px-1.5 py-0.5 rounded border tracking-wider shrink-0 ${meta.bg}">${esc(meta.badge)}</span>`;
    const sourceLink = it.source ? link(it.source, 'Source') : '';

    return `
      <li class="flex items-start gap-2 bg-white/70 border border-amber-200/60 p-2.5 rounded-xl shadow-2xs">
        <i data-lucide="${meta.icon}" class="w-4 h-4 text-amber-700 shrink-0 mt-0.5"></i>
        <div class="leading-relaxed flex-1 text-slate-800 text-xs">
          <div class="flex flex-wrap items-center gap-1.5 mb-1">
            ${cityBadge}
            ${typeBadge}
          </div>
          <p class="font-medium text-slate-800">${esc(it.text)}${sourceLink}</p>
        </div>
      </li>
    `;
  }).join('');

  const containerId = opts.id ? `id="${esc(opts.id)}" ` : '';
  const title = opts.title || 'Before You Go & Prerequisites';

  return `
    <div ${containerId}class="p-4 sm:p-5 bg-gradient-to-br from-amber-50/90 via-amber-50/50 to-orange-50/30 border border-amber-200/90 rounded-2xl sm:rounded-3xl shadow-2xs space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-950 flex items-center gap-2">
          <i data-lucide="shield-alert" class="w-4 h-4 text-amber-600"></i> ${esc(title)}
        </h4>
        <span class="text-[10px] font-bold px-2 py-0.5 bg-amber-200/70 text-amber-950 rounded-full">
          ${data.allItems.length} Key Item${data.allItems.length === 1 ? '' : 's'}
        </span>
      </div>

      ${portalsHtml}

      <ul class="space-y-2">
        ${itemsHtml}
      </ul>
    </div>
  `;
}

// Test on Tirupati
const html1 = renderTripBeforeYouGo(trips.find(t => t.id === 'blr-tirupati-the-divine-hill-shrine-weekend-2'), catalog);
console.log('--- Rendered Tirupati HTML snippet ---');
console.log(html1.slice(0, 1000));
console.log('...\nTotal length:', html1.length);

