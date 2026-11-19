const fs = require('fs');
const js = fs.readFileSync('js/page-trip-detail.js', 'utf8');

const regex = /bygHtml/g;
let m;
while ((m = regex.exec(js)) !== null) {
  console.log(`Occurrence at index ${m.index}:`);
  console.log(js.slice(Math.max(0, m.index - 50), Math.min(js.length, m.index + 150)));
  console.log('---');
}

