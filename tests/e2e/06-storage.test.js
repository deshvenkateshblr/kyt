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
  assert.match(await a.page.locator('#kyt-backup-msg').innerText(), /Saved: 2 cities, 1 virtual trip,/);
  await a.context.close();

  // brand-new device
  const c = await newPhone(env.browser);
  await c.page.goto(env.base + '/index.html');
  await c.page.click('[data-kyt-backup]');
  await c.page.setInputFiles('#kyt-backup-file', file);
  await c.page.waitForFunction(() => /Opened/.test(document.getElementById('kyt-backup-msg').textContent));
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

test('End Trip moves the trip to Past trips and offers a saved file first: cancel keeps the trip, the file downloads then ends', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { name: 'Goa Escape', steps: [{ title: 'Flight', icon: 'plane', where: 'Airport', targetTime: iso(1, 7) }] });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-end-trip');
  await page.click('#btn-end-trip');
  assert.match(await page.locator('#kyt-end-sheet').innerText(), /moves it to Past trips[\s\S]*End trip[\s\S]*Save a file first, then end it[\s\S]*Keep my trip/);
  await page.click('#kyt-end-cancel');
  assert.equal(await page.locator('#kyt-end-sheet').count(), 0);
  assert.equal(await page.evaluate(async () => { await KYT.store.loadData(); return KYT.store.get().stepsData.length; }), 1);
  await page.click('#btn-end-trip');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#kyt-end-backup')]);
  assert.match(dl.suggestedFilename(), /^kyt-saved-\d{4}-\d{2}-\d{2}\.kyt$/);
  await dl.saveAs('/tmp/kyt-test-end.json');
  assert.equal(JSON.parse(fs.readFileSync('/tmp/kyt-test-end.json', 'utf8')).activeTrip.name, 'Goa Escape');
  await page.waitForURL('**/virtual_trip.html');
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
  assert.match(await page.locator('#kyt-toast').innerText(), /could not be saved[\s\S]*no room left[\s\S]*Save now/);
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

test('the home page and the trip editor both link to Save and Open', async () => {
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
  assert.match((await page.locator('#kyt-feedback-footer').innerText()).trim(), /^Feedback: info@vividnova\.com · v\d+ · Refresh app$/);
  await page.evaluate(() => PassportStore.unlockCity('agra'));
  await page.reload(); await page.waitForSelector('#cards-container h3');
  assert.equal(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('kyt_passport'))).join()), 'agra', 'stamp survives a reload');
  await page.evaluate(() => KYT.backup.openSheet());
  await page.waitForSelector('#kyt-backup-sheet');
  await page.click('#kyt-backup-sheet summary');
  const txt = await page.locator('#kyt-backup-sheet').innerText();
  assert.match(txt, /About this device[\s\S]*✓ Settings and passport storage works[\s\S]*✓ Trip storage works[\s\S]*1 city stamped here/);
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
  await page.evaluate(() => { document.querySelector('.k-fold').open = true; });
  assert.match(await page.locator('.k-device-note').first().innerText(), /Already using KYT in Safari\?[\s\S]*Save or open your trips/);
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
    assert.equal((await page.locator('#kyt-version').innerText()).match(/^v(\d+)/)[1], sw, `${f}: footer version must equal sw.js (bump both together)`);
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

// ── Save and Open: tracking, the toolbar button, the nudge, the phone share sheet ─────────────────────────────

const setNow = (page, key, v) => page.evaluate(([k, x]) => localStorage.setItem(k, x), [key, v]);

