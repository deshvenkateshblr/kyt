const fs = require('fs');
const html = fs.readFileSync('trip_detail.html', 'utf8');

const scriptMatches = html.match(/<script[\s\S]*?<\/script>/gi) || [];
console.log('Scripts count:', scriptMatches.length);
scriptMatches.forEach((s, idx) => {
  const src = s.match(/src=["']([^"']+)["']/);
  if (src) {
    console.log(`Script ${idx + 1}: src=${src[1]}`);
  } else {
    console.log(`Script ${idx + 1}: inline (${s.length} chars)`);
    // print first 500 chars of inline script
    console.log(s.slice(0, 300) + '...\n');
  }
});

