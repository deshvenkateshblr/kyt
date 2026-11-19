const path = require('path');
const playwright = require(path.join(process.cwd(), 'node_modules', 'playwright'));

async function resolvePlace(query) {
  const browser = await playwright.chromium.launch({
    channel: 'msedge',
    headless: true
  });
  const page = await browser.newPage();
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  console.log(`Navigating to: ${url}`);
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  
  const finalUrl = page.url();
  console.log(`Final URL: ${finalUrl}`);
  
  // Extract place_id or ftid from URL
  let placeId = null;
  let ftid = null;
  let lat = null;
  let lng = null;
  
  const placeIdMatch = finalUrl.match(/query_place_id=([^&]+)/) || finalUrl.match(/1s([^!]+)!/);
  const ftidMatch = finalUrl.match(/0x[0-9a-fA-F]+:0x[0-9a-fA-F]+/);
  const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  
  if (ftidMatch) ftid = ftidMatch[0];
  if (coordMatch) {
    lat = parseFloat(coordMatch[1]);
    lng = parseFloat(coordMatch[2]);
  }
  
  // Check page HTML for place_id if not in URL
  const content = await page.content();
  const chijMatch = content.match(/ChIJ[0-9a-zA-Z_-]{23,}/);
  if (chijMatch) placeId = chijMatch[0];

  await browser.close();
  return { query, placeId, ftid, lat, lng, finalUrl };
}

async function run() {
  const queries = [
    'Banasura Sagar Dam Wayanad',
    'Thirunelli Temple Wayanad',
    'Wayanad Wildlife Sanctuary Muthanga'
  ];
  
  for (const q of queries) {
    try {
      const res = await resolvePlace(q);
      console.log('Result for:', q, res);
    } catch (e) {
      console.error('Error for:', q, e.message);
    }
  }
}

run();

