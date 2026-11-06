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
  assert.match(s.mapsUrl, /maps\/dir\/.*(origin=Delhi|origin=28\.).*(destination=Agra|destination=27\.).*travelmode=transit/);
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
  assert.equal(await page.locator('#vt-stay-out').isVisible(), true, 'a stay can have a check-out time');
  await page.fill('#vt-stay-out', '11:00');
  await page.click('#btn-save-vt-step');
  s = dayOf((await stored(page))[0], 1).find(x => x.type === 'stay');
  assert.equal(s.title, 'Stay in Hotel Sunrise');
  assert.equal(s.hour, 19);
  assert.equal(s.checkOut, '11:00');
  const row = await card(page, 'Stay in Hotel Sunrise').innerText();
  assert.match(row, /Check-in 19:00 · Check-out 11:00/);
  assert.doesNotMatch(row, /30m|19:30/, 'no placeholder duration on a stay');
  await card(page, 'Stay in Hotel Sunrise').getByRole('button', { name: 'Edit stop' }).click();
  assert.equal(await page.inputValue('#vt-stay-out'), '11:00', 'the check-out is remembered');
  await page.click('#btn-cancel-step-modal');

  await tab(page, 2).click();
  assert.equal(await page.locator('[data-hint="stay"]').count(), 0, 'nobody sleeps on the last day of the plan');
  await context.close();
});

test('the plan generator (test fixture) fills only the empty days and keeps what you added', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.click('#btn-vt-add-own');
  await page.fill('#vt-step-title', 'My own thing');
  await page.click('#btn-save-vt-step');
  await page.evaluate(() => KYT.virtualTrips.seedPlanForTests());
  const t = (await stored(page))[0];
  assert.deepEqual(dayOf(t, 1).map(s => s.title), ['My own thing'], 'Day 1 had a step, so it is left alone');
  assert.ok(dayOf(t, 2).length >= 3, 'Day 2 was empty and now has a day');
  assert.ok(dayOf(t, 2).some(s => s.type === 'travel'), 'generated travel is tagged as travel');
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
  assert.ok(await page.locator('.btn-move-city-left, .btn-move-city-right').count() > 0, 'cities can be moved with steps too');
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

test('Suggest a plan follows each day\'s own city, and days in the same city do not repeat attractions', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  const run = cities => page.evaluate(cities => {
    const t = { id: 't', name: 't', cities: [...new Set(cities)], originCity: 'already_there', duration: cities.length,
      taste: { intent: 'mixed', diet: 'any', pace: 'standard' }, nightStays: null, steps: null,
      days: cities.map((c, i) => ({ id: i + 1, cityId: c })) };
    KYT.virtualTrips.seedPlanForTests(t);
    const beatTitles = id => new Set(window.KYT_CITIES.find(c => c.id === id).beats.map(b => b.title));
    return cities.map((c, i) => {
      const own = beatTitles(c);
      return (t.steps || []).filter(s => s.dayId === i + 1 && own.has(s.title)).map(s => s.title);
    });
  }, cities);

  // Agra, Agra, Jaipur: day 3 must be Jaipur's attractions, and day 2 must not repeat day 1's.
  const [d1, d2, d3] = await run(['agra', 'agra', 'jaipur']);
  assert.ok(d1.length > 0 && d2.length > 0, 'both Agra days have attractions');
  assert.equal(d2.filter(t => d1.includes(t)).length, 0, `Agra day 2 repeats day 1: ${d1} / ${d2}`);
  assert.ok(d3.length > 0, 'day 3 holds Jaipur attractions, not a repeat of the last Agra day');
  await context.close();
});

