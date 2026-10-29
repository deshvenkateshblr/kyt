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
const prefsOpen = page => page.evaluate(() => document.getElementById('vt-preferences-details').open);
const visible = (page, sel) => page.locator(sel).isVisible();

test('a new empty trip is just a picker: no Stays & Days, menu, switch or Generate to puzzle over, and nothing alerts', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  assert.deepEqual(page.dialogs, [], 'creating a trip raises no message');

  assert.equal(await visible(page, '#vt-city-search'), true, 'the search is right there, inside the Destinations panel');
  assert.match(await page.locator('#vt-empty-cities').innerText(), /Where do you want to go/);
  for (const sel of ['#vt-menu-wrap', '#vt-mode-tabs', '#vt-trip-card', '#btn-vt-build', '#btn-vt-dest-done', '#btn-vt-dest-edit']) {
    assert.equal(await visible(page, sel), false, `${sel} is not shown before there is a destination`);
  }
  assert.equal((await page.locator('#vt-header-meta-pills').innerText()).trim(), '', 'no "1 Day" for a trip with nothing in it');

  await addCity(page, 'Jaipur', 'jaipur');
  assert.match(await page.locator('#btn-vt-dest-done').innerText(), /Continue · 1 selected/);
  assert.equal(await visible(page, '#vt-menu-wrap'), true);
  assert.equal(await visible(page, '#vt-mode-tabs'), true);
  assert.equal(await visible(page, '#vt-empty-cities'), false);

  // removing the last city puts it all away again, and the picker stays open
  await page.locator('.vt-selected-city-chip .btn-del-city').first().click();
  assert.equal(await visible(page, '#vt-menu-wrap'), false);
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

  assert.equal(await prefsOpen(page), false, 'defaults are fine, so Style starts closed');
  assert.match(await page.locator('#vt-pref-summary-value').innerText(), /^Mixed · Any food · Standard$/);
  await page.click('#vt-preferences-details summary');
  await page.click('.vt-chip[data-field="diet"][data-id="jain"]');
  assert.equal(await prefsOpen(page), true, 'a chip tap does not close or reset it');
  assert.match(await page.locator('#vt-pref-summary-value').innerText(), /^Mixed · Jain · Standard$/);
  await page.click('#btn-vt-prefs-done');
  assert.equal(await prefsOpen(page), false);
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

test('the header is one title row with a menu: actions live in the menu, the pills follow the screen', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await addCity(page, 'Jaipur', 'jaipur');
  await addCity(page, 'Udaipur', 'udaipur');
  await page.click('#btn-vt-dest-done');
  await page.selectOption('#vt-origin-city', 'delhi');

  // setup: only the trip length, and the menu is closed
  const pills = await page.locator('#vt-header-meta-pills').innerText();
  assert.match(pills, /2 Days/);
  assert.doesNotMatch(pills, /From Delhi|Mixed|Standard/, 'start and style are in the card, not repeated in the header');
  assert.equal(await visible(page, '#vt-subnav-share'), false, 'Share is in the closed menu');
  const headerHeight = await page.evaluate(() => document.getElementById('vt-subnav-bar').getBoundingClientRect().height);
  assert.ok(headerHeight < 140, `slim header, got ${Math.round(headerHeight)}px`);

  await page.click('#vt-menu-btn');
  for (const sel of ['#vt-header-btn-stays', '#vt-subnav-share', '#vt-subnav-detail']) {
    assert.equal(await visible(page, sel), true, `${sel} is in the menu`);
  }
  assert.equal(await visible(page, '#vt-menu-reset'), false, 'Reset plan only applies on the Day Plan');
  await page.keyboard.press('Escape');
  assert.equal(await visible(page, '#vt-menu'), false, 'Escape closes the menu');
  await page.click('#vt-menu-btn');
  await page.click('h3, body', { position: { x: 5, y: 5 } }).catch(() => {});
  await page.mouse.click(5, 400);
  assert.equal(await visible(page, '#vt-menu'), false, 'a tap outside closes it');

  // day plan: full summary, and Reset plan appears in the menu
  await page.click('#btn-vt-build');
  await page.locator('#btn-modal-confirm-build').click();
  await page.waitForURL('**/trip_detail.html*');
  await page.click('#btn-edit-plan');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  const planPills = await page.locator('#vt-header-meta-pills').innerText();
  assert.match(planPills, /From Delhi/);
  assert.match(planPills, /2 Days/);
  await page.click('#vt-menu-btn');
  assert.equal(await visible(page, '#vt-menu-reset'), true);
  await context.close();
});