test('Save tracks what changed: a dot on the toolbar Save button appears after a change and clears after saving', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#kyt-nav-save');
  assert.equal(await page.locator('#kyt-nav-save [data-kyt-save-dot]').isVisible(), false, 'nothing changed yet');
  await page.fill('#vt-new-name', 'Dot'); await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  assert.equal(await page.locator('#kyt-nav-save [data-kyt-save-dot]').isVisible(), true, 'a new trip is a change');
  await page.click('#kyt-nav-save');
  await page.waitForSelector('#kyt-backup-sheet');
  assert.match(await page.locator('#kyt-backup-sheet').innerText(), /Save & Open[\s\S]*change[\s\S]*none saved to a file yet/);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#kyt-backup-download')]);
  assert.match(dl.suggestedFilename(), /^kyt-saved-.*\.kyt$/);
  await page.waitForFunction(() => /Saved:/.test(document.getElementById('kyt-backup-msg').textContent));
  assert.equal(await page.locator('#kyt-nav-save [data-kyt-save-dot]').isVisible(), false, 'saved: the dot is gone');
  await page.click('#kyt-backup-close');
  await page.click('#kyt-nav-save');
  assert.match(await page.locator('#kyt-backup-sheet').innerText(), /Everything is saved/);
  await context.close();
});

test('the Save button is on every page that has the toolbar', async () => {
  const { context, page } = await newPhone(env.browser);
  for (const f of ['virtual_trip.html', 'curated_trips.html', 'visited.html', 'view_trip.html']) {
    await page.goto(env.base + '/' + f);
    await page.waitForSelector('#kyt-nav-save');
    assert.equal(await page.locator('#kyt-nav-save').count(), 1, f);
    assert.ok(await page.locator('#kyt-nav-save').isVisible(), f);
  }
  await context.close();
});

test('the toolbar still fits a small phone with the Save button added', async () => {
  const { context, page } = await newPhone(env.browser, { viewport: { width: 360, height: 740 } });
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#kyt-nav-save');
  const w = await page.evaluate(() => { const t = document.getElementById('main-toolbar'); return { scroll: t.scrollWidth, client: t.clientWidth, right: document.getElementById('kyt-nav-live') ? document.getElementById('kyt-nav-live').getBoundingClientRect().right : 0, vw: innerWidth }; });
  assert.ok(w.scroll <= w.client + 1, `toolbar overflows: ${JSON.stringify(w)}`);
  assert.ok(w.right <= w.vw, `right button is off screen: ${JSON.stringify(w)}`);
  await context.close();
});

test('a reminder appears once enough has changed with nothing saved, can be put off for a day, and never blocks', async () => {
  const { context, page } = await newPhone(env.browser, { nudge: true });
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#kyt-nav-save');
  await page.evaluate(() => { for (let i = 0; i < 3; i++) KYT.backup.markChanged(); });
  await page.waitForTimeout(4600);
  assert.equal(await page.locator('#kyt-save-nudge').count(), 0, '3 changes is too few to nag about');
  await page.evaluate(() => KYT.backup.markChanged());
  await page.waitForSelector('#kyt-save-nudge');
  assert.match(await page.locator('#kyt-save-nudge').innerText(), /Save a copy\?[\s\S]*only on this device/);
  assert.equal(await page.locator('#btn-vt-create').isEnabled(), true, 'the page underneath still works');
  await page.click('#kyt-nudge-later');
  assert.equal(await page.locator('#kyt-save-nudge').count(), 0);
  await page.reload(); await page.waitForTimeout(3200);
  assert.equal(await page.locator('#kyt-save-nudge').count(), 0, 'put off for a day');
  await context.close();
});

test('a reminder also appears for old unsaved changes, and saving from it clears everything', async () => {
  const { context, page } = await newPhone(env.browser, { nudge: true });
  await page.goto(env.base + '/virtual_trip.html');
  await setNow(page, 'kyt_change_count', '2');
  await setNow(page, 'kyt_changed_at', new Date(Date.now() - 5 * 86400000).toISOString());
  await page.reload();
  await page.waitForSelector('#kyt-save-nudge');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#kyt-nudge-save')]);
  assert.match(dl.suggestedFilename(), /^kyt-saved-.*\.kyt$/);
  await page.waitForFunction(() => !document.getElementById('kyt-save-nudge'));
  assert.deepEqual(await page.evaluate(() => KYT.backup.status().unsaved), false);
  await context.close();
});

