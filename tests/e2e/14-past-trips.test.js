'use strict';
/**
 * Past trips: ending a trip keeps it (photos shrunk), the Trips page lists it, it can be viewed read-only,
 * planned again as a new planned trip, stripped of photos, deleted, undone right after ending, and it
 * travels inside the saved file.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launch, newPhone, seedTrip, iso } = require('./helpers');
const PT = require('../../js/past-trips.js');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

// a real, decodable 2000x1500 JPEG made in the page, so shrinking can be measured
async function bigPhoto(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1500;
    const g = c.getContext('2d');
    for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i % 40)}%)`; g.fillRect((i * 97) % 2000, (i * 61) % 1500, 300, 200); }
    return c.toDataURL('image/jpeg', 0.95);
  });
}

async function endTripWith(page, photo) {
  await seedTrip(page, env.base, {
    name: 'Goa Escape', notes: 'Carry sunscreen',
    steps: [
      { title: 'Flight to Goa', icon: 'plane', where: 'Airport', targetTime: iso(1, 7), memories: [photo] },
      { title: 'Beach at Baga', icon: 'sun', where: 'Baga, Goa', targetTime: iso(1, 12), notes: 'Sunset', attachments: [{ name: 'ticket.png', type: 'image/png', data: photo }] },
      { title: 'Stay at Hotel Sunrise', icon: 'bed-double', where: 'Goa', targetTime: iso(1, 21) },
      { title: 'Fort Aguada', icon: 'landmark', where: 'Aguada, Goa', targetTime: iso(2, 10) }
    ]
  });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-end-trip');
  await page.click('#btn-end-trip');
  await page.click('#kyt-end-skip');
  await page.waitForURL('**/virtual_trip.html');
}

test('the rules: a past trip becomes a planned trip with days, times, types and cities, and no photos or old dates', () => {
  const cities = [{ id: 'goa', name: 'Goa' }, { id: 'agra', name: 'Agra' }];
  const rec = { id: 'pt_1', name: 'Goa Escape', steps: [
    { title: 'Flight to Goa', icon: 'plane', where: 'Airport, Goa', targetTime: '2025-03-01T07:00:00', memories: ['data:x'] },
    { title: 'Stay at Hotel Sunrise', icon: 'bed-double', where: 'Goa', targetTime: '2025-03-01T21:00:00' },
    { title: 'Fort Aguada', icon: 'landmark', where: 'Aguada, Goa', targetTime: '2025-03-03T10:30:00', attachments: [{ data: 'data:y' }] }] };
  const t = PT.planFromRecord(rec, cities, 111);
  assert.equal(t.name, 'Goa Escape (again)');
  assert.deepEqual(t.cities, ['goa']);
  assert.deepEqual(t.steps.map(s => [s.dayId, s.type, s.hour, s.minute]), [[1, 'travel', 7, 0], [1, 'stay', 21, 0], [2, 'stop', 10, 30]]);
  assert.deepEqual(t.days, [{ id: 1, cityId: 'goa' }, { id: 2, cityId: 'goa' }]);
  assert.equal(t.duration, 2);
  assert.doesNotMatch(JSON.stringify(t), /data:|2025/, 'no photos, no old dates');
  assert.equal(t.originCity, 'already_there');
});

test('a trip that was planned here keeps its origin, cities and step types, instead of guessing from the text (D13)', () => {
  const cities = [{ id: 'goa', name: 'Goa' }, { id: 'hampi', name: 'Hampi' }, { id: 'bengaluru', name: 'Bengaluru' }];
  const rec = { id: 'pt_2', name: 'South', steps: [
    { title: 'Overnight bus', icon: 'map-pin', where: 'KSRTC stand', type: 'travel', cityName: 'Hampi', originCity: 'bengaluru', targetTime: '2025-03-01T22:00:00' },
    { title: 'Virupaksha Temple', icon: 'landmark', where: 'Temple Road', type: 'stop', cityName: 'Hampi', targetTime: '2025-03-02T09:00:00' },
    { title: 'Sunset', icon: 'sun', where: 'Anegundi', type: 'stop', cityName: 'Goa', targetTime: '2025-03-03T17:00:00' }] };
  const t = PT.planFromRecord(rec, cities, 5);
  assert.equal(t.originCity, 'bengaluru', 'the origin comes back');
  assert.deepEqual(t.cities, ['hampi', 'goa'], 'cities from the plan, not from words in the text');
  assert.equal(t.steps[0].type, 'travel', 'a travel step stays travel even with a plain icon');
  assert.deepEqual(t.days.map(d => d.cityId), ['hampi', 'hampi', 'goa']);
});

