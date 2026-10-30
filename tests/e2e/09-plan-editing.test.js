'use strict';
/**
 * The Day Plan: one tab per day, built by hand. Suggestions come from the city's attractions with their
 * metadata; travel and stay are steps of their own; "Suggest a plan" fills only the days that are empty.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]'));
const dayOf = (trip, d) => (trip.steps || []).filter(s => s.dayId === d);
const card = (page, title) => page.locator('[data-step-id]', { hasText: title }).first();
const tab = (page, n) => page.locator(`#vt-day-tabs [role="tab"][data-day-id="${n}"]`);

/** New trip, cities chosen, start chosen, Day Plan open and empty. */
async function openPlan(page, cities = [['Agra', 'agra'], ['Jaipur', 'jaipur']], origin = 'delhi') {
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.fill('#vt-new-name', 'By hand');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  for (const [q, id] of cities) {
    await page.fill('#vt-city-search', q);
    await page.click(`.btn-add-city[data-id="${id}"]`);
    await page.fill('#vt-city-search', '');
  }
  await page.click('#btn-vt-dest-done');
  await page.selectOption('#vt-origin-city', origin);
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
}

test('the Day Plan opens empty with one tab per city; nothing is generated until asked', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  assert.equal(await page.locator('#vt-day-tabs [role="tab"]').count(), 2);
  assert.match(await tab(page, 1).innerText(), /Day 1[\s\S]*Agra/);
  assert.match(await tab(page, 2).innerText(), /Day 2[\s\S]*Jaipur/);
  assert.equal(await tab(page, 1).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#vt-day-empty').isVisible(), true);
  const t = (await stored(page))[0];
  assert.equal(t.steps, null);
  assert.deepEqual(t.days, [{ id: 1, cityId: 'agra' }, { id: 2, cityId: 'jaipur' }]);

  // each tab offers its own city's attractions
  assert.match(await page.locator('#vt-suggestions').innerText(), /Taj Mahal/);
  await tab(page, 2).click();
  assert.match(await page.locator('#vt-suggestions').innerText(), /Amber|Hawa Mahal|City Palace/);
  assert.doesNotMatch(await page.locator('#vt-suggestions').innerText(), /Taj Mahal/);
  await context.close();
});

test('tap a suggestion to add it: it becomes a step in time order and leaves the list', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  const first = (await page.locator('#vt-suggestions p.font-bold').first().innerText()).trim();
  const countBefore = await page.locator('#vt-suggestions [data-add-beat]').count();
  await page.locator('[data-add-beat="0"]').click();
  let day = dayOf((await stored(page))[0], 1);
  assert.equal(day.length, 1);
  assert.equal(day[0].title, first);
  assert.equal(day[0].type, 'stop');
  assert.match(day[0].mapsUrl, /google\.com\/maps/);
  assert.equal(await page.locator('#vt-day-empty').count(), 0);
  assert.equal(await card(page, first).count(), 1);
  assert.equal(await page.locator('#vt-suggestions [data-add-beat]').count(), countBefore - 1, 'it is not offered twice');

  await page.locator('[data-add-beat="0"]').click();
  day = dayOf((await stored(page))[0], 1);
  const times = day.map(s => s.hour * 60 + s.minute);
  assert.equal(day.length, 2);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(new Set(times).size, 2, 'no two steps start together');
  assert.match(await page.locator('#vt-tab-plan-badge, #vt-day-tabs').first().innerText(), /Day 1[\s\S]*2/);
  await context.close();
});

test('style sorts the suggestions and hides nothing', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page, [['Mumbai', 'mumbai']]);
  const names = () => page.locator('#vt-suggestions p.font-bold').allInnerTexts();
  const all = await names();
  assert.ok(all.length >= 11 - 0, `Mumbai lists every attraction, got ${all.length}`);

  await page.click('#btn-vt-style-toggle');
  assert.match(await page.locator('#vt-taste').innerText(), /A bit of everything/i);
  await page.click('.vt-chip[data-field="intent"][data-id="spiritual"]');
  const spiritual = await names();
  assert.equal(spiritual.length, all.length, 'the same attractions, in a different order');
  assert.match(spiritual.slice(0, 5).join('|'), /Siddhivinayak|Babulnath|Mumbadevi|Walkeshwar|ISKCON|Radha Gopinath|Haji Ali/);
  assert.match(await page.locator('#vt-suggestions').innerText(), /More in Mumbai/i);
  assert.equal(JSON.stringify(spiritual) === JSON.stringify(all), false);
  assert.equal((await stored(page))[0].taste.intent, 'spiritual');
  await context.close();
});

