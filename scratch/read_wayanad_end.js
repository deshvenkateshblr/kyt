const fs = require('fs');
const content = fs.readFileSync('data/cities.js', 'utf8');
const p = content.indexOf('Soochipara Waterfalls');
if (p !== -1) {
  console.log(content.slice(p - 10, p + 1500));
}

