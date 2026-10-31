'use strict';
/**
 * Generated day plans (TODO P0.2): the builder must not contradict itself, and every generated plan
 * says it is a suggested sequence. Scenarios are the ones that exposed the problems: plains,
 * hills, a high pass and a pilgrimage with a trek.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { launch, newPhone } = require('./helpers');

let env;
before(async () => { env = await launch(); });
after(async () => { await env.browser.close(); env.server.close(); });

const SCENARIOS = [
  { name: 'Golden Triangle', origin: 'bengaluru', cities: ['delhi', 'agra', 'jaipur'], duration: 4 },
  { name: 'Kerala hills', origin: 'bengaluru', cities: ['kochi', 'munnar', 'alleppey'], duration: 4 },
  { name: 'Manali to Leh', origin: 'delhi', cities: ['manali', 'leh'], duration: 4 },
  { name: 'Haridwar, Rishikesh, Kedarnath', origin: 'delhi', cities: ['haridwar', 'rishikesh', 'kedarnath'], duration: 4 },
  { name: 'Kerala in 3 days', origin: 'bengaluru', cities: ['kochi', 'munnar', 'alleppey'], duration: 3 },
  { name: 'Varanasi and Prayagraj, already there', origin: 'already_there', cities: ['varanasi', 'prayagraj'], duration: 3 }
];

/**
 * Checks one generated plan and returns a list of problems (empty when the plan is sound).
 * Runs inside the page, so it must not use anything from this file.
 */
function auditPlan(steps) {
  const problems = [];
  const days = {};
  steps.forEach(s => { (days[s.dayId] = days[s.dayId] || []).push(s); });
  Object.keys(days).forEach(d => {
    const list = days[d];
    const label = h => `day ${d} ${String(h.hour).padStart(2, '0')}:${String(h.minute).padStart(2, '0')} "${h.title}"`;
    const seen = new Map();
    let prev = -1;
    list.forEach(s => {
      const at = s.hour * 60 + s.minute;
      const t = s.title.toLowerCase();
      const hours = at / 60;
      if (seen.has(at)) problems.push(`two steps at the same time: ${label(s)} and "${seen.get(at)}"`);
      seen.set(at, s.title);
      if (at < prev) problems.push(`steps out of order at ${label(s)}`);
      prev = at;
      if (/sunrise|dawn|early morning/.test(t) && hours > 8) problems.push(`dawn beat too late: ${label(s)}`);
      else if (/\bmorning\b/.test(t) && !/breakfast|refreshment|arrival/.test(t) && hours > 11) problems.push(`morning beat too late: ${label(s)}`);
      if (/sunset/.test(t) && (hours < 16.5 || hours > 19)) problems.push(`sunset beat off its hour: ${label(s)}`);
      if (/\bdinner\b/.test(t) && hours < 17.5) problems.push(`dinner too early: ${label(s)}`);
      if (/\blunch\b/.test(t) && (hours < 11.5 || hours > 15.5)) problems.push(`lunch off its hour: ${label(s)}`);
    });
    // A thali or biryani at 18:00 or later is a dinner; only midday meals count as lunches.
    const lunches = list.filter(s => /\blunch\b|\bsadya\b|\bthali\b|biryani/i.test(s.title) && !/dinner/i.test(s.title)
      && s.hour >= 11 && s.hour < 16);
    if (lunches.length > 1) problems.push(`day ${d} has ${lunches.length} lunches: ${lunches.map(s => s.title).join(' | ')}`);
    const ret = list.findIndex(s => /^Return Journey/.test(s.title));
    if (ret >= 0 && list.some(s => /overnight stay|night stay/i.test(s.title))) problems.push(`day ${d} has an overnight stay and a return journey`);
    if (ret >= 0 && ret !== list.length - 1) problems.push(`day ${d}: the return journey is not the last step`);
  });
  return problems;
}

