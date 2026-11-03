#!/usr/bin/env node
/**
 * enrich_kyt_places.js
 * Resolves accurate Google Maps Place IDs, Feature IDs (ftid), and canonical Place URLs
 * for window.KYT_CITIES using Node.js and Playwright (Edge/Chromium).
 * 
 * Usage:
 *   node admin/enrich_kyt_places.js --city ujjain
 *   node admin/enrich_kyt_places.js --city omkareshwar
 *   node admin/enrich_kyt_places.js --limit 5
 *   node admin/enrich_kyt_places.js --skip-beats
 *   node admin/enrich_kyt_places.js --in-place
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('../node_modules/playwright');

const BASE_DIR = path.resolve(__dirname, '..');
const INPUT_JS_PATH = path.join(BASE_DIR, 'data', 'cities.js');
const OUTPUT_JS_PATH = path.join(BASE_DIR, 'data', 'cities.enriched.js');
const CACHE_PATH = path.join(BASE_DIR, 'admin', 'places_cache.json');

const GENERIC_QUERIES = new Set([
  'Hyderabad Biryani',
  'Alleppey Houseboat',
  'Amritsari Kulcha, Amritsar',
  'Lonavala Chikki',
  'Aurangabad Naan Qalia',
  'Bhubaneswar Odia Thali',
  'Guwahati Assamese Thali',
  'Thanjavur Painting',
  'Havelock Bioluminescence',
  'Badami Rock Climbing'
]);

// Cities where administrative Place ID forces an undesired postal name
const EXCLUDED_CITY_PLACE_IDS = new Set(['omkareshwar']);

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Mathematically convert Google Feature ID (0x...:0x...) to canonical ChIJ Place ID.
 */
function ftidToPlaceId(ftidStr) {
  if (!ftidStr) return null;
  const m = ftidStr.match(/0x([0-9a-fA-F]+):0x([0-9a-fA-F]+)/);
  if (!m) return null;
  try {
    const f1 = BigInt('0x' + m[1]);
    const f2 = BigInt('0x' + m[2]);
    const buf = Buffer.alloc(20);
    buf[0] = 0x0a;
    buf[1] = 0x12;
    buf[2] = 0x09;
    buf.writeBigUInt64LE(f1, 3);
    buf[11] = 0x11;
    buf.writeBigUInt64LE(f2, 12);
    return buf.toString('base64url');
  } catch (e) {
    return null;
  }
}

function getCleanSearchQuery(item, parentCityName) {
  const mapsUrl = item.mapsUrl || '';
  let q = '';
  try {
    const parsed = new URL(mapsUrl);
    q = decodeURIComponent(parsed.searchParams.get('query') || '').trim();
  } catch (_) {}

  if (!q) {
    if (parentCityName) {
      q = `${item.title || ''}, ${item.where || parentCityName}`;
    } else {
      q = `${item.name || ''}, ${item.state || 'India'}`;
    }
  }

  if (parentCityName && GENERIC_QUERIES.has(q)) {
    const where = item.where || parentCityName;
    q = `${where}, ${parentCityName}`;
  }

  return q;
}

