const fs = require('fs');
const js = fs.readFileSync('js/page-trip-detail.js', 'utf8');

const p = js.indexOf('const bygHtml =');
if (p !== -1) {
  console.log(js.slice(p, p + 1500));
}

