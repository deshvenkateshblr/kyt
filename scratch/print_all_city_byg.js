const vm = require('vm');
const fs = require('fs');

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data/cities.js', 'utf8'), ctx);

const cities = ctx.window.KYT_CITIES || [];
cities.filter(c => c.beforeYouGo).forEach(c => {
  console.log(`\n=== ${c.name} (${c.id}) ===`);
  console.log(`Official: ${c.beforeYouGo.official}`);
  console.log(`Last Checked: ${c.beforeYouGo.checked}`);
  c.beforeYouGo.items.forEach((item, idx) => {
    console.log(`  [${item.kind}] ${item.text}`);
    if (item.source) console.log(`       Source: ${item.source}`);
  });
});

