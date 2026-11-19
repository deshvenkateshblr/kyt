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

function mapKindToType(kind) {
  switch (kind) {
    case 'book': return 'booking';
    case 'rule': return 'rules';
    case 'dress': return 'dress';
    case 'id': return 'id';
    case 'permit': return 'booking';
    case 'season': return 'timing';
    default: return 'rules';
  }
}

function getIntegratedBeforeYouGo(trip, catalog) {
  const result = [];
  const seenTexts = new Set();

  // 1. Existing trip-level beforeYouGo
  if (Array.isArray(trip.beforeYouGo)) {
    trip.beforeYouGo.forEach(item => {
      const text = typeof item === 'string' ? item : item.text;
      const type = typeof item === 'object' && item.type ? item.type : 'rules';
      if (text && !seenTexts.has(text.toLowerCase())) {
        seenTexts.add(text.toLowerCase());
        result.push({
          type: type,
          text: text,
          scope: 'trip'
        });
      }
    });
  }

  // 2. City-level beforeYouGo from linked cities
  const linkedCityIds = trip.cities || [];
  linkedCityIds.forEach(cid => {
    const city = cityMap.get(cid);
    if (city && city.beforeYouGo) {
      const cityName = city.name;
      const official = city.beforeYouGo.official;
      const items = city.beforeYouGo.items || [];

      items.forEach(cItem => {
        const text = cItem.text;
        const type = mapKindToType(cItem.kind);
        // Prefix with city name if not already mentioned
        const formattedText = text.toLowerCase().includes(cityName.toLowerCase())
          ? text
          : `${cityName}: ${text}`;

        if (!seenTexts.has(formattedText.toLowerCase()) && !seenTexts.has(text.toLowerCase())) {
          seenTexts.add(formattedText.toLowerCase());
          result.push({
            type: type,
            text: formattedText,
            cityId: cid,
            cityName: cityName,
            officialUrl: official,
            sourceUrl: cItem.source,
            scope: 'city'
          });
        }
      });
    }
  });

  return result;
}

console.log('=== Demonstration of Integrated Before You Go ===\n');

// Test on Tirupati (blr-tirupati-the-divine-hill-shrine-weekend-2 which currently has 0 items)
const tirupatiTrip = trips.find(t => t.id === 'blr-tirupati-the-divine-hill-shrine-weekend-2');
console.log(`Trip: ${tirupatiTrip.title}`);
console.log('Original items count:', tirupatiTrip.beforeYouGo.length);
const integratedTirupati = getIntegratedBeforeYouGo(tirupatiTrip, catalog);
console.log('Integrated items count:', integratedTirupati.length);
integratedTirupati.forEach(item => {
  console.log(`  [${item.type.toUpperCase()}] (${item.scope}${item.cityName ? ' - ' + item.cityName : ''}): ${item.text}`);
  if (item.officialUrl) console.log(`     Official Portal: ${item.officialUrl}`);
});

console.log('\n----------------------------------------\n');

// Test on Varanasi (delhi-varanasi-vande-bharat-spiritual-3d)
const varanasiTrip = trips.find(t => t.id === 'delhi-varanasi-vande-bharat-spiritual-3d');
console.log(`Trip: ${varanasiTrip.title}`);
console.log('Original items count:', varanasiTrip.beforeYouGo.length);
const integratedVaranasi = getIntegratedBeforeYouGo(varanasiTrip, catalog);
console.log('Integrated items count:', integratedVaranasi.length);
integratedVaranasi.forEach(item => {
  console.log(`  [${item.type.toUpperCase()}] (${item.scope}${item.cityName ? ' - ' + item.cityName : ''}): ${item.text}`);
});