async function resolvePlace(page, query, expectedLat, expectedLng) {
  const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    console.log(`      [!] Timeout loading '${query}': ${e.message}`);
    return {
      query,
      resolvedName: query,
      placeId: null,
      ftid: null,
      lat: null,
      lng: null,
      distanceKm: null,
      canonicalMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    };
  }

  try {
    await page.waitForURL(/\/maps\/place\//, { timeout: 4000 });
  } catch (_) {
    try {
      const firstLink = page.locator('a[href*="/maps/place/"]').first();
      if ((await firstLink.count()) > 0) {
        await firstLink.click();
        await page.waitForURL(/\/maps\/place\//, { timeout: 5000 });
      }
    } catch (_) {}
  }

  await page.waitForTimeout(1200);
  const currentUrl = page.url();

  const ftidMatch = currentUrl.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  const ftid = ftidMatch ? ftidMatch[1] : null;

  const pinCoord = currentUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  const viewCoord = currentUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const lat = pinCoord ? parseFloat(pinCoord[1]) : (viewCoord ? parseFloat(viewCoord[1]) : null);
  const lng = pinCoord ? parseFloat(pinCoord[2]) : (viewCoord ? parseFloat(viewCoord[2]) : null);

  const nameMatch = currentUrl.match(/\/maps\/place\/([^/@]+)/);
  const resolvedName = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : query;

  const placeId = ftidToPlaceId(ftid);

  let distanceKm = null;
  if (expectedLat && expectedLng && lat && lng) {
    distanceKm = Math.round(haversineKm(expectedLat, expectedLng, lat, lng) * 10) / 10;
  }

  let canonicalUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  if (placeId) {
    canonicalUrl += `&query_place_id=${encodeURIComponent(placeId)}`;
  } else if (ftid) {
    canonicalUrl = `https://www.google.com/maps/place/${encodeURIComponent(resolvedName)}/data=!4m2!3m1!1s${ftid}`;
  }

  return {
    query,
    resolvedName,
    placeId,
    ftid,
    lat,
    lng,
    distanceKm,
    canonicalMapsUrl: canonicalUrl
  };
}

function loadCities(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const match = raw.match(/^(window\.KYT_CITIES\s*=\s*)(\[\s*\{[\s\S]*?\}\s*\])(\s*;[\s\S]*)$/);
  if (match) {
    return {
      cities: JSON.parse(match[2]),
      prefix: match[1],
      suffix: match[3]
    };
  }
  const match2 = raw.match(/window\.KYT_CITIES\s*=\s*(\[\s*\{[\s\S]*?\}\s*\])\s*;/);
  if (!match2) throw new Error(`Could not parse window.KYT_CITIES from ${filepath}`);
  return {
    cities: JSON.parse(match2[1]),
    prefix: 'window.KYT_CITIES = ',
    suffix: ';\n'
  };
}

function saveCities(cities, filepath, prefix, suffix) {
  const content = prefix + JSON.stringify(cities, null, 2) + suffix;
  fs.writeFileSync(filepath, content, 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = flag => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
  };
  const hasFlag = flag => args.includes(flag);

  const targetCityId = getArg('--city');
  const limit = getArg('--limit') ? parseInt(getArg('--limit'), 10) : null;
  const skipBeats = hasFlag('--skip-beats');
  const inPlace = hasFlag('--in-place');
  const delaySec = getArg('--delay') ? parseFloat(getArg('--delay')) : 1.0;

  console.log(`Loading catalog from: ${INPUT_JS_PATH}`);
  const { cities, prefix, suffix } = loadCities(INPUT_JS_PATH);
  console.log(`Loaded ${cities.length} cities.`);

  let targetCities = cities;
  if (targetCityId) {
    targetCities = cities.filter(c => c.id === targetCityId);
    if (!targetCities.length) {
      console.error(`City '${targetCityId}' not found.`);
      process.exit(1);
    }
  } else if (limit) {
    targetCities = cities.slice(0, limit);
  }

  let cache = {};
  if (fs.existsSync(CACHE_PATH)) {
    try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch (_) {}
  }

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_) {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext({
    locale: 'en-IN',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  for (let cIdx = 0; cIdx < targetCities.length; cIdx++) {
    const city = targetCities[cIdx];
    const cityId = city.id;
    const cityQuery = `${city.name}, ${city.state || ''}, India`;
    const cacheKey = `city::${cityId}`;

    let res;
    if (!cache[cacheKey]) {
      console.log(`[${cIdx + 1}/${targetCities.length}] Resolving City: ${cityQuery}...`);
      res = await resolvePlace(page, cityQuery, city.lat, city.lng);
      cache[cacheKey] = res;
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
      await new Promise(r => setTimeout(r, delaySec * 1000));
    } else {
      res = cache[cacheKey];
    }

    if (res.placeId && !EXCLUDED_CITY_PLACE_IDS.has(cityId)) city.placeId = res.placeId;
    if (res.ftid) city.ftid = res.ftid;
    if (res.canonicalMapsUrl && !EXCLUDED_CITY_PLACE_IDS.has(cityId)) city.mapsUrl = res.canonicalMapsUrl;

    if (skipBeats) continue;

    const beats = city.beats || [];
    for (let bIdx = 0; bIdx < beats.length; bIdx++) {
      const beat = beats[bIdx];
      const beatQuery = getCleanSearchQuery(beat, city.name);

      // If this attraction is an activity (food, breakfast, lunch, trail), do NOT map via Place ID
      if (beat.kind === 'activity') {
        delete beat.placeId;
        delete beat.ftid;
        beat.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(beatQuery)}`;
        console.log(`   -> Beat ${bIdx + 1}/${beats.length} [ACTIVITY]: ${beat.title} (skipped Place ID)`);
        continue;
      }

      const bCacheKey = `beat::${cityId}::${beat.title}`;

      let bRes;
      if (!cache[bCacheKey]) {
        console.log(`   -> Beat ${bIdx + 1}/${beats.length}: ${beatQuery}`);
        bRes = await resolvePlace(page, beatQuery, city.lat, city.lng);
        if (bRes.distanceKm && bRes.distanceKm > 150) {
          console.log(`      [!] WARNING: ${beat.title} resolved ${bRes.distanceKm} km from ${city.name} (${bRes.resolvedName})`);
        }
        cache[bCacheKey] = bRes;
        fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
        await new Promise(r => setTimeout(r, delaySec * 1000));
      } else {
        bRes = cache[bCacheKey];
      }

      if (bRes.placeId) beat.placeId = bRes.placeId;
      if (bRes.ftid) beat.ftid = bRes.ftid;
      if (bRes.lat && bRes.lng) { beat.lat = bRes.lat; beat.lng = bRes.lng; }
      if (bRes.canonicalMapsUrl) beat.mapsUrl = bRes.canonicalMapsUrl;
    }
  }

  await browser.close();

  const outPath = inPlace ? INPUT_JS_PATH : OUTPUT_JS_PATH;
  saveCities(cities, outPath, prefix, suffix);
  console.log(`\n✓ Done! Output written to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

