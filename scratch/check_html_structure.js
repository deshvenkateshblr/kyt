const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (m) {
  const jsonLd = JSON.parse(m[1]);
  console.log('JSON-LD items:', jsonLd.itemListElement.length);
  jsonLd.itemListElement.forEach(item => {
    console.log(`Pos ${item.position}: ${item.name} -> ${item.url}`);
  });
}

// Let's find sections or articles in the body
console.log('\n--- Body elements ---');
const sections = html.match(/<section[\s\S]*?<\/section>/g) || [];
console.log('Sections count:', sections.length);
sections.forEach((s, idx) => {
  const idMatch = s.match(/id="([^"]+)"/);
  const classMatch = s.match(/class="([^"]+)"/);
  console.log(`Section ${idx + 1}: id=${idMatch ? idMatch[1] : 'none'}, class=${classMatch ? classMatch[1] : 'none'}`);
});