test('on a phone, Save opens the share sheet (Files, Drive, WhatsApp) with a .kyt file and counts as saved', async () => {
  const { context, page } = await newPhone(env.browser, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async d => { window.__shared = { name: d.files[0].name, type: d.files[0].type, size: d.files[0].size }; };
  });
  await page.goto(env.base + '/visited.html');
  await page.evaluate(() => PassportStore.unlockCity('agra'));
  await page.evaluate(() => KYT.backup.openSheet());
  await page.click('#kyt-backup-download');
  await page.waitForFunction(() => window.__shared);
  const sh = await page.evaluate(() => window.__shared);
  assert.match(sh.name, /^kyt-saved-\d{4}-\d{2}-\d{2}\.kyt$/); assert.equal(sh.type, 'application/json', 'plain JSON inside, so chat and mail apps treat it as data'); assert.ok(sh.size > 50);
  assert.equal(await page.evaluate(() => KYT.backup.status().unsaved), false);
  await context.close();
});

test('closing the share sheet without choosing is not a save, and says so', async () => {
  const { context, page } = await newPhone(env.browser, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; };
  });
  await page.goto(env.base + '/visited.html');
  await page.evaluate(() => PassportStore.unlockCity('agra'));
  await page.evaluate(() => KYT.backup.openSheet());
  await page.click('#kyt-backup-download');
  await page.waitForFunction(() => /Not saved/.test(document.getElementById('kyt-backup-msg').textContent));
  assert.equal(await page.evaluate(() => KYT.backup.status().unsaved), true, 'still unsaved');
  await context.close();
});

test('opening a saved file counts as saved: the file and the device now match', async () => {
  const a = await newPhone(env.browser);
  await seedEverything(a.page);
  await a.page.goto(env.base + '/index.html');
  await a.page.click('[data-kyt-backup]');
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#kyt-backup-download')]);
  await dl.saveAs('/tmp/kyt-test-open.json');
  await a.context.close();
  const b = await newPhone(env.browser);
  await b.page.goto(env.base + '/index.html');
  await b.page.click('[data-kyt-backup]');
  await b.page.setInputFiles('#kyt-backup-file', '/tmp/kyt-test-open.json');
  await b.page.waitForFunction(() => /Opened/.test(document.getElementById('kyt-backup-msg').textContent));
  assert.match(b.page.dialogs.join('\n'), /Open this saved file\?/);
  assert.equal(await b.page.evaluate(() => KYT.backup.status().unsaved), false);
  await b.context.close();
});

test('Open goes by what is inside, not the file name: .kyt, .json and an oddly named file all open; other files are refused', async () => {
  const a = await newPhone(env.browser);
  await seedEverything(a.page);
  await a.page.goto(env.base + '/index.html');
  await a.page.click('[data-kyt-backup]');
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#kyt-backup-download')]);
  await dl.saveAs('/tmp/kyt-name-test.kyt');
  await a.context.close();
  fs.copyFileSync('/tmp/kyt-name-test.kyt', '/tmp/kyt-name-test.json');
  fs.copyFileSync('/tmp/kyt-name-test.kyt', '/tmp/kyt-name-test-renamed.txt');
  fs.writeFileSync('/tmp/kyt-name-test-bad.kyt', 'this is not a KYT file');
  for (const f of ['/tmp/kyt-name-test.kyt', '/tmp/kyt-name-test.json', '/tmp/kyt-name-test-renamed.txt']) {
    const b = await newPhone(env.browser);
    await b.page.goto(env.base + '/index.html');
    await b.page.click('[data-kyt-backup]');
    assert.equal(await b.page.locator('#kyt-backup-file').getAttribute('accept'), null, 'no type filter, so no phone greys the file out');
    await b.page.setInputFiles('#kyt-backup-file', f);
    await b.page.waitForFunction(() => /Opened/.test(document.getElementById('kyt-backup-msg').textContent), null, { timeout: 8000 });
    await b.context.close();
  }
  const c = await newPhone(env.browser);
  await c.page.goto(env.base + '/index.html');
  await c.page.click('[data-kyt-backup]');
  await c.page.setInputFiles('#kyt-backup-file', '/tmp/kyt-name-test-bad.kyt');
  await c.page.waitForFunction(() => /not a KYT saved file/.test(document.getElementById('kyt-backup-msg').textContent));
  await c.context.close();
});

