const vm = require('vm');
const fs = require('fs');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), ctx);

const v = ctx.window.KYT_CURATED_TRIPS.find(x => x.id === 'delhi-varanasi-vande-bharat-spiritual-3d');
v.days.forEach(d => {
  console.log(`Day ${d.day}:`);
  d.steps.forEach(s => console.log(`  - [${s.icon}] ${s.title}`));
});

