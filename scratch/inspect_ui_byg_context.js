const fs = require('fs');
const js = fs.readFileSync('js/ui-components.js', 'utf8');

const p = js.indexOf('function renderBeforeYouGo(');
if (p !== -1) {
  console.log(js.slice(p - 100, p + 1800));
}

