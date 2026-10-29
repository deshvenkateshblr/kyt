'use strict';
/**
 * The Day Plan is editable: move a stop earlier or later, edit it, add a stop (typed, or one of the
 * city's remaining attractions) and delete one. Rebuilding after cities, days or the start change keeps
 * those edits; "Reset plan" is the one thing that drops them.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]'));
const dayOf = (trip, d) => trip.steps.filter(s => s.dayId === d);
const card = (page, title) => page.locator('[data-step-id]', { hasText: title }).first();

/** Builds a 2-city plan and lands in the Day Plan editor. */
async function openEditor(page, cities = [['Agra', 'agra'], ['Jaipur', 'jaipur']]) {
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.fill('#vt-new-name', 'Editable');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  for (const [q, id] of cities) {
    await page.fill('#vt-city-search', q);
    await page.click(`.btn-add-city[data-id="${id}"]`);
    await page.fill('#vt-city-search', '');
  }
  await page.click('#btn-vt-dest-done');
  await page.selectOption('#vt-origin-city', 'delhi');
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
}

test('move a stop earlier or later: the two stops trade places and times, and the ends cannot move off the day', async () => {
  const { context, page } = await newPhone(env.browser);
  await openEditor(page);
  const before = dayOf((await stored(page))[0], 1);
  const [a, b] = before;

  await card(page, b.title).getByRole('button', { name: 'Move earlier' }).click();
  const after = dayOf((await stored(page))[0], 1);
  assert.equal(after[0].title, b.title);
  assert.equal(after[1].title, a.title);
  assert.deepEqual([after[0].hour, after[0].minute], [a.hour, a.minute], 'the stop that moved up takes the earlier time');
  assert.deepEqual([after[1].hour, after[1].minute], [b.hour, b.minute]);
  const times = after.map(s => s.hour * 60 + s.minute);
  assert.deepEqual(times, [...times].sort((x, y) => x - y), 'the day is still in time order');
  assert.match(await page.locator('#vt-itinerary-list').innerText(), new RegExp(b.title.slice(0, 12)));

  // the first stop of a day cannot go earlier, the last cannot go later
  const dayCards = page.locator('[data-step-id]');
  assert.equal(await card(page, after[0].title).getByRole('button', { name: 'Move earlier' }).isDisabled(), true);
  assert.equal(await card(page, after.at(-1).title).getByRole('button', { name: 'Move later' }).isDisabled(), true);
  assert.ok(await dayCards.count() > 4);

  await card(page, after[0].title).getByRole('button', { name: 'Move later' }).click();
  const back = dayOf((await stored(page))[0], 1);
  assert.equal(back[0].title, a.title, 'moving it back restores the order');
  await context.close();
});

test('edit a stop: title, time, place and notes are saved; the day re-sorts; a stop needs a name', async () => {
  const { context, page } = await newPhone(env.browser);
  await openEditor(page);
  const first = dayOf((await stored(page))[0], 1)[1];

  await card(page, first.title).getByRole('button', { name: 'Edit stop' }).click();
  await page.waitForSelector('#vt-step-modal:not(.hidden)');
  assert.equal(await page.locator('#vt-step-title').inputValue(), first.title);

  await page.fill('#vt-step-title', '');
  await page.click('#btn-save-vt-step');
  assert.equal(await page.locator('#vt-step-error').isVisible(), true, 'blank name is refused');
  assert.equal(await page.locator('#vt-step-modal').isVisible(), true);

  await page.fill('#vt-step-title', 'Sunrise at the ghats');
  await page.fill('#vt-step-time', '06:15');
  await page.fill('#vt-step-where', 'Mehtab Bagh');
  await page.fill('#vt-step-notes', 'Bring a jacket');
  await page.click('#btn-save-vt-step');
  await page.waitForSelector('#vt-step-modal', { state: 'hidden' });

  const day = dayOf((await stored(page))[0], 1);
  const edited = day.find(s => s.title === 'Sunrise at the ghats');
  assert.ok(edited, 'saved');
  assert.equal(edited.notes, 'Bring a jacket');
  assert.equal(edited.where, 'Mehtab Bagh');
  assert.match(edited.mapsUrl, /Mehtab%20Bagh/, 'the map link follows the new place');
  assert.deepEqual([edited.hour, edited.minute, edited.phase], [6, 15, 'Morning']);
  assert.equal(day[0].title, 'Sunrise at the ghats', 'an earlier time moves it to the top of the day');
  assert.match(await page.locator('#vt-itinerary-list').innerText(), /Sunrise at the ghats/);
  assert.equal(edited.edited, true);
  await context.close();
});

