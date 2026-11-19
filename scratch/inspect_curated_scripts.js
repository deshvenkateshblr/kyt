const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
console.log('Scripts count in curated_trips.html:', scriptMatches.length);
scriptMatches.forEach((s, idx) => {
  const src = s.match(/src=["']([^"']+)["']/);
  if (src) {
    console.log(`Script ${idx + 1}: src=${src[1]}`);
  } else {
    console.log(`Script ${idx + 1}: inline (${s.length} chars)`);
  }
});

