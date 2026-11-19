const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const regex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
let m;
let count = 0;
while ((m = regex.exec(html)) !== null) {
  count++;
  console.log(`=== Script ${count} ===`);
  console.log(m[1].slice(0, 500));
}

