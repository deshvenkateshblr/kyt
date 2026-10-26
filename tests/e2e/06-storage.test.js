'use strict';
/** Storage safety: one backup/restore, backup before End Trip, persistence request, visible save failures. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { launch, newPhone, seedTrip, iso } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function seedEverything(page) {
  await seedTrip(page, env.base, {
    name: 'Goa Escape', notes: 'Carry sunscreen',
    steps: [
      { title: 'Flight to Goa', icon: 'plane', where: 'Airport', targetTime: iso(1, 7), memories: [{ photo: PHOTO, note: 'wheels up' }] },
      { title: 'Beach', icon: 'sun', where: 'Baga', targetTime: iso(1, 12), attachments: [{ name: 'ticket.png', type: 'image/png', data: PHOTO }] }
    ]
  });
  await page.evaluate(() => {
    localStorage.setItem('kyt_passport', JSON.stringify({ agra: { date: '2025-01-10' }, goa: { date: '2025-02-10' } }));
    localStorage.setItem('kyt_virtual_trips', JSON.stringify([{ id: 'v1', name: 'Rajasthan', originCity: 'delhi', cities: ['jaipur'], taste: {}, steps: null }]));
  });
}

test('one backup file holds passport, virtual trips and the current trip with its photos and tickets, and restores on a fresh device', async () => {
  const a = await newPhone(env.browser);
  await seedEverything(a.page);
  await a.page.goto(env.base + '/index.html');
  await a.page.click('[data-kyt-backup]');
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#kyt-backup-download')]);
  const file = '/tmp/kyt-test-backup.json';
  await dl.saveAs(file);
  const text = fs.readFileSync(file, 'utf8');
  const b = JSON.parse(text);
  assert.equal(b.kytBackup, 1);
  assert.deepEqual(Object.keys(b.passport).sort(), ['agra', 'goa']);
  assert.equal(b.virtualTrips[0].name, 'Rajasthan');
  assert.equal(b.activeTrip.name, 'Goa Escape');
  assert.equal(b.activeTrip.steps.length, 2);
  assert.match(text, /wheels up/); assert.match(text, /ticket\.png/);
  assert.match(await a.page.locator('#kyt-backup-msg').innerText(), /Saved: 2 cities, 1 virtual trips/);
  await a.context.close();

  // brand-new device
  const c = await newPhone(env.browser);
  await c.page.goto(env.base + '/index.html');
  await c.page.click('[data-kyt-backup]');
  await c.page.setInputFiles('#kyt-backup-file', file);
  await c.page.waitForFunction(() => /Restored/.test(document.getElementById('kyt-backup-msg').textContent));
  assert.match(c.page.dialogs.join('\n'), /Passport: 2 cities[\s\S]*Virtual trips: 1[\s\S]*Goa Escape/);
  await c.page.goto(env.base + '/view_trip.html');
  await c.page.waitForFunction(() => window.KYT && KYT.store);
  const state = await c.page.evaluate(async () => { await KYT.store.loadData(); const t = KYT.store.get(); return { name: t.tripName, notes: t.tripNotes, n: t.stepsData.length, att: t.stepsData[1].attachments.length, mem: JSON.stringify(t.stepsData[0]).includes('wheels up'),
    passport: Object.keys(JSON.parse(localStorage.getItem('kyt_passport'))).sort(), v: JSON.parse(localStorage.getItem('kyt_virtual_trips')).length }; });
  assert.deepEqual(state, { name: 'Goa Escape', notes: 'Carry sunscreen', n: 2, att: 1, mem: true, passport: ['agra', 'goa'], v: 1 });
  assert.deepEqual(c.page.errors, []);
  await c.context.close();
});

test('restore refuses bad files and changes nothing', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  await page.evaluate(() => localStorage.setItem('kyt_passport', JSON.stringify({ agra: { date: 'x' } })));
  const r = await page.evaluate(async () => {
    const out = [];
    for (const t of ['not json', JSON.stringify({ kytVersion: 1, tripName: 'x', steps: [] }), JSON.stringify({ kytBackup: 1, passport: [], virtualTrips: [] }), JSON.stringify({ kytBackup: 1, passport: {}, virtualTrips: [], activeTrip: { steps: [{ targetTime: 'nope' }] } })]) {
      out.push((await KYT.backup.restoreFromText(t, () => true)).reason);
    }
    return { out, passport: localStorage.getItem('kyt_passport') };
  });
  assert.match(r.out[0], /could not be read/); assert.match(r.out[1], /single-trip file/); assert.match(r.out[2], /damaged/); assert.match(r.out[3], /damaged/);
  assert.equal(r.passport, JSON.stringify({ agra: { date: 'x' } }));
  await context.close();
});

test('End Trip offers a backup first: cancel keeps the trip, backup downloads then ends', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { name: 'Goa Escape', steps: [{ title: 'Flight', icon: 'plane', where: 'Airport', targetTime: iso(1, 7) }] });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-end-trip');
  await page.click('#btn-end-trip');
  assert.match(await page.locator('#kyt-end-sheet').innerText(), /permanently deletes[\s\S]*Download backup, then end trip[\s\S]*End without a backup[\s\S]*Keep my trip/);
  await page.click('#kyt-end-cancel');
  assert.equal(await page.locator('#kyt-end-sheet').count(), 0);
  assert.equal(await page.evaluate(async () => { await KYT.store.loadData(); return KYT.store.get().stepsData.length; }), 1);
  await page.click('#btn-end-trip');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#kyt-end-backup')]);
  assert.match(dl.suggestedFilename(), /^kyt-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await dl.saveAs('/tmp/kyt-test-end.json');
  assert.equal(JSON.parse(fs.readFileSync('/tmp/kyt-test-end.json', 'utf8')).activeTrip.name, 'Goa Escape');
  await page.waitForURL('**/index.html');
  await context.close();
});

