const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');
const p = html.indexOf('modal-tips');
if (p !== -1) {
  console.log(html.slice(p - 200, p + 600));
}

