'use strict';
/**
 * Save PDF on the trip page: the plan as a pdfMake document (cover, Before you go, the days with map links,
 * a guide per destination with When to go). The pdfMake CDN is blocked in tests, so a stand-in records the
 * document it is given; the document builder itself is also checked directly in Node.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const TRIP = {
  id: 'pdf1', name: 'Agra and Jaipur', originCity: 'delhi', cities: ['agra', 'jaipur', 'leh'], duration: 2,
  steps: [
    { id: 'a', dayId: 1, type: 'stop', cityName: 'Agra', title: 'Taj Mahal at sunrise', where: 'Taj Mahal', hour: 6, minute: 0, durationMin: 120, mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Taj%20Mahal' },
    { id: 'b', dayId: 1, type: 'travel', title: 'Travel Agra to Jaipur', from: 'Agra', to: 'Jaipur', duration: '4h 30m', hour: 14, minute: 0, mapsUrl: 'https://www.google.com/maps/dir/?api=1&origin=Agra&destination=Jaipur' },
    { id: 'c', dayId: 1, type: 'stay', cityName: 'Jaipur', title: 'Stay in Hotel Sunrise', where: 'Hotel Sunrise', hour: 21, minute: 30, checkOut: '11:00', durationMin: 30 },
    { id: 'd', dayId: 2, type: 'stop', cityName: 'Jaipur', title: 'Amber Fort', where: 'Amber', hour: 9, minute: 0, durationMin: 90 }
  ]
};

const texts = node => JSON.stringify(node);

test('the PDF document has the cover, the days with map links, and each city panel on its day, with printed source addresses', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(() => {
    window.__docs = [];
    window.pdfMake = { createPdf: doc => { window.__docs.push(doc); return { download() { window.__downloaded = true; }, getBlob(cb) { cb(new Blob(['x'])); } }; } };
  });
  await page.addInitScript(t => { try { if (!localStorage.getItem('kyt_virtual_trips')) localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, TRIP);
  await page.goto(env.base + '/trip_detail.html?id=pdf1');
  await page.waitForSelector('#btn-save-pdf');
  await page.click('#btn-save-pdf');
  await page.waitForFunction(() => window.__docs.length === 1);
  const doc = await page.evaluate(() => JSON.parse(JSON.stringify(window.__docs[0], (k, v) => typeof v === 'function' ? undefined : v)));
  const all = texts(doc.content);
  assert.match(all, /Agra and Jaipur/);
  assert.match(all, /BEFORE YOU GO/);
  assert.match(all, /closed every Friday/, 'Agra\'s Before you go item');
  assert.ok(all.indexOf('closed every Friday') < all.indexOf('DAY 2'), 'the city panel sits on the day that visits it, not at the end');
  assert.equal(all.split('closed every Friday').length - 1, 1, 'a city appears once, on its first day');
  assert.match(all, /Rest for at least 48 hours/, 'Leh\'s access note');
  assert.match(all, /"link":"https:\/\/www\.asiagracircle\.in/, 'each source is a link');
  assert.match(all, /"text":"www\.asiagracircle\.in\/tajmahal\.html"/, 'and its web address is printed, for a paper copy');
  assert.match(all, /\[1\]/, 'items point to numbered sources');
  assert.match(all, /DAY 1/); assert.match(all, /DAY 2/);
  assert.match(all, /Open in Google Maps/);
  assert.match(all, /Directions in Google Maps/);
  assert.match(all, /Check-out 11:00/);
  assert.doesNotMatch(all, /30 min/, 'a stay carries no made-up duration');
  assert.match(all, /AT A GLANCE/);
  assert.match(all, /WHEN TO GO/);
  assert.match(all, /Taj Mahal/);
  assert.doesNotMatch(all, /[→\u{1F300}-\u{1FAFF}]/u, 'no characters the PDF font lacks');
  assert.equal(await page.evaluate(() => window.__downloaded), true, 'desktop-style download is used');
  assert.equal(await page.locator('#btn-save-pdf').isEnabled(), true, 'the button is usable again');
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('on a phone the PDF goes to the share sheet, not the print dialog', async () => {
  const { context, page } = await newPhone(env.browser, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' });
  await page.addInitScript(() => {
    window.__shared = null;
    window.pdfMake = { createPdf: () => ({ download() { window.__downloaded = true; }, getBlob(cb) { cb(new Blob(['%PDF'], { type: 'application/pdf' })); } }) };
    navigator.canShare = () => true;
    navigator.share = async d => { window.__shared = { n: d.files[0].name, type: d.files[0].type }; };
    window.print = () => { window.__printed = true; };
  });
  await page.addInitScript(t => { try { if (!localStorage.getItem('kyt_virtual_trips')) localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, TRIP);
  await page.goto(env.base + '/trip_detail.html?id=pdf1');
  await page.click('#btn-save-pdf');
  await page.waitForFunction(() => window.__shared);
  assert.deepEqual(await page.evaluate(() => window.__shared), { n: 'agra_and_jaipur_plan.pdf', type: 'application/pdf' });
  assert.equal(await page.evaluate(() => !!window.__printed), false);
  assert.equal(await page.evaluate(() => !!window.__downloaded), false);
  await context.close();
});

test('without the PDF library the person gets a plain message, not a dead button', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(t => { try { if (!localStorage.getItem('kyt_virtual_trips')) localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, TRIP);
  await page.goto(env.base + '/trip_detail.html?id=pdf1');
  await page.click('#btn-save-pdf');
  await page.waitForFunction(() => document.querySelector('#btn-save-pdf').disabled === false);
  assert.ok(page.dialogs.some(d => /PDF library did not load/.test(d)), 'says what went wrong: ' + JSON.stringify(page.dialogs));
  await context.close();
});

test('the PDF script is in the offline precache', () => {
  assert.match(require('fs').readFileSync(require('path').join(__dirname, '../../sw.js'), 'utf8'), /\.\/js\/trip-pdf\.js/);
});

test('a travel month puts a Travelling in box in the PDF, with closures and weather; no month, no box', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(() => {
    window.__docs = [];
    window.pdfMake = { createPdf: doc => { window.__docs.push(doc); return { download() {}, getBlob(cb) { cb(new Blob(['x'])); } }; } };
  });
  const trip = { ...TRIP, id: 'pdf2', travelMonth: 1 };
  await page.addInitScript(t => { try { if (!localStorage.getItem('kyt_virtual_trips')) localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, trip);
  await page.goto(env.base + '/trip_detail.html?id=pdf2');
  await page.waitForSelector('#btn-save-pdf');
  await page.click('#btn-save-pdf');
  await page.waitForFunction(() => window.__docs.length === 1);
  const all = JSON.stringify(await page.evaluate(() => JSON.parse(JSON.stringify(window.__docs[0].content))));
  assert.match(all, /TRAVELLING IN JANUARY/);
  assert.match(all, /Agra in January/);
  await context.close();
  const none = await newPhone(env.browser);
  await none.page.addInitScript(() => {
    window.__docs = [];
    window.pdfMake = { createPdf: doc => { window.__docs.push(doc); return { download() {}, getBlob(cb) { cb(new Blob(['x'])); } }; } };
  });
  await none.page.addInitScript(t => { try { localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, TRIP);
  await none.page.goto(env.base + '/trip_detail.html?id=pdf1');
  await none.page.waitForSelector('#btn-save-pdf');
  await none.page.click('#btn-save-pdf');
  await none.page.waitForFunction(() => window.__docs.length === 1);
  assert.doesNotMatch(JSON.stringify(await none.page.evaluate(() => JSON.parse(JSON.stringify(window.__docs[0].content)))), /TRAVELLING IN/);
  await none.context.close();
});

test('a shared link carries the travel month and the PDF from it shows it', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(() => {
    window.__docs = [];
    window.pdfMake = { createPdf: doc => { window.__docs.push(doc); return { download() {}, getBlob(cb) { cb(new Blob(['x'])); } }; } };
  });
  await page.goto(env.base + '/trip_detail.html?trip=Shared&cities=agra,jaipur&taste=msa&origin=delhi&days=2&m=7');
  await page.waitForSelector('#btn-save-pdf');
  await page.click('#btn-save-pdf');
  await page.waitForFunction(() => window.__docs.length === 1);
  assert.match(JSON.stringify(await page.evaluate(() => JSON.parse(JSON.stringify(window.__docs[0].content)))), /TRAVELLING IN JULY/);
  await context.close();
});

// ── Hindi (Devanagari) text ──────────────────────────────────────────────────────────────────────────────
test('splitScripts and withScriptFonts mark only the Devanagari runs, keeping the rest and the layout', () => {
  const T = require('../../js/trip-pdf.js');
  assert.deepEqual(T.splitScripts('Taj Mahal'), ['Taj Mahal']);
  assert.deepEqual(T.splitScripts('ताज महल visit'), [{ text: 'ताज महल', font: 'NotoDeva' }, ' visit']);
  assert.deepEqual(T.splitScripts('Stay: होटल सूर्य, Agra'), ['Stay: ', { text: 'होटल सूर्य', font: 'NotoDeva' }, ', Agra']);
  const doc = { content: [
    { text: 'होटल', bold: true },
    { text: ['Check-in ', { text: 'सुबह', color: 'red' }, ' ok'] },
    { table: { body: [['plain', 'आगरा'], [{ text: 'x' }, { text: 'y' }]] } },
    { stack: [{ text: 'English only' }] }
  ] };
  assert.equal(T.hasDevanagari(doc), true);
  assert.equal(T.hasDevanagari({ content: [{ text: 'English only' }] }), false);
  T.withScriptFonts(doc.content);
  assert.deepEqual(doc.content[0], { text: [{ text: 'होटल', font: 'NotoDeva' }], bold: true }, 'the parent keeps bold; the run carries the font');
  assert.deepEqual(doc.content[1].text.map(x => typeof x === 'string' ? x : (x.font || x.color)), ['Check-in ', 'red', ' ok']);
  assert.deepEqual(doc.content[1].text[1], { text: [{ text: 'सुबह', font: 'NotoDeva' }], color: 'red' });
  assert.equal(doc.content[2].table.body[0][0], 'plain', 'a plain table cell is untouched');
  assert.deepEqual(doc.content[2].table.body[0][1], { text: [{ text: 'आगरा', font: 'NotoDeva' }] }, 'a Hindi cell stays a cell');
  assert.equal(doc.content[3].stack[0].text, 'English only');
});

test('with the real PDF library, a trip with Hindi in it makes a PDF that carries the Hindi text and its font', async () => {
  const { execFileSync } = require('node:child_process'), fsx = require('node:fs');
  const { context, page } = await newPhone(env.browser, { realPdf: true });
  const trip = { ...TRIP, id: 'pdfh', name: 'आगरा यात्रा', steps: TRIP.steps.concat([{ id: 'h', dayId: 2, type: 'stop', cityName: 'Jaipur', title: 'हवा महल देखना', where: 'Hawa Mahal', hour: 11, minute: 0, durationMin: 60 }]) };
  await page.addInitScript(t => { try { localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, trip);
  await page.goto(env.base + '/trip_detail.html?id=pdfh');
  await page.waitForSelector('#btn-save-pdf');
  await page.waitForFunction(() => typeof pdfMake === 'object' || typeof pdfMake === 'function');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save-pdf')]);
  const file = '/tmp/kyt-hindi-test.pdf';
  await dl.saveAs(file);
  const raw = fsx.readFileSync(file).toString('latin1');
  assert.match(raw, /NotoSansDevanagari/, 'the Hindi font is inside the PDF');
  assert.match(raw, /Roboto/, 'and the usual font for everything else');
  try {
    const text = execFileSync('pdftotext', [file, '-']).toString();
    assert.match(text, /हवा महल/);
    assert.match(text, /Taj Mahal at sunrise/);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }       // no pdftotext here: the font check above stands
  assert.deepEqual(page.errors, []);
  await context.close();
});

test('an English-only trip does not load the Hindi font', async () => {
  const { context, page } = await newPhone(env.browser, { realPdf: true });
  const asked = [];
  page.on('request', r => { if (/NotoSansDevanagari/.test(r.url())) asked.push(r.url()); });
  await page.addInitScript(t => { try { localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, TRIP);
  await page.goto(env.base + '/trip_detail.html?id=pdf1');
  await page.waitForSelector('#btn-save-pdf');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-save-pdf')]);
  await dl.saveAs('/tmp/kyt-english-test.pdf');
  assert.deepEqual(asked, []);
  await context.close();
});

test('the PDF library and the Hindi font are bundled and kept in a cache a release does not wipe', async () => {
  const fsx = require('node:fs'), pth = require('node:path');
  const root = pth.resolve(__dirname, '..', '..');
  const sw = fsx.readFileSync(pth.join(root, 'sw.js'), 'utf8');
  for (const f of ['lib/pdfmake.min.js', 'lib/vfs_fonts.js', 'lib/fonts/NotoSansDevanagari-Regular.ttf', 'lib/fonts/NotoSansDevanagari-Bold.ttf']) {
    assert.ok(fsx.existsSync(pth.join(root, f)), f + ' exists');
    assert.ok(sw.includes("'./" + f + "'"), f + ' is in the library cache list');
  }
  assert.match(sw, /k !== CACHE_NAME && k !== LIB_CACHE/, 'activate keeps the library cache');
  for (const page of ['trip_detail.html', 'virtual_trip.html', 'view_trip.html', 'configure_trip.html']) {
    const html = fsx.readFileSync(pth.join(root, page), 'utf8');
    assert.doesNotMatch(html, /cdnjs\.cloudflare\.com\/ajax\/libs\/pdfmake/, page + ' no longer needs the CDN');
  }
});

test('consecutive nights print as one stay: check-in on night 1, check-out on the last night', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.addInitScript(() => {
    window.__docs = [];
    window.pdfMake = { createPdf: doc => { window.__docs.push(doc); return { download() {}, getBlob(cb) { cb(new Blob(['x'])); } }; } };
  });
  const st = (id, dayId, extra = {}) => ({ id, dayId, type: 'stay', cityName: 'Agra', title: 'Stay in Hotel Taj', where: 'Hotel Taj', hour: 21, minute: 0, durationMin: 30, ...extra });
  const trip = { ...TRIP, id: 'pdfn', cities: ['agra'], steps: [st('n1', 1), st('n2', 2), st('n3', 3, { checkOut: '11:00' })] };
  await page.addInitScript(t => { try { localStorage.setItem('kyt_virtual_trips', JSON.stringify([t])); } catch (e) { /* about:blank */ } }, trip);
  await page.goto(env.base + '/trip_detail.html?id=pdfn');
  await page.waitForSelector('#btn-save-pdf');
  await page.click('#btn-save-pdf');
  await page.waitForFunction(() => window.__docs.length === 1);
  const all = JSON.stringify(await page.evaluate(() => JSON.parse(JSON.stringify(window.__docs[0].content))));
  assert.match(all, /Check-in 21:00/); assert.match(all, /night 1 of 3/);
  assert.match(all, /Night 2 of 3/); assert.match(all, /Night 3 of 3/); assert.match(all, /Check-out 11:00/);
  assert.equal(all.split('Check-in').length - 1, 1, 'check-in is printed once');
  await context.close();
});
