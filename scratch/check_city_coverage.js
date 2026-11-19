const vm = require('vm');
const fs = require('fs');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), ctx);

const cities = ctx.window.KYT_CITIES || [];

// Check fields like weatherLink, access, elevation, setting, vibes, beforeYouGo
const stats = {};
cities.forEach(c => {
  for (const k of Object.keys(c)) {
    stats[k] = (stats[k] || 0) + 1;
  }
});

console.log('City field coverage across 159 cities:');
Object.entries(stats).sort((a,b) => b[1] - a[1]).forEach(([k, count]) => {
  console.log(`  ${k.padEnd(16)}: ${count} (${Math.round(count/cities.length*100)}%)`);
});

