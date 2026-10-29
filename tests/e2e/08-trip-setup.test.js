'use strict';
/**
 * Setting up a virtual trip: destinations are picked first, then collapse into the route while the
 * trip's attributes (From, Days, Style) appear; controls that do not apply yet are not shown; the
 * header stays slim with its actions in a menu.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

async function newTrip(page, name = 'Rajasthan') {
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.fill('#vt-new-name', name);
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
}
async function addCity(page, query, id) {
  await page.fill('#vt-city-search', query);
  await page.click(`.btn-add-city[data-id="${id}"]`);
  await page.fill('#vt-city-search', '');
}
const visible = (page, sel) => page.locator(sel).isVisible();

test('a new empty trip is just a picker: no Share, Style, Days or Generate to puzzle over, and nothing alerts', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  assert.deepEqual(page.dialogs, [], 'creating a trip raises no message');

  assert.equal(await visible(page, '#vt-city-search'), true, 'the search is right there, inside the Destinations panel');
  assert.match(await page.locator('#vt-empty-cities').innerText(), /Where do you want to go/);
  for (const sel of ['#vt-subnav-share', '#vt-trip-card', '#btn-vt-build', '#btn-vt-dest-done', '#btn-vt-dest-edit']) {
    assert.equal(await visible(page, sel), false, `${sel} is not shown before there is a destination`);
  }
  assert.equal(await page.locator('#vt-mode-tabs, #vt-menu-btn, #vt-header-meta-pills').count(), 0, 'no Setup / Day Plan switch, ⋯ menu or pills');

  await addCity(page, 'Jaipur', 'jaipur');
  assert.match(await page.locator('#btn-vt-dest-done').innerText(), /Continue · 1 selected/);
  assert.equal(await visible(page, '#vt-subnav-share'), true);
  assert.equal(await visible(page, '#vt-empty-cities'), false);

  // removing the last city puts it all away again, and the picker stays open
  await page.locator('.vt-selected-city-chip .btn-del-city').first().click();
  assert.equal(await visible(page, '#vt-subnav-share'), false);
  assert.equal(await visible(page, '#btn-vt-dest-done'), false);
  assert.equal(await visible(page, '#vt-city-search'), true);
  assert.deepEqual(page.dialogs, []);
  await context.close();
});

test('choosing destinations comes first: Continue collapses the picker into the route, Add or reorder opens it again', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await addCity(page, 'Jaipur', 'jaipur');
  await addCity(page, 'Udaipur', 'udaipur');
  assert.equal(await visible(page, '#vt-trip-card'), false, 'the trip attributes wait while destinations are being chosen');
  assert.equal(await visible(page, '#btn-vt-build'), false, 'and so does Generate');

  await page.click('#btn-vt-dest-done');
  assert.equal(await visible(page, '#vt-city-search'), false, 'the picker collapses');
  assert.equal(await visible(page, '#vt-trip-card'), true);
  assert.equal(await visible(page, '#btn-vt-build'), true);
  assert.equal(await visible(page, '#btn-vt-dest-done'), false);
  assert.equal(await page.locator('.vt-selected-city-chip').count(), 2, 'the route stays visible as chips');

  // the route can be reordered and trimmed without reopening the picker
  await page.locator('.vt-selected-city-chip').first().locator('.btn-move-city-right').click();
  assert.match(await page.locator('#vt-selected-cities').innerText().then(t => t.replace(/\s+/g, ' ')), /1\. Udaipur.*2\. Jaipur/);

  await page.click('#btn-vt-dest-edit');
  assert.equal(await visible(page, '#vt-city-search'), true);
  assert.equal(await visible(page, '#vt-trip-card'), false);
  await addCity(page, 'Agra', 'agra');
  await page.click('#btn-vt-dest-done');
  assert.equal(await page.locator('.vt-selected-city-chip').count(), 3);
  assert.equal(await visible(page, '#btn-vt-build'), true);
  await context.close();
});

test('the trip card lists From, Days and Style as short rows; the start is flagged while missing', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await addCity(page, 'Jaipur', 'jaipur');
  await addCity(page, 'Udaipur', 'udaipur');
  await page.click('#btn-vt-dest-done');

  assert.equal(await visible(page, '#vt-origin-city'), true, 'the starting point is a visible row, not tucked away');
  assert.match(await page.locator('#vt-origin-desc').innerText(), /Needed to plan your journey/);
  assert.match(await page.locator('#vt-origin-city').getAttribute('class'), /border-amber-400/, 'flagged while missing');
  await page.selectOption('#vt-origin-city', 'delhi');
  assert.equal((await page.locator('#vt-origin-desc').innerText()).trim(), '', 'nothing to explain once it is set');
  await page.selectOption('#vt-origin-city', 'already_there');
  assert.match(await page.locator('#vt-origin-desc').innerText(), /Day 1 starts directly/);

  assert.match(await page.locator('#vt-stays-summary').innerText(), /^2 days · stay in Jaipur, Udaipur$/);
  await page.click('#btn-vt-stays-row');
  await page.waitForSelector('#vt-stay-modal:not(.hidden)');
  await page.click('#btn-modal-duration-plus');
  await page.click('#btn-close-stay-modal');
  assert.match(await page.locator('#vt-stays-summary').innerText(), /^3 days · stay in /);

  // Style is fully visible, each group says what it is and what the chosen option means
  const style = await page.locator('#vt-style').innerText();
  for (const word of ['Interests', 'Food', 'Pace', 'Mixed', 'Any food', 'Standard']) assert.match(style, new RegExp(word, 'i'));
  assert.match(style, /A bit of everything/, 'Mixed is explained');
  assert.match(style, /Main sights at an easy pace/, 'Standard is explained');
  await page.click('.vt-chip[data-field="diet"][data-id="jain"]');
  assert.match(await page.locator('#vt-style').innerText(), /Jain-friendly food only/);
  assert.equal(await page.locator('#btn-vt-prefs-done').count(), 0, 'nothing to open or close');
  await context.close();
});

test('with the starting point remembered from last time, the next trip has it already chosen', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page, 'First');
  await addCity(page, 'Agra', 'agra');
  await page.click('#btn-vt-dest-done');
  await page.selectOption('#vt-origin-city', 'bengaluru');
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.fill('#vt-new-name', 'Second');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await addCity(page, 'Agra', 'agra');
  await page.click('#btn-vt-dest-done');
  assert.equal(await page.locator('#vt-origin-city').inputValue(), 'bengaluru');
  assert.doesNotMatch(await page.locator('#vt-origin-city').getAttribute('class'), /border-amber-400/);
  await context.close();
});

test('the header is just back, the name and Share; the plan screen owns the summary, with no repeats', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await addCity(page, 'Jaipur', 'jaipur');
  await addCity(page, 'Udaipur', 'udaipur');
  await page.click('#btn-vt-dest-done');
  await page.selectOption('#vt-origin-city', 'delhi');

  assert.equal(await page.locator('#vt-mode-tabs, #vt-menu-btn, #vt-header-meta-pills').count(), 0);
  assert.equal(await visible(page, '#vt-subnav-share'), true);
  const headerHeight = await page.evaluate(() => document.getElementById('vt-subnav-bar').getBoundingClientRect().height);
  assert.ok(headerHeight < 70, `one slim row, got ${Math.round(headerHeight)}px`);

  // Generate: no dialog, straight to the editable plan with the summary and the way back to setup
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  assert.equal(await visible(page, '#vt-stay-modal'), false);
  const summary = await page.locator('#vt-itinerary-list').innerText();
  assert.match(summary, /From Delhi · 2 days · Mixed · Any food · Standard/);
  assert.equal(await visible(page, '#btn-vt-edit-setup'), true);
  assert.equal(await visible(page, '#btn-vt-reset-plan'), true);
  assert.equal(await page.locator('[data-step-id]').first().getByRole('button', { name: 'Edit stop' }).count(), 1, 'stops are editable right here');

  // back to setup and again to the plan, which now says "Open Day Plan"
  await page.click('#btn-vt-edit-setup');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  assert.match(await page.locator('#btn-vt-build').innerText(), /Open Day Plan/);
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  await context.close();
});

test('Continue sits inside the Destinations card, under the chips, not floating over the list', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await addCity(page, 'Mumbai', 'mumbai');
  const geo = await page.evaluate(() => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    return { chips: r('vt-selected-cities'), btn: r('btn-vt-dest-done'), search: r('vt-city-search'),
      insideCard: document.getElementById('vt-dest-card').contains(document.getElementById('btn-vt-dest-done')) };
  });
  assert.equal(geo.insideCard, true);
  assert.ok(geo.btn.top >= geo.chips.bottom - 1 && geo.btn.bottom <= geo.search.top, 'between the chips and the search');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('vt-canvas-bar')).position), 'static');
  await context.close();
});

test('after the first city, the places nearest to it are offered first', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await addCity(page, 'Mumbai', 'mumbai');
  const text = await page.locator('#vt-city-list').innerText();
  assert.match(text, /Near Mumbai/i);
  assert.match(text, /All destinations/i);
  const firstCards = await page.locator('#vt-city-list .btn-add-city').evaluateAll(b => b.slice(0, 6).map(x => x.dataset.id));
  const row = await page.evaluate(() => window.KYT_DISTANCE_MATRIX.mumbai);
  const dists = firstCards.map(id => row[id]);
  assert.ok(dists.every(d => d != null), `nearest are known neighbours: ${firstCards}`);
  assert.deepEqual(dists, [...dists].sort((a, b) => a - b), 'in order of distance');
  assert.ok(!firstCards.includes('mumbai'), 'the city already chosen is not offered again');
  // searching still searches everything
  await page.fill('#vt-city-search', 'Agra');
  assert.doesNotMatch(await page.locator('#vt-city-list').innerText(), /Near Mumbai/i);
  await context.close();
});
