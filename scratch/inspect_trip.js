const vm = require('vm');
const fs = require('fs');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), ctx);

const trip = ctx.window.KYT_CURATED_TRIPS.find(t => t.id === 'delhi-varanasi-vande-bharat-spiritual-3d');
console.log(JSON.stringify(trip, null, 2));

