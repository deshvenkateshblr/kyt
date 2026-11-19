const vm = require('vm');
const fs = require('fs');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), ctx);

const cities = ctx.window.KYT_CITIES || [];
console.log('Total cities in catalog:', cities.length);

const withByg = cities.filter(c => c.beforeYouGo);
console.log('Cities with beforeYouGo:', withByg.length);
withByg.forEach(c => {
  const itemCount = c.beforeYouGo.items ? c.beforeYouGo.items.length : 0;
  console.log(`- ${c.id} (${c.name}): official=${c.beforeYouGo.official}, items=${itemCount}`);
});