async function openBuilderPage(page) {
  await page.goto(env.base + '/virtual_trip.html');
  await page.waitForSelector('#vt-new-name');
}

/** Generates each scenario with the real builder and returns { name, steps, problems }. */
async function runScenarios(page, scenarios) {
  return page.evaluate(({ scenarios, auditSrc }) => {
    const audit = new Function('return ' + auditSrc)();
    return scenarios.map(s => {
      const trip = {
        id: 't_' + s.name, name: s.name, cities: s.cities, originCity: s.origin, duration: s.duration,
        taste: { intent: 'mixed', diet: 'any', pace: 'standard' }, nightStays: {}
      };
      const steps = KYT.virtualTrips.generateSteps(trip).map(x => ({
        dayId: x.dayId, hour: x.hour, minute: x.minute, title: x.title, icon: x.icon
      }));
      return { name: s.name, steps, problems: audit(steps) };
    });
  }, { scenarios, auditSrc: auditPlan.toString() });
}

test('P0.2: the five problem scenarios generate plans with no contradictions', async () => {
  const { context, page } = await newPhone(env.browser);
  await openBuilderPage(page);
  const results = await runScenarios(page, SCENARIOS);
  for (const r of results) {
    assert.ok(r.steps.length > 10, `${r.name} generated a plan`);
    assert.deepEqual(r.problems, [], `${r.name}: ${r.problems.join('; ')}`);
  }
  await context.close();
});

test('P0.2 (a): the last day of a trip that returns home never says "Overnight Stay", and the return is the last step', async () => {
  const { context, page } = await newPhone(env.browser);
  await openBuilderPage(page);
  const [kerala, leh] = await runScenarios(page, [SCENARIOS[1], SCENARIOS[2]]);
  for (const r of [kerala, leh]) {
    const last = Math.max(...r.steps.map(s => s.dayId));
    const day = r.steps.filter(s => s.dayId === last);
    assert.match(day.at(-1).title, /^Return Journey to/, `${r.name}: the return closes the last day`);
    assert.equal(day.some(s => /overnight stay|night stay/i.test(s.title)), false, `${r.name}: no overnight stay on the way home`);
    assert.ok(day.some(s => /^Dinner in /.test(s.title)), `${r.name}: the last evening is a plain dinner`);
  }
  // A middle day still ends with a night in the hotel.
  const mid = kerala.steps.filter(s => s.dayId === 1);
  assert.ok(mid.some(s => /Overnight Stay/.test(s.title)), 'day 1 still ends with an overnight stay');
  await context.close();
});

test('P0.2 (c): sunrise and morning beats keep the morning, and a transit day does not hold them', async () => {
  const { context, page } = await newPhone(env.browser);
  await openBuilderPage(page);
  const [leh] = await runScenarios(page, [SCENARIOS[2]]);
  // Days 3 and 4 are both free days in Leh and now share its attractions (TODO P2.8), so a morning stop may land on either.
  const at = (re) => leh.steps.find(s => s.dayId >= 3 && re.test(s.title));
  const transit = leh.steps.filter(s => s.dayId === 2);
  assert.equal(transit.some(s => /sunrise|morning prayers/i.test(s.title)), false, 'the day spent driving to Leh holds no sunrise or morning prayers');
  const sunrise = at(/Shanti Stupa sunrise/);
  assert.ok(sunrise && sunrise.hour <= 8, 'Shanti Stupa sunrise is at dawn on a free day');
  const prayers = at(/Thiksey Monastery morning prayers/);
  assert.ok(prayers && prayers.hour <= 11, 'morning prayers stay in the morning');
  const lehTitles = d => leh.steps.filter(s => s.dayId === d).map(s => s.title);
  assert.equal(lehTitles(3).filter(t => /Shanti Stupa|Thiksey|Leh Palace|Hemis/.test(t) && lehTitles(4).includes(t)).length, 0, 'the two free Leh days do not repeat an attraction');
  await context.close();
});

