const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const pos1 = html.indexOf('delhi-varanasi-vande-bharat-spiritual-3d');
console.log('--- Context around JSON-LD item 10 ---');
console.log(html.slice(pos1 - 250, pos1 + 200));

const pos2 = html.indexOf('delhi-varanasi-vande-bharat-spiritual-3d', pos1 + 50);
console.log('\n--- Context around Directory list item 10 ---');
console.log(html.slice(pos2 - 150, pos2 + 400));