test('move, edit and delete a stop; a stop needs a name', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.locator('[data-add-beat="0"]').click();
  await page.locator('[data-add-beat="0"]').click();
  const [a, b] = dayOf((await stored(page))[0], 1);

  await card(page, b.title).getByRole('button', { name: 'Move earlier' }).click();
  let day = dayOf((await stored(page))[0], 1);
  assert.deepEqual(day.map(s => s.title), [b.title, a.title]);
  assert.equal(await card(page, day[0].title).getByRole('button', { name: 'Move earlier' }).isDisabled(), true);
  assert.equal(await card(page, day[1].title).getByRole('button', { name: 'Move later' }).isDisabled(), true);

  await card(page, a.title).getByRole('button', { name: 'Edit stop' }).click();
  await page.waitForSelector('#vt-step-modal:not(.hidden)');
  assert.match(await page.locator('#vt-step-modal-title').innerText(), /Edit stop/);
  await page.fill('#vt-step-title', '');
  await page.click('#btn-save-vt-step');
  assert.equal(await page.locator('#vt-step-error').isVisible(), true, 'blank name is refused');
  await page.fill('#vt-step-title', 'Sunrise at the ghats');
  await page.fill('#vt-step-time', '05:45');
  await page.fill('#vt-step-where', 'Mehtab Bagh');
  await page.fill('#vt-step-notes', 'Bring a jacket');
  await page.click('#btn-save-vt-step');
  day = dayOf((await stored(page))[0], 1);
  const edited = day.find(s => s.title === 'Sunrise at the ghats');
  assert.deepEqual([edited.hour, edited.minute], [5, 45]);
  assert.match(edited.mapsUrl, /Mehtab%20Bagh/);
  assert.equal(day[0].title, 'Sunrise at the ghats', 'an earlier time moves it to the top');

  await card(page, 'Sunrise at the ghats').getByRole('button', { name: 'Delete stop' }).click();
  assert.equal(dayOf((await stored(page))[0], 1).length, 1);
  await context.close();
});

test('add your own stop to a day', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.click('#btn-vt-add-own');
  assert.match(await page.locator('#vt-step-modal-title').innerText(), /Add a stop to Day 1/);
  assert.equal(await page.locator('#vt-fields-travel').isVisible(), false);
  await page.fill('#vt-step-title', 'Chai with cousins');
  await page.fill('#vt-step-time', '17:30');
  await page.click('#btn-save-vt-step');
  const s = dayOf((await stored(page))[0], 1)[0];
  assert.equal(s.title, 'Chai with cousins');
  assert.equal(s.type, 'stop');
  assert.deepEqual([s.hour, s.minute], [17, 30]);
  await context.close();
});

test('travel is a step of its own: suggested between cities, with from, to, how and a Google Maps route', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page, [['Agra', 'agra'], ['Jaipur', 'jaipur']], 'delhi');

  // Day 1: arriving from the start; Day 2: moving on from Agra
  assert.match(await page.locator('#vt-day-hints').innerText(), /Travel from Delhi[\s\S]*to Agra/);
  await page.locator('[data-hint="travel"]').first().click();
  await page.waitForSelector('#vt-step-modal:not(.hidden)');
  assert.equal(await page.locator('#vt-fields-travel').isVisible(), true);
  assert.equal(await page.locator('#vt-fields-stop').isVisible(), false);
  assert.equal(await page.locator('#vt-travel-from').inputValue(), 'Delhi');
  assert.equal(await page.locator('#vt-travel-to').inputValue(), 'Agra');
  assert.match(await page.locator('#vt-travel-hint').innerText(), /About \d+ km/);

  await page.fill('#vt-travel-from', '');
  await page.click('#btn-save-vt-step');
  assert.equal(await page.locator('#vt-step-error').isVisible(), true, 'from and to are needed');
  await page.fill('#vt-travel-from', 'Delhi');
  await page.selectOption('#vt-travel-mode', 'train');
  await page.fill('#vt-travel-duration', '2 h');
  await page.click('#btn-save-vt-step');

  const s = dayOf((await stored(page))[0], 1)[0];
  assert.equal(s.type, 'travel');
  assert.equal(s.from, 'Delhi'); assert.equal(s.to, 'Agra'); assert.equal(s.mode, 'train'); assert.equal(s.duration, '2 h');
  assert.match(s.title, /Travel: Delhi to Agra by train/);
  assert.match(s.mapsUrl, /maps\/dir\/.*origin=Delhi.*destination=Agra.*travelmode=transit/);
  assert.match(await card(page, 'Travel: Delhi').innerText(), /TRAVEL/i);
  assert.equal(await page.locator('#vt-day-hints').innerText().then(t => /Travel from Delhi/.test(t)), false, 'the hint goes once it is added');

  await tab(page, 2).click();
  assert.match(await page.locator('#vt-day-hints').innerText(), /Travel from Agra to Jaipur/);
  assert.match(await page.locator('#vt-day-hints').innerText(), /Travel back to Delhi/, 'the last day suggests the way home');
  await context.close();
});

