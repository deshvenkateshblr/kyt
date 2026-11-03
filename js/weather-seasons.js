/**
 * weather-seasons.js: turns a city's twelve months of weather (data/weather.js) into two or three seasons a
 * traveller can read at a glance, for example "Nov to Mar · Pleasant, about 17°C · dry".
 *
 * Input is one city's {hi, lo, rain}: 12 monthly mean highs and lows in deg C, 12 monthly rainfall totals in mm.
 * It uses the AVERAGE of high and low and the rainfall, never the highs and lows on their own: NASA's source grid
 * exaggerates the day-night swing (see tools/weather/update_weather.py), but its average and its rain are sound.
 *
 * How: every month becomes a point (average temperature, rainfall). Neighbouring months, treating the year as a
 * circle so Nov to Feb stays one season, are merged cheapest-first until at most three seasons remain, and a
 * season is never a single month. Merging goes on past three only for climates that barely change.
 *
 * Loads in the browser as KYT.weatherSeasons and in Node with require().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.KYT = root.KYT || {}; root.KYT.weatherSeasons = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MAX_SEASONS = 3;
  const STOP_COST = 60;          // beyond three seasons, merge only while the two are this alike (about 5 deg apart over 4 + 4 months)
  const RAIN_FULL = 300;         // mm a month that counts as fully wet when weighing rain against temperature
  const RAIN_WEIGHT = 24;        // a fully wet month differs from a dry one as much as 24 deg of temperature (12 let heat swamp the monsoon)

  /** Bands on the average of the day's high and low. */
  const TEMP_BANDS = [
    { below: 10, label: 'Cold' },
    { below: 18, label: 'Cool' },
    { below: 25, label: 'Pleasant' },
    { below: 30, label: 'Warm' },
    { below: Infinity, label: 'Hot' }
  ];
  const tempLabel = t => TEMP_BANDS.find(b => t < b.below).label;
  /** Average monthly rainfall in a season, in words. */
  const rainLabel = mm => (mm >= 150 ? 'wet' : mm >= 60 ? 'some rain' : 'dry');
  
  function validMonths(a) {
    return Array.isArray(a) && a.length === 12 && a.every(v => typeof v === 'number' && isFinite(v));
  }

  const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;

  /** The cost of merging two neighbouring groups: how different they are, weighted by their size (Ward's rule). */
  function mergeCost(a, b) {
    const dt = a.t - b.t, dr = a.r - b.r;
    return (a.n * b.n) / (a.n + b.n) * (dt * dt + dr * dr);
  }

  function merged(a, b) {
    const n = a.n + b.n;
    return { months: a.months.concat(b.months), n, t: (a.t * a.n + b.t * b.n) / n, r: (a.r * a.n + b.r * b.n) / n };
  }

  /**
   * The seasons of one city, in calendar order starting from the one that contains January.
   * Each: { from, to, months, span, avgTemp, tempLabel, rainLabel, rainMm, text }. Empty for bad input.
   */
  function summarise(entry, opts) {
    const weight = (opts && opts.rainWeight) || RAIN_WEIGHT, stopCost = (opts && opts.stopCost) || STOP_COST;
    const rainScore = mm => Math.min(mm, RAIN_FULL) / RAIN_FULL * weight;
    if (!entry || !validMonths(entry.hi) || !validMonths(entry.lo) || !validMonths(entry.rain)) return [];
    const temp = entry.hi.map((h, i) => (h + entry.lo[i]) / 2);
    let groups = temp.map((t, i) => ({ months: [i], n: 1, t, r: rainScore(entry.rain[i]) }));

    const neighbours = () => {
      const pairs = [];
      for (let i = 0; i < groups.length - 1; i++) pairs.push([i, i + 1]);
      if (groups.length > 2) pairs.push([groups.length - 1, 0]);      // the year is a circle
      return pairs;
    };
    const cheapest = (only) => {
      let best = null;
      for (const [i, j] of neighbours()) {
        if (only && !only(groups[i], groups[j])) continue;
        const cost = mergeCost(groups[i], groups[j]);
        if (!best || cost < best.cost) best = { i, j, cost };
      }
      return best;
    };
    const apply = ({ i, j }) => {
      const m = merged(groups[i], groups[j]);
      if (i === groups.length - 1 && j === 0) groups = [m].concat(groups.slice(1, -1));   // last joins first: still a circle
      else groups.splice(i, 2, m);
    };

    while (groups.length > 1) {
      const best = cheapest();
      if (groups.length <= MAX_SEASONS && best.cost > stopCost) break;
      apply(best);
    }
    // A season is never a single month: fold it into the neighbour it resembles more.
    while (groups.length > 1 && groups.some(g => g.n < 2)) {
      const best = cheapest((a, b) => a.n < 2 || b.n < 2);
      apply(best);
    }

    // Put each season's months in calendar order, and begin with the season that holds January.
    const seasons = groups.map(g => {
      const ms = g.months.slice();
      // a wrapped season (Nov, Dec, Jan, Feb) was built as [..., 0, 1]; sort around the gap in the circle
      const set = new Set(ms);
      let start = ms.find(m => !set.has((m + 11) % 12));
      if (start === undefined) start = 0;                                  // all twelve months
      const ordered = [];
      for (let k = 0; k < ms.length; k++) ordered.push((start + k) % 12);
      return ordered;
    });
    seasons.sort((a, b) => a[0] - b[0]);
    const janAt = seasons.findIndex(s => s.includes(0));
    const rotated = seasons.slice(janAt).concat(seasons.slice(0, janAt));

    return rotated.map(ms => {
      const avg = mean(ms.map(m => temp[m]));
      const rainAvg = mean(ms.map(m => entry.rain[m]));
      const span = ms.length === 12 ? 'All year' : ms.length === 1 ? MONTHS[ms[0]] : `${MONTHS[ms[0]]} to ${MONTHS[ms[ms.length - 1]]}`;
      const t = tempLabel(avg), r = rainLabel(rainAvg), shown = Math.round(avg);
      return {
        from: ms[0], to: ms[ms.length - 1], months: ms, span,
        avgTemp: shown, tempLabel: t, rainLabel: r, rainMm: Math.round(ms.reduce((s, m) => s + entry.rain[m], 0)),
        text: `${span} · ${t}, about ${shown < 0 ? '−' + Math.abs(shown) : shown}°C · ${r}`
      };
    });
  }

  return { summarise, tempLabel, rainLabel, MONTHS, MAX_SEASONS };
});