test('the browser is asked to keep KYT data (persistent storage) after the first save', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(() => {
    window.__persist = 0;
    const s = navigator.storage;
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => false, persist: async () => { window.__persist++; return true; }, estimate: async () => ({ usage: 1, quota: 100 }) } });
  });
  await seedTrip(page, env.base, { steps: [{ title: 'Flight', icon: 'plane', where: 'A', targetTime: iso(1, 7) }] });
  await page.evaluate(() => KYT.store.saveData());   // the page reload inside seedTrip reset the counter
  assert.ok(await page.evaluate(() => window.__persist) >= 1, 'navigator.storage.persist() was never called');
  await context.close();
});

test('a failed save is visible: no space left shows a clear message with a backup shortcut', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.fill('#vt-new-name', 'Too big'); await page.click('#btn-vt-create');
  await page.waitForSelector('#kyt-toast');
  assert.match(await page.locator('#kyt-toast').innerText(), /could not be saved[\s\S]*no room left[\s\S]*Back up now/);
  await page.click('#kyt-toast [data-kyt-backup]');
  await page.waitForSelector('#kyt-backup-sheet');
  await context.close();
});

test('passport writes also report a full device', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; PassportStore.unlockCity('agra'); });
  await page.waitForSelector('#kyt-toast');
  await context.close();
});

test('the home page and the trip editor both link to Back up and restore', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  assert.equal(await page.locator('.k-backup-link').isVisible(), true);
  await page.goto(env.base + '/view_trip.html');
  assert.ok(await page.locator('[data-kyt-backup]').count() >= 1);
  await context.close();
});

