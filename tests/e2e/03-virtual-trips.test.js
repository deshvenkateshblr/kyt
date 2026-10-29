'use strict';
/** Virtual trips: hub, city picking, taste filtering, itinerary build, "Start this trip", share link. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone, seedTrip, iso } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

async function openHub(page) {
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
}
async function createTrip(page, name, origin = 'bengaluru') {
  await page.fill('#vt-new-name', name);
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  page.__origin = origin;   // chosen on the next step, once the destinations are set
}
/** Destinations are set: press Continue, then pick the starting point the test asked for. */
async function proceed(page) {
  const cont = page.locator('#btn-vt-dest-done');
  if (await cont.isVisible()) await cont.click();
  await page.waitForSelector('#vt-trip-card:not(.hidden)');
  if (page.__origin) await page.selectOption('#vt-origin-city', page.__origin);
}
async function addCity(page, query, id) {
  await page.fill('#vt-city-search', query);
  await page.click(`.btn-add-city[data-id="${id}"]`);
}
async function buildPlan(page) {
  await proceed(page);
  await page.click('#btn-vt-build');
  const confirmBtn = page.locator('#btn-modal-confirm-build');
  try {
    await confirmBtn.waitFor({ state: 'visible', timeout: 1000 });
    await confirmBtn.click();
    await page.waitForURL('**/trip_detail.html*');
    await page.waitForSelector('#btn-edit-plan');
    await page.click('#btn-edit-plan');
    await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  } catch(e) {}
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]'));

test('empty hub invites the user to name a trip; blank names are ignored', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  assert.match(await page.locator('#vt-list').innerText(), /Plan Your Dream Trip/);
  await page.click('#btn-vt-create');                   // blank name
  assert.equal((await stored(page)).length, 0);
  await context.close();
});

test('create a trip, add and remove cities; "Generate Day Plan" only appears once a city is chosen', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Golden Triangle');
  assert.equal(await page.locator('#btn-vt-build').isHidden(), true);

  await addCity(page, 'Agra', 'agra');
  assert.equal(await page.locator('.vt-selected-city-chip').count(), 1);
  assert.equal(await page.locator('#btn-vt-build').isVisible(), false, 'still choosing: the action is Continue');
  assert.match(await page.locator('#btn-vt-dest-done').innerText(), /Continue · 1 selected/);
  await page.click('#btn-vt-dest-done');
  assert.equal(await page.locator('#btn-vt-build').isVisible(), true);
  assert.match(await page.locator('#btn-vt-build').innerText(), /Generate Day Plan/);
  await page.click('#btn-vt-dest-edit');   // back to the picker to add the second city

  await page.fill('#vt-city-search', '');
  await addCity(page, 'Jaipur', 'jaipur');
  assert.equal(await page.locator('.vt-selected-city-chip').count(), 2);

  await page.locator('.vt-selected-city-chip .btn-del-city').first().click();
  assert.equal(await page.locator('.vt-selected-city-chip').count(), 1);
  const t = (await stored(page))[0];
  assert.equal(t.name, 'Golden Triangle');
  assert.deepEqual(t.cities, ['jaipur']);
  await context.close();
});

test('city search matches alternate names (Kashi finds Varanasi) and an unknown term finds nothing', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Search test');
  await page.fill('#vt-city-search', 'kashi');
  assert.equal(await page.locator('#vt-city-list .btn-add-city[data-id="varanasi"]').count(), 1);
  await page.fill('#vt-city-search', 'zzzzqqq');
  assert.equal(await page.locator('#vt-city-list .btn-add-city').count(), 0);
  await context.close();
});

test('exact city name sorts first in search results', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Sort test');
  await page.fill('#vt-city-search', 'goa');
  const first = await page.locator('#vt-city-list article[data-city-id]').first().getAttribute('data-city-id');
  assert.equal(first, 'goa');
  await context.close();
});

test('building a plan groups attractions into one Day per city, in the order the cities were added', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Two cities');
  await addCity(page, 'Agra', 'agra');
  await page.fill('#vt-city-search', '');
  await addCity(page, 'Jaipur', 'jaipur');
  await buildPlan(page);
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  const text = await page.locator('#vt-itinerary-list').innerText();
  assert.match(text, /day 0/i); assert.match(text, /day 1/i); assert.match(text, /day 2/i);
  assert.ok(text.indexOf('Agra') < text.indexOf('Jaipur'));
  const trip = (await stored(page))[0];
  assert.ok(trip.steps.length >= 2);
  assert.deepEqual([...new Set(trip.steps.map(s => s.dayId))], [0, 1, 2]);
  assert.equal(trip.steps.filter(s => s.dayId === 1).every(s => s.cityName === 'Agra'), true);
  await context.close();
});