test('add a stop: typed by hand, or picked from the city, and a picked attraction is not offered twice', async () => {
  const { context, page } = await newPhone(env.browser);
  await openEditor(page);
  const day2 = () => stored(page).then(t => dayOf(t[0], 2));

  // typed
  await page.locator('button[onclick="addVirtualTripStep(2)"]').click();   
  await page.waitForSelector('#vt-step-modal:not(.hidden)');
  assert.match(await page.locator('#vt-step-modal-title').innerText(), /Day 2/);
  await page.fill('#vt-step-title', 'Evening chai with the family');
  await page.fill('#vt-step-time', '17:45');
  await page.click('#btn-save-vt-step');
  let d2 = await day2();
  const mine = d2.find(s => s.title === 'Evening chai with the family');
  assert.ok(mine && mine.custom === true);
  assert.deepEqual([mine.hour, mine.minute], [17, 45]);
  assert.match(mine.mapsUrl, /google\.com\/maps/);
  assert.equal(await card(page, 'Evening chai').getByText('Added').count(), 1, 'marked as added');

  // picked
  await page.locator('button[onclick="addVirtualTripStep(2)"]').click();
  await page.waitForSelector('#vt-step-pick-wrap:not(.hidden)');
  const optionsBefore = await page.locator('#vt-step-pick option').allInnerTexts();
  assert.ok(optionsBefore.length > 1, 'the city has attractions left to offer');
  const pickedTitle = optionsBefore[1];
  await page.selectOption('#vt-step-pick', { index: 1 });
  assert.equal(await page.locator('#vt-step-title').inputValue(), pickedTitle, 'choosing fills the form');
  await page.click('#btn-save-vt-step');
  d2 = await day2();
  assert.ok(d2.some(s => s.title === pickedTitle));

  await page.locator('button[onclick="addVirtualTripStep(2)"]').click();
  await page.waitForSelector('#vt-step-modal:not(.hidden)');
  // the picker disappears altogether once the city has nothing left to offer
  const optionsAfter = await page.locator('#vt-step-pick-wrap').isVisible()
    ? await page.locator('#vt-step-pick option').allInnerTexts() : [];
  assert.equal(optionsAfter.includes(pickedTitle), false, 'a stop already in the plan is not offered again');
  await page.click('#btn-cancel-step-modal');
  assert.equal(await page.locator('#vt-step-modal').isVisible(), false);

  // times stay in order
  const times = (await day2()).map(s => s.hour * 60 + s.minute);
  assert.deepEqual(times, [...times].sort((x, y) => x - y));
  await context.close();
});

test('rebuilding after the days change keeps edited and added stops; Reset plan drops them', async () => {
  const { context, page } = await newPhone(env.browser);
  await openEditor(page);
  const t0 = (await stored(page))[0];
  const target = dayOf(t0, 1)[1];

  await card(page, target.title).getByRole('button', { name: 'Edit stop' }).click();
  await page.fill('#vt-step-title', 'My own plan for the morning');
  await page.click('#btn-save-vt-step');
  await page.locator('button[onclick="addVirtualTripStep(2)"]').click();
  await page.fill('#vt-step-title', 'Family dinner');
  await page.fill('#vt-step-time', '20:30');
  await page.click('#btn-save-vt-step');

  // change the days from the setup screen, which rebuilds the plan and returns to it
  await page.click('#btn-vt-edit-setup');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await page.click('#btn-vt-stays-row');
  await page.waitForSelector('#vt-stay-modal:not(.hidden)');
  await page.click('#btn-modal-duration-plus');
  await page.click('#btn-modal-confirm-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');

  let t = (await stored(page))[0];
  assert.equal(t.duration, 3);
  assert.ok(dayOf(t, 1).some(s => s.title === 'My own plan for the morning'), 'the edit survives the rebuild');
  assert.equal(dayOf(t, 1).filter(s => s.title === target.title).length, 0, 'and it replaced the suggested stop, not duplicated it');
  assert.ok(dayOf(t, 2).some(s => s.title === 'Family dinner'), 'the added stop survives');
  assert.ok(dayOf(t, 3).length > 0, 'the new day was generated');

  // changing the start rebuilds too
  await page.click('#btn-vt-edit-setup');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await page.selectOption('#vt-origin-city', 'mumbai');
  t = (await stored(page))[0];
  assert.ok(dayOf(t, 2).some(s => s.title === 'Family dinner'), 'still there after the start changed');

  // an added stop on a day that no longer exists goes with the day
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  await page.click('#btn-vt-reset-plan');
  t = (await stored(page))[0];
  assert.equal(t.steps.some(s => s.custom || s.edited), false, 'Reset plan returns to the suggested plan');
  assert.equal(t.steps.some(s => s.title === 'Family dinner'), false);
  await context.close();
});

test('delete a stop still works from the new controls, and the activity count follows the stops', async () => {
  const { context, page } = await newPhone(env.browser);
  await openEditor(page);
  const before = (await stored(page))[0].steps;
  const victim = before[1];
  await card(page, victim.title).getByRole('button', { name: 'Delete stop' }).click();
  const after = (await stored(page))[0].steps;
  assert.equal(after.length, before.length - 1);
  assert.equal(after.some(s => s.id === victim.id), false);
  assert.match(await page.locator('#vt-itinerary-list').innerText(), new RegExp(`${after.length} activities`));
  await context.close();
});
