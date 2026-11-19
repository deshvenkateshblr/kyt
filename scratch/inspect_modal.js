const fs = require('fs');
const js = fs.readFileSync('js/page-curated.js', 'utf8');

const p = js.indexOf('function openTripDetail');
if (p !== -1) {
  console.log(js.slice(p, p + 2500));
}

