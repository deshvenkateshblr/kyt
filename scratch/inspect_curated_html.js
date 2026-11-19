const fs = require('fs');

const html = fs.readFileSync('curated_trips.html', 'utf8');

// Find JSON-LD script
const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (jsonLdMatch) {
  try {
    const data = JSON.parse(jsonLdMatch[1]);
    console.log('JSON-LD @type:', data['@type']);
    if (data.itemListElement) {
      console.log('Total ItemList elements:', data.itemListElement.length);
      data.itemListElement.forEach(item => {
        console.log(`  ${item.position}. ${item.item.name} (${item.item.url})`);
      });
    }
  } catch (e) {
    console.error('JSON-LD parse error:', e.message);
  }
}

// Check trip cards
const cardMatches = html.match(/class=["'][^"']*trip-card[^"']*["']/g);
console.log('\nTrip card elements found:', cardMatches ? cardMatches.length : 0);

// Check if any articles or sections have data-trip-id
const tripIdMatches = html.match(/data-trip-id=["']([^"']+)["']/g);
if (tripIdMatches) {
  console.log('\nTrips with data-trip-id in HTML:');
  tripIdMatches.forEach(m => console.log(' ', m));
}

