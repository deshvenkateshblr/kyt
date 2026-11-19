const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const pos1 = html.indexOf('kolkata-siliguri-vande-bharat-dooars-3d');
console.log('--- Context around JSON-LD item 11 ---');
console.log(html.slice(pos1 - 100, pos1 + 400));

const pos2 = html.lastIndexOf('kolkata-siliguri-vande-bharat-dooars-3d');
console.log('\n--- Context around Directory list item 11 ---');
console.log(html.slice(pos2 - 100, pos2 + 500));

