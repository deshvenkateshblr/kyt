'use strict';
/** Core itinerary engine: launcher state, step CRUD, reorder, persistence, Now view. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone, seedTrip, waitForSaved, iso } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const THREE = () => ([
  { title: 'Flight to Goa',  icon: 'plane',    where: 'Bengaluru Airport', targetTime: iso(1, 7) },
  { title: 'Check in',       icon: 'bed',      where: 'Calangute, Goa',    targetTime: iso(1, 11) },
  { title: 'Dinner at Fish', icon: 'utensils', where: 'Panaji',            targetTime: iso(1, 20) }
]);

async function addStep(page, title, where) {
  await page.click('#btn-add-step');
  await page.fill('#form-step-title', title);
  await page.fill('#form-step-where', where);
  await page.click('#btn-save-step');
}

test('new user sees the new-user launcher with all four entry points', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  await page.waitForSelector('#options-container a');
  const hrefs = await page.$$eval('#options-container a', as => as.map(a => a.getAttribute('href')));
  assert.deepEqual(hrefs.sort(), ['configure_trip.html', 'curated_trips.html', 'virtual_trip.html', 'visited.html']);
  await context.close();
});

test('returning user (has an active trip) sees "View Current Trip" on the launcher', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });      // note: seeded without visiting home first
  await page.goto(env.base + '/index.html');
  await page.waitForSelector('#options-container a[href="view_trip.html"]');
  assert.equal(await page.locator('#options-container a[href="view_trip.html"]').count(), 1);
  await context.close();
});

// REGRESSION (currently fails): index.js opens IndexedDB "kyt_db" v1 without creating the "kyt_store"
// object store. A brand-new user always lands on the home page first, so the store is never created
// and every later save fails with "Failed to save to database".
test('first-time user who opens the home page FIRST can still build and keep a trip', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  await page.waitForSelector('#options-container a');
  await page.click('a[href="configure_trip.html"]');
  await page.waitForURL('**/configure_trip.html');
  await page.waitForSelector('#btn-add-step');
  await addStep(page, 'My first step', 'Somewhere');
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector('#config-steps-list');
  await page.waitForTimeout(500);
  assert.deepEqual(page.dialogs, [], `unexpected alert: ${page.dialogs.join(' / ')}`);
  assert.equal(await page.evaluate(() => KYT.store.get().stepsData.length), 1, 'the step must still be there after reload');
  await context.close();
});

test('empty trip shows the empty state with a Configure Trip action', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/view_trip.html');
  await page.waitForSelector('#hero-card');
  assert.match(await page.locator('#hero-card').innerText(), /No steps yet/i);
  assert.equal(await page.locator('#btn-prev').isDisabled(), true);
  assert.equal(await page.locator('#btn-next').isDisabled(), true);
  await context.close();
});

test('add steps in the editor: count badge updates, steps sort by time, data survives reload', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-add-step');
  assert.match(await page.locator('#step-count-badge').innerText(), /^0 items?/);

  await addStep(page, 'Second thing', 'Place B');
  assert.match(await page.locator('#step-count-badge').innerText(), /^1 item$/);
  // later default time (+1h of last step) keeps order; an explicit earlier time must sort first
  await page.click('#btn-add-step');
  await page.fill('#form-step-title', 'First thing');
  await page.fill('#form-step-where', 'Place A');
  await page.fill('#form-step-time', '2020-01-01T08:00');
  await page.click('#btn-save-step');

  assert.match(await page.locator('#step-count-badge').innerText(), /^2 items$/);
  const titles = await page.$$eval('#config-steps-list .config-step-row p.font-bold', ps => ps.map(p => p.textContent.trim()));
  assert.deepEqual(titles, ['First thing', 'Second thing']);

  await waitForSaved(page);
  await page.reload();
  await page.waitForSelector('#config-steps-list .config-step-row');
  const after = await page.$$eval('#config-steps-list .config-step-row p.font-bold', ps => ps.map(p => p.textContent.trim()));
  assert.deepEqual(after, ['First thing', 'Second thing'], 'steps must persist in IndexedDB');
  await context.close();
});