// ── Storage meter ─────────────────────────────────────────────────────────────────────────────────────────────

const stubStorage = (usage, quota) => ({ persisted: async () => true, persist: async () => true, estimate: async () => ({ usage, quota }) });

test('the meter rule: ok under 70%, low from 70%, full from 90%, and ok when the browser will not say', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/index.html');
  const r = await page.evaluate(() => {
    const m = KYT.backup.meterInfo;
    return [m({}, 50, 100).level, m({}, 70, 100).level, m({}, 89, 100).level, m({}, 90, 100).level, m({}, null, null).level, m({ live: 1, past: 2, other: 3 }, 1, 100).mine];
  });
  assert.deepEqual(r, ['ok', 'low', 'low', 'full', 'ok', 6]);
  await context.close();
});

test('Save & Open shows what uses space: current trip, past trips, planned trips, and the share of the allowance', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(([u, q]) => { Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => true, persist: async () => true, estimate: async () => ({ usage: u, quota: q }) } }); }, [30 * 1024 * 1024, 100 * 1024 * 1024]);
  await seedEverything(page);
  await page.goto(env.base + '/index.html');
  await page.click('[data-kyt-backup]');
  await page.waitForSelector('[data-kyt-meter]');
  const txt = await page.locator('[data-kyt-meter]').innerText();
  assert.match(txt, /Space on this device/);
  assert.match(txt, /about 30% of the room[\s\S]*30\.?0? MB of 100 MB|30 MB of 100 MB/);
  assert.match(txt, /Current trip[\s\S]*Planned trips, passport and settings/);
  assert.doesNotMatch(txt, /getting full|almost full/i);
  await context.close();
});

test('the meter warns when the allowance is 70% and 90% used', async () => {
  for (const [used, word] of [[75, /Getting full/], [95, /Almost full/]]) {
    const { context, page } = await newPhone(env.browser);
    await page.addInitScript(([u, q]) => { Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => true, persist: async () => true, estimate: async () => ({ usage: u, quota: q }) } }); }, [used, 100]);
    await page.goto(env.base + '/index.html');
    await page.click('[data-kyt-backup]');
    await page.waitForSelector('[data-kyt-meter]');
    assert.match(await page.locator('[data-kyt-meter]').innerText(), word);
    await context.close();
  }
});

test('when the device is nearly full a heads-up appears on its own, once, and can be put off for days', async () => {
  const { context, page } = await newPhone(env.browser, { nudge: true });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => true, persist: async () => true, estimate: async () => ({ usage: 80, quota: 100 }) } }); });
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#kyt-space-notice');
  assert.match(await page.locator('#kyt-space-notice').innerText(), /getting full/i);
  await page.click('#kyt-space-later');
  await page.reload(); await page.waitForTimeout(4200);
  assert.equal(await page.locator('#kyt-space-notice').count(), 0, 'put off for three days');
  await context.close();
});

test('no heads-up while there is plenty of room', async () => {
  const { context, page } = await newPhone(env.browser, { nudge: true });
  await page.addInitScript(() => { Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted: async () => true, persist: async () => true, estimate: async () => ({ usage: 10, quota: 100 }) } }); });
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForTimeout(4200);
  assert.equal(await page.locator('#kyt-space-notice').count(), 0);
  await context.close();
});

// ── Open when this device already has trips (D4) ─────────────────────────────────────────────────────────
async function fileFromDevice(path) {
  const a = await newPhone(env.browser);
  await seedEverything(a.page);
  await a.page.goto(env.base + '/index.html');
  await a.page.click('[data-kyt-backup]');
  const [dl] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#kyt-backup-download')]);
  await dl.saveAs(path);
  await a.context.close();
}
async function deviceWithOwnTrips() {
  const b = await newPhone(env.browser);
  await seedTrip(b.page, env.base, { name: 'My Own Trip', notes: '', steps: [{ title: 'Own step', icon: 'sun', where: 'Here', targetTime: iso(2, 9) }] });
  await b.page.evaluate(() => {
    localStorage.setItem('kyt_passport', JSON.stringify({ agra: { date: 'mine' }, udaipur: { date: '2025-03-03' } }));
    localStorage.setItem('kyt_virtual_trips', JSON.stringify([{ id: 'own1', name: 'Own plan', originCity: 'delhi', cities: ['agra'], taste: {}, steps: null }, { id: 'v1', name: 'Rajasthan (edited here)', originCity: 'delhi', cities: ['jaipur'], taste: {}, steps: null }]));
  });
  await b.page.goto(env.base + '/index.html');
  await b.page.click('[data-kyt-backup]');
  return b;
}

