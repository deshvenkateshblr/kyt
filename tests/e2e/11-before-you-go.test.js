'use strict';
/**
 * Before you go: a short, sourced list per city (`beforeYouGo` in data/cities.js) for the places where
 * booking, permits, ID or dress change a plan. Shown in the city sheet, with a cue on the city cards.
 * Every item must carry the official page it was read from; a city with nothing verified has none.
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

async function startTrip(page, name = 'Before') {
  await open(page);
  await page.fill('#vt-new-name', name);
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
}

test('every Before you go entry has an official site, a check month and sourced items', async () => {
  const { context, page } = await newPhone(env.browser);
  await open(page);
  const rows = await page.evaluate(() => window.KYT_CITIES.filter(c => c.beforeYouGo).map(c => ({ id: c.id, ...c.beforeYouGo })));
  assert.ok(rows.length >= 10, 'the priority cities are recorded');
  const kinds = ['book', 'permit', 'id', 'dress', 'rule', 'season'];
  for (const b of rows) {
    assert.match(b.official, /^https:\/\//, `${b.id} official site`);
    assert.match(b.checked, /^\d{4}-(0[1-9]|1[0-2])$/, `${b.id} checked month`);
    assert.ok(b.items.length >= 2 && b.items.length <= 5, `${b.id} keeps it short`);
    for (const it of b.items) {
      assert.ok(kinds.includes(it.kind), `${b.id} kind ${it.kind}`);
      assert.ok(it.text.length > 20 && it.text.length <= 220, `${b.id} text length: ${it.text}`);
      assert.match(it.source, /^https:\/\/\S+$/, `${b.id} source for: ${it.text}`);
      assert.doesNotMatch(it.text, /(?:rs\.?|₹|inr)\s?\d/i, `${b.id} quotes no prices, they go stale`);
    }
  }
  await context.close();
});

test('the city sheet shows Before you go with a source on every item, and nothing for a city without it', async () => {
  const { context, page } = await newPhone(env.browser);
  await startTrip(page);
  await page.evaluate(() => KYT.virtualTrips.openCityDetail('tirupati', false));
  await page.waitForSelector('#cd-byg');
  const sheet = page.locator('#cd-byg');
  assert.match(await sheet.innerText(), /Before you go/i);
  assert.equal(await sheet.locator('li').count(), 4);
  assert.equal(await sheet.locator('li a', { hasText: 'Source' }).count(), 4, 'each item links its source');
  assert.match(await sheet.locator('a', { hasText: 'Official website' }).getAttribute('href'), /^https:\/\/ttdevasthanams\.ap\.gov\.in/);
  assert.match(await sheet.innerText(), /Checked Nov 2026/);

  // a place with an access note shows both, the note first
  await page.evaluate(() => KYT.virtualTrips.openCityDetail('kedarnath', false));
  await page.waitForSelector('#cd-byg');
  const order = await page.evaluate(() => {
    const a = document.getElementById('cd-access'), b = document.getElementById('cd-byg');
    return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  assert.equal(order, true, 'the access note comes before Before you go');

  await page.evaluate(() => KYT.virtualTrips.openCityDetail('jaipur', false));
  assert.equal(await page.locator('#cd-byg').count(), 0, 'Jaipur has none, and the old one is cleared');
  await context.close();
});

test('city cards carry a Before you go cue only where the sheet has one', async () => {
  const { context, page } = await newPhone(env.browser);
  await startTrip(page);
  await page.fill('#vt-city-search', 'Tirupati');
  const chip = page.locator('article[data-city-id="tirupati"] [data-byg-chip]');
  await chip.waitFor();
  assert.match(await chip.innerText(), /Before you go/);
  assert.match(await chip.innerText(), /Book ahead/, 'it says what kind of notes are inside');
  await page.fill('#vt-city-search', 'Jaipur');
  await page.locator('article[data-city-id="jaipur"]').waitFor();
  assert.equal(await page.locator('article[data-city-id="jaipur"] [data-byg-chip]').count(), 0);

  // the summary card (curated trip and shared trip pages) uses the same cue
  const html = await page.evaluate(() => ({
    withNotes: KYT.ui.renderCityCard(window.KYT_CITIES.find(c => c.id === 'agra'), { variant: 'summary' }),
    without: KYT.ui.renderCityCard(window.KYT_CITIES.find(c => c.id === 'jaipur'), { variant: 'summary' })
  }));
  assert.match(html.withNotes, /data-byg-chip/);
  assert.doesNotMatch(html.without, /data-byg-chip/);
  await context.close();
});