test('taste: Culinary intent keeps food stops and drops sightseeing-only stops', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Foodie Agra');
  await addCity(page, 'Agra', 'agra');
  await proceed(page);                                   // Style is part of the trip card, after Continue
  await page.click('#vt-preferences-details summary');   // and closed until Change
  await page.click('.vt-chip[data-field="intent"][data-id="culinary"]');
  await buildPlan(page);
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  const titles = (await stored(page))[0].steps.map(s => s.title);
  assert.ok(titles.includes('Petha & chaat at Kinari Bazaar'), `got: ${titles.join(' | ')}`);
  assert.ok(!titles.includes('Taj Mahal'), 'Taj Mahal is cultural/spiritual, not culinary');
  await context.close();
});

test('taste: Jain diet never includes a stop that is tagged for other diets only', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Jain trip');
  for (const [q, id] of [['Jaipur', 'jaipur'], ['Varanasi', 'varanasi'], ['Goa', 'goa'], ['Delhi', 'delhi']]) {
    await addCity(page, q, id); await page.fill('#vt-city-search', '');
  }
  await proceed(page);
  await page.click('#vt-preferences-details summary');
  await page.click('.vt-chip[data-field="diet"][data-id="jain"]');
  await buildPlan(page);
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  const offenders = await page.evaluate(() => {
    const trip = JSON.parse(localStorage.getItem('kyt_virtual_trips'))[0];
    const bad = [];
    trip.steps.forEach(s => {
      const city = KYT_CITIES.find(c => c.name === s.cityName);
      const beat = city.beats.find(b => b.title === s.title);
      if (beat && beat.diet && beat.diet.length && !beat.diet.includes('jain')) bad.push(s.title);
    });
    return bad;
  });
  assert.deepEqual(offenders, []);
  await context.close();
});

// ── Starting a plan as the live trip: the traveller always chooses the start date ───────────────
const ymd = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
/** Build a plan and stay on the plan page (trip_detail.html), where "Start this trip" lives. */
async function buildToPlanPage(page, name, cities) {
  await openHub(page);
  await createTrip(page, name);
  for (const [q, id] of cities) { await page.fill('#vt-city-search', ''); await addCity(page, q, id); }
  await proceed(page);
  await page.click('#btn-vt-build');
  await page.locator('#btn-modal-confirm-build').click();
  await page.waitForURL('**/trip_detail.html*');
  await page.waitForSelector('#btn-edit-plan');
}
/** Answer the "When does your trip start?" dialog with a date, checking Start is disabled until then. */
async function chooseStartDate(page, date) {
  await page.waitForSelector('#kyt-start-date-input');
  assert.equal(await page.locator('#kyt-start-date-confirm').isDisabled(), true, 'Start is disabled until a date is chosen');
  await page.fill('#kyt-start-date-input', date);
  assert.equal(await page.locator('#kyt-start-date-confirm').isDisabled(), false);
  await page.click('#kyt-start-date-confirm');
}
async function liveTrip(page) {
  await page.waitForURL('**/view_trip.html');
  await page.waitForFunction(() => window.KYT && KYT.store.get().stepsData.length > 0);
  return page.evaluate(() => {
    const s = KYT.store.get();
    return { name: s.tripName, notes: s.tripNotes, cover: s.tripCoverImage, n: s.stepsData.length,
      steps: s.stepsData.map(x => ({ t: x.title, d: new Date(x.targetTime).toISOString(), st: x.status })) };
  });
}

test('"Start this trip" in the builder turns the plan into the live trip on the chosen start date', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Agra and Jaipur');
  await addCity(page, 'Agra', 'agra');
  await page.fill('#vt-city-search', '');
  await addCity(page, 'Jaipur', 'jaipur');
  await buildPlan(page);
  const planned = (await stored(page))[0].steps;
  await page.getByRole('button', { name: /Start this trip/ }).click();
  await chooseStartDate(page, '2027-03-15');

  const live = await liveTrip(page);
  assert.equal(live.name, 'Agra and Jaipur');
  assert.equal(live.n, planned.length);
  assert.equal(ymd(live.steps[0].d), '2027-03-15', 'Day 0 lands on the start date');
  assert.equal(ymd(live.steps.at(-1).d), '2027-03-17', 'Day 2 lands on the subsequent day');
  assert.ok(live.steps.every(s => s.st === 'todo'));
  for (let i = 1; i < live.steps.length; i++) {
    assert.ok(live.steps[i].d > live.steps[i - 1].d, 'steps have strictly increasing timestamps without overlap');
  }
  assert.match(await page.locator('#hero-card').innerText(), new RegExp(planned[0].title.slice(0, 8)));
  await context.close();
});