test('reorder with the up/down buttons and delete a step (with confirm)', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('.config-step-row');
  const titles = () => page.$$eval('#config-steps-list .config-step-row p.font-bold', ps => ps.map(p => p.textContent.trim()));

  await page.locator('.config-step-row').nth(0).locator('button[title="Move down"]').click();
  assert.deepEqual(await titles(), ['Check in', 'Flight to Goa', 'Dinner at Fish']);

  await page.locator('.config-step-row').nth(2).locator('button[title="Delete"]').click();
  assert.deepEqual(await titles(), ['Check in', 'Flight to Goa']);
  assert.ok(page.dialogs.some(d => /delete this step/i.test(d)));
  assert.match(await page.locator('#step-count-badge').innerText(), /^2 items$/);
  await context.close();
});

test('edit an existing step from the editor list (pencil button)', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('.config-step-row');
  await page.locator('.config-step-row').nth(1).locator('button[title="Edit"]').click();

  // The edit form must open pre-filled with that step.
  await page.waitForSelector('#step-form-view:not(.hidden)', { timeout: 3000 });
  assert.equal(await page.inputValue('#form-step-title'), 'Check in');
  await page.fill('#form-step-title', 'Check in (late)');
  await page.click('#btn-save-step');
  const titles = await page.$$eval('#config-steps-list .config-step-row p.font-bold', ps => ps.map(p => p.textContent.trim()));
  assert.ok(titles.includes('Check in (late)'));
  assert.equal(titles.length, 3, 'editing must not duplicate the step');
  await context.close();
});

test('Now view: step indicator, prev/next bounds, first/last jump', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });
  const pos = () => page.locator('#step-position-indicator').textContent();   // CSS uppercases the visible text
  assert.equal(await pos(), 'Step 1 of 3');
  assert.equal(await page.locator('#btn-prev').isDisabled(), true);
  await page.click('#btn-next');
  assert.equal(await pos(), 'Step 2 of 3');
  await page.click('#btn-main-last');
  assert.equal(await pos(), 'Step 3 of 3');
  assert.equal(await page.locator('#btn-next').isDisabled(), true);
  await page.click('#btn-main-first');
  assert.equal(await pos(), 'Step 1 of 3');
  await context.close();
});

test('Now view: marking a step Done auto-advances; toggling again returns it to To-Do', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });
  await page.click('[data-action="toggle-done"]');
  await page.waitForFunction(() => document.getElementById('step-position-indicator').textContent === 'Step 2 of 3', null, { timeout: 4000 });
  const status = await page.evaluate(() => KYT.store.get().stepsData[0].status);
  assert.equal(status, 'done');

  await page.click('#btn-prev');
  await page.click('[data-action="toggle-done"]');
  const back = await page.evaluate(() => KYT.store.get().stepsData[0].status);
  assert.equal(back, 'todo');
  await context.close();
});

test('Now view: "In progress" toggle and the status persists after reload', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });
  await page.click('[data-action="toggle-on"]');
  await page.waitForFunction(() => KYT.store.get().stepsData[0].status === 'on');
  await waitForSaved(page);
  await page.reload();
  await page.waitForFunction(() => window.KYT && KYT.store.get().stepsData.length === 3);
  assert.equal(await page.evaluate(() => KYT.store.get().stepsData[0].status), 'on');
  assert.match(await page.locator('#hero-card').innerText(), /In Progress/i);
  await context.close();
});

test('Now view: the card shows the step title and a Google Maps link for its place', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });
  const card = page.locator('#hero-card');
  assert.match(await card.innerText(), /Flight to Goa/);
  const href = await card.locator('a[href*="google.com/maps"]').first().getAttribute('href');
  assert.match(href, /Bengaluru%20Airport|Bengaluru Airport/);
  await context.close();
});

test('End Current Trip wipes the trip and returns to the new-user launcher', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: THREE() });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-end-trip');
  await page.click('#btn-end-trip');
  await page.click('#kyt-end-skip');
  await page.waitForURL('**/index.html');
  await page.waitForSelector('#options-container a');
  assert.equal(await page.locator('#options-container a[href="view_trip.html"]').count(), 0);
  await context.close();
});

test('ending a trip stamps the passport for cities named in its steps', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, {
    steps: [{ title: 'See the Taj', icon: 'landmark', where: 'Taj Mahal, Agra', targetTime: iso(1, 6) }]
  });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-end-trip');
  await page.click('#btn-end-trip');
  await page.click('#kyt-end-skip');
  await page.waitForURL('**/index.html');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kyt_passport') || '{}'));
  assert.ok(stored.agra, 'Agra should be marked visited after ending a trip that mentions Agra');
  await context.close();
});