test('a stay row shows check-in and check-out, never "~30 mins"', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  const html = await page.evaluate(() => {
    const base = { id: 's1', type: 'stay', title: 'Stay in Indore', where: 'Indore', icon: 'bed-double', hour: 21, minute: 0, endHour: 21, endMinute: 30, durationMin: 30 };
    const r = st => KYT.ui.renderStepCard(st, { variant: 'curated-preview' });
    return { plain: r(base), out: r({ ...base, checkOut: '11:00' }), stop: r({ ...base, type: 'stop', title: 'Fort', icon: 'map-pin', durationMin: 90 }) };
  });
  assert.doesNotMatch(html.plain, /mins/, 'no made-up duration on a stay');
  assert.doesNotMatch(html.plain, /21:00 – 21:30/, 'no end time either');
  assert.match(html.plain, /21:00/);
  assert.match(html.out, /Check-out 11:00/);
  assert.match(html.stop, /~90 mins/, 'stops keep their duration');
  await context.close();
});

test('P1.9: one day can hold stops from two cities with the travel between them', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.locator('[data-add-beat]').first().click();            // a stop in Agra
  await page.click('#btn-vt-add-travel');
  await page.fill('#vt-travel-from', 'Agra');
  await page.fill('#vt-travel-to', 'Jaipur');
  await page.fill('#vt-step-time', '14:00');
  await page.click('#btn-save-vt-step');
  const sug = await page.locator('#vt-suggestions').innerText();
  assert.match(sug, /Amber|Hawa Mahal|City Palace/, 'after travelling, the suggestions are Jaipur\'s');
  await page.locator('[data-add-beat]').first().click();            // a stop in Jaipur, same day
  const day = dayOf((await stored(page))[0], 1).sort((a, b) => a.hour - b.hour || a.minute - b.minute);
  assert.deepEqual(day.map(s => s.type), ['stop', 'travel', 'stop']);
  assert.equal(day[0].cityName, 'Agra');
  assert.equal(day[2].cityName, 'Jaipur');
  assert.ok(day[2].hour * 60 + day[2].minute > day[1].hour * 60 + day[1].minute, 'Jaipur stop is after the travel');
  await context.close();
});

test('Add your own stop starts after the day\'s last step, and the card has a map link with the place', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.click('#btn-vt-add-own');
  assert.equal(await page.inputValue('#vt-step-time'), '09:00', 'an empty day starts in the morning');
  await page.fill('#vt-step-title', 'Old Fort');
  await page.fill('#vt-step-time', '14:00');
  await page.fill('#vt-step-where', 'Fort Road');
  await page.click('#btn-save-vt-step');
  await page.click('#btn-vt-add-own');
  const t = await page.inputValue('#vt-step-time');
  const [h, m] = t.split(':').map(Number);
  assert.ok(h * 60 + m > 14 * 60, `second stop comes after the 14:00 one, got ${t}`);
  assert.notEqual(t, '12:00');
  await page.fill('#vt-step-title', 'Tea stall');
  await page.click('#btn-save-vt-step');
  const link = page.locator('[data-step-id] a', { hasText: 'Open in Maps' });
  assert.equal(await link.count(), 2);
  assert.match(await link.first().getAttribute('href'), /google\.com\/maps\/search.*query=/);
  assert.match(await page.locator('[data-step-id]').first().innerText(), /Fort Road/);
  await context.close();
});

test('Before you go comes first in the Day Plan; a travel month warns about closures, and Style stays one small link at the top', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  const order = await page.evaluate(() => {
    const list = document.getElementById('vt-itinerary-list');
    const kids = [...list.querySelectorAll('#vt-byg, #vt-day-tabs')].map(e => e.id);
    return kids;
  });
  assert.deepEqual(order, ['vt-byg', 'vt-day-tabs'], 'Before you go sits above the day tabs');
  const link = page.locator('#btn-vt-style-toggle');
  assert.equal(await link.innerText(), 'Change');
  assert.ok((await link.boundingBox()).height < 24, 'a small link, not a button');
  await link.click();
  assert.equal(await page.locator('#vt-taste .vt-chip').count() > 3, true, 'chips open at the top');
  await page.click('#vt-taste .vt-chip[data-field="diet"][data-id="veg"]');
  assert.match(await page.locator('#vt-itinerary-list').innerText(), /Style: .*Veg/);
  assert.equal((await stored(page))[0].taste.diet, 'veg', 'the change is kept');
  await context.close();
});