test('the plan page offers "Start this trip" as its main action, and it starts the trip on the chosen date', async () => {
  const { context, page } = await newPhone(env.browser);
  await buildToPlanPage(page, 'Rajasthan', [['Jaipur', 'jaipur'], ['Udaipur', 'udaipur']]);
  assert.equal(await page.locator('#btn-start-trip').isVisible(), true);
  assert.match(await page.locator('#btn-start-trip').innerText(), /Start this trip/);
  // it comes before Refine with AI / Edit in Builder / Share
  const order = await page.evaluate(() => ['btn-start-trip', 'btn-open-ai-refine', 'btn-edit-plan', 'btn-share-trip']
    .map(id => document.getElementById(id).getBoundingClientRect().top));
  assert.ok(order[0] < order[1] && order[0] < order[2] && order[0] < order[3], 'Start this trip is the first action');

  await page.click('#btn-start-trip');
  await chooseStartDate(page, '2027-06-01');
  const live = await liveTrip(page);
  assert.equal(live.name, 'Rajasthan');
  assert.equal(ymd(live.steps[0].d), '2027-06-01');
  await context.close();
});

test('the start dialog never assumes a date: Cancel and Escape leave everything as it was, and Today is explicit', async () => {
  const { context, page } = await newPhone(env.browser);
  await buildToPlanPage(page, 'Cancel me', [['Agra', 'agra']]);
  await page.click('#btn-start-trip');
  await page.waitForSelector('#kyt-start-date-input');
  assert.equal(await page.locator('#kyt-start-date-input').inputValue(), '', 'no date is pre-filled');
  await page.click('#kyt-start-date-cancel');
  assert.equal(await page.locator('#kyt-start-date-overlay').count(), 0);
  assert.match(page.url(), /trip_detail\.html/);

  await page.click('#btn-start-trip');
  await page.waitForSelector('#kyt-start-date-input');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#kyt-start-date-overlay').count(), 0);
  assert.match(page.url(), /trip_detail\.html/);
  const live = await page.evaluate(async () => { await KYT.store.loadData(); return KYT.store.get().stepsData.length; });
  assert.equal(live, 0, 'cancelling does not start a trip');

  await page.click('#btn-start-trip');
  await page.waitForSelector('#kyt-start-date-input');
  await page.click('#kyt-start-date-today');
  assert.equal(await page.locator('#kyt-start-date-input').inputValue(), ymd(new Date()));
  assert.equal(await page.locator('#kyt-start-date-confirm').isDisabled(), false);
  await page.fill('#kyt-start-date-input', '2020-01-01');
  assert.equal(await page.locator('#kyt-start-date-confirm').isDisabled(), true, 'a date in the past is not accepted');
  await context.close();
});

test('starting asks before overwriting an existing active trip; Cancel keeps it, and a new start clears its notes and cover', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { name: 'Existing Trip', notes: 'old notes', steps: [{ title: 'Keep me', targetTime: iso(2, 9) }] });
  await buildToPlanPage(page, 'New plan', [['Agra', 'agra']]);
  page.removeAllListeners('dialog');
  let asked = '';
  page.on('dialog', d => { asked = d.message(); d.dismiss(); });
  await page.click('#btn-start-trip');
  await page.waitForTimeout(500);
  assert.match(asked, /overwrite your current active trip \("Existing Trip"\)/);
  assert.equal(await page.locator('#kyt-start-date-overlay').count(), 0, 'no date question once the overwrite is refused');
  const kept = await page.evaluate(async () => { await KYT.store.loadData(); return KYT.store.get().tripName; });
  assert.equal(kept, 'Existing Trip');

  page.removeAllListeners('dialog');
  page.on('dialog', d => d.accept());
  await page.click('#btn-start-trip');
  await chooseStartDate(page, '2027-02-10');
  const live = await liveTrip(page);
  assert.equal(live.name, 'New plan');
  assert.equal(live.notes, '', 'the old trip notes do not leak into the new trip');
  assert.ok(!live.cover, 'the old cover image does not leak into the new trip');
  await context.close();
});

