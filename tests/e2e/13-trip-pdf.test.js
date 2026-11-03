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