test('monthWarnings: a closed month (wrapping the year end) and a wet month are flagged', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  const r = await page.evaluate(() => {
    const spiti = KYT_CITIES.find(c => c.id === 'spiti_valley') || KYT_CITIES.find(c => c.access && c.access.closed);
    const w = KYT.virtualTrips.monthWarnings([spiti], spiti.access.closed[0]);
    const none = KYT.virtualTrips.monthWarnings([spiti], 0);
    const delhi = KYT.virtualTrips.monthWarnings([KYT_CITIES.find(c => c.id === 'delhi')], 7);
    return { closed: w.some(x => x.kind === 'closed'), none: none.length, delhi: delhi.map(x => x.kind) };
  });
  assert.equal(r.closed, true);
  assert.equal(r.none, 0, 'no month chosen, no warnings');
  assert.ok(r.delhi.includes('wet'), 'Delhi in July is wet');
  await context.close();
});

test('choosing a travel month shows its notes and is kept with the trip', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page);
  await page.selectOption('#vt-travel-month', '7');
  await page.waitForSelector('#vt-month-notes li');
  assert.equal((await stored(page))[0].travelMonth, 7);
  await page.reload();
  assert.equal((await stored(page))[0].travelMonth, 7);
  await context.close();
});

test('the start date dialog warns about a closed or wet month and a month that differs from the plan, and still lets you start', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page, [['Leh', 'leh'], ['Agra', 'agra']]);
  await page.selectOption('#vt-travel-month', '7');
  await page.evaluate(() => KYT.virtualTrips.seedPlanForTests());
  const leh = await page.evaluate(() => { const c = KYT_CITIES.find(x => x.id === 'leh'); return c.access && c.access.closed; });
  const closedMonth = leh ? leh[0] : 1;
  await page.evaluate(() => { window.__ask = KYT.ui.askStartDate({ cities: ['leh', 'agra'].map(KYT.ui.resolveCity), travelMonth: 7 }); });
  await page.waitForSelector('#kyt-start-date-input');
  const y = new Date().getFullYear() + 1, pad = n => String(n).padStart(2, '0');
  await page.fill('#kyt-start-date-input', `${y}-${pad(closedMonth)}-15`);
  const notes = await page.locator('#kyt-start-date-notes').innerText();
  if (leh) assert.match(notes, /closed or cut off/i);
  assert.match(notes, /planned for July/i, 'the date is in another month than the one chosen');
  assert.equal(await page.locator('#kyt-start-date-confirm').isDisabled(), false, 'a warning never blocks');
  await page.fill('#kyt-start-date-input', `${y}-07-15`);
  assert.doesNotMatch(await page.locator('#kyt-start-date-notes').innerText(), /planned for July/);
  await page.keyboard.press('Escape');
  await context.close();
});

test('a shared link with a month brings the month into the new trip', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html?trip=Shared&cities=agra,jaipur&taste=msa&origin=delhi&days=2&m=7');
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]')[0] || {}).travelMonth === 7);
  await context.close();
});

test('Earlier and Later swap a day with its steps and the cities list follows; the end days have one button (D9)', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page, [['Agra', 'agra'], ['Jaipur', 'jaipur']]);
  await page.evaluate(() => KYT.virtualTrips.seedPlanForTests());
  const before = (await stored(page))[0];
  const dayCities = t => t.days.filter(d => d.id >= 1).sort((a, b) => a.id - b.id).map(d => d.cityId);
  assert.deepEqual(dayCities(before), ['agra', 'jaipur']);
  const firstOfDay1 = before.steps.find(s => Number(s.dayId) === 1 && s.type === 'stop');
  await page.click('[data-day-tab="1"], #vt-day-tabs button:has-text("Day 1")');
  assert.equal(await page.locator('#btn-vt-day-earlier').count(), 0, 'nothing before day 1');
  assert.equal(await page.locator('#btn-vt-day-later').count(), 1);
  await page.click('#btn-vt-day-later');
  const after = (await stored(page))[0];
  assert.deepEqual(dayCities(after), ['jaipur', 'agra']);
  assert.deepEqual(after.cities.slice(0, 2), ['jaipur', 'agra'], 'the chosen-cities list follows');
  assert.equal(Number(after.steps.find(s => s.id === firstOfDay1.id).dayId), 2, 'its steps moved with the day');
  assert.equal(after.steps.length, before.steps.length, 'no step lost');
  assert.equal(await page.locator('#btn-vt-day-earlier').count(), 1, 'the day is now second');
  assert.equal(await page.locator('#btn-vt-day-later').count(), 0, 'and last');
  await context.close();
});

