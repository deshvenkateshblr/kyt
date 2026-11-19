const vm = require('vm');
const fs = require('fs');

const catCtx = { window: {} };
vm.createContext(catCtx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), catCtx);
const cities = catCtx.window.KYT_CITIES || [];
const cityMap = new Map(cities.map(c => [c.id, c]));

const tripsCtx = { window: {} };
vm.createContext(tripsCtx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), tripsCtx);
const trips = tripsCtx.window.KYT_CURATED_TRIPS || [];

console.log('Matching curated trips with city metadata:');
trips.forEach(trip => {
  const tripCities = trip.cities || [];
  const matchedCitiesWithByg = tripCities.filter(cid => {
    const c = cityMap.get(cid);
    return c && c.beforeYouGo;
  });
  console.log(`\nTrip: "${trip.title}" (${trip.id})`);
  console.log(`  Cities: [${tripCities.join(', ')}]`);
  console.log(`  Current trip beforeYouGo items: ${trip.beforeYouGo ? trip.beforeYouGo.length : 0}`);
  if (matchedCitiesWithByg.length > 0) {
    console.log(`  Matched catalog cities with beforeYouGo: ${matchedCitiesWithByg.join(', ')}`);
    matchedCitiesWithByg.forEach(cid => {
      const c = cityMap.get(cid);
      console.log(`    - ${c.name} (${c.beforeYouGo.official}): ${c.beforeYouGo.items.length} items`);
    });
  } else {
    console.log(`  No catalog cities with beforeYouGo in cities.js`);
  }
});

