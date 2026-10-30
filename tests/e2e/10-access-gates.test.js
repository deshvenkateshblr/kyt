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