test('a device with trips is offered: add the file, replace, or save first; Cancel changes nothing', async () => {
  await fileFromDevice('/tmp/kyt-test-d4a.json');
  const b = await deviceWithOwnTrips();
  await b.page.setInputFiles('#kyt-backup-file', '/tmp/kyt-test-d4a.json');
  await b.page.waitForSelector('#kyt-open-sheet');
  const txt = await b.page.locator('#kyt-open-sheet').innerText();
  assert.match(txt, /In the file[\s\S]*Goa Escape[\s\S]*On this device now[\s\S]*My Own Trip/);
  for (const id of ['merge', 'replace', 'save', 'cancel']) assert.equal(await b.page.locator('#kyt-open-' + id).count(), 1, id);
  await b.page.click('#kyt-open-cancel');
  assert.equal(await b.page.locator('#kyt-open-sheet').count(), 0);
  assert.equal(JSON.parse(await b.page.evaluate(() => localStorage.getItem('kyt_virtual_trips'))).length, 2, 'nothing changed');
  await b.context.close();
});

test('Add the file to what is here keeps your trips and current trip, and adds only what is new', async () => {
  await fileFromDevice('/tmp/kyt-test-d4b.json');
  const b = await deviceWithOwnTrips();
  await b.page.setInputFiles('#kyt-backup-file', '/tmp/kyt-test-d4b.json');
  await b.page.waitForSelector('#kyt-open-merge');
  await b.page.click('#kyt-open-merge');
  await b.page.waitForFunction(() => /Added/.test((document.getElementById('kyt-backup-msg') || {}).textContent || ''));
  const msg = await b.page.locator('#kyt-backup-msg').innerText();
  assert.match(msg, /Added 1 city, 0 virtual trips|Added 1 city/);
  assert.match(msg, /current trip was kept/i);
  const st = await b.page.evaluate(() => ({ p: JSON.parse(localStorage.getItem('kyt_passport')), v: JSON.parse(localStorage.getItem('kyt_virtual_trips')).map(t => t.name) }));
  assert.deepEqual(Object.keys(st.p).sort(), ['agra', 'goa', 'udaipur'], 'the file\'s goa was added, yours stay');
  assert.equal(st.p.agra.date, 'mine', 'a city on both keeps this device\'s entry');
  assert.deepEqual(st.v.sort(), ['Own plan', 'Rajasthan (edited here)'], 'same id keeps your version, nothing duplicated');
  await b.page.goto(env.base + '/view_trip.html');
  await b.page.waitForFunction(() => window.KYT && KYT.store);
  assert.equal(await b.page.evaluate(async () => { await KYT.store.loadData(); return KYT.store.get().tripName; }), 'My Own Trip');
  assert.equal(await b.page.evaluate(() => KYT.backup.status().unsaved), true, 'the device now differs from any file');
  await b.context.close();
});

test('Replace what is here with the file works as before, and Save first downloads a file then lets you choose', async () => {
  await fileFromDevice('/tmp/kyt-test-d4c.json');
  const b = await deviceWithOwnTrips();
  await b.page.setInputFiles('#kyt-backup-file', '/tmp/kyt-test-d4c.json');
  await b.page.waitForSelector('#kyt-open-save');
  const [dl] = await Promise.all([b.page.waitForEvent('download'), b.page.click('#kyt-open-save')]);
  assert.match(dl.suggestedFilename(), /\.kyt$/);
  await b.page.waitForFunction(() => /Saved\. Now choose/.test(document.getElementById('kyt-open-msg').textContent));
  assert.equal(await b.page.locator('#kyt-open-sheet').count(), 1, 'still asking');
  await b.page.click('#kyt-open-replace');
  await b.page.waitForFunction(() => /Opened/.test(document.getElementById('kyt-backup-msg').textContent));
  const v = await b.page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips')).map(t => t.name));
  assert.deepEqual(v, ['Rajasthan'], 'exactly the file');
  await b.context.close();
});

