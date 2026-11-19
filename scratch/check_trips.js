const vm = require('vm');
const fs = require('fs');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), ctx);

const trips = ctx.window.KYT_CURATED_TRIPS || [];
console.log('Total trips:', trips.length);
trips.forEach((t, i) => {
  console.log(`${i + 1}. ${t.id} - ${t.title} (${t.days.length}d)`);
});

