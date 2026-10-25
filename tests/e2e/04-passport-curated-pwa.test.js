'use strict';
/** Passport, curated trips, offline/PWA behaviour and the catalog data the app depends on. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { launch, newPhone, seedTrip, iso, ROOT } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const passport = page => page.evaluate(() => JSON.parse(localStorage.getItem('kyt_passport') || '{}'));

// ── Passport ────────────────────────────────────────────────────────────────
test('passport starts at 0 visited; Mark Visited stamps a city and updates the count', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#verified-count');
  assert.match(await page.locator('#verified-count').innerText(), /^0 Visited/);
  await page.getByRole('button', { name: /Mark Visited/ }).first().click();
  assert.match(await page.locator('#verified-count').innerText(), /^1 Visited/);
  assert.equal(Object.keys(await passport(page)).length, 1);
  assert.match(await page.locator('body').innerText(), /BEEN THERE DONE THAT|Undo Visit/);
  await context.close();
});

test('passport filter (Visited / Unvisited) and sort (A-Z) change the grid', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#verified-count');
  const total = await page.getByRole('button', { name: /Mark Visited/ }).count();
  assert.ok(total >= 100, `expected the full city grid, got ${total}`);
  await page.getByRole('button', { name: /Mark Visited/ }).nth(0).click();
  await page.getByRole('button', { name: /Mark Visited/ }).nth(0).click();

  await page.selectOption('#filter-select', 'visited');
  assert.equal(await page.getByRole('button', { name: /Undo Visit/ }).count(), 2);
  assert.equal(await page.getByRole('button', { name: /Mark Visited/ }).count(), 0);

  await page.selectOption('#filter-select', 'unvisited');
  assert.equal(await page.getByRole('button', { name: /Undo Visit/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /Mark Visited/ }).count(), total - 2);

  await page.selectOption('#filter-select', 'all');
  await page.selectOption('#sort-select', 'alpha');
  const names = await page.$$eval('h3', hs => hs.map(h => h.textContent.trim()).filter(Boolean));
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names.slice(0, 20), sorted.slice(0, 20));
  await context.close();
});

test('passport: the visit date can be edited and persists; Undo Visit removes the stamp', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#verified-count');
  await page.getByRole('button', { name: /Mark Visited/ }).first().click();
  const dateInput = page.locator('input[type="date"]').first();
  await dateInput.fill('2025-12-31');
  await dateInput.dispatchEvent('change');
  const rec = Object.values(await passport(page))[0];
  assert.equal(rec.date, '2025-12-31');

  await page.reload();
  await page.waitForSelector('#verified-count');
  assert.equal(await page.locator('input[type="date"]').first().inputValue(), '2025-12-31');

  await page.getByRole('button', { name: /Undo Visit/ }).first().click();
  assert.match(await page.locator('#verified-count').innerText(), /^0 Visited/);
  assert.deepEqual(await passport(page), {});
  await context.close();
});

test('passport search filters cities by name, alias, and state, with clear search support', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container');

  // Search by alias "Kashi" -> Varanasi
  await page.fill('#search-input', 'kashi');
  await page.waitForTimeout(100);
  const matchedNames = await page.$$eval('#cards-container h3', hs => hs.map(h => h.textContent.trim()));
  assert.ok(matchedNames.includes('Varanasi'));
  assert.ok(matchedNames.length <= 3);

  // Search by unknown query -> empty state
  await page.fill('#search-input', 'zzzzqqq');
  await page.waitForTimeout(100);
  assert.match(await page.locator('#cards-container').innerText(), /No destinations found/);

  // Clear search via button
  await page.click('#btn-clear-search');
  await page.waitForTimeout(100);
  const total = await page.getByRole('button', { name: /Mark Visited/ }).count();
  assert.ok(total >= 100);

  await context.close();
});

// ── Curated trips ───────────────────────────────────────────────────────────
test('curated trips list shows the approved trips and the filter narrows by travel style', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/curated_trips.html');
  await page.waitForSelector('#filter-pills');
  assert.match(await page.locator('body').innerText(), /Tirupati: Divine Calling/);
  assert.match(await page.locator('body').innerText(), /Showing \d+ trips?\b/);

  await page.click('.filter-pill[data-filter="culinary"]');
  assert.doesNotMatch(await page.locator('body').innerText(), /Tirupati: Divine Calling/);
  await page.click('.filter-pill[data-filter="all"]');
  assert.match(await page.locator('body').innerText(), /Tirupati: Divine Calling/);
  await context.close();
});

test('opening a curated trip card previews its highlights and day-by-day plan', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/curated_trips.html');
  await page.waitForSelector('[role="button"][title^="Click to preview"]');
  await page.click('[role="button"][title^="Click to preview"]');
  await page.waitForFunction(() => /Tirupati: Divine Calling/.test(document.getElementById('modal-title').textContent));
  assert.match(await page.locator('#modal-days').innerText(), /Journey from Bengaluru to Tirupati/);
  assert.ok((await page.locator('#modal-highlights li').count()) > 0);
  await context.close();
});

test('"Open in Virtual Trips" on a curated trip saves it with its steps and opens it', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/curated_trips.html');
  await page.waitForSelector('[role="button"][title^="Click to preview"]');
  await page.click('[role="button"][title^="Click to preview"]');
  await page.waitForSelector('#modal-title:not(:empty)');
  await page.click('#btn-open-virtual-trips');
  await page.waitForURL('**/virtual_trip.html**');
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips'))[0]);
  assert.ok(t.curatedId, 'imported trip remembers which curated trip it came from');
  assert.ok(t.steps && t.steps.length > 3);
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  assert.match(await page.locator('#vt-itinerary-list').innerText(), /Journey from Bengaluru to Tirupati/);
  await context.close();
});