test('with no current trip here, Add also brings the file\'s current trip', async () => {
  await fileFromDevice('/tmp/kyt-test-d4d.json');
  const b = await newPhone(env.browser);
  await b.page.goto(env.base + '/index.html');
  await b.page.evaluate(() => localStorage.setItem('kyt_virtual_trips', JSON.stringify([{ id: 'own1', name: 'Own plan', originCity: 'delhi', cities: ['agra'], taste: {}, steps: null }])));
  await b.page.reload();
  await b.page.click('[data-kyt-backup]');
  await b.page.setInputFiles('#kyt-backup-file', '/tmp/kyt-test-d4d.json');
  await b.page.waitForSelector('#kyt-open-merge');
  await b.page.click('#kyt-open-merge');
  await b.page.waitForFunction(() => /Added/.test(document.getElementById('kyt-backup-msg').textContent));
  assert.match(await b.page.locator('#kyt-backup-msg').innerText(), /and the current trip/);
  await b.page.goto(env.base + '/view_trip.html');
  await b.page.waitForFunction(() => window.KYT && KYT.store);
  assert.equal(await b.page.evaluate(async () => { await KYT.store.loadData(); return KYT.store.get().tripName; }), 'Goa Escape');
  await b.context.close();
});

test('every release number agrees: sw.js, the footer, and the ?v= on every local script and style in every page (D11)', () => {
  const fsx = require('node:fs'), pth = require('node:path');
  const root = pth.resolve(__dirname, '..', '..');
  const sw = /CACHE_NAME = 'kyt-v(\d+)'/.exec(fsx.readFileSync(pth.join(root, 'sw.js'), 'utf8'))[1];
  const footer = /APP_VERSION = (\d+)/.exec(fsx.readFileSync(pth.join(root, 'js', 'footer.js'), 'utf8'))[1];
  assert.equal(footer, sw, 'footer.js APP_VERSION equals sw.js CACHE_NAME (run: npm run bump)');
  const odd = [];
  for (const f of fsx.readdirSync(root).filter(n => n.endsWith('.html'))) {
    const html = fsx.readFileSync(pth.join(root, f), 'utf8');
    for (const m of html.matchAll(/(?:src|href)="((?:\.\/)?[a-zA-Z0-9_\/.-]+\.(?:js|css))\?v=(\d+)"/g)) if (m[2] !== sw) odd.push(`${f}: ${m[1]} ?v=${m[2]}`);
  }
  assert.deepEqual(odd, [], 'every ?v= equals the app version (run: npm run bump)');
});