test('the builder has one way back to the plan page and one way forward; the day count ignores the travel day', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Three days');
  for (const [q, id] of [['Jaipur', 'jaipur'], ['Udaipur', 'udaipur'], ['Jodhpur', 'jodhpur']]) { await page.fill('#vt-city-search', ''); await addCity(page, q, id); }
  await buildPlan(page);
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  await page.click('#vt-menu-btn');
  assert.equal(await page.locator('a:visible', { hasText: 'Trip details & AI' }).count(), 1, 'exactly one Trip details & AI link, in the menu');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#vt-start-date').count(), 0, 'no hidden start-date field');
  assert.equal(await page.getByRole('button', { name: /Start this trip/ }).count(), 1);
  assert.match(await page.locator('#vt-itinerary-list').innerText(), /\d+ activities\s+·\s+3 days/);
  await context.close();
});

test('delete a step in the builder; the edit persists across reload and the trip is marked Built', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Edit me');
  await addCity(page, 'Agra', 'agra');
  await buildPlan(page);
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  const before = (await stored(page))[0].steps.length;
  const firstId = (await stored(page))[0].steps[0].id;
  await page.evaluate(id => window.deleteVirtualTripStep(id), firstId);
  assert.equal((await stored(page))[0].steps.length, before - 1);

  await page.reload();
  await page.waitForSelector('.vt-card');
  assert.match(await page.locator('.vt-card').first().innerText(), /built/i);
  assert.equal((await stored(page))[0].steps.length, before - 1);
  await context.close();
});

test('deleting a trip from the hub removes it for good', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Temp');
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('.vt-card');
  await page.click('.btn-del-vt');
  assert.equal((await stored(page)).length, 0);
  await context.close();
});

test('opening a shared trip link offers an import, then saves the trip with its cities and taste', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html?trip=Friends%20Trip&cities=agr,jai&taste=cvs');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]')).length === 1);
  assert.ok(page.dialogs.some(d => /import the shared trip: "Friends Trip"/.test(d)));
  const t = (await stored(page))[0];
  assert.equal(t.name, 'Friends Trip');
  assert.deepEqual(t.cities, ['agra', 'jaipur']);
  assert.deepEqual(t.taste, { intent: 'cultural', diet: 'veg', pace: 'standard' });
  assert.ok(!page.url().includes('cities='), 'share params are cleaned from the URL');
  await context.close();
});

test('declining a shared trip import saves nothing', async () => {
  const { context, page } = await newPhone(env.browser);
  page.removeAllListeners('dialog');
  page.on('dialog', d => d.dismiss());
  await page.goto(env.base + '/virtual_trip.html?trip=No&cities=agr&taste=mas');
  await page.waitForTimeout(500);
  assert.equal((await stored(page)).length, 0);
  await context.close();
});

test('city detail opens from a deep link and shows attractions', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html?city=agra');
  await page.waitForFunction(() => /Agra/.test(document.getElementById('cd-title')?.textContent || ''));
  assert.match(await page.locator('#city-detail-panel').innerText(), /Taj Mahal/);
  await context.close();
});

test('generating a day plan leads to trip-detail with Refine with AI, and Edit in Builder returns to editor', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Jaipur Journey');
  await addCity(page, 'Jaipur', 'jaipur');
  await proceed(page);
  await page.click('#btn-vt-build');
  await page.waitForSelector('#btn-modal-confirm-build:not(.hidden)');
  await page.click('#btn-modal-confirm-build');

  // Verify navigation to trip_detail.html with the trip id
  await page.waitForURL('**/trip_detail.html*');
  assert.ok(page.url().includes('trip_detail.html'));
  assert.match(page.url(), /id=/);

  // Verify trip title, Refine with AI button, and Edit in Builder button
  assert.match(await page.locator('#trip-title').innerText(), /Jaipur Journey/);
  assert.equal(await page.locator('#btn-open-ai-refine').isVisible(), true);
  assert.equal(await page.locator('#btn-edit-plan').isVisible(), true);

  // Verify day-by-day plan rendered on trip_detail.html
  assert.match(await page.locator('#refined-itinerary-section').innerText(), /day 1/i);

  // Click "Edit in Builder" and verify it navigates back to virtual_trip.html builder
  await page.click('#btn-edit-plan');
  await page.waitForURL('**/virtual_trip.html*');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  assert.match(await page.locator('#vt-itinerary-list').innerText(), /Jaipur/);

  // Verify Builder has a Trip Details & AI navigation link back to the plan page
  const detailsLink = page.locator('a[href*="trip_detail.html"]');
  assert.ok((await detailsLink.count()) >= 1, 'Builder contains a link back to trip_detail.html');

  await context.close();
});



