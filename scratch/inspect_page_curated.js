const fs = require('fs');
const js = fs.readFileSync('js/page-curated.js', 'utf8');

console.log('js/page-curated.js length:', js.length);
// Find functions or render methods
const matches = js.match(/function\s+([a-zA-Z0-9_]+)|const\s+([a-zA-Z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g) || [];
console.log('Functions in page-curated.js:');
matches.slice(0, 20).forEach(m => console.log(' ', m));