test('the bump command changes all three places together', () => {
  const { execFileSync } = require('node:child_process'), fsx = require('node:fs'), pth = require('node:path'), os = require('node:os');
  const root = pth.resolve(__dirname, '..', '..');
  const tmp = fsx.mkdtempSync(pth.join(os.tmpdir(), 'kyt-bump-'));
  try {
    fsx.mkdirSync(pth.join(tmp, 'js')); fsx.mkdirSync(pth.join(tmp, 'scripts'));
    fsx.writeFileSync(pth.join(tmp, 'sw.js'), "const CACHE_NAME = 'kyt-v7';\n");
    fsx.writeFileSync(pth.join(tmp, 'js', 'footer.js'), 'const APP_VERSION = 7;\n');
    fsx.writeFileSync(pth.join(tmp, 'a.html'), '<script src="./js/x.js?v=3"></script><script src="js/y.js?v=9"></script><link href="./css/z.css?v=1"><script src="https://cdn.example.com/p.js?v=2"></script>');
    fsx.copyFileSync(pth.join(root, 'scripts', 'bump-version.js'), pth.join(tmp, 'scripts', 'bump-version.js'));
    execFileSync('node', [pth.join(tmp, 'scripts', 'bump-version.js')]);
    assert.match(fsx.readFileSync(pth.join(tmp, 'sw.js'), 'utf8'), /kyt-v8/);
    assert.match(fsx.readFileSync(pth.join(tmp, 'js', 'footer.js'), 'utf8'), /APP_VERSION = 8/);
    const html = fsx.readFileSync(pth.join(tmp, 'a.html'), 'utf8');
    assert.match(html, /x\.js\?v=8/); assert.match(html, /y\.js\?v=8/); assert.match(html, /z\.css\?v=8/);
    assert.match(html, /p\.js\?v=2"/, 'another site\'s file is left alone');
  } finally { fsx.rmSync(tmp, { recursive: true, force: true }); }
});

test('the internal Maps audit page is no longer shipped (D17)', () => {
  const fsx = require('node:fs'), pth = require('node:path');
  assert.equal(fsx.existsSync(pth.resolve(__dirname, '..', '..', 'testgmap.html')), false);
});

// ── Share worker: the code has a day anchor and is checked for a clash (D15) ─────────────────────────────
test('a share code is 6 characters: 2 for the day, 4 random, and the day part changes with the date (D15)', async () => {
  const { pathToFileURL } = require('node:url'), pth = require('node:path');
  const W = await import(pathToFileURL(pth.resolve(__dirname, '..', '..', 'cloudflare-worker', 'worker.js')).href);
  const d1 = Date.UTC(2026, 10, 7, 12), d2 = Date.UTC(2026, 10, 8, 12);
  const a = W.makeCode(d1), b = W.makeCode(d1), c = W.makeCode(d2);
  for (const x of [a, b, c]) assert.match(x, /^[0-9a-z]{6}$/);
  assert.equal(a.slice(0, 2), b.slice(0, 2), 'same day, same anchor');
  assert.notEqual(a.slice(0, 2), c.slice(0, 2), 'next day, next anchor');
  assert.equal(parseInt(c.slice(0, 2), 36) - parseInt(a.slice(0, 2), 36), 1);
  assert.equal(W.makeCode(Date.UTC(2024, 0, 1)).slice(0, 2), '00', 'the count starts at 2024-01-01');
  const seen = new Set(Array.from({ length: 2000 }, () => W.makeCode(d1).slice(2)));
  assert.ok(seen.size > 1900, 'the random part varies: ' + seen.size);
});

test('the random part has no bias, and a code already in use is never handed out again', async () => {
  const { pathToFileURL } = require('node:url'), pth = require('node:path');
  const W = await import(pathToFileURL(pth.resolve(__dirname, '..', '..', 'cloudflare-worker', 'worker.js')).href);
  // every byte value 0..255 once: bytes at or above 252 must be skipped, the rest map evenly onto 36 letters
  const all = Array.from({ length: 256 }, (_, i) => i);
  let pos = 0;
  const feed = n => { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = all[pos++ % 256]; return out; };
  const counts = {};
  for (let i = 0; i < 63; i++) for (const ch of W.makeCode(Date.UTC(2026, 0, 1), feed).slice(2)) counts[ch] = (counts[ch] || 0) + 1;
  const vals = Object.values(counts);
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 2, 'even use of every letter: ' + JSON.stringify(counts));
  // a store that already holds the first two codes it would hand out
  const first = W.makeCode(Date.UTC(2026, 0, 1), () => Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]));
  const taken = new Set([first]);
  let seq = 0;
  const rand = n => Uint8Array.from({ length: n }, (_, i) => (seq === 0 ? i : 40 + (i % 5)));
  const kv = { async get(k) { if (taken.has(k)) { seq++; return '{}'; } return null; } };
  const got = await W.freeCode(kv, Date.UTC(2026, 0, 1), rand);
  assert.ok(got && !taken.has(got), 'skipped the taken code: ' + got);
  const full = { async get() { return '{}'; } };
  assert.equal(await W.freeCode(full, Date.now()), null, 'gives up cleanly when nothing is free');
});