test('moveDay refuses to move off either end', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page, [['Agra', 'agra'], ['Jaipur', 'jaipur']]);
  const r = await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('kyt_virtual_trips'))[0]; return [KYT.virtualTrips.moveDay(t, 1, -1), KYT.virtualTrips.moveDay(t, 2, 1)]; });
  assert.deepEqual(r, [null, null]);
  await context.close();
});

// ── Stays: one entry per night, shown as one stay; a Review list for what looks off (D12) ───────────────
const stayStep = (id, dayId, where, extra = {}) => ({ id, dayId, type: 'stay', cityName: 'Agra', title: 'Stay in ' + where, where, hour: 21, minute: 0, durationMin: 30, icon: 'bed-double', ...extra });
const stopStep = (id, dayId, title, hour, extra = {}) => ({ id, dayId, type: 'stop', cityName: 'Agra', title, where: title, hour, minute: 0, durationMin: 90, icon: 'map-pin', ...extra });
/** One city, three days, and exactly the steps given. */
async function threeDays(page, steps) {
  await openPlan(page, [['Agra', 'agra']]);
  await page.evaluate(st => {
    const all = JSON.parse(localStorage.getItem('kyt_virtual_trips'));
    all[0].days = [{ id: 1, cityId: 'agra' }, { id: 2, cityId: 'agra' }, { id: 3, cityId: 'agra' }];
    all[0].duration = 3; all[0].steps = st;
    localStorage.setItem('kyt_virtual_trips', JSON.stringify(all));
    KYT.virtualTrips.redrawPlan();
  }, steps);
  await page.waitForSelector('#vt-day-tabs');
}

test('consecutive nights at one place read as one stay: check-in on night 1, check-out on the last night', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeDays(page, [stopStep('a', 1, 'Taj Mahal', 9), stayStep('s1', 1, 'Hotel Taj'), stopStep('b', 2, 'Agra Fort', 9), stayStep('s2', 2, 'Hotel Taj', { checkOut: '11:00' }), stopStep('c', 3, 'Mehtab Bagh', 9)]);
  assert.match(await card(page, 'Stay in Hotel Taj').innerText(), /Check-in 21:00 · night 1 of 2/);
  await tab(page, 2).click();
  const t2 = await card(page, 'Stay in Hotel Taj').innerText();
  assert.match(t2, /Night 2 of 2 · Check-out 11:00/);
  assert.doesNotMatch(t2, /Check-in/);
  await context.close();
});

test('"Stay at X again tonight" adds the next night and moves the check-out to it', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeDays(page, [stopStep('a', 1, 'Taj Mahal', 9), stayStep('s1', 1, 'Hotel Taj', { checkOut: '11:00' }), stopStep('b', 2, 'Agra Fort', 9), stopStep('c', 3, 'Mehtab Bagh', 9)]);
  await tab(page, 2).click();
  const hint = page.locator('[data-hint="stay"]');
  assert.match(await hint.innerText(), /Stay at Hotel Taj again tonight/);
  await hint.click();
  const t = (await stored(page))[0];
  const stays = t.steps.filter(x => x.type === 'stay').sort((a, b) => a.dayId - b.dayId);
  assert.deepEqual(stays.map(x => [x.dayId, x.where, x.checkOut || '']), [[1, 'Hotel Taj', ''], [2, 'Hotel Taj', '11:00']]);
  assert.equal(await page.locator('[data-hint="stay"]').count(), 0, 'the night is covered');
  await context.close();
});

