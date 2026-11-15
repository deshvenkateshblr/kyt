import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const URL_BY2024 = 'https://residex.nhbonline.org.in/DashboardBY2024/DashboardBY2024';
const URL_BY2018 = 'https://residex.nhbonline.org.in/DashboardBY2018/DashboardBY2018';
const OUTPUT_PATH = path.resolve('./nhb_residex_kyf.json');

const TARGET_CITIES = [
  'Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad',
  'Pune', 'Kolkata', 'Ahmedabad', 'Gurugram', 'Noida', 'Faridabad'
];

function cleanNum(val) {
  if (!val) return null;
  const cleaned = String(val).replace(/[^\d.\-]/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function calculateMetrics(seriesObj) {
  const quarters = Object.keys(seriesObj);
  if (!quarters.length) {
    return { latest_quarter: null, latest_value: null, qoq_pct: null, yoy_pct: null };
  }
  const latestQ = quarters[quarters.length - 1];
  const latestVal = seriesObj[latestQ];

  let qoqPct = null;
  if (quarters.length >= 2) {
    const prevVal = seriesObj[quarters[quarters.length - 2]];
    if (prevVal > 0) qoqPct = Number((((latestVal - prevVal) / prevVal) * 100).toFixed(2));
  }

  let yoyPct = null;
  if (quarters.length >= 5) {
    const yoyVal = seriesObj[quarters[quarters.length - 5]];
    if (yoyVal > 0) yoyPct = Number((((latestVal - yoyVal) / yoyVal) * 100).toFixed(2));
  }

  return {
    latest_quarter: latestQ,
    latest_value: latestVal,
    qoq_pct: qoqPct,
    yoy_pct: yoyPct
  };
}

async function runSync() {
  console.log('Launching local Microsoft Edge in headless mode...');
  // Uses your existing Edge binary — no Chromium download needed!
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Fetch Linking Factors & Historical Series from BY2018
  console.log('1. Extracting Linking Factors from DashboardBY2018...');
  await page.goto(URL_BY2018, { waitUntil: 'networkidle', timeout: 60000 });

  const linkingFactors = await page.evaluate(() => {
    const factors = {};
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      if (table.innerText.includes('Forward Linking Factor')) {
        const rows = Array.from(table.querySelectorAll('tr'));
        for (const row of rows) {
          const cols = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText.trim());
          if (cols.length >= 5 && cols[0] && cols[0] !== 'City Name') {
            factors[cols[0]] = {
              assessment_forward: parseFloat(cols[1]) || null,
              assessment_backward: parseFloat(cols[2]) || null,
              market_uc_forward: parseFloat(cols[3]) || null,
              market_uc_backward: parseFloat(cols[4]) || null
            };
          }
        }
        break;
      }
    }
    return factors;
  });

  // 2. Fetch Current Series (FY 2024-25 = 100) & Carpet Area Prices from BY2024
  console.log('2. Loading DashboardBY2024 for latest HPI & Carpet Area prices...');
  await page.goto(URL_BY2024, { waitUntil: 'networkidle', timeout: 60000 });

  // Extract 50-City National Composite Table
  const compositeSeries = await page.evaluate(() => {
    const series = {};
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
      if (headers.length === 2 && headers[0] === 'Quarter') {
        const rows = Array.from(table.querySelectorAll('tr')).slice(1);
        for (const r of rows) {
          const cols = Array.from(r.querySelectorAll('td')).map(td => td.innerText.trim());
          if (cols.length === 2 && cols[0]) {
            const val = parseFloat(cols[1]);
            if (!Number.isNaN(val)) series[cols[0]] = val;
          }
        }
        if (Object.keys(series).length > 0) break;
      }
    }
    return series;
  });

  // Helper to read active 2-column Quarter/Value table on screen
  const extractActiveQuarterTable = async () => {
    return await page.evaluate(() => {
      const out = {};
      const rows = Array.from(document.querySelectorAll('table tr'));
      for (const r of rows) {
        const cols = Array.from(r.querySelectorAll('td, th')).map(c => c.innerText.trim());
        if (cols.length === 2 && /^(Jun|Sep|Dec|Mar)\s+\d{4}$/.test(cols[0])) {
          const num = parseFloat(cols[1].replace(/[^\d.\-]/g, ''));
          if (!Number.isNaN(num)) out[cols[0]] = num;
        }
      }
      return out;
    });
  };

  const citiesPayload = {};

  for (const city of TARGET_CITIES) {
    console.log(`  -> Syncing ${city}...`);
    citiesPayload[city] = {
      summary: {},
      hpi_assessment_by2024: {},
      carpet_price_sqft_by2024: {
        composite: {},
        compact_lte_646_sqft: {},
        mid_646_to_1184_sqft: {},
        large_gt_1184_sqft: {}
      },
      linking_factors_2012_to_2018: linkingFactors[city] || {}
    };

    try {
      // Select city in dropdown
      const selects = await page.$$('select');
      for (const sel of selects) {
        const text = await sel.innerText();
        if (text.includes(city)) {
          await sel.selectOption({ label: city });
          await page.waitForTimeout(1000);
          break;
        }
      }

      // Read HPI @ Assessment Prices
      const hpiSeries = await extractActiveQuarterTable();
      citiesPayload[city].hpi_assessment_by2024 = hpiSeries;
      citiesPayload[city].summary = calculateMetrics(hpiSeries);

      // Toggle to Carpet Area Prices (Rs./Sq.Ft.)
      const carpetToggle = page.locator('text=Carpet Area Prices').first();
      if ((await carpetToggle.count()) > 0) {
        await carpetToggle.click();
        await page.waitForTimeout(900);

        const tiers = [
          ['Composite Price', 'composite'],
          ['<=60 sq.mt.', 'compact_lte_646_sqft'],
          ['<=110 sq.mt.', 'mid_646_to_1184_sqft'],
          ['> 110 sq.mt.', 'large_gt_1184_sqft']
        ];

        for (const [labelText, key] of tiers) {
          const loc = page.locator(`text=${labelText}`).first();
          if ((await loc.count()) > 0) {
            await loc.click();
            await page.waitForTimeout(700);
            citiesPayload[city].carpet_price_sqft_by2024[key] = await extractActiveQuarterTable();
          }
        }

        // Switch back to HPI for next city
        const hpiToggle = page.locator('text=Housing Price Index (HPI)').first();
        if ((await hpiToggle.count()) > 0) {
          await hpiToggle.click();
          await page.waitForTimeout(700);
        }
      }
    } catch (err) {
      console.warn(`  [Warn] Could not fully parse ${city}:`, err.message);
    }
  }

  await browser.close();

  const finalJson = {
    metadata: {
      source: 'National Housing Bank (NHB RESIDEX)',
      current_base_year: 'FY 2024-25 = 100',
      last_synced_utc: new Date().toISOString(),
      area_unit: 'RERA Carpet Area (Rs. / Sq. Ft.)'
    },
    national_composite_50_cities: {
      summary: calculateMetrics(compositeSeries),
      series: compositeSeries
    },
    cities: citiesPayload
  };

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(finalJson, null, 2), 'utf-8');
  console.log(`\nSaved NHB RESIDEX data to ${OUTPUT_PATH}`);
}

runSync().catch(console.error);