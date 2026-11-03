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

  console.log(`Loading catalog from: ${INPUT_JS_PATH}`);
  const { cities, prefix, suffix } = loadCities(INPUT_JS_PATH);
  console.log(`Loaded ${cities.length} cities.`);

  const batchSize = parseInt(getArg('--batch-size') || '10', 10);
  const batchArg = getArg('--batch');
  const targetCityId = getArg('--city');
  const limitArg = getArg('--limit') ? parseInt(getArg('--limit'), 10) : null;
  const offsetArg = getArg('--offset') ? parseInt(getArg('--offset'), 10) : 0;
  const skipBeats = hasFlag('--skip-beats');
  const skipCity = hasFlag('--skip-city');
  const force = hasFlag('--force');
  const inPlace = hasFlag('--in-place');
  const delaySec = getArg('--delay') ? parseFloat(getArg('--delay')) : 1.0;

  // --status: display statistics and exit
  if (hasFlag('--status')) {
    let totalPlaces = 0;
    let resolvedPlaces = 0;
    let totalActivities = 0;
    let resolvedCities = cities.filter(c => c.placeId).length;

    cities.forEach(c => {
      (c.beats || []).forEach(b => {
        if (b.kind === 'activity') {
          totalActivities++;
        } else {
          totalPlaces++;
          if (b.placeId) resolvedPlaces++;
        }
      });
    });

    const missingPlaces = totalPlaces - resolvedPlaces;
    const totalBatches = Math.ceil(cities.length / batchSize);

    console.log('\n================ KYT PLACES CATALOG STATUS ================');
    console.log(`Total Cities:           ${cities.length} (${resolvedCities} have city.placeId)`);
    console.log(`Total Attractions:      ${totalPlaces + totalActivities}`);
    console.log(`  - Places:             ${totalPlaces} (${resolvedPlaces} resolved, ${missingPlaces} missing Place ID)`);
    console.log(`  - Activities:         ${totalActivities} (exempt from Place ID)`);
    console.log(`Total Batches:          ${totalBatches} (batch size: ${batchSize} cities/batch)`);
    console.log('-----------------------------------------------------------');

    for (let b = 1; b <= totalBatches; b++) {
      const bStart = (b - 1) * batchSize;
      const bCities = cities.slice(bStart, bStart + batchSize);
      let bPlaces = 0;
      let bMissing = 0;
      bCities.forEach(c => {
        (c.beats || []).forEach(beat => {
          if (beat.kind !== 'activity') {
            bPlaces++;
            if (!beat.placeId) bMissing++;
          }
        });
      });
      const tag = bMissing === 0 ? '✓ COMPLETE' : `${bMissing} missing`;
      console.log(`  Batch ${String(b).padStart(2)}: cities ${String(bStart + 1).padStart(3)}-${String(bStart + bCities.length).padStart(3)} | ${String(bPlaces).padStart(2)} places | ${tag} | ${bCities.map(c => c.name).join(', ').slice(0, 50)}...`);
    }
    console.log('===========================================================\n');
    console.log(`Run a batch with: node admin/enrich_kyt_places.js --batch 1 --in-place`);
    return;
  }

  let targetCities = cities;
  let runDescription = 'all cities';

  if (targetCityId) {
    targetCities = cities.filter(c => c.id === targetCityId);
    if (!targetCities.length) {
      console.error(`City '${targetCityId}' not found.`);
      process.exit(1);
    }
    runDescription = `city ${targetCityId}`;
  } else if (batchArg) {
    // Supports single batch e.g. "1" or range "1-3" or list "1,2"
    let batchIndices = [];
    if (batchArg.includes('-')) {
      const [startB, endB] = batchArg.split('-').map(n => parseInt(n.trim(), 10));
      for (let b = startB; b <= endB; b++) batchIndices.push(b);
    } else if (batchArg.includes(',')) {
      batchIndices = batchArg.split(',').map(n => parseInt(n.trim(), 10));
    } else {
      batchIndices = [parseInt(batchArg, 10)];
    }

    targetCities = [];
    for (const b of batchIndices) {
      const bStart = (b - 1) * batchSize;
      const bSlice = cities.slice(bStart, bStart + batchSize);
      targetCities.push(...bSlice);
    }
    runDescription = `batch(es) ${batchArg} (${targetCities.length} cities)`;
  } else if (limitArg) {
    targetCities = cities.slice(offsetArg, offsetArg + limitArg);
    runDescription = `offset ${offsetArg}, limit ${limitArg} (${targetCities.length} cities)`;
  }

  console.log(`Targeting: ${runDescription}`);

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

  const outPath = inPlace ? INPUT_JS_PATH : OUTPUT_JS_PATH;

  for (let cIdx = 0; cIdx < targetCities.length; cIdx++) {
    const city = targetCities[cIdx];
    const cityId = city.id;
    const cityQuery = `${city.name}, ${city.state || ''}, India`;
    const cacheKey = `city::${cityId}`;

    const beats = city.beats || [];
    const placeBeats = beats.filter(b => b.kind !== 'activity');
    const missingInCity = placeBeats.filter(b => !b.placeId).length;

    console.log(`\n[City ${cIdx + 1}/${targetCities.length}] ${city.name} (${placeBeats.length} places, ${missingInCity} missing, ${beats.length - placeBeats.length} activities)`);

    // Only resolve city place ID if not excluded, not skipping city, and not already resolved (unless force)
    if (!skipCity && !EXCLUDED_CITY_PLACE_IDS.has(cityId)) {
      if (city.placeId && !force) {
        // already has placeId
      } else {
        let res;
        if (!cache[cacheKey] || force) {
          console.log(`  Resolving City: ${cityQuery}...`);
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
      }
    }

    if (!skipBeats) {
      for (let bIdx = 0; bIdx < beats.length; bIdx++) {
        const beat = beats[bIdx];
        const beatQuery = getCleanSearchQuery(beat, city.name);

        // If this attraction is an activity (food, breakfast, lunch, trail), do NOT map via Place ID
        if (beat.kind === 'activity') {
          delete beat.placeId;
          delete beat.ftid;
          beat.mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(beatQuery)}`;
          console.log(`   -> Beat ${bIdx + 1}/${beats.length} [ACTIVITY]: ${beat.title} (skipped)`);
          continue;
        }

        // If already has placeId and not force, skip
        if (beat.placeId && !force) {
          console.log(`   -> Beat ${bIdx + 1}/${beats.length} [PLACE]: ${beat.title} (already has ${beat.placeId})`);
          continue;
        }

        const bCacheKey = `beat::${cityId}::${beat.title}`;

        let bRes;
        if (!cache[bCacheKey] || force) {
          console.log(`   -> Beat ${bIdx + 1}/${beats.length} [PLACE]: Resolving ${beatQuery}...`);
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
        console.log(`      ✓ ${beat.title} -> ${beat.placeId || '(no placeId)'}`);
      }
    }

    // Save incrementally after each city completes
    saveCities(cities, outPath, prefix, suffix);
  }

  await browser.close();
  console.log(`\n✓ Batch complete! Updated catalog saved to: ${outPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

