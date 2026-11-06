'use strict';
/** Export / import, attachments, memories album. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launch, newPhone, seedTrip, waitForSaved, iso } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const STEPS = () => ([
  { title: 'Sunrise at Taj', icon: 'landmark', where: 'Agra', targetTime: iso(1, 6), notes: 'Carry ID' },
  { title: 'Agra Fort', icon: 'landmark', where: 'Agra', targetTime: iso(1, 10) }
]);

test('export downloads a valid .json with trip name, notes and steps (no attachments)', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { name: 'Agra Weekend', notes: 'Winter trip', steps: STEPS() });
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-export-trip');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export-trip')]);
  assert.match(download.suggestedFilename(), /^agra_weekend_kyt\.json$/);
  const file = path.join(os.tmpdir(), `kyt-export-${Date.now()}.json`);
  await download.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.tripName, 'Agra Weekend');
  assert.equal(data.tripNotes, 'Winter trip');
  assert.equal(data.steps.length, 2);
  assert.equal(data.steps[0].title, 'Sunrise at Taj');
  assert.ok(!('attachments' in data.steps[0]), 'attachments are intentionally excluded');
  await context.close();
});

test('import restores a trip exported earlier into a clean device', async () => {
  const a = await newPhone(env.browser);
  await seedTrip(a.page, env.base, { name: 'Agra Weekend', notes: 'Winter trip', steps: STEPS() });
  await a.page.goto(env.base + '/configure_trip.html');
  await a.page.waitForSelector('#btn-export-trip');
  const [download] = await Promise.all([a.page.waitForEvent('download'), a.page.click('#btn-export-trip')]);
  const file = path.join(os.tmpdir(), `kyt-roundtrip-${Date.now()}.json`);
  await download.saveAs(file);
  await a.context.close();

  const b = await newPhone(env.browser);   // different "phone": empty storage
  await b.page.goto(env.base + '/configure_trip.html');
  await b.page.waitForSelector('#input-import-file', { state: 'attached' });
  await b.page.setInputFiles('#input-import-file', file);
  await b.page.waitForFunction(() => KYT.store.get().stepsData.length === 2);
  assert.ok(b.page.dialogs.some(d => /imported successfully/i.test(d)));
  assert.equal(await b.page.inputValue('#input-trip-name'), 'Agra Weekend');
  const titles = await b.page.$$eval('#config-steps-list .config-step-row p.font-bold', ps => ps.map(p => p.textContent.trim()));
  assert.deepEqual(titles, ['Sunrise at Taj', 'Agra Fort']);
  await b.context.close();
});

test('import rejects a file that is not a KYT trip', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#input-import-file', { state: 'attached' });
  const bad = path.join(os.tmpdir(), `kyt-bad-${Date.now()}.json`);
  fs.writeFileSync(bad, JSON.stringify({ hello: 'world' }));
  await page.setInputFiles('#input-import-file', bad);
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  assert.ok(page.dialogs.some(d => /invalid trip file/i.test(d)));
  assert.equal(await page.evaluate(() => KYT.store.get().stepsData.length), 0);
  await context.close();
});

test('exporting with no steps is blocked with a message', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-export-trip');
  await page.click('#btn-export-trip');
  assert.ok(page.dialogs.some(d => /add some steps/i.test(d)));
  await context.close();
});

test('a web link attachment can be added to a step and shows on the Now card', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-add-step');
  await page.click('#btn-add-step');
  await page.fill('#form-step-title', 'Hotel booking');
  await page.click('#btn-show-link-input');
  await page.fill('#form-step-link-url', 'https://drive.google.com/file/d/abc/view');
  await page.click('#btn-add-link');
  assert.match(await page.locator('#attachment-count-badge').innerText(), /1\/4/);
  await page.click('#btn-save-step');
  await page.waitForSelector('#step-form-view.hidden', { state: 'attached' });   // the form closes once the write is done (D3)

  await page.goto(env.base + '/view_trip.html');
  await page.waitForSelector('#hero-card a[href*="drive.google.com"]');
  assert.match(await page.locator('#hero-card').innerText(), /Google Drive/);
  await context.close();
});

test('attachments: a file over 2 MB is rejected, a small image is accepted', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-add-step');
  await page.click('#btn-add-step');

  await page.setInputFiles('#form-step-file', { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 1) });
  await page.waitForSelector('#attachment-error:not(.hidden)');
  assert.match(await page.locator('#attachment-error-text').innerText(), /exceeds 2 MB/);

  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#form-step-file', { name: 'ticket.png', mimeType: 'image/png', buffer: tinyPng });
  await page.waitForFunction(() => /1\/4/.test(document.getElementById('attachment-count-badge').textContent));
  await context.close();
});

test('a step allows at most 4 attachments', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/configure_trip.html');
  await page.waitForSelector('#btn-add-step');
  await page.click('#btn-add-step');
  for (let i = 0; i < 4; i++) {
    await page.click('#btn-show-link-input');
    await page.fill('#form-step-link-url', `https://example.com/doc${i}`);
    await page.click('#btn-add-link');
  }
  assert.match(await page.locator('#attachment-count-badge').innerText(), /4\/4/);
  assert.equal(await page.locator('#attachment-controls').isHidden(), true);
  await context.close();
});

test('a photo added to a step is stored as a memory on that step', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: STEPS() });
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#memory-upload-input', { name: 'p.png', mimeType: 'image/png', buffer: tinyPng });
  await page.waitForFunction(() => (KYT.store.get().stepsData[0].memories || []).length === 1, null, { timeout: 5000 });
  await waitForSaved(page);
  await page.reload();
  await page.waitForFunction(() => window.KYT && KYT.store.get().stepsData.length === 2);
  assert.equal(await page.evaluate(() => KYT.store.get().stepsData[0].memories.length), 1);
  await context.close();
});

test('finishing every step opens the celebration prompt', async () => {
  const { context, page } = await newPhone(env.browser);
  await seedTrip(page, env.base, { steps: STEPS() });
  await page.click('[data-action="toggle-done"]');
  await page.waitForFunction(() => document.getElementById('step-position-indicator').textContent === 'Step 2 of 2', null, { timeout: 4000 });
  await page.click('[data-action="toggle-done"]');
  await page.waitForSelector('#social-celebration-modal:not(.hidden)', { timeout: 4000 });
  await context.close();
});