test('every page carries one feedback link to info@vividnova.com, added by the single js/footer.js', async () => {
  const fsx = require('node:fs'), pth = require('node:path');
  const root = pth.resolve(__dirname, '..', '..');
  const pages = fsx.readdirSync(root).filter(f => f.endsWith('.html'));
  assert.ok(pages.length >= 7);
  assert.ok(fsx.readFileSync(pth.join(root, 'sw.js'), 'utf8').includes('./js/footer.js'), 'footer.js must be in the service worker shell');
  for (const f of pages) {
    const { context, page } = await newPhone(env.browser);
    await page.goto(env.base + '/' + f);
    await page.waitForSelector('#kyt-feedback-footer a');
    assert.equal(await page.locator('#kyt-feedback-footer').count(), 1, f);
    const href = await page.locator('#kyt-feedback-footer a').first().getAttribute('href');
    assert.match(href, /^mailto:info@vividnova\.com\?subject=KYT%20feedback&body=/, f);
    assert.ok(decodeURIComponent(href).includes(f), `${f}: the page name should be in the message`);
    await context.close();
  }
});

test('footer wording, and the backup sheet reports whether storage works on this device', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#kyt-feedback-footer');
  assert.match((await page.locator('#kyt-feedback-footer').innerText()).trim(), /^Questions, comments and feedback, write to info@vividnova\.com\n/);
  await page.evaluate(() => PassportStore.unlockCity('agra'));
  await page.reload(); await page.waitForSelector('#cards-container h3');
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('kyt_passport'))).join()), 'agra', 'stamp survives a reload');
  await page.evaluate(() => KYT.backup.openSheet());
  await page.waitForSelector('#kyt-backup-sheet');
  const txt = await page.locator('#kyt-backup-sheet').innerText();
  assert.match(txt, /This device check[\s\S]*✓ Settings and passport storage works[\s\S]*✓ Trip storage works[\s\S]*1 city stamped here/);
  await context.close();
});

test('passport: floating counter appears after scrolling, counts live, and takes you back to the top', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  assert.equal(await page.locator('#passport-float').isVisible(), false, 'hidden while the header counter is on screen');
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 1500); });
  await page.waitForSelector('#passport-float', { state: 'visible' });
  assert.match(await page.locator('#passport-float').innerText(), /0\s*visited/);
  await page.locator('[onclick^="markVisited"]').first().click();
  await page.waitForFunction(() => /1\s*visited/.test(document.getElementById('passport-float').innerText));
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; });
  await page.click('#passport-float');
  await page.waitForFunction(() => window.scrollY < 5);
  await context.close();
});

test('installed app with no data explains that it is separate from Safari, once; home page warns before adding', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
  await page.goto(env.base + '/index.html');
  await page.waitForSelector('#kyt-fresh-notice');
  assert.match(await page.locator('#kyt-fresh-notice').innerText(), /separate from Safari/);
  await page.reload(); await page.waitForTimeout(800);
  assert.equal(await page.locator('#kyt-fresh-notice').count(), 0, 'shown only once');
  assert.match(await page.locator('.k-device-note').first().innerText(), /Already using KYT in Safari\?[\s\S]*Back up or restore your data/);
  await context.close();
});

test('every page prints the app version, and it matches the service worker cache name', async () => {
  const fsx = require('node:fs'), pth = require('node:path');
  const root = pth.resolve(__dirname, '..', '..');
  const sw = /CACHE_NAME = 'kyt-v(\d+)'/.exec(fsx.readFileSync(pth.join(root, 'sw.js'), 'utf8'))[1];
  const { context, page } = await newPhone(env.browser);
  for (const f of ['index.html', 'visited.html']) {
    await page.goto(env.base + '/' + f);
    await page.waitForSelector('#kyt-version');
    assert.equal((await page.locator('#kyt-version').innerText()).match(/^KYT version (\d+)/)[1], sw, `${f}: footer version must equal sw.js (bump both together)`);
  }
  await context.close();
});

test('Refresh app clears the offline cache and service worker, then reloads', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || true);
  await page.evaluate(async () => { await caches.open('kyt-v1'); });
  const [nav] = await Promise.all([page.waitForNavigation(), page.click('#kyt-refresh')]);
  assert.equal(await page.evaluate(async () => (await caches.keys()).includes('kyt-v1')), false, 'old cache removed');
  await context.close();
});