test('sharing a curated trip produces a link to the detail page with its cities and taste', async () => {
  const { context, page } = await newPhone(env.browser);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: env.base });
  await page.goto(env.base + '/curated_trips.html');
  await page.waitForSelector('[role="button"][title^="Click to preview"]');
  await page.click('[role="button"][title^="Click to preview"]');
  await page.waitForSelector('#btn-share-curated-idea');
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('#btn-share-curated-idea');
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(link, /trip_detail\.html\?/);
  assert.match(link, /curated=/);
  assert.match(link, /cities=tirupati/);
  await context.close();
});

// ── Offline / PWA ───────────────────────────────────────────────────────────
test('after one online visit the app shell loads with the network off', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length > 10, null, { timeout: 15000 });
  // visit the pages we will need offline so they are surely cached
  for (const p of ['view_trip.html', 'configure_trip.html', 'visited.html']) { await page.goto(env.base + '/' + p); }
  await context.setOffline(true);
  await page.goto(env.base + '/view_trip.html');
  await page.waitForSelector('#hero-card');
  assert.match(await page.locator('#hero-card').innerText(), /No steps yet/i);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#verified-count');
  await context.close();
});

test('a trip can be created and edited with the network off (offline-first)', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/configure_trip.html');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#btn-add-step');
  await page.click('#btn-add-step');
  await page.fill('#form-step-title', 'In-flight note');
  await page.click('#btn-save-step');
  assert.match(await page.locator('#step-count-badge').innerText(), /^1 item$/);
  await context.close();
});

test('manifest makes the app installable (name, standalone, icons exist)', async () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name && m.start_url);
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), `missing icon ${i.src}`);
});

test('no page throws an uncaught error on load', async () => {
  const { context, page } = await newPhone(env.browser);
  for (const p of ['index.html', 'view_trip.html', 'configure_trip.html', 'virtual_trip.html', 'curated_trips.html', 'visited.html', 'trip_detail.html?id=x']) {
    await page.goto(env.base + '/' + p);
    await page.waitForTimeout(300);
  }
  // pdfmake CDN is blocked in the harness on purpose, so ignore its ReferenceError.
  const real = page.errors.filter(e => !/pdfMake/i.test(e));
  assert.deepEqual(real, []);
  await context.close();
});

// ── Catalog data the planner depends on (pure Node, no browser) ─────────────
function load(file, key) {
  const sandbox = { window: {} };
  new Function('window', fs.readFileSync(path.join(ROOT, file), 'utf8'))(sandbox.window);
  return sandbox.window[key];
}

test('catalog: every city has a unique id and code, a name, and at least one attraction', () => {
  const cities = load('data/cities.js', 'KYT_CITIES');
  assert.equal(new Set(cities.map(c => c.id)).size, cities.length);
  assert.equal(new Set(cities.map(c => c.code)).size, cities.length);
  const bad = cities.filter(c => !c.name || !Array.isArray(c.beats) || c.beats.length === 0).map(c => c.id);
  assert.deepEqual(bad, []);
});

test('catalog: every attraction has a title, a place and an hour between 0 and 23', () => {
  const cities = load('data/cities.js', 'KYT_CITIES');
  const bad = [];
  cities.forEach(c => c.beats.forEach(b => {
    if (!b.title || !b.where || !(b.hour >= 0 && b.hour <= 23)) bad.push(`${c.id}: ${b.title}`);
  }));
  assert.deepEqual(bad, []);
});