test('a stay is a step of its own: suggested for each night, editable, and not on the last day', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  assert.match(await page.locator('#vt-day-hints').innerText(), /Stay in Agra tonight/);
  await page.locator('[data-hint="stay"]').click();
  let s = dayOf((await stored(page))[0], 1).find(x => x.type === 'stay');
  assert.equal(s.title, 'Stay in Agra');
  assert.equal(s.hour, 21);
  assert.match(await card(page, 'Stay in Agra').innerText(), /STAY/i);
  assert.equal(await page.locator('[data-hint="stay"]').count(), 0, 'one stay per night');

  await card(page, 'Stay in Agra').getByRole('button', { name: 'Edit stop' }).click();
  assert.match(await page.locator('#vt-step-modal-title').innerText(), /Edit stay/);
  assert.equal(await page.locator('#vt-fields-stay').isVisible(), true);
  await page.fill('#vt-stay-place', 'Hotel Sunrise');
  await page.fill('#vt-step-time', '19:00');
  await page.click('#btn-save-vt-step');
  s = dayOf((await stored(page))[0], 1).find(x => x.type === 'stay');
  assert.equal(s.title, 'Stay in Hotel Sunrise');
  assert.equal(s.hour, 19);

  await tab(page, 2).click();
  assert.equal(await page.locator('[data-hint="stay"]').count(), 0, 'nobody sleeps on the last day of the plan');
  await context.close();
});

test('Suggest a plan fills only the empty days and keeps what you added', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.click('#btn-vt-add-own');
  await page.fill('#vt-step-title', 'My own thing');
  await page.click('#btn-save-vt-step');
  await page.click('#btn-vt-suggest');
  const t = (await stored(page))[0];
  assert.deepEqual(dayOf(t, 1).map(s => s.title), ['My own thing'], 'Day 1 had a step, so it is left alone');
  assert.ok(dayOf(t, 2).length >= 3, 'Day 2 was empty and now has a day');
  assert.ok(dayOf(t, 2).some(s => s.type === 'travel'), 'generated travel is tagged as travel');
  assert.equal(await page.locator('#btn-vt-suggest').count(), 0, 'no empty days left, so no button');
  await context.close();
});

test('days follow the cities: adding a city adds a day, removing one takes its day and steps; + Day and Remove day work', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.locator('[data-add-beat="0"]').click();

  await page.click('#btn-vt-add-day');
  assert.equal(await page.locator('#vt-day-tabs [role="tab"]').count(), 3);
  assert.equal(await tab(page, 3).getAttribute('aria-selected'), 'true');
  assert.match(await tab(page, 3).innerText(), /Jaipur/, 'a new day is in the last city');
  await page.selectOption('#vt-day-city', 'agra');
  assert.match(await tab(page, 3).innerText(), /Agra/);
  assert.equal((await stored(page))[0].duration, 3);

  await page.click('#btn-vt-remove-day');
  assert.equal(await page.locator('#vt-day-tabs [role="tab"]').count(), 2);

  // a day with steps keeps its city: the picker is locked
  await tab(page, 1).click();
  assert.equal(await page.locator('#vt-day-city').isDisabled(), true);

  // setup: a new city is a new day; reordering is not offered once steps exist
  await page.click('#btn-vt-edit-setup');
  await page.click('#btn-vt-dest-edit');
  await page.fill('#vt-city-search', 'Udaipur');
  await page.click('.btn-add-city[data-id="udaipur"]');
  await page.click('#btn-vt-dest-done');
  assert.equal(await page.locator('.btn-move-city-left, .btn-move-city-right').count(), 0);
  let t = (await stored(page))[0];
  assert.deepEqual(t.days.map(d => d.cityId), ['agra', 'jaipur', 'udaipur']);

  await page.locator('.vt-selected-city-chip', { hasText: 'Agra' }).locator('.btn-del-city').click();   // has a step: asks first
  t = (await stored(page))[0];
  assert.deepEqual(t.cities, ['jaipur', 'udaipur']);
  assert.deepEqual(t.days, [{ id: 1, cityId: 'jaipur' }, { id: 2, cityId: 'udaipur' }], 'later days move up');
  assert.equal(t.steps, null, 'its step went with it');
  await context.close();
});

test('trips saved before day tabs open with days worked out from their steps', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await page.evaluate(() => {
    localStorage.setItem('kyt_virtual_trips', JSON.stringify([{
      id: 'old1', name: 'Old trip', originCity: 'delhi', cities: ['agra', 'jaipur'], duration: 2,
      taste: { intent: 'mixed', diet: 'any', pace: 'standard' },
      steps: [
        { id: 'a', dayId: 1, cityName: 'Agra', title: 'Taj Mahal', hour: 8, minute: 0, where: 'Agra', mapsUrl: '', icon: 'landmark', notes: '' },
        { id: 'b', dayId: 2, cityName: 'Jaipur', title: 'Amber Fort', hour: 9, minute: 0, where: 'Jaipur', mapsUrl: '', icon: 'landmark', notes: '' }
      ]
    }]));
  });
  await page.reload();
  // open it the way a person would: from My Trips to the plan page, then Edit Trip
  await page.waitForSelector('#vt-list');
  await page.locator('#vt-list').getByText('Old trip').first().click();
  await page.waitForURL('**/trip_detail.html*');
  await page.click('#btn-edit-plan');
  await page.waitForSelector('#vt-day-tabs');
  assert.match(await tab(page, 1).innerText(), /Agra/);
  assert.match(await tab(page, 2).innerText(), /Jaipur/);
  assert.match(await page.locator('[data-step-id]').first().innerText(), /Taj Mahal/);
  await context.close();
});