test('origin is never assumed: nothing pre-selected, build asks for it, then it is remembered for the next trip', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'First Trip', null);
  await addCity(page, 'Jaipur', 'jaipur');
  await proceed(page);
  assert.equal(await page.locator('#vt-origin-city').inputValue(), '');
  assert.match(await page.locator('#vt-origin-city option:checked').innerText(), /Where are you starting from/);
  await page.click('#btn-vt-build');
  assert.equal(await page.locator('#btn-modal-confirm-build').isVisible(), false, 'must not open stay modal without an origin');
  assert.match(await page.locator('#vt-origin-desc').innerText(), /Choose where you start/);
  await page.selectOption('#vt-origin-city', 'chennai');
  await page.click('#btn-vt-build');
  await page.locator('#btn-modal-confirm-build').waitFor({ state: 'visible' });
  // second trip starts with the remembered choice
  await openHub(page);
  await createTrip(page, 'Second Trip', null);
  await addCity(page, 'Jaipur', 'jaipur');
  await proceed(page);
  assert.equal(await page.locator('#vt-origin-city').inputValue(), 'chennai');
  await context.close();
});

test('"Already in destination" is still available and skips Day 0', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await createTrip(page, 'Local Trip', 'already_there');
  await addCity(page, 'Jaipur', 'jaipur');
  await proceed(page);
  await page.click('#btn-vt-build');
  await page.locator('#btn-modal-confirm-build').waitFor({ state: 'visible' });
  await page.locator('#btn-modal-confirm-build').click();
  await page.waitForURL('**/trip_detail.html*');
  assert.doesNotMatch(await page.locator('body').innerText(), /DAY 0/i);
  await context.close();
});

test('blank trip name: Create gives feedback instead of silently doing nothing', async () => {
  const { context, page } = await newPhone(env.browser);
  await openHub(page);
  await page.click('#btn-vt-create');
  assert.equal(await page.locator('#vt-screen-canvas').isHidden(), true);
  assert.match(await page.locator('#vt-new-name').getAttribute('placeholder'), /name/i);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'vt-new-name');
  await context.close();
});

test('own plan page shows a plain summary, not curated-journey marketing copy; phones get no Ctrl+V hint', async () => {
  const { context, page } = await newPhone(env.browser);
  await buildToPlanPage(page, 'Rajasthan', [['Jaipur', 'jaipur'], ['Udaipur', 'udaipur']]);
  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /curated journey|amazing cities/i);
  assert.match(await page.locator('#trip-desc').innerText(), /2 cities/);
  await page.goto(env.base + '/configure_trip.html');
  assert.equal(await page.locator('.kyt-paste-hint').first().isVisible(), false);
  await context.close();
});

test('home page makes no sync promise and does not say curated trips are "coming soon"', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  const body = await page.locator('body').innerText();
  assert.doesNotMatch(body, /effortless sync|coming soon|on the way/i);
  await context.close();
});

test('home menu: first visit lights each option in turn once, then never again; reduced motion gets none', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  await page.waitForSelector('#options-container:not(.hidden)');
  await page.evaluate(() => document.querySelector('#options-container').scrollIntoView({ block: 'center' }));
  const seen = new Set();
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(250);
    (await page.evaluate(() => [...document.querySelectorAll('.k-option-card')].findIndex(c => c.classList.contains('k-nudge')))) >= 0 && seen.add(await page.evaluate(() => [...document.querySelectorAll('.k-option-card')].findIndex(c => c.classList.contains('k-nudge'))));
  }
  assert.ok(seen.size >= 4, 'all four options were highlighted in turn, saw ' + [...seen]);
  await page.reload(); await page.waitForSelector('#options-container:not(.hidden)');
  await page.waitForTimeout(1500);
  assert.equal(await page.locator('.k-nudge').count(), 0, 'does not repeat on the next visit');
  await context.close();
  const rm = await env.browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const p2 = await rm.newPage(); await p2.goto(env.base + '/index.html'); await p2.waitForSelector('#options-container:not(.hidden)');
  await p2.waitForTimeout(1500);
  assert.equal(await p2.locator('.k-nudge').count(), 0);
  assert.equal(await p2.evaluate(() => localStorage.getItem('kyt_home_nudged')), null);
  await rm.close();
});