test('catalog: any Maps link an attraction has is an https Google Maps URL', () => {
  const cities = load('data/cities.js', 'KYT_CITIES');
  const bad = [];
  cities.forEach(c => c.beats.forEach(b => {
    if (b.mapsUrl && !/^https:\/\/www\.google\.com\/maps\//.test(b.mapsUrl)) bad.push(`${c.id}: ${b.title}`);
  }));
  assert.deepEqual(bad, []);
});

test('catalog: every attraction ships a direct Maps link', () => {
  const cities = load('data/cities.js', 'KYT_CITIES');
  const missing = [];
  cities.forEach(c => c.beats.forEach(b => { if (!b.mapsUrl) missing.push(`${c.id}: ${b.title}`); }));
  assert.deepEqual(missing, []);
});

test('catalog: the distance table only refers to cities that exist', () => {
  const ids = new Set(load('data/cities.js', 'KYT_CITIES').map(c => c.id));
  const dm = load('data/distance_matrix.js', 'KYT_DISTANCE_MATRIX');
  const unknown = [];
  Object.entries(dm).forEach(([a, row]) => {
    if (!ids.has(a)) unknown.push(a);
    Object.keys(row).forEach(b => { if (!ids.has(b)) unknown.push(`${a}->${b}`); });
  });
  assert.deepEqual(unknown, []);
});

test('catalog: curated trips reference real cities and have steps on every day', () => {
  const ids = new Set(load('data/cities.js', 'KYT_CITIES').map(c => c.id));
  const trips = load('data/curated_trips.js', 'KYT_CURATED_TRIPS');
  trips.forEach(t => {
    assert.ok(t.title && t.days && t.days.length > 0, `${t.id} needs a title and days`);
    (t.cities || []).forEach(c => assert.ok(ids.has(c), `${t.id}: unknown city ${c}`));
    t.days.forEach(d => assert.ok(d.steps && d.steps.length > 0, `${t.id} day ${d.day} has no steps`));
  });
});

test('catalog: quests reference real cities, have unique ids, valid categories, and < 15 cities each', () => {
  const ids = new Set(load('data/cities.js', 'KYT_CITIES').map(c => c.id));
  const quests = load('data/quests.js', 'KYT_QUESTS');
  const validCategories = new Set(['spiritual', 'heritage', 'nature', 'regional']);
  const questIds = new Set();

  assert.ok(Array.isArray(quests) && quests.length >= 20, 'expected at least 20 quests');
  quests.forEach(q => {
    assert.ok(q.id && typeof q.id === 'string', 'quest needs an id');
    assert.ok(!questIds.has(q.id), `duplicate quest id: ${q.id}`);
    questIds.add(q.id);
    assert.ok(q.title && typeof q.title === 'string', `${q.id} needs a title`);
    assert.ok(q.subtitle && typeof q.subtitle === 'string', `${q.id} needs a subtitle`);
    assert.ok(q.icon && typeof q.icon === 'string', `${q.id} needs an icon`);
    assert.ok(validCategories.has(q.category), `${q.id} has invalid category: ${q.category}`);
    assert.ok(Array.isArray(q.cityIds) && q.cityIds.length > 0, `${q.id} needs non-empty cityIds`);
    assert.ok(q.cityIds.length < 15, `${q.id} has ${q.cityIds.length} cities (must be < 15)`);
    q.cityIds.forEach(cid => {
      assert.ok(ids.has(cid), `${q.id} references unknown city id: ${cid}`);
    });
  });
});

test('sharing a trip from trip_detail requires privacy consent and generates valid share link', async () => {
  const { context, page } = await newPhone(env.browser);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: env.base });
  
  const testUrl = `${env.base}/trip_detail.html?trip=Mumbai+and+Nashik&cities=mum,nas&taste=mas&origin=bengaluru&days=2&id=test_123`;

  await page.goto(testUrl);
  await page.waitForSelector('#btn-share-trip');

  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('#btn-share-trip');

  // Verify privacy consent modal appears
  await page.waitForSelector('#share-consent-modal:not(.hidden)');
  assert.equal(await page.isDisabled('#btn-confirm-share-url'), true, 'Confirm button must be disabled before consent');

  // Verify checkbox text contains required privacy wording
  const consentText = await page.locator('#share-consent-modal label').innerText();
  assert.match(consentText, /anyone with this URL can only see this trip plan/i);

  // Check the consent box
  await page.check('#share-privacy-consent-cb');
  assert.equal(await page.isDisabled('#btn-confirm-share-url'), false, 'Confirm button must be enabled after consent');

  // Confirm share
  await page.click('#btn-confirm-share-url');
  await page.waitForTimeout(300);

  const copiedLink = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copiedLink.length < 500, `Share URL must be lightweight (<500 chars, got ${copiedLink.length})`);
  assert.ok(!copiedLink.includes('&ai='), 'Shared link must never contain legacy &ai= param');
  assert.match(copiedLink, /trip_detail\.html\?/);
  assert.match(copiedLink, /cities=mum/);
  assert.match(copiedLink, /id=test_123/);

  await context.close();
});

