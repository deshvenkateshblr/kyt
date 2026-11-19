const fs = require('fs');
const js = fs.readFileSync('js/ui-components.js', 'utf8');

const p = js.indexOf('BYG_META');
if (p !== -1) {
  console.log(js.slice(p - 50, p + 800));
}

