/**
 * trip-pdf.js: a planned trip as a PDF to share, built with pdfMake (the engine the Memory Album uses), so it
 * downloads on a phone without the browser's print dialog.
 *
 *   KYT.tripPdf.collectPlan(trip, curated, cities)   plain data for the PDF: title, route, days, destinations
 *   KYT.tripPdf.buildDocDefinition(plan, deps)       the pdfMake document (pure, so it is tested in Node)
 *   KYT.tripPdf.download(plan)                       builds it and shares (phone) or downloads (desktop)
 *
 * Contents: a cover; "Before you go" for places that have it (booking, permits, ID, dress, access, each with its
 * source link); the days in order with a tappable "Open in Google Maps" on every step that has one; then a short
 * guide per destination with "When to go" and the places to see, each with a map link.
 *
 * Only plain text and ASCII-safe punctuation: the default PDF font has no arrows or emoji.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.KYT = root.KYT || {}; root.KYT.tripPdf = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const KIND_LABEL = { book: 'Book ahead', permit: 'Permit', id: 'ID', dress: 'Dress', rule: 'Rules', season: 'When' };
  const COLORS = { ink: '#0F172A', body: '#334155', muted: '#64748B', faint: '#94A3B8', blue: '#2563EB', line: '#E2E8F0', amber: '#92400E' };
  const MAX_PLACES = 8;

  const pad2 = n => String(n).padStart(2, '0');
  const isHttps = u => typeof u === 'string' && /^https:\/\/\S+$/.test(u);
  const clean = s => String(s == null ? '' : s).replace(/[→←↔]/g, ' to ').replace(/\s+/g, ' ').trim();

  // ── Collecting ────────────────────────────────────────────────────────────────────────────────────────────

  function distinctCities(steps) {
    const out = [];
    const add = n => { if (n && !out.includes(n)) out.push(n); };
    steps.forEach(s => { if (s.type === 'travel') { add(s.from); add(s.to); } else add(s.cityName); });
    return out;
  }

  /** Steps sorted by time within each day, as [{ day, label, sub, steps }]. */
  function daysOf(trip, curated) {
    if (trip && Array.isArray(trip.steps) && trip.steps.length) {
      const buckets = {};
      trip.steps.forEach(s => {
        const d = s.dayId != null ? s.dayId : (s.day != null ? s.day : 1);
        (buckets[d] = buckets[d] || []).push(s);
      });
      return Object.keys(buckets).map(Number).sort((a, b) => a - b).map(d => {
        const steps = buckets[d].slice().sort((a, b) => ((a.hour || 0) * 60 + (a.minute || 0)) - ((b.hour || 0) * 60 + (b.minute || 0)));
        const names = distinctCities(steps);
        return { day: d, label: d === 0 ? 'TRAVEL AND ARRIVAL' : `DAY ${d}`, sub: names.length ? names.join(' to ') : '', steps };
      });
    }
    if (curated && Array.isArray(curated.days)) {
      return curated.days.map(d => ({ day: d.day, label: `DAY ${d.day}`, sub: clean(d.title || ''), steps: d.steps || [] }));
    }
    return [];
  }

  /** Everything the PDF prints, as plain data. `cities` are the trip's city records, in route order. */
  function collectPlan(trip, curated, cities) {
    const title = (trip && trip.name) || (curated && curated.title) || 'My trip';
    return {
      title: clean(title),
      tagline: clean((curated && curated.tagline) || ''),
      origin: trip && trip.originCity && trip.originCity !== 'already_there' ? trip.originCity : '',
      days: daysOf(trip, curated),
      cities: (cities || []).filter(Boolean)
    };
  }

  // ── Building ──────────────────────────────────────────────────────────────────────────────────────────────

  const link = (text, url) => isHttps(url) ? { text, link: url, color: COLORS.blue, decoration: 'underline' } : null;
  const rule = (w = 0.5) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: w, lineColor: COLORS.line }], margin: [0, 6, 0, 8] });

  function stepBlock(s) {
    const time = s.hour != null ? `${pad2(s.hour)}:${pad2(s.minute || 0)}` : '';
    const stack = [];
    stack.push({ text: [{ text: time ? time + '   ' : '', color: COLORS.faint, bold: true, fontSize: 9 }, { text: clean(s.title), bold: true, fontSize: 12, color: COLORS.ink }], margin: [0, 8, 0, 1] });
    const meta = [];
    if (s.type === 'travel') {
      const route = s.from && s.to ? `${clean(s.from)} to ${clean(s.to)}` : clean(s.where);
      if (route) meta.push(route);
      if (s.duration) meta.push('about ' + clean(s.duration));
    } else if (s.type === 'stay') {
      meta.push(clean(s.where));
      meta.push(`Check-in ${time}`.trim());
      if (s.checkOut) meta.push(`Check-out ${s.checkOut}`);
    } else {
      if (s.where) meta.push(clean(s.where));
      if (s.durationMin) meta.push(`about ${s.durationMin} min`);
    }
    const metaText = meta.filter(Boolean).join('  |  ');
    if (metaText) stack.push({ text: metaText, fontSize: 9.5, color: COLORS.muted, margin: [0, 0, 0, 1] });
    if (s.notes) stack.push({ text: clean(s.notes), fontSize: 10, color: COLORS.body, margin: [0, 2, 0, 1] });
    const maps = link(s.type === 'travel' ? 'Directions in Google Maps' : 'Open in Google Maps', s.mapsUrl);
    if (maps) stack.push({ text: maps.text, link: maps.link, color: maps.color, decoration: maps.decoration, fontSize: 9, margin: [0, 2, 0, 0] });
    return { stack, unbreakable: true };
  }

  function beforeYouGoBlock(city, deps) {
    const byg = deps.beforeYouGoInfo ? deps.beforeYouGoInfo(city) : null;
    const acc = deps.accessInfo ? deps.accessInfo(city) : null;
    if (!byg && !acc) return null;
    const stack = [{ text: clean(city.name), bold: true, fontSize: 14, color: COLORS.ink, margin: [0, 10, 0, 4] }];
    if (acc) {
      stack.push({
        text: [{ text: clean(acc.label) + '. ', bold: true }, clean(acc.text), isHttps(acc.source) ? { text: '  Source', link: acc.source, color: COLORS.blue, decoration: 'underline' } : ''],
        fontSize: 10, color: COLORS.amber, margin: [0, 0, 0, 4]
      });
    }
    if (byg) {
      byg.items.forEach(it => {
        stack.push({
          text: [{ text: (KIND_LABEL[it.kind] || 'Note') + '. ', bold: true }, clean(it.text), isHttps(it.source) ? { text: '  Source', link: it.source, color: COLORS.blue, decoration: 'underline' } : ''],
          fontSize: 10, color: COLORS.body, margin: [8, 0, 0, 3]
        });
      });
      const foot = [];
      if (byg.official) foot.push({ text: 'Official website', link: byg.official, color: COLORS.blue, decoration: 'underline' });
      if (byg.checked) foot.push({ text: (foot.length ? '   ' : '') + `Checked ${byg.checked}`, color: COLORS.faint });
      if (foot.length) stack.push({ text: foot, fontSize: 9, margin: [8, 2, 0, 0] });
    }
    return { stack, unbreakable: true };
  }

  function placesList(city) {
    const beats = Array.isArray(city.beats) ? city.beats.slice(0, MAX_PLACES) : [];
    return beats.map(b => {
      const maps = link('Map', b.mapsUrl);
      return { text: [{ text: clean(b.title), color: COLORS.body }, maps ? { text: '   Map', link: maps.link, color: maps.color, decoration: maps.decoration, fontSize: 8.5 } : ''], fontSize: 10, margin: [0, 0, 0, 2] };
    });
  }

  function destinationBlock(city, deps) {
    const stack = [{ text: clean(city.name) + (city.state ? ', ' + clean(city.state) : ''), bold: true, fontSize: 14, color: COLORS.ink, margin: [0, 10, 0, 4] }];
    const seasons = deps.seasonsFor ? deps.seasonsFor(city) : [];
    if (seasons.length) {
      stack.push({ text: 'WHEN TO GO', fontSize: 8, bold: true, color: COLORS.muted, characterSpacing: 1, margin: [0, 0, 0, 2] });
      seasons.forEach(se => stack.push({ text: [{ text: se.span + '. ', bold: true }, `${se.tempLabel}, about ${se.avgTemp < 0 ? '-' + Math.abs(se.avgTemp) : se.avgTemp} C, ${se.rainLabel === 'wet' ? 'wet' : se.rainLabel === 'dry' ? 'dry' : 'some rain'}.`], fontSize: 10, color: COLORS.body, margin: [8, 0, 0, 1] }));
      stack.push({ text: 'Typical day-and-night average. Check the forecast close to your dates.', fontSize: 8, color: COLORS.faint, margin: [8, 1, 0, 4] });
    }
    const places = placesList(city);
    if (places.length) {
      stack.push({ text: 'PLACES TO SEE', fontSize: 8, bold: true, color: COLORS.muted, characterSpacing: 1, margin: [0, 2, 0, 2] });
      stack.push({ stack: places, margin: [8, 0, 0, 0] });
    }
    const mapLink = link('Open ' + clean(city.name) + ' in Google Maps', city.mapsUrl);
    if (mapLink) stack.push({ text: mapLink.text, link: mapLink.link, color: mapLink.color, decoration: mapLink.decoration, fontSize: 9, margin: [0, 4, 0, 0] });
    return { stack };
  }

  /**
   * deps: { beforeYouGoInfo(city), accessInfo(city), seasonsFor(city) -> [{span, tempLabel, avgTemp, rainLabel}], logo (data URL), today }
   */
  function buildDocDefinition(plan, deps) {
    deps = deps || {};
    const content = [];
    if (deps.logo) content.push({ image: deps.logo, width: 44, alignment: 'center', margin: [0, 0, 0, 8] });
    content.push({ text: 'KYT - KNOW YOUR TRAVEL', alignment: 'center', fontSize: 9, bold: true, color: COLORS.faint, characterSpacing: 2, margin: [0, 0, 0, 28] });
    content.push({ text: plan.title, alignment: 'center', fontSize: 28, bold: true, color: COLORS.ink, margin: [0, 0, 0, 6] });
    if (plan.tagline) content.push({ text: plan.tagline, alignment: 'center', fontSize: 12, color: COLORS.muted, margin: [0, 0, 0, 10] });
    const dayCount = plan.days.filter(d => d.day >= 1).length;
    const route = plan.cities.map(c => clean(c.name)).join(', ');
    const facts = [plan.origin && plan.origin !== '0' ? `From ${clean(plan.origin)}` : '', dayCount ? `${dayCount} day${dayCount === 1 ? '' : 's'}` : '', route].filter(Boolean).join('   |   ');
    if (facts) content.push({ text: facts, alignment: 'center', fontSize: 11, color: COLORS.body, margin: [0, 0, 0, 14] });
    content.push({ text: 'Tap any blue "Open in Google Maps" link to see the place or get directions. Times are indicative: check roads, weather and opening hours close to your day.', alignment: 'center', fontSize: 9, italics: true, color: COLORS.muted, margin: [30, 0, 30, 6] });

    const byg = plan.cities.map(c => beforeYouGoBlock(c, deps)).filter(Boolean);
    if (byg.length) {
      content.push({ text: 'BEFORE YOU GO', fontSize: 10, bold: true, color: COLORS.blue, characterSpacing: 2, margin: [0, 24, 0, 2], pageBreak: 'before' });
      content.push({ text: 'Things to book, carry or know before these places. Each links to the page it was read from.', fontSize: 9.5, color: COLORS.muted, margin: [0, 0, 0, 4] });
      content.push(rule(1));
      byg.forEach(b => content.push(b));
    }

    plan.days.forEach((d, i) => {
      content.push({
        stack: [
          { text: d.label, fontSize: 10, bold: true, color: COLORS.blue, characterSpacing: 2, margin: [0, 0, 0, 2] },
          { text: d.sub || 'Itinerary', fontSize: 18, bold: true, color: COLORS.ink, margin: [0, 0, 0, 2] },
          rule(1)
        ],
        unbreakable: true,
        pageBreak: 'before'
      });
      d.steps.forEach(s => content.push(stepBlock(s)));
    });

    if (plan.cities.length) {
      content.push({ text: 'DESTINATION GUIDE', fontSize: 10, bold: true, color: COLORS.blue, characterSpacing: 2, margin: [0, 0, 0, 2], pageBreak: 'before' });
      content.push(rule(1));
      plan.cities.forEach(c => content.push(destinationBlock(c, deps)));
    }

    return {
      pageSize: 'A4',
      pageMargins: [50, 60, 50, 55],
      info: { title: plan.title + ' - trip plan', author: 'KYT' },
      footer: (page, pages) => ({ text: `KYT - Know Your Travel - vividnova.com/kyt/ - Page ${page} of ${pages}`, alignment: 'center', fontSize: 8, color: COLORS.faint, margin: [0, 16, 0, 0] }),
      content,
      defaultStyle: { font: 'Roboto', lineHeight: 1.3 }
    };
  }

  // ── Browser: build, then share or download ────────────────────────────────────────────────────────────────

  function toDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  /** Builds the PDF and hands it over: the share sheet on a phone, a download elsewhere. Resolves to the file name. */
  async function download(plan) {
    if (typeof pdfMake === 'undefined') throw new Error('The PDF library did not load. Check your connection and try again.');
    let logo = null;
    try { logo = await toDataUrl(await (await fetch('./icons/KYT.jpg')).blob()); } catch (e) { /* the cover works without it */ }
    const ui = (window.KYT && KYT.ui) || {};
    const seasons = window.KYT && KYT.weatherSeasons;
    const W = window.KYT_WEATHER;
    const deps = {
      logo,
      beforeYouGoInfo: ui.beforeYouGoInfo,
      accessInfo: ui.accessInfo,
      seasonsFor: city => (seasons && W && W.cities && W.cities[city.id]) ? seasons.summarise(W.cities[city.id]) : []
    };
    const doc = buildDocDefinition(plan, deps);
    const fileName = (plan.title.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'trip') + '_plan.pdf';
    const pdf = pdfMake.createPdf(doc);
    const phone = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && navigator.share;
    if (phone) {
      const blob = await new Promise(res => pdf.getBlob(res));
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: plan.title }); return fileName; }
        catch (e) { if (e && e.name === 'AbortError') return fileName; }          // cancelled: nothing more to do
      }
    }
    pdf.download(fileName);
    return fileName;
  }

  return { collectPlan, buildDocDefinition, download, daysOf, MAX_PLACES, MONTHS };
});