test('importing a compressed plan parameter into trip_detail restores customized steps and timings', async () => {
  const { context, page } = await newPhone(env.browser);
  const zlib = require('zlib');
  const compactPlan = [
    { d: 0, s: [[18, 0, 'Arrival at Gateway Hotel', 'Colaba, Mumbai', 'car']] },
    { d: 1, s: [[9, 30, 'Elephanta Special Heritage Tour', 'Elephanta Island', 'compass']] }
  ];
  const def = zlib.deflateRawSync(Buffer.from(JSON.stringify(compactPlan)));
  const planB64 = def.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const testUrl = `${env.base}/trip_detail.html?trip=Custom+Gateway+Trip&cities=mum&taste=mas&origin=bengaluru&days=2&plan=${planB64}`;

  await page.goto(testUrl);
  await page.waitForSelector('#refined-itinerary-section');

  // Address bar URL should have ?plan= stripped
  assert.ok(!page.url().includes('plan='), 'URL should strip plan parameter from address bar');

  // Content should display the restored customized steps
  const scheduleText = await page.locator('#refined-itinerary-section').innerText();
  assert.match(scheduleText, /Arrival at Gateway Hotel/);
  assert.match(scheduleText, /Elephanta Special Heritage Tour/);

  await context.close();
});

test('sharing a refined trip with shortener generates ?c= link and loading ?c= restores trip', async () => {
  const { context, page } = await newPhone(env.browser);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: env.base });

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type'
  };

  let storedTrip = null;
  await context.route(/\/api\/trip/, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    if (req.method() === 'POST') {
      storedTrip = JSON.parse(req.postData());
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'abc123', success: true })
      });
    } else if (req.method() === 'GET') {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        contentType: 'application/json',
        body: JSON.stringify(storedTrip)
      });
    }
    route.continue();
  });

  const seededTrip = {
    id: 'trip_worker_test',
    name: 'Shared Shortener Trip',
    duration: 1,
    originCity: 'bengaluru',
    cities: ['mum'],
    taste: { intent: 'mixed', diet: 'any', pace: 'standard' },
    steps: [
      { dayId: 1, hour: 11, minute: 30, title: 'Private Heritage Walk', where: 'Fort Mumbai', icon: 'footprints' }
    ]
  };

  await page.goto(`${env.base}/trip_detail.html`);
  await page.evaluate(trip => {
    localStorage.setItem('kyt_virtual_trips', JSON.stringify([trip]));
  }, seededTrip);

  await page.goto(`${env.base}/trip_detail.html?id=trip_worker_test`);
  await page.waitForSelector('#btn-share-trip');

  await page.evaluate(() => { navigator.share = undefined; });
  await page.click('#btn-share-trip');

  await page.waitForSelector('#share-consent-modal:not(.hidden)');
  await page.check('#share-privacy-consent-cb');
  await page.click('#btn-confirm-share-url');
  await page.waitForTimeout(300);

  const copiedLink = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(copiedLink.includes('?c=abc123'), `Link must contain shortcode ?c=abc123, got ${copiedLink}`);
  assert.ok(copiedLink.length < 80, `Link length must be under 80 characters, got ${copiedLink.length}`);

  // Test loading a new clean browser session with this ?c= link
  const { context: context2, page: page2 } = await newPhone(env.browser);
  await context2.route(/\/api\/trip/, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    return route.fulfill({
      status: 200,
      headers: corsHeaders,
      contentType: 'application/json',
      body: JSON.stringify(storedTrip)
    });
  });

  await page2.goto(`${env.base}/trip_detail.html?c=abc123`);
  await page2.waitForSelector('#refined-itinerary-section > div');

  const pageText = await page2.locator('#refined-itinerary-section').innerText();
  assert.match(pageText, /Private Heritage Walk/);
  assert.match(pageText, /Fort Mumbai/);

  // Verify duplicate buttons are removed from itinerary card
  assert.equal(await page2.locator('#btn-re-refine-trigger').count(), 0, 'Duplicate refine button must not exist in itinerary card');

  // Verify cities grid and video gallery are populated for shared shortlink
  const citiesText = await page2.locator('#cities-grid').innerText();
  assert.match(citiesText, /Mumbai/i, 'Cities section must display destination cards');
  assert.ok(!citiesText.includes('No cities selected in this trip'), 'Must not show empty cities message');

  const videoCount = await page2.locator('#video-gallery iframe').count();
  assert.ok(videoCount > 0, `Video gallery must display city videos, got ${videoCount}`);

  await context2.close();
  await context.close();
});


