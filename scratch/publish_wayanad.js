const fs = require('fs');
const vm = require('vm');
const K = require('../admin/core.js');

// 1. Load catalog
const catCtx = { window: {} };
vm.createContext(catCtx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), catCtx);
const catalog = catCtx.window.KYT_CITIES || [];
const catalogIndex = K.buildCatalogIndex(catalog);

// 2. Load draft trip
const draft = JSON.parse(fs.readFileSync('scratch/bangalore_wayanad_draft.json', 'utf8'));

// 3. Validate draft trip
const validation = K.validateTrip(draft, { catalog, catalogIndex });
console.log('Validation results:');
console.log('Errors:', validation.errors);
console.log('Warnings:', validation.warnings);

if (validation.errors.length > 0) {
  console.error('Validation failed, aborting publish!');
  process.exit(1);
}

// 4. Load existing curated trips
const tripsCtx = { window: {} };
vm.createContext(tripsCtx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), tripsCtx);
let trips = tripsCtx.window.KYT_CURATED_TRIPS || [];

// Remove existing if present (idempotent)
trips = trips.filter(t => t.id !== draft.id);

// Add new trip
trips.push(draft);

// Sort alphabetically by ID
trips.sort((a, b) => a.id.localeCompare(b.id));

const content = 'window.KYT_CURATED_TRIPS = ' + JSON.stringify(trips, null, 2) + ';\n';

fs.writeFileSync('data/curated_trips.js', content, 'utf8');
fs.writeFileSync('admin/curated_trips.js', content, 'utf8');

console.log(`Successfully published ${draft.id}! Total trips now: ${trips.length}`);

