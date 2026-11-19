const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const s2Match = html.match(/<section class="max-w-6xl mx-auto px-4 mt-3"[\s\S]*?<\/section>/);
if (s2Match) {
  console.log(s2Match[0].slice(0, 1500));
  console.log('...\n' + s2Match[0].slice(-1000));
}

