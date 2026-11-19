const fs = require('fs');
const js = fs.readFileSync('js/page-trip-detail.js', 'utf8');

const lines = js.split('\n');
lines.forEach((line, i) => {
  if (line.includes('beforeYouGo')) {
    console.log(`Line ${i + 1}: ${line}`);
    const start = Math.max(0, i - 5);
    const end = Math.min(lines.length - 1, i + 10);
    for (let j = start; j <= end; j++) {
      console.log(`  ${j + 1}: ${lines[j]}`);
    }
    console.log('---');
  }
});

