'use strict';
/**
 * P1.0: places where a normal plan fails (a trek, winter closure, altitude, a permit) carry an
 * `access` note with an official source; the city sheet and the Day Plan warn, and the generator
 * never turns a trek or altitude place into a day trip.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

async function open(page) {
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
}

test('every access note has a kind, a note, month windows that make sense and an https source', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  const rows = await page.evaluate(() => window.KYT_CITIES.filter(c => c.access).map(c => ({ id: c.id, ...c.access })));
  assert.ok(rows.length >= 8, 'the verified places are recorded');
  for (const a of rows) {
    assert.ok(['trek', 'seasonal', 'altitude', 'permit'].includes(a.kind), `${a.id} kind`);
    assert.ok(a.note && a.note.length > 20, `${a.id} note`);
    assert.match(a.source, /^https:\/\//, `${a.id} has a source`);
    if (a.closed) assert.ok(a.closed.every(m => Number.isInteger(m) && m >= 1 && m <= 12), `${a.id} months`);
  }
  assert.ok(rows.some(a => a.id === 'kedarnath' && a.kind === 'trek'));
  await context.close();
});

test('a trek place is never generated as a day trip, a normal place still is', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  const titles = (cities) => page.evaluate((cities) => {
    const trip = { id: 't', name: 't', cities, originCity: 'already_there', duration: 3, taste: { intent: 'mixed', diet: 'any', pace: 'standard' }, nightStays: null };
    trip.nightStays = null;
    const t = { ...trip, steps: null };
    // suggestPlan builds night stays itself; use a temp trip like it does
    const added = [];
    KYT.virtualTrips.suggestPlan(Object.assign(t, { days: cities.map((c, i) => ({ id: i + 1, cityId: c })) }));
    return (t.steps || []).map(s => s.title);
  }, cities);
  const gated = await titles(['rishikesh', 'kedarnath', 'kedarnath']);
  assert.ok(!gated.some(x => /Day Excursion: Drive to Kedarnath/.test(x)), 'no day excursion to Kedarnath');
  const normal = await titles(['jaipur', 'jaipur', 'jaipur']);
  assert.ok(normal.length > 5, 'normal plans still generate');
  await context.close();
});

test('the city sheet and the Day Plan warn for Kedarnath and stay quiet for Jaipur', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  await page.fill('#vt-new-name', 'Char Dham');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await page.fill('#vt-city-search', 'Kedarnath');
  await page.click('.btn-add-city[data-id="kedarnath"]');
  await page.fill('#vt-city-search', '');
  await page.evaluate(() => KYT.virtualTrips.openCityDetail('kedarnath', false));
  await page.waitForSelector('#cd-access');
  assert.match(await page.locator('#cd-access').innerText(), /16–18 km trek from Gaurikund/);
  await page.evaluate(() => { document.getElementById('city-detail-overlay')?.classList.add('hidden'); });
  await page.click('#btn-vt-dest-done');
  await page.waitForSelector('#vt-trip-card:not(.hidden)');
  await page.selectOption('#vt-origin-city', 'bengaluru');
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  assert.match(await page.locator('#vt-day-access').innerText(), /On foot\. .*Gaurikund/s, 'the Day Plan carries the same note');
  await page.evaluate(() => KYT.virtualTrips.openCityDetail('jaipur', false));
  assert.equal(await page.locator('#cd-access').count(), 0, 'Jaipur has no warning');
  await context.close();
});

test('city cards say how many videos a city has, and only when it has some', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  await page.fill('#vt-new-name', 'Videos');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  const { withVideos, without } = await page.evaluate(() => {
    const v = window.KYT_CITY_VIDEOS;
    const ids = window.KYT_CITIES.map(c => c.id);
    return { withVideos: ids.find(i => (v[i] || []).length > 0), without: ids.find(i => !(v[i] || []).length) };
  });
  assert.ok(withVideos, 'some city has videos');
  const html = (id) => page.evaluate((id) => KYT.ui.renderCityCard(window.KYT_CITIES.find(c => c.id === id), { variant: 'library' }), id);
  assert.match(await html(withVideos), /city-videos-link[^>]*>.*\d+ videos?/s);
  if (without) assert.doesNotMatch(await html(without), /city-videos-link/);
  for (const variant of ['summary', 'nearby']) {
    const h = await page.evaluate(([id, v]) => KYT.ui.renderCityCard(window.KYT_CITIES.find(c => c.id === id), { variant: v }), [withVideos, variant]);
    assert.match(h, /city-videos-link/, `${variant} card too`);
  }
  await context.close();
});

async function planFor(page, cityId, query) {
  await open(page);
  await page.fill('#vt-new-name', 'Sticky');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await page.fill('#vt-city-search', query);
  await page.click(`.btn-add-city[data-id="${cityId}"]`);
  await page.click('#btn-vt-dest-done');
  await page.waitForSelector('#vt-trip-card:not(.hidden)');
  await page.selectOption('#vt-origin-city', 'bengaluru');
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  await page.click('#btn-vt-suggest');
  await page.waitForSelector('#vt-day-panel .step-card, #vt-day-panel [data-step-id]');
}

test('the "N videos" cue is a real link to the city page and a plain click opens the sheet', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  await page.fill('#vt-new-name', 'Links');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await page.fill('#vt-city-search', 'Jaipur');
  const link = page.locator('article[data-city-id="jaipur"] a.city-videos-link');
  await link.waitFor();
  assert.match(await link.getAttribute('href'), /[?&]city=jaipur/, 'a real href to the city');
  await link.click();
  await page.waitForSelector('#city-detail-overlay:not(.hidden)');
  assert.equal(await page.locator('#cd-title').innerText(), 'Jaipur');
  await context.close();
});

test('the day tabs stay at the top while the day scrolls, and View trip leads the bottom bar', async () => {
  const { context, page } = await newPhone(env.browser);
  await planFor(page, 'jaipur', 'Jaipur');
  await page.evaluate(() => { document.getElementById('vt-screen-builder').scrollTop = 600; });
  const gap = await page.evaluate(() => {
    const t = document.getElementById('vt-day-tabs').getBoundingClientRect().top;
    const s = document.getElementById('vt-screen-builder').getBoundingClientRect().top;
    return Math.abs(t - s);
  });
  assert.ok(gap < 2, `tabs pinned to the top of the plan (gap ${gap})`);
  const view = await page.locator('#btn-vt-view-trip').boundingBox();
  const start = await page.getByRole('button', { name: /Start this trip/ }).boundingBox();
  assert.ok(view.width > start.width, 'View trip is the bigger, primary button');
  assert.ok(start.x < view.x, 'Start this trip sits quietly beside it');
  await context.close();
});

test('the footer is one line on a phone', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  await page.waitForSelector('#kyt-feedback-footer');
  const h = await page.locator('#kyt-feedback-footer').evaluate(el => el.getBoundingClientRect().height);
  assert.ok(h < 40, `footer height ${h}`);
  assert.equal(await page.locator('#kyt-feedback-footer').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'nothing cut off');
  await context.close();
});

async function threeCityTrip(page) {
  await open(page);
  await page.fill('#vt-new-name', 'Maharashtra');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  for (const [q, id] of [['Pune', 'pune'], ['Nashik', 'nashik'], ['Aurangabad', 'aurangabad']]) {
    await page.fill('#vt-city-search', q);
    await page.click(`.btn-add-city[data-id="${id}"]`);
    await page.fill('#vt-city-search', '');
  }
  await page.click('#btn-vt-dest-done');
  await page.waitForSelector('#vt-trip-card:not(.hidden)');
  await page.selectOption('#vt-origin-city', 'bengaluru');
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
}

test('Day Plan flow: the next step is the next empty day, travel to the next city is offered, overnight travel replaces a stay', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeCityTrip(page);
  // 1. an empty Day 1: nothing to move on to yet, and no View trip or Start
  assert.equal(await page.locator('#btn-vt-next-day').count(), 0);
  assert.equal(await page.locator('#btn-vt-view-trip').count(), 0);
  // add one stop on Day 1: the bar moves on to Day 2, still no View trip
  await page.locator('[data-add-beat]').first().click();
  assert.match(await page.locator('#btn-vt-next-day').innerText(), /Plan Day 2/);
  assert.equal(await page.locator('#btn-vt-view-trip').count(), 0, 'View trip waits until every day has something');
  // 4. Day 1 offers travel to Day 2's city, by day or overnight, and a stay
  const hints = await page.locator('#vt-day-hints').innerText();
  assert.match(hints, /Travel to Nashik for Day 2/);
  assert.match(hints, /Overnight travel to Nashik/);
  assert.match(hints, /Stay in Pune tonight/);
  // 5. choosing overnight travel opens the editor with the box ticked, and the Maps link opens in a new tab
  await page.click('[data-overnight="1"]');
  assert.equal(await page.locator('#vt-travel-overnight').isChecked(), true);
  assert.equal(await page.locator('#vt-step-time').inputValue(), '21:00');
  const maps = page.locator('#vt-travel-maps');
  assert.equal(await maps.isVisible(), true);
  assert.equal(await maps.getAttribute('target'), '_blank');
  assert.match(await maps.getAttribute('href'), /google\.com\/maps\/dir\/.*origin=Pune.*destination=Nashik/);
  // 3. From and To suggest places
  assert.equal(await page.locator('#vt-travel-from').getAttribute('list'), 'vt-place-list');
  assert.ok(await page.locator('#vt-place-list option').count() > 100);
  await page.click('#btn-save-vt-step');
  const card = page.locator('#vt-day-panel').getByText(/Overnight travel: Pune to Nashik/);
  assert.equal(await card.count(), 1);
  assert.equal(await page.locator('#vt-day-panel a[href*="maps/dir"][target="_blank"]').count(), 1, 'the step carries a directions link');
  assert.doesNotMatch(await page.locator('#vt-day-hints').innerText(), /Stay in Pune|Overnight travel to Nashik/, 'no stay or second travel needed that night');
  // Day 2 does not offer the same journey again as an arrival
  await page.click('[data-day-id="2"][role="tab"]');
  assert.doesNotMatch(await page.locator('#vt-day-hints').innerText(), /Travel from Pune to Nashik/);
  // fill the other days: View trip and Start appear
  for (const d of [2, 3]) {
    await page.click(`[data-day-id="${d}"][role="tab"]`);
    if (await page.locator('[data-add-beat]').count()) await page.locator('[data-add-beat]').first().click();
  }
  assert.equal(await page.locator('#btn-vt-view-trip').count(), 1, 'every day planned: View trip is the next step');
  assert.equal(await page.getByRole('button', { name: /Start this trip/ }).count(), 1);
  await context.close();
});

test('Add travel starts from what is planned: arriving unless the journey in is already there; Suggest a plan keeps it', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeCityTrip(page);
  const fields = async () => [await page.locator('#vt-travel-from').inputValue(), await page.locator('#vt-travel-to').inputValue()];
  // Day 1 (Pune), nothing planned: the journey arrives, from where the trip starts
  await page.click('#btn-vt-add-travel');
  assert.deepEqual(await fields(), ['Bengaluru', 'Pune']);
  await page.click('#btn-cancel-step-modal');
  // Day 1 gets an overnight journey to Nashik; Day 2's journey in is therefore planned
  await page.click('[data-overnight="1"]');
  await page.click('#btn-save-vt-step');
  await page.click('[data-day-id="2"][role="tab"]');
  await page.click('#btn-vt-add-travel');
  assert.deepEqual(await fields(), ['Nashik', 'Aurangabad'], 'the next journey leaves Nashik');
  await page.click('#btn-cancel-step-modal');
  // Suggest a plan fills the empty days without a second journey into Nashik
  await page.click('#btn-vt-suggest');
  await page.click('[data-day-id="2"][role="tab"]');
  const day2 = await page.locator('#vt-day-panel').innerText();
  assert.doesNotMatch(day2, /Travel to Nashik|Travel from Pune to Nashik/, 'no duplicate journey into Nashik');
  await page.click('[data-day-id="1"][role="tab"]');
  assert.equal(await page.locator('#vt-day-panel').getByText(/Overnight travel: Pune to Nashik/).count(), 1, 'the planned journey is kept');
  await context.close();
});

test('with two or more cities there is a Google Maps route link in their order', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  await page.fill('#vt-new-name', 'Route');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  const link = page.locator('#vt-route-link');
  for (const [q, id] of [['Pune', 'pune'], ['Nashik', 'nashik'], ['Aurangabad', 'aurangabad']]) {
    assert.equal(await link.isVisible(), id === 'aurangabad', `link before adding ${id}`);
    await page.fill('#vt-city-search', q);
    await page.click(`.btn-add-city[data-id="${id}"]`);
    await page.fill('#vt-city-search', '');
  }
  assert.equal(await link.getAttribute('target'), '_blank');
  const href = decodeURIComponent(await link.getAttribute('href'));
  assert.match(href, /origin=Pune India&destination=Aurangabad India&waypoints=Nashik India/);
  await context.close();
});
