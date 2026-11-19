'use strict';
/**
 * The Passport loop: celebrations when a stamp achieves something, a next-quest suggestion, a way from a quest into
 * trip planning, a call to action on shared views, and a Passport share card that leads recipients back in.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const seed = (ids) => (ids) => ids.forEach(id => PassportStore.unlockCity(id));
async function passportPage(page, ids = []) {
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container [data-city-id]');
  await page.waitForTimeout(600);                    // the first visit records a baseline
  if (ids.length) await page.evaluate(seed(ids), ids);
}

test('stamping the last city of a quest opens a celebration that names the quest and the next one', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page, ['delhi', 'agra']);
  await page.evaluate(() => window.markVisited('jaipur'));
  const sheet = page.locator('#kyt-celebrate');
  await sheet.waitFor();
  assert.match(await sheet.innerText(), /Quest complete: .*Golden Triangle/i);
  assert.match(await sheet.innerText(), /next quest/i);
  assert.equal(await sheet.locator('a[data-j-plan]').count(), 1, 'a way to plan the next quest');
  await sheet.locator('#kyt-celebrate-close').click();
  assert.equal(await page.locator('#kyt-celebrate').count(), 0);
  await context.close();
});

test('a first stamp gets a toast, not a sheet; an ordinary stamp shows quest progress; neither blocks the page', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page);
  await page.evaluate(() => window.markVisited('delhi'));
  await page.locator('#kyt-journey-toast').waitFor();
  assert.match(await page.locator('#kyt-journey-toast').innerText(), /first stamp/i);
  assert.equal(await page.locator('#kyt-celebrate').count(), 0, 'no sheet to dismiss');
  await page.evaluate(() => window.markVisited('somnath'));
  await page.waitForFunction(() => /Stamped Somnath/.test((document.getElementById('kyt-journey-toast') || {}).innerText || ''));
  assert.equal(await page.locator('#kyt-celebrate').count(), 0, 'no sheet for an ordinary stamp');
  assert.match(await page.locator('#kyt-journey-toast').innerText(), /Jyotirlingas 1\/12/);
  await context.close();
});

test('stamps made elsewhere (a trip that ended) are celebrated when Passport opens, once', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page, ['delhi', 'agra']);
  await page.evaluate(() => KYT.journey.reconcile());      // records two stamps as seen
  await page.evaluate(() => PassportStore.unlockCity('jaipur'));
  await page.reload();
  await page.locator('#kyt-celebrate').waitFor();
  assert.match(await page.locator('#kyt-celebrate').innerText(), /Golden Triangle/);
  await page.reload();
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#kyt-celebrate').count(), 0, 'not shown a second time');
  await context.close();
});

test('the Passport header suggests the next quest, closest to finished first, and offers to plan it', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page);
  assert.match(await page.locator('#passport-next-quest').innerText(), /start here/i);
  await page.evaluate(() => ['delhi', 'agra'].forEach(id => PassportStore.unlockCity(id)));
  await page.reload();
  await page.waitForSelector('#passport-next-quest a');
  const card = page.locator('#passport-next-quest');
  assert.match(await card.innerText(), /Golden Triangle/);
  assert.match(await card.innerText(), /2 of 3 stamped, 1 to go/);
  assert.match(await card.innerText(), /Jaipur/);
  assert.match(await card.locator('a').getAttribute('href'), /virtual_trip\.html\?quest=golden-triangle/);
  await context.close();
});

test('"Plan this trip" on a quest opens a new virtual trip holding its nearest unstamped places', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page, ['delhi', 'agra']);
  await page.goto(env.base + '/visited.html?quest=golden-triangle');
  await page.waitForSelector('#quest-plan-link:not(.hidden)');
  await page.click('#quest-plan-link');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  const trip = await page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips'))[0]);
  assert.match(trip.name, /Golden Triangle: next stops/);
  assert.deepEqual(trip.cities, ['jaipur'], 'only the places not yet stamped');
  assert.equal(new URL(page.url()).searchParams.get('quest'), null, 'the parameter is not left in the address');
  await context.close();
});

test('a finished quest has nothing to plan, and an unknown quest opens nothing', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page, ['delhi', 'agra', 'jaipur']);
  await page.goto(env.base + '/virtual_trip.html?quest=golden-triangle');
  await page.waitForSelector('#vt-new-name');
  assert.equal(await page.evaluate(() => (JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]')).length), 0);
  await page.goto(env.base + '/virtual_trip.html?quest=nope');
  await page.waitForSelector('#vt-new-name');
  assert.equal(await page.evaluate(() => (JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]')).length), 0);
  await context.close();
});

test('the city sheet says which quests a place belongs to and links into Passport', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page, ['delhi']);
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.evaluate(() => KYT.virtualTrips.openCityDetail('agra', false));
  await page.waitForSelector('#cd-quests');
  const chips = page.locator('#cd-quests a');
  assert.ok(await chips.count() >= 1);
  assert.match(await page.locator('#cd-quests').innerText(), /Golden Triangle · 1\/3/);
  assert.match(await chips.first().getAttribute('href'), /^visited\.html\?quest=/);
  await context.close();
});

test('shared views carry a call to action: a shared city link and a shared trip link', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html?city=jaipur');
  const bar = page.locator('#kyt-shared-cta');
  await bar.waitFor();
  assert.match(await bar.innerText(), /Plan a trip here/);
  assert.equal(await bar.locator('a[href="virtual_trip.html"]').count(), 1);
  await bar.locator('button').click();
  assert.equal(await page.locator('#kyt-shared-cta').count(), 0, 'it can be closed');
  await page.goto(env.base + '/trip_detail.html?cities=jaipur,udaipur&trip=Rajasthan&days=3');
  await page.locator('#kyt-shared-cta').waitFor();
  assert.match(await page.locator('#kyt-shared-cta').innerText(), /Plan your own trip/);
  // an ordinary visit to the app is not a shared view
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  assert.equal(await page.locator('#kyt-shared-cta').count(), 0);
  await context.close();
});

test('the shared Passport link opens Passport on a quest, with an invitation; the card says where to go', async () => {
  const { context, page } = await newPhone(env.browser);
  await passportPage(page, ['delhi', 'agra']);
  await page.reload();
  await page.waitForSelector('#cards-container [data-city-id]');
  const url = await page.evaluate(() => KYT.journey.passportShareUrl());
  assert.equal(url, 'https://vividnova.com/kyt/visited.html?from=share&quest=golden-triangle', 'the quest the sender is nearest to finishing');
  const { context: c2, page: friend } = await (async () => { const n = await newPhone(env.browser); return { context: n.context, page: n.page }; })();
  await friend.goto(env.base + '/visited.html?from=share&quest=golden-triangle');
  await friend.waitForSelector('#passport-invite:not(.hidden)');
  assert.match(await friend.locator('#passport-invite').innerText(), /A friend shared their India passport/);
  assert.match(await friend.locator('#passport-invite').innerText(), /Golden Triangle/);
  await friend.click('#passport-invite [data-j-open]');
  await friend.waitForSelector('#quest-explainer-card:not(.hidden)');
  // the share dialog offers the link, and the picture carries the invitation
  await page.click('#btn-share-passport');
  await page.waitForSelector('#sh-copy');
  assert.equal(await page.locator('#sh-copy').count(), 1);
  // an ordinary visit shows no invitation
  await friend.goto(env.base + '/visited.html');
  await friend.waitForSelector('#cards-container [data-city-id]');
  assert.equal(await friend.locator('#passport-invite').isHidden(), true);
  await c2.close(); await context.close();
});
