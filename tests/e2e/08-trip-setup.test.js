'use strict';
/**
 * Setting up a virtual trip: a new empty trip does not answer with alerts, the Start & Style card says
 * what it holds and gets out of the way, and the header keeps up with the cities.
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

test('a new empty trip shows only what applies: no Stays & Days, Day Plan or Share to puzzle over, and nothing alerts', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  assert.deepEqual(page.dialogs, [], 'creating a trip raises no message');

  for (const sel of ['#vt-header-btn-stays', '#vt-mode-tabs', '#vt-subnav-share', '#vt-subnav-detail']) {
    assert.equal(await visible(page, sel), false, `${sel} is not shown before there is a destination`);
  }
  assert.match(await page.locator('#vt-empty-cities').innerText(), /Add your first destination/);
  assert.equal(await visible(page, '#btn-vt-build'), false);
  assert.equal((await page.locator('#vt-header-meta-pills').innerText()).trim(), '', 'no "1 Day" for a trip with nothing in it');

  await addCity(page, 'Jaipur', 'jaipur');
  for (const sel of ['#vt-header-btn-stays', '#vt-mode-tabs', '#vt-subnav-share']) {
    assert.equal(await visible(page, sel), true, `${sel} appears with the first destination`);
  }
  assert.equal(await visible(page, '#vt-empty-cities'), false);
  assert.equal(await visible(page, '#btn-vt-build'), true);

  // removing the last city puts them away again
  await page.locator('.vt-selected-city-chip .btn-del-city').first().click();
  assert.equal(await visible(page, '#vt-header-btn-stays'), false);
  assert.equal(await visible(page, '#vt-subnav-share'), false);
  assert.deepEqual(page.dialogs, []);
  await context.close();
});

test('one card holds From, Destinations and Style, with the start always visible and flagged while missing', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  const same = await page.evaluate(() => {
    const card = document.getElementById('vt-trip-card');
    return ['vt-origin-city', 'vt-selected-cities', 'vt-empty-cities', 'vt-preferences-details', 'btn-vt-build']
      .every(id => card.contains(document.getElementById(id)));
  });
  assert.equal(same, true, 'start, destinations, style and the build button share one card');
  assert.equal(await visible(page, '#vt-origin-city'), true, 'the starting point is not tucked away');
  assert.match(await page.locator('#vt-origin-desc').innerText(), /Needed to plan your journey/);
  assert.match(await page.locator('#vt-origin-city').getAttribute('class'), /border-amber-400/, 'flagged while missing');

  await page.selectOption('#vt-origin-city', 'delhi');
  assert.equal((await page.locator('#vt-origin-desc').innerText()).trim(), '', 'nothing to explain once it is set');
  assert.doesNotMatch(await page.locator('#vt-origin-city').getAttribute('class'), /border-amber-400/);
  await page.selectOption('#vt-origin-city', 'already_there');
  assert.match(await page.locator('#vt-origin-desc').innerText(), /Day 1 starts directly/);
  await context.close();
});

test('Style is one line of choices, closed until Change, and Done puts it away', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  const summary = page.locator('#vt-pref-summary-value');
  assert.equal(await prefsOpen(page), false, 'defaults are fine, so the chips start closed');
  assert.match(await summary.innerText(), /^Mixed · Any food · Standard$/);

  await page.click('#vt-preferences-details summary');
  assert.equal(await prefsOpen(page), true);
  await page.click('.vt-chip[data-field="diet"][data-id="jain"]');
  assert.equal(await prefsOpen(page), true, 'a chip tap does not close or reset it');
  assert.match(await summary.innerText(), /^Mixed · Jain · Standard$/);
  await page.click('#btn-vt-prefs-done');
  assert.equal(await prefsOpen(page), false);

  await addCity(page, 'Jaipur', 'jaipur');
  assert.equal(await prefsOpen(page), false, 'adding a city leaves it as it was');
  await context.close();
});

test('with the starting point remembered from last time, a new trip opens with it already chosen', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page, 'First');
  await page.selectOption('#vt-origin-city', 'bengaluru');
  await addCity(page, 'Agra', 'agra');
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.fill('#vt-new-name', 'Second');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  assert.equal(await page.locator('#vt-origin-city').inputValue(), 'bengaluru');
  assert.doesNotMatch(await page.locator('#vt-origin-city').getAttribute('class'), /border-amber-400/);
  await context.close();
});

test('the header carries only the trip length while cities are picked, and the full summary on the plan', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await page.selectOption('#vt-origin-city', 'delhi');
  assert.equal((await page.locator('#vt-header-meta-pills').innerText()).trim(), '');
  await addCity(page, 'Jaipur', 'jaipur');
  await addCity(page, 'Udaipur', 'udaipur');
  const pills = await page.locator('#vt-header-meta-pills').innerText();
  assert.match(pills, /2 Days/);
  assert.doesNotMatch(pills, /From Delhi|Mixed|Standard/, 'start and style are in the card, not repeated in the header');

  await page.click('#btn-vt-build');
  await page.locator('#btn-modal-confirm-build').click();
  await page.waitForURL('**/trip_detail.html*');
  await page.click('#btn-edit-plan');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  const planPills = await page.locator('#vt-header-meta-pills').innerText();
  assert.match(planPills, /From Delhi/);
  assert.match(planPills, /2 Days/);
  await context.close();
});