test('the Nights picker adds a stay for each night and stops, saying why, when the city changes or the days run out', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeDays(page, [stopStep('a', 1, 'Taj Mahal', 9), stopStep('b', 2, 'Agra Fort', 9), stopStep('c', 3, 'Mehtab Bagh', 9)]);
  await page.click('#btn-vt-add-stay');
  assert.equal(await page.locator('#vt-stay-nights-wrap').isVisible(), true);
  await page.fill('#vt-stay-place', 'Hotel Taj');
  await page.fill('#vt-stay-out', '10:30');
  await page.selectOption('#vt-stay-nights', '2');
  await page.click('#btn-save-vt-step');
  let stays = (await stored(page))[0].steps.filter(x => x.type === 'stay').sort((a, b) => a.dayId - b.dayId);
  assert.deepEqual(stays.map(x => [x.dayId, x.where, x.checkOut || '']), [[1, 'Hotel Taj', ''], [2, 'Hotel Taj', '10:30']]);
  assert.ok(stays[1].hour >= 21, 'a later night checks in at 21:00 or after the day\'s last step');
  // asking for more nights than days left: adds what fits and says so
  await tab(page, 3).click();
  await page.click('#btn-vt-add-stay');
  await page.fill('#vt-stay-place', 'Hotel Oberoi');
  await page.selectOption('#vt-stay-nights', '3');
  await page.click('#btn-save-vt-step');
  assert.ok(page.dialogs.some(d => /Added 1 of 3 nights: there is no Day 4/.test(d)), page.dialogs.join(' | '));
  stays = (await stored(page))[0].steps.filter(x => x.type === 'stay');
  assert.equal(stays.length, 3);
  await context.close();
});

test('editing a stay has no Nights picker', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeDays(page, [stayStep('s1', 1, 'Hotel Taj'), stopStep('a', 1, 'Taj Mahal', 9)]);
  await page.evaluate(() => window.editVirtualTripStep('s1'));
  await page.waitForSelector('#vt-step-modal:not(.hidden)');
  assert.equal(await page.locator('#vt-stay-nights-wrap').isVisible(), false);
  await context.close();
});

test('Review lists what looks off, with a fix for each, and stays out of the way when all is well', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeDays(page, [stopStep('a', 1, 'Taj Mahal', 9), stopStep('b', 2, 'Agra Fort', 9), stopStep('c', 3, 'Mehtab Bagh', 9)]);
  assert.match(await page.locator('#vt-review').innerText(), /Review · 2 to look at/i);
  assert.equal(await page.locator('#vt-review li').count(), 0, 'collapsed until opened');
  await page.click('#btn-vt-review-toggle');
  assert.equal(await page.locator('#vt-review li[data-review="no-stay"]').count(), 2, 'days 1 and 2 have no stay; the last day needs none');
  await page.locator('#vt-review li[data-review="no-stay"]').first().locator('button').click();
  let stays = (await stored(page))[0].steps.filter(x => x.type === 'stay');
  assert.deepEqual(stays.map(x => x.dayId), [1]);
  assert.match(await page.locator('#vt-review').innerText(), /Review · 1 to look at/i);
  assert.equal(await page.locator('#vt-review li').count(), 1, 'the list stays open while you fix things');
  await page.locator('#vt-review li[data-review="no-stay"]').first().locator('button').click();
  assert.equal(await page.locator('#vt-review').count(), 0, 'nothing left to review');
  await context.close();
});

