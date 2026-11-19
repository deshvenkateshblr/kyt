const vm = require('vm');
const fs = require('fs');

const catCtx = { window: {} };
vm.createContext(catCtx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), catCtx);
const catalog = catCtx.window.KYT_CITIES || [];
const cityMap = new Map(catalog.map(c => [c.id, c]));

const tripsCtx = { window: {} };
vm.createContext(tripsCtx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), tripsCtx);
const trips = tripsCtx.window.KYT_CURATED_TRIPS || [];

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

  // 1. Trip-level items
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

  // 2. City-level items
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

// Test on Tirupati
const t1 = trips.find(t => t.id === 'blr-tirupati-the-divine-hill-shrine-weekend-2');
console.log('Tirupati result:', synthesizeTripBeforeYouGo(t1, catalog));

// Test on Varanasi
const t2 = trips.find(t => t.id === 'delhi-varanasi-vande-bharat-spiritual-3d');
console.log('\nVaranasi result portals:', synthesizeTripBeforeYouGo(t2, catalog).officialPortals);
console.log('Varanasi allItems count:', synthesizeTripBeforeYouGo(t2, catalog).allItems.length);

