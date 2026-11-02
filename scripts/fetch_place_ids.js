#!/usr/bin/env node
'use strict';

/**
 * Utility script to populate or refresh Google Place IDs for all cities in data/cities.js.
 *
 * Usage:
 *   node scripts/fetch_place_ids.js --key=YOUR_GOOGLE_MAPS_API_KEY
 *   OR set environment variable: GOOGLE_MAPS_API_KEY
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const keyArg = process.argv.find(a => a.startsWith('--key='));
const API_KEY = keyArg ? keyArg.split('=')[1] : process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.log('Google Maps API key not provided.');
  console.log('Usage: node scripts/fetch_place_ids.js --key=YOUR_GOOGLE_MAPS_API_KEY');
  console.log('Alternatively set the GOOGLE_MAPS_API_KEY environment variable.');
  process.exit(1);
}

const CITIES_PATH = path.join(__dirname, '..', 'data', 'cities.js');
let content = fs.readFileSync(CITIES_PATH, 'utf8');

const window = {};
eval(content);
const cities = window.KYT_CITIES || [];

function fetchPlaceId(query) {
  return new Promise((resolve, reject) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${API_KEY}`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.status === 'OK' && json.results && json.results.length > 0) {
            resolve(json.results[0].place_id);
          } else {
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log(`Starting Place ID lookup for ${cities.length} cities...`);
  const isCRLF = content.includes('\r\n');
  const nl = isCRLF ? '\r\n' : '\n';
  let updatedCount = 0;

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    if (city.placeId) {
      console.log(`[${i + 1}/${cities.length}] ${city.name} already has placeId: ${city.placeId}`);
      continue;
    }

    const query = `${city.name}, ${city.state || ''}, India`;
    try {
      const placeId = await fetchPlaceId(query);
      if (placeId) {
        console.log(`[${i + 1}/${cities.length}] ${city.name} -> ${placeId}`);
        const target = `"id": "${city.id}",`;
        content = content.replace(target, `${target}${nl}    "placeId": "${placeId}",`);
        updatedCount++;
      } else {
        console.warn(`[${i + 1}/${cities.length}] Could not find placeId for ${city.name}`);
      }
      // Brief rate-limiting pause
      await new Promise(r => setTimeout(r, 100));
    } catch (err) {
      console.error(`Error querying ${city.name}:`, err.message);
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(CITIES_PATH, content, 'utf8');
    console.log(`\nSuccessfully saved ${updatedCount} new Place IDs to data/cities.js`);
  } else {
    console.log('\nNo updates were made.');
  }
}

run();

