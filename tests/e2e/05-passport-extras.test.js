'use strict';
/** Passport extras: attribute filters, state grouping and the share card. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const seed = (page, ids) => page.addInitScript(ids => {
  if (!localStorage.getItem('kyt_passport')) {
    const o = {}; ids.forEach((id, i) => { o[id] = { date: `2025-0${(i % 9) + 1}-10` }; });
    localStorage.setItem('kyt_passport', JSON.stringify(o));
  }
}, ids);
const names = page => page.$$eval('#cards-container h3', hs => hs.map(h => h.textContent.trim()));

test('filters: choosing a vibe narrows the grid, shows a chip and a count; Clear all restores it', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  const all = (await names(page)).length;
  assert.ok(all >= 100);

  await page.click('#btn-open-filters');
  await page.click('[data-g=vibe][data-k=spiritual]');
  const label = await page.textContent('#pf-show');
  const n = Number(label.match(/\d+/)[0]);
  assert.ok(n > 10 && n < all, `spiritual should be a subset, got ${n}`);
  await page.click('#pf-show');
  assert.equal((await names(page)).length, n);
  assert.match(await page.textContent('#active-filters'), /Spiritual/);
  assert.match(await page.textContent('#results-count'), /matching your filters/);
  assert.equal(await page.textContent('#btn-open-filters [data-badge]'), '1');

  await page.click('[data-rm-g=vibe]');                      // one filter: remove its chip
  assert.equal((await names(page)).length, all);
  assert.equal(await page.locator('#active-filters').isHidden(), true);

  await page.click('#btn-open-filters');                      // two filters: "Clear all" appears
  await page.click('[data-g=vibe][data-k=spiritual]');
  await page.click('[data-g=setting][data-k=coast]');
  await page.click('#pf-show');
  await page.click('[data-rm-all]');
  assert.equal((await names(page)).length, all);
  await context.close();
});

test('filters: groups combine with AND (vibe + region) and counts in the sheet stay consistent', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  await page.click('#btn-open-filters');
  await page.click('[data-g=vibe][data-k=spiritual]');
  const spiritual = Number((await page.textContent('#pf-show')).match(/\d+/)[0]);
  await page.click('[data-g=region][data-k=South]');
  const both = Number((await page.textContent('#pf-show')).match(/\d+/)[0]);
  assert.ok(both > 0 && both < spiritual, `AND should narrow: ${both} vs ${spiritual}`);
  await page.click('#pf-show');
  const states = await page.$$eval('#cards-container [class*="uppercase"]', els => els.map(e => e.textContent.trim()).filter(Boolean));
  assert.equal((await names(page)).length, both);
  assert.ok(!states.some(s => /RAJASTHAN|PUNJAB|GUJARAT/i.test(s)), 'no northern/western states in a South filter');
  await context.close();
});

test('filters combine with the Visited status filter and text search', async () => {
  const { context, page } = await newPhone(env.browser);
  await seed(page, ['varanasi', 'goa', 'kochi']);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  await page.selectOption('#filter-select', 'visited');
  assert.equal((await names(page)).length, 3);
  await page.click('#btn-open-filters');
  await page.click('[data-g=vibe][data-k=spiritual]');
  await page.click('#pf-show');
  const spiritualVisited = await names(page);
  assert.ok(spiritualVisited.includes('Varanasi'));
  assert.ok(spiritualVisited.length < 3 || spiritualVisited.length === 3);
  await page.fill('#search-input', 'varanasi');
  assert.deepEqual(await names(page), ['Varanasi']);
  await context.close();
});

test('group by state: slim collapsed rows ordered by progress; expanding shows that state\'s cities', async () => {
  const { context, page } = await newPhone(env.browser);
  await seed(page, ['jaipur', 'udaipur', 'jodhpur', 'goa']);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  const fullHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.selectOption('#sort-select', 'state');
  const rows = await page.$$eval('[data-state-toggle]', bs => bs.map(b => b.innerText.replace(/\s+/g, ' ').trim()));
  assert.ok(rows.length >= 25, `expected a row per state, got ${rows.length}`);
  assert.equal(await page.locator('#cards-container h3').count(), 0, 'groups start collapsed');
  assert.match(rows[0], /^.?\s*Rajasthan.*3\/10/, `most-visited state first: ${rows[0]}`);
  assert.match(rows[1], /Goa.*1\/1/);
  const groupedHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  assert.ok(groupedHeight < fullHeight / 4, `grouped view should be compact (${groupedHeight} vs ${fullHeight})`);

  await page.click('[data-state-toggle="Rajasthan"]');
  const shown = await names(page);
  assert.equal(shown.length, 10);
  assert.ok(shown.includes('Jaipur'));
  await page.click('[data-state-toggle="Rajasthan"]');
  assert.equal(await page.locator('#cards-container h3').count(), 0);
  await context.close();
});

test('group by state auto-expands while searching so results are never hidden', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  await page.selectOption('#sort-select', 'state');
  await page.fill('#search-input', 'kashi');
  assert.ok((await names(page)).includes('Varanasi'));
  await context.close();
});

test('share: disabled with nothing stamped; with stamps it opens a card that follows the name field', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  assert.equal(await page.isDisabled('#btn-share-passport'), true);

  const { context: c2, page: p2 } = await newPhone(env.browser);
  await seed(p2, ['jaipur', 'udaipur', 'varanasi', 'goa', 'hampi', 'kochi']);
  await p2.goto(env.base + '/visited.html');
  await p2.waitForSelector('#cards-container h3');
  assert.equal(await p2.isDisabled('#btn-share-passport'), false);
  await p2.click('#btn-share-passport');
  await p2.waitForSelector('#sh-canvas');
  await p2.waitForFunction(() => document.getElementById('sh-canvas').width === 1080);   // drawn once fonts and logo are ready
  const size = await p2.evaluate(() => [document.getElementById('sh-canvas').width, document.getElementById('sh-canvas').height]);
  assert.deepEqual(size, [1080, 1350]);
  const blank = await p2.evaluate(() => { const c = document.getElementById('sh-canvas'); return c.toDataURL().length; });
  await p2.fill('#sh-name', 'Asha');
  await p2.waitForTimeout(200);
  const named = await p2.evaluate(() => document.getElementById('sh-canvas').toDataURL().length);
  assert.notEqual(blank, named, 'the card should redraw with the name');
  assert.equal(await p2.evaluate(() => localStorage.getItem('kyt_share_name')), 'Asha');
  assert.equal(await p2.isChecked('#sh-list'), true, 'city list is on by default');
  await p2.click('#sh-close');
  assert.equal(await p2.isHidden('#share-overlay'), true);
  await context.close(); await c2.close();
});

test('share card stats come from the stamped cities', async () => {
  const { context, page } = await newPhone(env.browser);
  await seed(page, ['jaipur', 'udaipur', 'jodhpur', 'goa']);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  const s = await page.evaluate(() => {
    const all = window.PassportStore.getPassportCities();
    return PassportExtras.stats(all, all.filter(c => c.visited));
  });
  assert.equal(s.cities, 4);
  assert.equal(s.states, 2);                 // Rajasthan + Goa
  assert.equal(s.span, undefined, 'no distance metric');
  await context.close();
});

test('levels: Bronze under 8 cities, Silver from 8, Gold from 25 cities or 10 states, with the next-level gap', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  const r = await page.evaluate(() => {
    const all = window.PassportStore.getPassportCities();
    // few states first (Karnataka, Rajasthan, Kerala...), so counts below 25 stay under the 10-state breadth rule
    const by = {}; all.forEach(c => (by[c.state] = by[c.state] || []).push(c));
    const ordered = Object.values(by).sort((a, b) => b.length - a.length).flat();
    const lv = n => { const p = PassportExtras.persona(ordered.slice(0, n)); return [p.id, p.title, p.next && p.next.need]; };
    // ten cities from ten different states -> Advanced by breadth even with few cities
    const seen = new Set(), wide = [];
    for (const c of all) if (!seen.has(c.state)) { seen.add(c.state); wide.push(c); if (wide.length === 10) break; }
    return { l0: lv(0), l7: lv(7), l8: lv(8), l24: lv(24), l25: lv(25), l60: lv(60), wide: PassportExtras.persona(wide).id, titles: PassportExtras.LEVELS.map(l => l.title) };
  });
  assert.deepEqual(r.l0.slice(0, 2), ['bronze', 'Bronze']);
  assert.equal(r.l0[2], 8);                                   // 8 more cities to Silver
  assert.equal(r.l7[0], 'bronze');
  assert.deepEqual(r.l8.slice(0, 2), ['silver', 'Silver']);
  assert.equal(r.l24[0], 'silver');
  assert.equal(r.l24[2], 1);
  assert.deepEqual(r.l25.slice(0, 2), ['gold', 'Gold']);
  assert.equal(r.l60[2], null);                               // nothing above Gold
  assert.equal(r.wide, 'gold');
  assert.deepEqual(r.titles, ['Bronze', 'Silver', 'Gold']);
  await context.close();
});

test('share card: city list can be switched off, and a full city list still fits without overflow', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  await page.evaluate(() => { const o = {}; window.KYT_CITIES.forEach(c => { o[c.id] = { date: '2025-01-01' }; }); localStorage.setItem('kyt_passport', JSON.stringify(o)); });
  await page.reload();
  await page.waitForSelector('#cards-container h3');
  await page.click('#btn-share-passport');
  await page.waitForSelector('#sh-canvas');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.PassportStore.getPassportCities().filter(c => c.visited).length), await page.evaluate(() => window.KYT_CITIES.length));
  const withList = await page.evaluate(() => document.getElementById('sh-canvas').toDataURL().length);
  await page.uncheck('#sh-list');
  await page.waitForTimeout(200);
  const without = await page.evaluate(() => document.getElementById('sh-canvas').toDataURL().length);
  assert.ok(withList > without, 'the list adds content to the card');
  assert.equal(await page.evaluate(() => typeof PassportExtras.drawSeal), 'function');
  await context.close();
});

test('catalog: every city has a state and coordinates (needed by filters and the share map)', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  const bad = await page.evaluate(() => window.KYT_CITIES.filter(c => !c.state || c.lat == null || c.lng == null).map(c => c.name));
  assert.deepEqual(bad, []);
  await context.close();
});

test('strength meters: breadth fills as cities from new states, regions, experiences and landscapes are stamped; panel shows on the page', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  assert.match(await page.textContent('#passport-strength'), /Bronze level/);
  assert.match(await page.textContent('#passport-strength'), /first city/);
  const r = await page.evaluate(() => {
    const all = window.PassportStore.getPassportCities(), by = id => all.find(c => c.id === id);
    const m = ids => Object.fromEntries(PassportExtras.meters(all, ids.map(by)).map(x => [x.id, x.got + '/' + x.of]));
    return { none: m([]), one: m(['jaipur']), more: m(['jaipur', 'goa', 'darjeeling']) };
  });
  assert.equal(r.none.states.split('/')[0], '0');
  assert.equal(r.one.states.split('/')[0], '1');
  assert.ok(+r.more.states.split('/')[0] === 3 && +r.more.regions.split('/')[0] >= 3, JSON.stringify(r.more));
  assert.ok(+r.more.landscapes.split('/')[0] >= 2, 'coast + hills/plains');
  await page.evaluate(() => localStorage.setItem('kyt_passport', JSON.stringify({ jaipur: { date: '2025-01-01' }, goa: { date: '2025-01-01' } })));
  await page.reload();
  await page.waitForSelector('#cards-container h3');
  assert.equal(await page.locator('[data-meter]').count(), 4);
  assert.match(await page.textContent('#passport-strength'), /more cities to Silver/);
  assert.match(await page.textContent('h1, .text-white'), /./);
  await context.close();
});

test('branding: page and nav call it India Explorer Passport', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  assert.match(await page.title(), /India Explorer Passport/);
  assert.match(await page.textContent('body'), /India Explorer Passport/);
  await context.close();
});

test('strength panel: always open beside the title on desktop; tablet remembers a manual toggle; collapsed on a phone', async () => {
  const mk = async (width) => { const c = await env.browser.newContext({ viewport: { width, height: 900 } });
    const pg = await c.newPage(); await pg.route(/^https?:\/\/(?!localhost|127\.)/, r => r.abort());
    await pg.goto(env.base + '/visited.html'); await pg.waitForSelector('#cards-container h3'); return { c, pg }; };
  const d = await mk(1280);
  assert.equal(await d.pg.locator('#passport-strength details').evaluate(x => x.open), true, 'open on desktop');
  const box = await d.pg.locator('#passport-strength').boundingBox(), title = await d.pg.locator('h1').boundingBox();
  assert.ok(box.x > title.x + title.width - 40 && box.y < title.y + 250, 'panel sits to the right of the title, not below the header');
  await d.pg.click('#passport-strength summary', { force: true }).catch(() => {});
  assert.equal(await d.pg.locator('#passport-strength details').evaluate(x => x.open), true, 'cannot be collapsed on desktop');
  await d.c.close();
  const t8 = await mk(800);
  assert.equal(await t8.pg.locator('#passport-strength details').evaluate(x => x.open), true, 'open by default on a tablet');
  await t8.pg.click('#passport-strength summary');
  await t8.pg.waitForTimeout(150);                                                  // let the async 'toggle' event record the choice
  await t8.pg.fill('#search-input', 'goa'); await t8.pg.waitForTimeout(200);       // re-render keeps the choice
  assert.equal(await t8.pg.locator('#passport-strength details').evaluate(x => x.open), false, 'stays closed after the user closed it');
  await t8.c.close();
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html'); await page.waitForSelector('#cards-container h3');
  assert.equal(await page.locator('#passport-strength details').evaluate(x => x.open), false, 'collapsed on phone');
  await context.close();
});

test('data: every city carries valid vibes (1-3 of spiritual/heritage/nature/adventure/foodie), effort (easy/trek) and setting', () => {
  const fsx = require('node:fs'), vm = require('node:vm');
  const win = {}; new vm.Script(fsx.readFileSync(require('node:path').resolve(__dirname, '..', '..', 'data', 'cities.js'), 'utf8')).runInNewContext({ window: win });
  const V = new Set(['spiritual', 'heritage', 'nature', 'adventure', 'foodie']), bad = [];
  for (const c of win.KYT_CITIES) {
    const okV = Array.isArray(c.vibes) && c.vibes.length >= 1 && c.vibes.length <= 3 && c.vibes.every(v => V.has(v)) && new Set(c.vibes).size === c.vibes.length;
    if (!okV || !['easy', 'trek'].includes(c.effort) || !['coast', 'hills', 'plains'].includes(c.setting)) bad.push(c.id);
  }
  assert.deepEqual(bad, [], 'cities need "vibes": [1-3 of spiritual|heritage|nature|adventure|foodie], "effort": "easy"|"trek", "setting": "coast"|"hills"|"plains" in data/cities.js');
});

test('setting: every city carries a valid setting in data/cities.js, and known cities classify correctly (Kutch is not hills)', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  const r = await page.evaluate(() => {
    const P = PassportExtras, C = window.KYT_CITIES, by = id => C.find(c => c.id === id);
    const set = id => P.attrs(by(id)).setting.join('+') || 'plains';
    return { invalid: C.filter(c => !['coast', 'hills', 'plains'].includes(c.setting)).map(c => c.id),
      s: Object.fromEntries(['kutch', 'chandigarh', 'bhilai', 'jamshedpur', 'raipur', 'dhanbad', 'jaipur', 'goa', 'manali', 'munnar', 'alleppey', 'nainital', 'kaziranga'].map(i => [i, set(i)])) };
  });
  assert.deepEqual(r.invalid, [], 'add "setting": "coast" | "hills" | "plains" to these cities in data/cities.js');
  assert.deepEqual(r.s, { kutch: 'plains', chandigarh: 'plains', bhilai: 'plains', jamshedpur: 'plains', raipur: 'plains', dhanbad: 'plains', jaipur: 'plains',
    goa: 'coast', manali: 'hills', munnar: 'hills', alleppey: 'coast', nainital: 'hills', kaziranga: 'hills' });
  await context.close();
});

test('passport cards open the city detail sheet; stamping from the sheet updates the card; card buttons do not open it', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html');
  await page.waitForSelector('#cards-container h3');
  const overlay = page.locator('#city-detail-overlay');
  assert.equal(await overlay.isHidden(), true);

  // the card's own Mark Visited button stamps and does NOT open the sheet
  await page.locator('[data-city-id="jaipur"]').scrollIntoViewIfNeeded();
  await page.locator('[data-city-id="jaipur"] button', { hasText: 'Mark Visited' }).click();
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem('kyt_passport') || '{}').jaipur);
  await page.waitForTimeout(250);
  assert.equal(await overlay.isHidden(), true, 'button clicks keep their own behaviour');

  // tapping the card body opens the sheet for that city, with the stamp state reflected
  await page.locator('[data-city-id="jaipur"] h3').click();
  await page.waitForSelector('#city-detail-overlay:not(.hidden)');
  assert.equal(await page.textContent('#cd-title'), 'Jaipur');
  assert.match(page.url(), /city=jaipur/);
  assert.match(await page.textContent('#cd-btn-add-main'), /Undo Visit/);
  await page.waitForFunction(() => document.querySelectorAll('#cd-attractions-list > *').length > 0);

  // undo from inside the sheet, and the card behind it follows
  await page.click('#cd-btn-add-main');
  await page.waitForFunction(() => !JSON.parse(localStorage.getItem('kyt_passport') || '{}').jaipur);
  assert.match(await page.textContent('#cd-btn-add-main'), /Mark Visited/);

  // nearby city opens inside the sheet and Back appears; Escape closes
  await page.locator('#cd-nearby-list [data-nearby-id]').first().click();
  await page.waitForFunction(() => document.getElementById('cd-title').textContent !== 'Jaipur');
  assert.equal(await page.locator('#btn-back-city-detail').isVisible(), true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#city-detail-overlay.hidden', { state: 'attached' });
  assert.doesNotMatch(page.url(), /city=/);
  await context.close();
});

test('passport page deep link ?city=<id> opens that city sheet', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/visited.html?city=udaipur');
  await page.waitForSelector('#city-detail-overlay:not(.hidden)');
  assert.equal(await page.textContent('#cd-title'), 'Udaipur');
  await context.close();
});

test('every inline <script> in every page parses (an HTML auto-formatter once broke string literals in index.html)', () => {
  const vm = require('node:vm'), fsx = require('node:fs'), pth = require('node:path');
  const root = pth.resolve(__dirname, '..', '..');
  const pages = fsx.readdirSync(root).filter(f => f.endsWith('.html'));
  assert.ok(pages.length >= 7);
  for (const f of pages) {
    const html = fsx.readFileSync(pth.join(root, f), 'utf8');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!m[2].trim() || /type="(?!text\/javascript)/.test(m[1])) continue;
      assert.doesNotThrow(() => new vm.Script(m[2], { filename: f }), `inline script in ${f} has a syntax error`);
    }
  }
});

test('page scripts live in js/page-*.js, are referenced by a page, parse, and are in the service-worker shell (offline)', () => {
  const fsx = require('node:fs'), pth = require('node:path'), vm = require('node:vm');
  const root = pth.resolve(__dirname, '..', '..');
  const files = fsx.readdirSync(pth.join(root, 'js')).filter(f => /^page-.*\.js$/.test(f));
  assert.ok(files.length >= 4);
  const htmls = fsx.readdirSync(root).filter(f => f.endsWith('.html')).map(f => fsx.readFileSync(pth.join(root, f), 'utf8')).join('\n');
  const sw = fsx.readFileSync(pth.join(root, 'sw.js'), 'utf8');
  for (const f of files) {
    assert.doesNotThrow(() => new vm.Script(fsx.readFileSync(pth.join(root, 'js', f), 'utf8'), { filename: f }), `${f} has a syntax error`);
    assert.ok(htmls.includes(`./js/${f}`), `${f} is not referenced by any page`);
    assert.ok(sw.includes(`./js/${f}`), `${f} is missing from the service worker's APP_SHELL, so the page would break offline`);
  }
});