test('P0.2 (d): a day with a lunch among its attractions does not also get a generic lunch', async () => {
  const { context, page } = await newPhone(env.browser);
  await openBuilderPage(page);
  const [kerala] = await runScenarios(page, [SCENARIOS[1]]);
  const day2 = kerala.steps.filter(s => s.dayId === 2);
  assert.equal(day2.filter(s => /lunch/i.test(s.title)).length, 1, `got: ${day2.map(s => s.title).join(' | ')}`);
  assert.equal(day2.some(s => /^Local Lunch in/.test(s.title)), false, 'Kerala sadya lunch stands in for the generic lunch');
  // A day with no lunch of its own still gets one.
  const golden = (await runScenarios(page, [SCENARIOS[0]]))[0];
  assert.ok(golden.steps.filter(s => s.dayId === 3).some(s => /Lunch in Jaipur/.test(s.title)), 'a day without a lunch beat gets the generic one');
  await context.close();
});

test('P0.2: 400 random trips (any cities, origins, night stays, tastes) never break the rules', async () => {
  const { context, page } = await newPhone(env.browser);
  await openBuilderPage(page);
  const out = await page.evaluate(({ auditSrc, count }) => {
    const audit = new Function('return ' + auditSrc)();
    let seed = 987654321;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pick = a => a[Math.floor(rnd() * a.length)];
    const ids = KYT_CITIES.map(c => c.id);
    const origins = ['already_there', 'delhi', 'bengaluru', 'mumbai', 'chennai', 'kolkata'];
    const failures = [];
    let planned = 0;
    for (let n = 0; n < count; n++) {
      const k = 1 + Math.floor(rnd() * 4);
      const cities = [];
      while (cities.length < k) { const c = pick(ids); if (!cities.includes(c)) cities.push(c); }
      const duration = k + Math.floor(rnd() * 3);
      const nightStays = {};
      for (let d = 1; d <= duration; d++) if (rnd() < 0.3) nightStays[d] = rnd() < 0.3 ? 'overnight_travel' : pick(cities);
      const trip = {
        id: 'r' + n, name: 'r', cities, originCity: pick(origins), duration, nightStays,
        taste: {
          intent: pick(['mixed', 'spiritual', 'cultural', 'heritage', 'nature', 'adventure', 'culinary', 'leisure']),
          diet: pick(['any', 'veg', 'jain', 'satvik']), pace: pick(['relaxed', 'standard', 'deep', 'short'])
        }
      };
      const steps = KYT.virtualTrips.generateSteps(trip).map(x => ({ dayId: x.dayId, hour: x.hour, minute: x.minute, title: x.title }));
      planned += steps.length;
      const problems = audit(steps);
      if (problems.length) failures.push({ cities, origin: trip.originCity, nightStays, problems });
    }
    return { planned, failures: failures.slice(0, 5), failureCount: failures.length };
  }, { auditSrc: auditPlan.toString(), count: 400 });
  assert.ok(out.planned > 4000, 'the random trips produced real plans');
  assert.equal(out.failureCount, 0, JSON.stringify(out.failures, null, 1));
  await context.close();
});

// ── The explainer on every generated plan ───────────────────────────────────
async function buildPlan(page, name, cities) {
  await openBuilderPage(page);
  await page.fill('#vt-new-name', name);
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  for (const [q, id] of cities) {
    await page.fill('#vt-city-search', q);
    await page.click(`.btn-add-city[data-id="${id}"]`);
    await page.fill('#vt-city-search', '');
  }
  await page.click('#btn-vt-dest-done');
  await page.selectOption('#vt-origin-city', 'bengaluru');
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  await page.click('#btn-vt-suggest');
  await page.click('#vt-subnav-back');
  await page.waitForURL('**/trip_detail.html*');
  await page.waitForSelector('#btn-edit-plan');
}

