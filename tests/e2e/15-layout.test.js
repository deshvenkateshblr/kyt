'use strict';
/** Layout on very small phones, and the flat home page. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, seedTrip } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

async function at(width, url) {
  const context = await env.browser.newContext({ viewport: { width, height: 640 }, hasTouch: true });
  const page = await context.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await page.goto(env.base + url);
  return { context, page };
}

for (const width of [320, 300]) {
  test(`the top toolbar keeps every button on screen at ${width} px wide (Live was cut off)`, async () => {
    const { context, page } = await at(width, '/visited.html');
    await page.waitForSelector('#kyt-nav-live');
    const out = await page.evaluate(w => [...document.querySelectorAll('.kyt-toolbar a, .kyt-toolbar button')].map(b => {
      const r = b.getBoundingClientRect(); return { id: b.id || b.textContent.trim().slice(0, 12), l: r.left, r: r.right, w: r.width };
    }).filter(b => b.w > 0 && (b.l < 0 || b.r > w)), width);
    assert.deepEqual(out, [], 'buttons outside the screen: ' + JSON.stringify(out));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
    await context.close();
  });
}

test('home page: one solid primary action, flat rows (no card frame, no shadows), nothing overflows at 320 px', async () => {
  const { context, page } = await at(320, '/index.html');
  await page.waitForSelector('#options-container:not(.hidden) .k-option-card');
  assert.equal(await page.locator('.k-option-primary').count(), 1, 'exactly one primary action');
  assert.match(await page.locator('.k-option-primary').first().getAttribute('href'), /virtual_trip/);
  const boxes = await page.evaluate(() => ['#launch', '#options-container', '.k-menu-section', '.k-option-card:not(.k-option-primary)'].map(s => {
    const cs = getComputedStyle(document.querySelector(s)); return [s, cs.boxShadow, cs.borderLeftWidth, cs.borderRightWidth];
  }));
  for (const [s, shadow, l, r] of boxes) { assert.equal(shadow, 'none', s + ' has a shadow'); assert.equal(l + r, '0px0px', s + ' has a side border'); }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no sideways scroll');
  // the primary action is on the first screen without scrolling
  const top = await page.locator('.k-option-primary').first().evaluate(a => a.getBoundingClientRect().bottom);
  assert.ok(top < 640, 'primary action is above the fold, bottom at ' + top);
  await context.close();
});

test('home page: the install steps are folded, and the top "Add to Home Screen" link opens them', async () => {
  const { context, page } = await at(390, '/index.html');
  assert.equal(await page.locator('details.k-fold').evaluate(d => d.open), false);
  await page.click('.k-install-btn');
  assert.equal(await page.locator('details.k-fold').evaluate(d => d.open), true);
  await context.close();
});
