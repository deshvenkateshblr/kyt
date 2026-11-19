const fs = require('fs');
const html = fs.readFileSync('curated_trips.html', 'utf8');

const p = html.indexOf('id="detail-modal"');
if (p !== -1) {
  console.log(html.slice(p, p + 3000));
}