test('reviewTrip flags a stay in the wrong city, an early check-in, a late check-out, two stays, and a stay on the last day', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page, [['Agra', 'agra'], ['Jaipur', 'jaipur']]);
  const keys = await page.evaluate(() => {
    const trip = {
      cities: ['agra', 'jaipur'], originCity: 'delhi', days: [{ id: 1, cityId: 'agra' }, { id: 2, cityId: 'jaipur' }],
      steps: [
        { id: 'a', dayId: 1, type: 'stop', cityName: 'Agra', title: 'Dinner', hour: 20, minute: 0, durationMin: 150 },
        { id: 's1', dayId: 1, type: 'stay', cityName: 'Jaipur', title: 'Stay', where: 'Hotel', hour: 21, minute: 0, durationMin: 30 },
        { id: 's1b', dayId: 1, type: 'stay', cityName: 'Agra', title: 'Stay', where: 'Hotel 2', hour: 23, minute: 0, durationMin: 30, checkOut: '11:00' },
        { id: 't', dayId: 2, type: 'travel', cityName: 'Jaipur', title: 'Travel', from: 'Agra', to: 'Jaipur', hour: 6, minute: 0, durationMin: 240 },
        { id: 's2', dayId: 2, type: 'stay', cityName: 'Jaipur', title: 'Stay', where: 'Hotel 3', hour: 21, minute: 0, durationMin: 30 }
      ]
    };
    return KYT.virtualTrips.reviewTrip(trip).map(i => i.key).sort();
  });
  assert.deepEqual(keys, ['early-checkin', 'last-day-stay', 'late-checkout', 'stay-city', 'two-stays'].sort());
  await context.close();
});

test('a Review step button opens that step to correct it', async () => {
  const { context, page } = await newPhone(env.browser);
  await threeDays(page, [stopStep('a', 1, 'Taj Mahal', 9), stayStep('s1', 1, 'Hotel Taj', { hour: 8 }), stopStep('b', 2, 'Agra Fort', 9), stayStep('s2', 2, 'Hotel Taj'), stopStep('c', 3, 'Mehtab Bagh', 9)]);
  await page.click('#btn-vt-review-toggle');
  const row = page.locator('#vt-review li[data-review="early-checkin"]');
  assert.equal(await row.count(), 1);
  assert.match(await row.innerText(), /Day 1: check-in 08:00 is before your last step ends/);
  await row.locator('button').click();
  await page.waitForSelector('#vt-step-modal:not(.hidden)');
  assert.equal(await page.inputValue('#vt-step-time'), '08:00');
  await page.fill('#vt-step-time', '21:00');
  await page.click('#btn-save-vt-step');
  assert.equal(await page.locator('#vt-review li[data-review="early-checkin"]').count(), 0, 'corrected, so the flag is gone');
  await context.close();
});

test('moving a city with steps moves its days and steps with it and renumbers the days (D9)', async () => {
  const { context, page } = await newPhone(env.browser);
  await openPlan(page, [['Agra', 'agra'], ['Jaipur', 'jaipur'], ['Udaipur', 'udaipur']]);
  await page.evaluate(() => KYT.virtualTrips.seedPlanForTests());
  const before = (await stored(page))[0];
  const agraDays = before.days.filter(d => d.cityId === 'agra').map(d => d.id);
  const agraSteps = before.steps.filter(x => agraDays.includes(Number(x.dayId))).map(x => x.id).sort();
  await page.click('#btn-vt-edit-setup');
  await page.click('#btn-vt-dest-edit');
  await page.locator('.vt-selected-city-chip', { hasText: 'Agra' }).locator('.btn-move-city-right').click();
  const t = (await stored(page))[0];
  assert.deepEqual(t.cities.slice(0, 2), ['jaipur', 'agra']);
  const order = t.days.filter(d => d.id >= 1).sort((a, b) => a.id - b.id).map(d => d.cityId);
  assert.ok(order.indexOf('jaipur') < order.indexOf('agra') && order.indexOf('agra') < order.indexOf('udaipur'), order.join());
  assert.deepEqual(t.days.filter(d => d.id >= 1).map(d => d.id).sort((a, b) => a - b), t.days.filter(d => d.id >= 1).map((d, k) => k + 1), 'days are 1..n');
  const newAgra = t.days.filter(d => d.cityId === 'agra').map(d => d.id);
  assert.deepEqual(t.steps.filter(x => newAgra.includes(Number(x.dayId))).map(x => x.id).sort(), agraSteps, 'its steps went with it');
  assert.equal(t.steps.length, before.steps.length);
  await context.close();
});
