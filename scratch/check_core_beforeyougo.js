const fs = require('fs');
const core = fs.readFileSync('admin/core.js', 'utf8');

const lines = core.split('\n');
lines.forEach((line, i) => {
  if (line.includes('beforeYouGo')) {
    console.log(`Line ${i + 1}: ${line}`);
    // show 5 surrounding lines
    const start = Math.max(0, i - 3);
    const end = Math.min(lines.length - 1, i + 5);
    for (let j = start; j <= end; j++) {
      console.log(`  ${j + 1}: ${lines[j]}`);
    }
    console.log('---');
  }
});

