'use strict';
/**
 * Shared harness for KYT functional tests.
 *  - serves the repo root over http://127.0.0.1:<port> (service workers need a secure origin)
 *  - launches headless Chromium with a phone-sized viewport and touch
 *  - blocks every non-local request (Google Fonts, pdfmake CDN) so tests are hermetic
 *
 * Env: KYT_CHROMIUM=/path/to/chrome to use a specific browser binary.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

function findChromium() {
  if (process.env.KYT_CHROMIUM && fs.existsSync(process.env.KYT_CHROMIUM)) return process.env.KYT_CHROMIUM;
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

async function launch() {
  const { server, base } = await startServer();
  const browser = await chromium.launch({
    headless: true,
    executablePath: findChromium()
  });
  return { server, browser, base };
}

/** A fresh, isolated phone-sized browser context (empty IndexedDB / localStorage). */
async function newPhone(browser, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    acceptDownloads: true, ...opts
  });
  await context.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  // KYT_PW_TIMEOUT (ms) shortens how long a missing element is waited for, to see failures quickly.
  page.setDefaultTimeout(Number(process.env.KYT_PW_TIMEOUT) || 30000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.errors = errors;
  // Default: accept every confirm()/alert() and remember the text.
  page.dialogs = [];
  page.on('dialog', d => { page.dialogs.push(d.message()); d.accept(); });
  return { context, page };
}

/** Seed the active trip exactly the way store.js persists it (IndexedDB kyt_db/kyt_store). */
async function seedTrip(page, base, { name = 'Seed Trip', notes = '', steps }) {
  await page.goto(base + '/view_trip.html');
  await page.waitForFunction(() => window.KYT && KYT.store && KYT.carousel);
  await page.evaluate(async ({ name, notes, steps }) => {
    KYT.store.setTripName(name);
    KYT.store.setTripNotes(notes);
    KYT.store.setStepsData(steps.map((s, i) => ({
      id: 1000 + i, icon: 'map-pin', where: '', mapUrl: '', notes: '', attachments: [], status: 'todo',
      ...s, targetTime: new Date(s.targetTime)
    })));
    KYT.store.setCurrentIndex(0);
    await KYT.store.saveData();
  }, { name, notes, steps });
  await page.reload();
  await page.waitForFunction(() => window.KYT && KYT.store.get().stepsData.length > 0);
}

/**
 * Wait until the trip held in memory has actually been written to IndexedDB.
 * store.saveData() is asynchronous, so reloading right after a UI change can race the write.
 */
async function waitForSaved(page) {
  await page.waitForFunction(() => new Promise(resolve => {
    const open = indexedDB.open('kyt_db');
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('kyt_store')) { db.close(); return resolve(false); }
      const get = db.transaction('kyt_store').objectStore('kyt_store').get('kyt_stepsData');
      get.onerror = () => { db.close(); resolve(false); };
      get.onsuccess = () => { db.close(); resolve(get.result === JSON.stringify(KYT.store.get().stepsData)); };
    };
  }), null, { timeout: 5000 });
  // Chromium can very occasionally serve the previous value to a page reloaded within a few ms of the
  // commit (seen ~1 run in 40). Give the write a moment to settle before the test reloads.
  await page.waitForTimeout(400);
}

const iso = (daysFromNow, hour = 9) => {
  const d = new Date(); d.setDate(d.getDate() + daysFromNow); d.setHours(hour, 0, 0, 0); return d.toISOString();
};

module.exports = { launch, newPhone, seedTrip, waitForSaved, iso, ROOT };
