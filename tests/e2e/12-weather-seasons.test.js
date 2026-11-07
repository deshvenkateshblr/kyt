'use strict';
/**
 * js/weather-seasons.js turns a city's 12 months of weather into two or three seasons. It reads the AVERAGE of the
 * day's high and low plus rainfall, so NASA's exaggerated day-night swing cannot distort it. Pure functions: no
 * browser needed, so this file loads the module straight into Node.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const S = require(path.join(__dirname, '..', '..', 'js', 'weather-seasons.js'));

const root = path.join(__dirname, '..', '..');
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const MONTHS = S.MONTHS;

// Delhi, IMD 1991-2020 normals (Safdarjung): winter, a hot dry spring, then the monsoon.
const DELHI = {
  hi: [20.1, 24.2, 29.9, 36.5, 39.9, 39.0, 35.6, 34.2, 34.1, 33.0, 28.4, 22.8],
  lo: [7.5, 10.6, 15.6, 21.3, 25.8, 27.7, 27.5, 26.7, 25.0, 19.5, 13.0, 8.4],
  rain: [19, 21, 17, 16, 31, 74, 210, 233, 124, 15, 6, 8]
};
const covers = seasons => seasons.flatMap(s => s.months).sort((a, b) => a - b);

test('Delhi reads as winter, a hot dry stretch and the monsoon', () => {
  const s = S.summarise(DELHI);
  assert.equal(s.length, 3, s.map(x => x.text).join(' / '));
  const has = (season, ...ms) => ms.every(m => season.months.includes(m));
  const winter = s.find(x => has(x, 0, 11)), summer = s.find(x => has(x, 4, 5)), monsoon = s.find(x => has(x, 6, 7));
  assert.ok(winter && summer && monsoon && new Set([winter, summer, monsoon]).size === 3, 'three different seasons');
  assert.ok(['Cool', 'Pleasant'].includes(winter.tempLabel) && winter.rainLabel === 'dry', winter.text);
  assert.equal(summer.tempLabel, 'Hot');
  assert.equal(summer.rainLabel, 'dry');
  assert.equal(monsoon.rainLabel, 'wet');
});

test('the year is a circle: a cold Nov to Feb is one season, and the list starts with the season holding January', () => {
  const cold = [10, 11, 0, 1];
  const e = { hi: [], lo: [], rain: Array(12).fill(10) };
  for (let m = 0; m < 12; m++) { const t = cold.includes(m) ? 4 : 24; e.hi.push(t + 3); e.lo.push(t - 3); }
  const s = S.summarise(e);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].months, [10, 11, 0, 1], 'wrapped season, in calendar order');
  assert.equal(s[0].span, 'Nov to Feb');
  assert.equal(s[0].tempLabel, 'Cold');
  assert.equal(s[1].span, 'Mar to Oct');
});

test('a climate that barely changes is one season, "All year"', () => {
  const flat = { hi: Array(12).fill(31), lo: Array(12).fill(23), rain: Array(12).fill(20) };
  const s = S.summarise(flat);
  assert.equal(s.length, 1);
  assert.equal(s[0].span, 'All year');
  assert.equal(s[0].months.length, 12);
});

test('rain alone makes seasons when temperature is flat (a dry half and a wet half)', () => {
  const e = { hi: Array(12).fill(31), lo: Array(12).fill(23), rain: [5, 5, 10, 20, 60, 400, 600, 500, 300, 100, 20, 5] };
  const s = S.summarise(e);
  assert.ok(s.length >= 2);
  const wet = s.find(x => x.months.includes(6));
  assert.equal(wet.rainLabel, 'wet');
  assert.ok(s.some(x => x.rainLabel === 'dry'));
});

test('the day-night swing is ignored: only the average of high and low counts', () => {
  const widened = { ...DELHI, hi: DELHI.hi.map(h => h + 8), lo: DELHI.lo.map(l => l - 8) };    // same average, a wildly bigger swing
  const a = S.summarise(DELHI), b = S.summarise(widened);
  assert.deepEqual(b.map(x => x.text), a.map(x => x.text));
});

test('a season is never a single month, even when one month is an outlier', () => {
  const e = { hi: Array(12).fill(30), lo: Array(12).fill(20), rain: Array(12).fill(20) };
  e.hi[5] = 48; e.lo[5] = 38;                                           // one scorching June
  for (const s of S.summarise(e)) assert.ok(s.months.length >= 2 || s.months.length === 12, s.text);
});

test('the text reads well, including below zero', () => {
  const leh = { hi: [-1, 3, 9, 14, 19, 24, 27, 26, 22, 15, 8, 2], lo: [-14, -11, -6, -1, 3, 7, 11, 10, 5, -2, -8, -12], rain: Array(12).fill(15) };
  const s = S.summarise(leh);
  assert.match(s[0].text, /^\w{3} to \w{3} · Cold, about −\d+°C · dry$/, s[0].text);
  assert.match(S.summarise(DELHI)[0].text, /^\w{3} to \w{3} · (Cool|Pleasant), about \d+°C · dry$/);
});

test('bad input gives no seasons rather than an error', () => {
  for (const bad of [null, undefined, {}, { hi: [1], lo: [1], rain: [1] }, { hi: Array(12).fill('x'), lo: Array(12).fill(1), rain: Array(12).fill(1) }]) {
    assert.deepEqual(S.summarise(bad), []);
  }
});

test('temperature and rain words', () => {
  assert.deepEqual([5, 15, 22, 28, 35].map(S.tempLabel), ['Cold', 'Cool', 'Pleasant', 'Warm', 'Hot']);
  assert.deepEqual([0, 59, 60, 149, 150, 900].map(S.rainLabel), ['dry', 'dry', 'some rain', 'some rain', 'wet', 'wet']);
});

test('every city in data/weather.js gets two or three whole-year seasons, none a single month, none empty', () => {
  global.window = {};
  require(path.join(root, 'data', 'cities.js'));
  require(path.join(root, 'data', 'weather.js'));
  const cities = window.KYT_CITIES.filter(c => !c.weatherLink).map(c => c.id), weather = window.KYT_WEATHER.cities;
  delete global.window;
  const missing = cities.filter(id => !weather[id]);
  assert.deepEqual(missing, [], 'every city has weather');
  for (const id of cities) {
    const s = S.summarise(weather[id]);
    assert.ok(s.length >= 1 && s.length <= 3, `${id}: ${s.length} seasons`);
    assert.deepEqual(covers(s), range(0, 11), `${id}: each month in exactly one season`);
    if (s.length > 1) assert.ok(s.every(x => x.months.length >= 2), `${id}: ${s.map(x => x.text).join(' / ')}`);
    assert.ok(s[0].months.includes(0), `${id}: starts with the season holding January`);
    s.forEach(x => assert.match(x.text, /· (Cold|Cool|Pleasant|Warm|Hot), about −?\d+°C · (dry|some rain|wet)$/, `${id}: ${x.text}`));
  }
});

// ── In the app ────────────────────────────────────────────────────────────────────────────────────────────
const { launch, newPhone } = require('./helpers');
const { before: beforeAll, after: afterAll } = require('node:test');
let env;
beforeAll(async () => { env = await launch(); });
afterAll(async () => { await env.browser.close(); env.server.close(); });

test('the city sheet shows When to go with two or three seasons, and clears it for the next city', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await page.fill('#vt-new-name', 'Weather');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  await page.evaluate(() => KYT.virtualTrips.openCityDetail('delhi', false));
  await page.waitForSelector('#cd-weather');
  const n = await page.locator('#cd-weather li[data-season]').count();
  assert.ok(n >= 2 && n <= 3, `Delhi shows ${n} seasons`);
  assert.match(await page.locator('#cd-weather').innerText(), /when to go[\s\S]*about \d+°C/i);
  const shimla = await page.evaluate(() => { KYT.virtualTrips.openCityDetail('shimla', false); return document.getElementById('cd-weather').innerText; });
  assert.match(shimla, /Cold|Cool/, 'a hill city is not shown as hot all year');
  assert.equal(await page.locator('#cd-weather').count(), 1, 'one panel, the old one replaced');
  await context.close();
});

test('places without trustworthy figures show a live-forecast link in a new tab, and no made-up seasons (D14)', async () => {
  const { context, page } = await newPhone(env.browser);
  await page.goto(env.base + '/virtual_trip.html');
  await page.fill('#vt-new-name', 'W');
  await page.click('#btn-vt-create');
  await page.waitForSelector('#vt-screen-canvas:not(.hidden)');
  const linked = await page.evaluate(() => KYT_CITIES.filter(c => c.weatherLink).map(c => c.id));
  assert.deepEqual(linked.sort(), ['bhimashankar', 'mawlynnong', 'tirupati']);
  for (const id of linked) {
    const html = await page.evaluate(i => { KYT.virtualTrips.openCityDetail(i, false); return document.getElementById('cd-weather').outerHTML; }, id);
    assert.match(html, /data-weather-link/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener"/);
    assert.match(html, /google\.com\/search\?q=weather/);
    assert.doesNotMatch(html, /data-season/, 'no season rows');
  }
  assert.equal(await page.evaluate(() => Object.keys(KYT_WEATHER.cities).filter(id => KYT_CITIES.find(c => c.id === id && c.weatherLink)).length), 0, 'no figures kept for them');
  await context.close();
});

test('weather data and the summariser are in the offline precache', () => {
  const sw = require('fs').readFileSync(require('path').join(__dirname, '../../sw.js'), 'utf8');
  assert.match(sw, /\.\/data\/weather\.js/);
  assert.match(sw, /\.\/js\/weather-seasons\.js/);
});
