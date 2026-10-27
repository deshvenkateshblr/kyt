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

test('a new empty trip: Stays & Days, Day Plan and Share wait for a first destination, and nothing alerts', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  assert.deepEqual(page.dialogs, [], 'creating a trip raises no message');

  assert.equal(await page.locator('#vt-header-btn-stays').isDisabled(), true);
  assert.equal(await page.locator('#vt-tab-builder').isDisabled(), true);
  assert.equal(await page.locator('#vt-subnav-share').isVisible(), false);
  assert.equal(await page.locator('#vt-subnav-detail').isVisible(), false);
  assert.match(await page.locator('#vt-header-btn-stays').getAttribute('title'), /Add a destination first/);

  await addCity(page, 'Jaipur', 'jaipur');
  assert.equal(await page.locator('#vt-header-btn-stays').isDisabled(), false);
  assert.equal(await page.locator('#vt-tab-builder').isDisabled(), false);
  assert.equal(await page.locator('#vt-subnav-share').isVisible(), true);

  // removing the last city puts them back to waiting
  await page.locator('.vt-selected-city-chip .btn-del-city').first().click();
  assert.equal(await page.locator('#vt-header-btn-stays').isDisabled(), true);
  assert.equal(await page.locator('#vt-subnav-share').isVisible(), false);
  assert.deepEqual(page.dialogs, []);
  await context.close();
});

test('Start & Style is its own card (not part of the route) and its summary says what is missing, then what was chosen', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  const inRouteCard = await page.evaluate(() => {
    const card = document.getElementById('btn-vt-build').closest('.rounded-2xl');
    return card.contains(document.getElementById('vt-preferences-details'));
  });
  assert.equal(inRouteCard, false, 'the starting point and style are not inside the destinations route card');

  const summary = page.locator('#vt-pref-summary-value');
  assert.match(await summary.innerText(), /Choose where you start/);
  assert.doesNotMatch(await page.locator('#vt-preferences-details summary').innerText(), /From Origin/);

  await page.selectOption('#vt-origin-city', 'delhi');
  assert.match(await summary.innerText(), /^From Delhi · Mixed · Standard$/);
  await page.click('.vt-chip[data-field="diet"][data-id="jain"]');
  assert.match(await summary.innerText(), /^From Delhi · Mixed · Standard · Jain$/);
  await page.selectOption('#vt-origin-city', 'already_there');
  assert.match(await summary.innerText(), /^Already there · /);
  await context.close();
});

test('Start & Style opens by itself only while the starting point is missing, and Done puts it away for good', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  assert.equal(await prefsOpen(page), true, 'open: the starting point is still needed');
  assert.equal(await page.locator('#btn-vt-prefs-done').isVisible(), true);

  // choosing a style does not close or reopen anything under the traveller's hands
  await page.selectOption('#vt-origin-city', 'chennai');
  await page.click('.vt-chip[data-field="intent"][data-id="spiritual"]');
  assert.equal(await prefsOpen(page), true, 'still open while setting up, with no cities yet');

  // Done collapses it, and later style changes or cities do not bring it back
  await page.click('#btn-vt-prefs-done');
  assert.equal(await prefsOpen(page), false);
  await addCity(page, 'Jaipur', 'jaipur');
  assert.equal(await prefsOpen(page), false);

  // opened by hand, it stays open while the traveller works in it, until Done
  await page.click('#vt-preferences-details summary');
  assert.equal(await prefsOpen(page), true);
  await page.click('.vt-chip[data-field="pace"][data-id="deep"]');
  assert.equal(await prefsOpen(page), true, 'a chip tap does not close or reset it');
  await page.click('#btn-vt-prefs-done');
  assert.equal(await prefsOpen(page), false);
  await context.close();
});

test('with the starting point remembered from last time, a new trip opens with Start & Style already put away', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page, 'First');
  await page.selectOption('#vt-origin-city', 'bengaluru');
  await addCity(page, 'Agra', 'agra');
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.fill('#vt-new-name', 'Second');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  assert.equal(await prefsOpen(page), false, 'nothing is missing, so it stays out of the way');
  assert.match(await page.locator('#vt-pref-summary-value').innerText(), /^From Bengaluru/);
  await context.close();
});

test('the header follows the cities: duration and start update as the trip is set up', async () => {
  const { context, page } = await newPhone(env.browser);
  await newTrip(page);
  await page.selectOption('#vt-origin-city', 'delhi');
  assert.match(await page.locator('#vt-header-meta-pills').innerText(), /From Delhi/);
  await addCity(page, 'Jaipur', 'jaipur');
  await addCity(page, 'Udaipur', 'udaipur');
  assert.match(await page.locator('#vt-header-meta-pills').innerText(), /2 Days/);
  await context.close();
});
