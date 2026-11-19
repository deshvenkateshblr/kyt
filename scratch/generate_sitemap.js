const fs = require('fs');
const vm = require('vm');

const tripsCtx = { window: {} };
vm.createContext(tripsCtx);
vm.runInContext(fs.readFileSync('data/curated_trips.js', 'utf8'), tripsCtx);
const trips = tripsCtx.window.KYT_CURATED_TRIPS || [];

// Sort alphabetically
trips.sort((a, b) => a.id.localeCompare(b.id));

const today = '2026-11-18';

let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Core Application Pages -->
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/index.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/curated_trips.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/virtual_trip.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/trip_detail.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/configure_trip.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/view_trip.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/visited.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

  <!-- Curated Travel Itinerary Deep Links -->
`;

trips.forEach(t => {
  xml += `  <url>
    <loc>https://deshvenkateshblr.github.io/kyt/trip_detail.html?id=${t.id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>
`;
});

xml += `</urlset>\n`;

fs.writeFileSync('sitemap.xml', xml, 'utf8');
console.log(`Updated sitemap.xml with ${8 + trips.length} URLs (8 core + ${trips.length} curated trips).`);

