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

test('setup is only destinations and a start: no Days, Style or dialog; the start is flagged while missing', async () => {
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

  for (const sel of ['#vt-stays-summary', '#btn-vt-stays-row', '#vt-style', '#vt-taste', '#vt-stay-modal']) {
    assert.equal(await page.locator(sel).count(), 0, `${sel} is gone from setup`);
  }
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

test('the header is just back, the name and Share; the Day Plan owns the summary, with no repeats', async () => {
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

  // Plan the days: no dialog, the Day Plan opens empty with one tab per city
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  assert.equal(await page.locator('#vt-day-tabs [role="tab"]').count(), 2);
  assert.match(await page.locator('#vt-itinerary-list').innerText(), /From Delhi · 2 days/);
  assert.equal(await visible(page, '#btn-vt-edit-setup'), true);
  assert.equal(await visible(page, '#btn-vt-suggest'), true);
  assert.equal(await page.locator('#vt-subnav-back-label').innerText(), 'Setup', 'with nothing planned, back is the setup');

  await page.click('#btn-vt-suggest');
  assert.equal(await page.locator('[data-step-id]').first().getByRole('button', { name: 'Edit stop' }).count(), 1, 'steps are editable right here');
  assert.equal(await page.locator('#vt-subnav-back-label').innerText(), 'View Trip');

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

test('Generate is a compact button, and a missing start is flagged on the field (no alert) until it is chosen', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await addCity(page, 'Jaipur', 'jaipur');
  await page.click('#btn-vt-dest-done');
  const w = await page.locator('#btn-vt-build').evaluate(b => b.getBoundingClientRect().width / window.innerWidth);
  assert.ok(w < 0.6, `compact, got ${Math.round(w * 100)}% of the screen`);

  await page.click('#btn-vt-build');
  await page.click('#btn-vt-build');   // pressing it again changes nothing and still says why
  assert.deepEqual(page.dialogs, [], 'no alert');
  assert.equal(await visible(page, '#vt-screen-builder'), false);
  assert.match(await page.locator('#vt-origin-city').getAttribute('class'), /border-rose-500/);
  const desc = page.locator('#vt-origin-desc');
  assert.match(await desc.innerText(), /Choose where you start/);
  assert.match(await desc.getAttribute('class'), /text-rose-600/);
  const rgb = await desc.evaluate(e => getComputedStyle(e).color);
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  assert.ok(r > 180 && g < 80 && b < 120, `the message is really red, got ${rgb}`);

  await page.selectOption('#vt-origin-city', 'delhi');
  assert.doesNotMatch(await page.locator('#vt-origin-city').getAttribute('class'), /border-rose-500/);
  assert.equal((await desc.innerText()).trim(), '', 'the message goes once a start is chosen');
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  await context.close();
});
