const fs = require('fs');
const vm = require('vm');
const K = require('../admin/core.js');

// 1. Load catalog
const catCtx = { window: {} };
vm.createContext(catCtx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), catCtx);
const catalog = catCtx.window.KYT_CITIES || [];
const catalogIndex = K.buildCatalogIndex(catalog);

// 2. Load curated trips
const tripsCtx = { window: {} };
vm.createContext(tripsCtx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), tripsCtx);
let trips = tripsCtx.window.KYT_CURATED_TRIPS || [];

// 3. Find blr-tirupati-the-divine-hill-shrine-weekend-2 and backfill
const t = trips.find(x => x.id === 'blr-tirupati-the-divine-hill-shrine-weekend-2');
if (t) {
  t.beforeYouGo = [
    {
      type: "booking",
      text: "Special entry darshan, sevas and accommodation must be booked online ahead through official TTD monthly quota releases on ttdevasthanams.ap.gov.in."
    },
    {
      type: "dress",
      text: "Strict traditional dress code: dhoti or pyjama with upper cloth for men; saree, half-saree, or churidar with dupatta for women. Western attire and jeans are not permitted in darshan queues."
    },
    {
      type: "id",
      text: "Carry original valid government photo ID (Aadhaar, passport, or voter ID) matching the ID entered during online darshan token booking."
    },
    {
      type: "rules",
      text: "Mobile phones, cameras, smartwatches, and all electronic gadgets are strictly banned inside the sanctum complex; free secure lockers are available near Vaikuntam Queue Complex."
    }
  ];
  console.log(`Backfilled beforeYouGo for ${t.id} with ${t.beforeYouGo.length} items.`);
}

// 4. Validate all trips
let allValid = true;
trips.forEach(trip => {
  const res = K.validateTrip(trip, { catalog, catalogIndex });
  if (res.errors.length > 0) {
    console.error(`Trip ${trip.id} has errors:`, res.errors);
    allValid = false;
  }
});

if (!allValid) {
  console.error('Validation failed, aborting!');
  process.exit(1);
}

// 5. Sort alphabetically by ID
trips.sort((a, b) => a.id.localeCompare(b.id));

const content = 'window.KYT_CURATED_TRIPS = ' + JSON.stringify(trips, null, 2) + ';\n';
fs.writeFileSync('data/curated_trips.js', content, 'utf8');
fs.writeFileSync('admin/curated_trips.js', content, 'utf8');

console.log('Successfully updated data/curated_trips.js and admin/curated_trips.js!');