test('starting a planned trip records each step\'s type and city, and the origin on the first step (D13)', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  const out = await page.evaluate(() => {
    const trip = { originCity: 'delhi', steps: [
      { id: 'a', dayId: 1, type: 'travel', cityName: 'Agra', title: 'Train', hour: 6, minute: 0 },
      { id: 'b', dayId: 1, type: 'stop', cityName: 'Agra', title: 'Taj', hour: 9, minute: 0 }] };
    return KYT.ui.buildLiveSteps(trip, new Date(2026, 5, 1)).map(s => [s.type, s.cityName, s.originCity || '']);
  });
  assert.deepEqual(out, [['travel', 'Agra', 'delhi'], ['stop', 'Agra', '']]);
  await context.close();
});

test('summary and sizes', () => {
  const rec = { steps: [{ targetTime: '2025-03-01T07:00:00', memories: ['a', { photo: 'b' }], attachments: [{ data: 'c' }] }, { targetTime: '2025-03-02T07:00:00' }] };
  const s = PT.summarise(rec);
  assert.equal(s.steps, 2); assert.equal(s.days, 2); assert.equal(s.photos, 3);
  assert.equal(PT.bytesLabel(500), '1 KB'); assert.equal(PT.bytesLabel(4.2 * 1024 * 1024), '4.2 MB');
  assert.equal(PT.validRecord({ id: 'x', steps: [{ targetTime: 'nope' }] }), false);
});

test('ending a trip keeps it in Past trips with photos shrunk, and the live trip is cleared', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  const photo = await bigPhoto(page);
  await endTripWith(page, photo);
  await page.waitForSelector('#vt-past [data-past-id]');
  assert.match(await page.locator('#vt-past').innerText(), /past trips \(1\)[\s\S]*Goa Escape[\s\S]*4 steps[\s\S]*2 photos/i);
  const r = await page.evaluate(async () => {
    const [rec] = await KYT.pastTrips.all();
    await KYT.store.loadData();
    return { name: rec.name, steps: rec.steps.length, small: rec.steps[0].memories[0].length, ticket: rec.steps[1].attachments[0].data.length, live: KYT.store.get().stepsData.length };
  });
  assert.equal(r.name, 'Goa Escape'); assert.equal(r.steps, 4); assert.equal(r.live, 0);
  assert.ok(r.small < photo.length * 0.6, `photo shrunk: ${r.small} vs ${photo.length}`);
  await context.close();
});

test('Undo right after ending puts the trip back as the live trip', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await endTripWith(page, await bigPhoto(page));
  await page.waitForSelector('#kyt-past-toast');
  assert.match(await page.locator('#kyt-past-toast').innerText(), /moved to Past trips[\s\S]*Undo/);
  await page.click('#kyt-past-toast button');
  await page.waitForFunction(() => /live again/.test((document.getElementById('kyt-past-toast') || {}).textContent || ''));
  const live = await page.evaluate(async () => { await KYT.store.loadData(); return { n: KYT.store.get().stepsData.length, name: KYT.store.get().tripName, past: (await KYT.pastTrips.all()).length }; });
  assert.deepEqual(live, { n: 4, name: 'Goa Escape', past: 0 });
  await context.close();
});

