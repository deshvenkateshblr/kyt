const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const matches = [];
let idx = 0;
while ((idx = html.indexOf('delhi-varanasi', idx)) !== -1) {
  matches.push(idx);
  idx += 'delhi-varanasi'.length;
}

console.log('Occurrences of delhi-varanasi:', matches.length);
matches.forEach((pos, i) => {
  console.log(`\nOccurrence ${i + 1} at pos ${pos}:`);
  console.log(html.slice(Math.max(0, pos - 200), Math.min(html.length, pos + 300)));
});

