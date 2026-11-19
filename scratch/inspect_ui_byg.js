const fs = require('fs');
const js = fs.readFileSync('js/ui-components.js', 'utf8');

const p = js.indexOf('function beforeYouGoInfo') !== -1 ? js.indexOf('function beforeYouGoInfo') : js.indexOf('beforeYouGoInfo');
if (p !== -1) {
  console.log(js.slice(p - 100, p + 2500));
}