test('View, Plan this again, Remove photos and Delete work from the Past trips list', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await endTripWith(page, await bigPhoto(page));
  await page.waitForSelector('#vt-past [data-past-id]');

  await page.click('[data-past-act="view"]');
  const view = await page.locator('#kyt-past-view').innerText();
  assert.match(view, /Goa Escape[\s\S]*DAY 1[\s\S]*Flight to Goa[\s\S]*Sunset[\s\S]*DAY 2[\s\S]*Fort Aguada/);
  assert.equal(await page.locator('#kyt-past-view img').count(), 1, 'the shrunk photo shows');
  await page.click('#kyt-past-view [data-past-close]');

  await page.click('[data-past-act="again"]');
  await page.waitForFunction(() => /is in your trips/.test((document.getElementById('kyt-past-toast') || {}).textContent || ''));
  const vt = await page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips')));
  assert.equal(vt.length, 1); assert.equal(vt[0].name, 'Goa Escape (again)');
  assert.equal(vt[0].steps.length, 4); assert.equal(vt[0].days.length, 2);
  assert.match(await page.locator('#vt-list').innerText(), /Goa Escape \(again\)/, 'it appears in the trip list straight away');

  await page.click('[data-past-act="photos"]');
  await page.waitForFunction(() => !document.querySelector('[data-past-act="photos"]'));
  const after = await page.evaluate(async () => (await KYT.pastTrips.all())[0].steps.map(s => (s.memories || []).length + (s.attachments || []).length));
  assert.deepEqual(after, [0, 0, 0, 0]);
  assert.match(await page.locator('#vt-past').innerText(), /0 photos/);

  await page.click('[data-past-act="delete"]');
  await page.waitForFunction(() => !document.querySelector('[data-past-id]'));
  assert.equal(await page.evaluate(async () => (await KYT.pastTrips.all()).length), 0);
  await context.close();
});

test('past trips travel in the saved file and come back when it is opened on a new device', async () => {
  const a = await newPhone(env.browser);
  await a.page.goto(env.base + '/virtual_trip.html');
  await endTripWith(a.page, await bigPhoto(a.page));
  await a.page.click('[data-kyt-backup]');
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#kyt-backup-download')]);
  await dl.saveAs('/tmp/kyt-past-test.kyt');
  assert.equal(JSON.parse(fs.readFileSync('/tmp/kyt-past-test.kyt', 'utf8')).pastTrips.length, 1);
  await a.context.close();

  const b = await newPhone(env.browser);
  await b.page.goto(env.base + '/virtual_trip.html');
  await b.page.click('[data-kyt-backup]');
  await b.page.setInputFiles('#kyt-backup-file', '/tmp/kyt-past-test.kyt');
  await b.page.waitForFunction(() => /Opened/.test(document.getElementById('kyt-backup-msg').textContent));
  assert.match(b.page.dialogs.join('\n'), /Past trips: 1/);
  await b.page.goto(env.base + '/virtual_trip.html');
  await b.page.waitForSelector('#vt-past [data-past-id]', { state: 'attached' });
  assert.match(await b.page.locator('#vt-past').innerText(), /past trips \(1\)/i, 'listed, collapsed until opened');
  await b.page.click('[data-past-toggle]');
  await b.page.waitForSelector('#vt-past [data-past-id]', { state: 'visible' });
  assert.match(await b.page.locator('#vt-past').innerText(), /Goa Escape/);
  await b.context.close();
});

test('if the device has no room to keep the trip, the person is asked before it is lost', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await seedTrip(page, env.base, { name: 'Full', steps: [{ title: 'A', icon: 'map-pin', where: 'X', targetTime: iso(1, 9) }] });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-end-trip');
  await page.evaluate(() => { KYT.store.setRaw = async () => { throw new Error('quota'); }; });
  let asked = '';
  page.removeAllListeners('dialog');
  page.on('dialog', d => { asked = d.message(); d.dismiss(); });
  await page.click('#btn-end-trip');
  await page.click('#kyt-end-skip');
  await page.waitForTimeout(600);
  assert.match(asked, /not enough space to keep this trip/);
  assert.equal(await page.evaluate(async () => { await KYT.store.loadData(); return KYT.store.get().stepsData.length; }), 1, 'declining keeps the live trip');
  await context.close();
});

test('D13: a past trip can be saved as the same journal PDF a live trip gets', async () => {
  const { context, page } = await newPhone(env.browser, { realPdf: true });
  await page.goto(env.base + '/virtual_trip.html');
  await endTripWith(page, await bigPhoto(page));
  await page.waitForSelector('#vt-past [data-past-id]');
  await page.click('[data-past-act="view"]');
  await page.waitForFunction(() => typeof pdfMake === 'object' || typeof pdfMake === 'function');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#kyt-past-view [data-past-pdf]')]);
  assert.match(dl.suggestedFilename(), /goa_escape_journal\.pdf/);
  await dl.saveAs('/tmp/kyt-past.pdf');
  const raw = fs.readFileSync('/tmp/kyt-past.pdf').toString('latin1');
  assert.ok(raw.startsWith('%PDF'));
  try { const t = require('node:child_process').execFileSync('pdftotext', ['/tmp/kyt-past.pdf', '-']).toString(); assert.match(t, /Fort Aguada/); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await context.close();
});
