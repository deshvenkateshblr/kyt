const fs = require('fs');
const html = fs.readFileSync('trip_detail.html', 'utf8');

console.log('trip_detail.html size:', html.length);
// Let's find sections or IDs in trip_detail.html
const sectionHeaders = html.match(/<h[23][^>]*>[\s\S]*?<\/h[23]>/gi) || [];
console.log('Headers in trip_detail.html:');
sectionHeaders.forEach(h => console.log(' ', h.replace(/<[^>]+>/g, '').trim()));