test('P0.2 (e): the plan page and the builder both say the sequence is suggested and to check Google Maps', async () => {
  const { context, page } = await newPhone(env.browser);
  await buildPlan(page, 'Rajasthan', [['Jaipur', 'jaipur'], ['Udaipur', 'udaipur']]);

  // plan page
  await page.waitForSelector('#refined-itinerary-section #generated-plan-notice');
  const planNotice = await page.locator('#generated-plan-notice').innerText();
  assert.match(planNotice, /not a schedule/i);
  assert.match(planNotice, /indicative/i);
  assert.match(planNotice, /Google Maps/);

  // builder
  await page.click('#btn-edit-plan');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  const builderNotice = page.locator('#vt-itinerary-list #generated-plan-notice');
  assert.equal(await builderNotice.count(), 1, 'one notice, not one per day');
  assert.match(await builderNotice.innerText(), /Google Maps/);
  await context.close();
});

test('P0.2 (e): a curated trip opened in the builder keeps its own wording and gets no generated-plan notice', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/curated_trips.html');
  await page.waitForSelector('[role="button"][title^="Click to preview"]');
  await page.click('[role="button"][title^="Click to preview"]');
  await page.waitForSelector('#modal-title:not(:empty)');
  await page.click('#btn-open-virtual-trips');
  await page.waitForURL('**/virtual_trip.html**');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  assert.equal(await page.locator('#vt-itinerary-list #generated-plan-notice').count(), 0);
  await context.close();
});

test('an interest a city cannot serve still gets sights, not a day of only meals; the notice is one quiet line', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await page.fill('#vt-new-name', 'Quiet');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await page.fill('#vt-city-search', 'Mumbai');
  await page.click('.btn-add-city[data-id="mumbai"]');
  await page.click('#btn-vt-dest-done');
  await page.selectOption('#vt-origin-city', 'already_there');
  await page.click('#btn-vt-build');
  await page.waitForSelector('#vt-screen-builder:not(.hidden)');
  await page.click('#btn-vt-style-toggle');
  await page.click('.vt-chip[data-field="intent"][data-id="spiritual"]');
  await page.click('.vt-chip[data-field="diet"][data-id="veg"]');
  await page.click('#btn-vt-suggest');
  const day1 = (await page.evaluate(() => JSON.parse(localStorage.getItem('kyt_virtual_trips'))[0].steps)).filter(s => s.dayId === 1);
  const sights = day1.filter(s => !/breakfast|lunch|dinner|refreshment/i.test(s.title));
  assert.ok(sights.length >= 2, `Day 1 has sights, got: ${day1.map(s => s.title).join(' | ')}`);
  const h = await page.locator('#generated-plan-notice').evaluate(e => e.getBoundingClientRect().height);
  assert.ok(h < 60, `notice is a quiet line or two, got ${Math.round(h)}px`);
  // the plan page says "Day-by-Day" once
  await page.click('#vt-subnav-back');
  await page.waitForSelector('#btn-edit-plan');
  const body = await page.locator('#refined-itinerary-section').innerText();
  assert.equal((body.match(/day-by-day/gi) || []).length, 1, 'one Day-by-Day heading');
  await context.close();
});

test('Mumbai has its famous temples, so a Spiritual vegetarian day is full of them', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  const titles = await page.evaluate(() => window.KYT_CITIES.find(c => c.id === 'mumbai').beats.map(b => b.title).join('|'));
  for (const t of ['Siddhivinayak', 'Mumbadevi', 'Babulnath', 'ISKCON Juhu', 'Walkeshwar', 'Radha Gopinath', 'Haji Ali Dargah & Mahalaxmi']) {
    assert.match(titles, new RegExp(t), `${t} is listed`);
  }
  const spiritual = await page.evaluate(() => window.KYT_CITIES.find(c => c.id === 'mumbai').beats.filter(b => b.intent.includes('spiritual')).length);
  assert.ok(spiritual >= 7, `got ${spiritual}`);
  await context.close();
});
