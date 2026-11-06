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
      cities: (cities || []).filter(Boolean),
      month: trip && Number(trip.travelMonth) >= 1 && Number(trip.travelMonth) <= 12 ? Number(trip.travelMonth) : 0
    };
  }

  // ── Building ──────────────────────────────────────────────────────────────────────────────────────────────

  const WIDTH = 495;                                           // A4 less 50 pt margins
  const display = u => String(u).replace(/^https:\/\//, '').replace(/\/$/, '');
  const link = (text, url) => isHttps(url) ? { text, link: url, color: COLORS.blue, decoration: 'underline' } : null;
  const rule = (w = 0.5, color = COLORS.line) => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: w, lineColor: color }], margin: [0, 6, 0, 8] });
  const FLAT = { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 };

  /** A tinted box with a coloured edge. Never split across pages. */
  function panel(accent, fill, heading, stack) {
    return {
      table: { widths: ['*'], body: [[{ stack: [{ text: heading, fontSize: 8, bold: true, color: accent, characterSpacing: 1, margin: [0, 0, 0, 4] }].concat(stack), fillColor: fill, margin: [10, 8, 10, 8] }]] },
      layout: { ...FLAT, vLineWidth: i => (i === 0 ? 3 : 0), vLineColor: () => accent },
      unbreakable: true, margin: [0, 6, 0, 0]
    };
  }

  /** Numbered sources: items end in [n], and the full address of each page is printed once, under the list. */
  function sourced(items, extraUrls) {
    const urls = [];
    const num = u => { if (!isHttps(u)) return 0; let i = urls.indexOf(u); if (i < 0) { urls.push(u); i = urls.length - 1; } return i + 1; };
    const lines = items.map(it => {
      const n = num(it.source);
      return { text: [{ text: it.label ? it.label + '. ' : '', bold: true }, clean(it.text), n ? { text: ` [${n}]`, color: COLORS.blue, bold: true, fontSize: 8 } : ''], fontSize: 10, color: it.color || COLORS.body, margin: [0, 0, 0, 3] };
    });
    (extraUrls || []).forEach(num);
    const refs = urls.map((u, i) => ({ text: [{ text: `[${i + 1}] `, bold: true, color: COLORS.muted }, { text: display(u), link: u, color: COLORS.blue, decoration: 'underline' }], fontSize: 7.5, margin: [0, 0, 0, 1.5] }));
    return { lines, refs };
  }

  function chip(text, color) {
    return { table: { body: [[{ text, fontSize: 7, bold: true, color: '#FFFFFF', fillColor: color, margin: [4, 1, 4, 1] }]] }, layout: FLAT, margin: [0, 1, 0, 3] };
  }

  function stepRow(s) {
    const time = s.hour != null ? `${pad2(s.hour)}:${pad2(s.minute || 0)}` : '';
    const body = [];
    if (s.type === 'travel') body.push(chip('TRAVEL', '#0284C7'));
    else if (s.type === 'stay') body.push(chip('STAY', '#7C3AED'));
    body.push({ text: clean(s.title), bold: true, fontSize: 12, color: COLORS.ink });
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
    const metaText = meta.filter(Boolean).join('   |   ');
    if (metaText) body.push({ text: metaText, fontSize: 9.5, color: COLORS.muted, margin: [0, 1, 0, 0] });
    if (s.notes) body.push({ text: clean(s.notes), fontSize: 10, color: COLORS.body, margin: [0, 3, 0, 0] });
    const maps = link(s.type === 'travel' ? 'Directions in Google Maps' : 'Open in Google Maps', s.mapsUrl);
    if (maps) body.push({ text: maps.text, link: maps.link, color: maps.color, decoration: maps.decoration, fontSize: 9, margin: [0, 3, 0, 0] });
    return [{ text: time, fontSize: 10, bold: true, color: COLORS.muted, margin: [0, 2, 0, 0] }, { stack: body }];
  }

  function stepsTable(steps) {
    if (!steps.length) return { text: 'Nothing planned yet.', italics: true, color: COLORS.muted, fontSize: 10, margin: [0, 4, 0, 0] };
    return {
      table: { widths: [38, '*'], body: steps.map(stepRow), dontBreakRows: true },
      layout: { hLineWidth: i => (i === 0 || i === steps.length ? 0 : 0.5), hLineColor: () => COLORS.line, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 7, paddingBottom: () => 7 }
    };
  }

  function dayHeader(d) {
    return {
      table: { widths: ['*'], body: [[{ stack: [
        { text: d.label, fontSize: 9, bold: true, color: '#BFDBFE', characterSpacing: 2 },
        { text: d.sub || 'Itinerary', fontSize: 18, bold: true, color: '#FFFFFF', margin: [0, 2, 0, 0] }
      ], fillColor: '#1E3A8A', margin: [14, 10, 14, 11] }]] },
      layout: FLAT, margin: [0, 0, 0, 6]
    };
  }

  /** The city's panels: Before you go, access, when to go, places. */
  function cityPanels(city, deps) {
    const out = [];
    const heading = { text: clean(city.name) + (city.state ? ', ' + clean(city.state) : ''), bold: true, fontSize: 13, color: COLORS.ink, margin: [0, 14, 0, 0] };
    const acc = deps.accessInfo ? deps.accessInfo(city) : null;
    const byg = deps.beforeYouGoInfo ? deps.beforeYouGoInfo(city) : null;
    if (acc || byg) {
      const items = [];
      if (acc) items.push({ label: acc.label, text: acc.text, source: acc.source, color: COLORS.amber });
      if (byg) byg.items.forEach(it => items.push({ label: KIND_LABEL[it.kind] || 'Note', text: it.text, source: it.source }));
      const { lines, refs } = sourced(items, byg && byg.official ? [byg.official] : []);
      const foot = [];
      if (byg && byg.checked) foot.push({ text: `Checked ${byg.checked}. Rules and booking details change: confirm on the official site before you go.`, fontSize: 8, color: COLORS.muted, margin: [0, 3, 0, 0] });
      out.push(panel(acc && !byg ? '#D97706' : '#4F46E5', acc && !byg ? '#FFFBEB' : '#EEF2FF', 'BEFORE YOU GO', lines.concat([{ stack: refs, margin: [0, 4, 0, 0] }], foot)));
    }
    const seasons = deps.seasonsFor ? deps.seasonsFor(city) : [];
    if (seasons.length) {
      const lines = seasons.map(se => ({ text: [{ text: se.span + '. ', bold: true }, `${se.tempLabel}, about ${se.avgTemp < 0 ? '-' + Math.abs(se.avgTemp) : se.avgTemp} C, ${se.rainLabel === 'wet' ? 'wet' : se.rainLabel === 'dry' ? 'dry' : 'some rain'}.`], fontSize: 10, color: COLORS.body, margin: [0, 0, 0, 2] }));
      lines.push({ text: 'Typical day-and-night average over 2001-2020. Check the forecast close to your dates.', fontSize: 8, color: COLORS.muted, margin: [0, 2, 0, 0] });
      out.push(panel('#0284C7', '#F0F9FF', 'WHEN TO GO', lines));
    }
    const beats = Array.isArray(city.beats) ? city.beats.slice(0, MAX_PLACES) : [];
    if (beats.length) {
      const lines = beats.map(b => {
        const m = link('Map', b.mapsUrl);
        return { text: [{ text: clean(b.title), color: COLORS.body }, m ? { text: '   Map', link: m.link, color: m.color, decoration: m.decoration, fontSize: 8.5 } : ''], fontSize: 10, margin: [0, 0, 0, 2] };
      });
      const cm = link('Open ' + clean(city.name) + ' in Google Maps', city.mapsUrl);
      if (cm) lines.push({ text: cm.text, link: cm.link, color: cm.color, decoration: cm.decoration, fontSize: 9, margin: [0, 3, 0, 0] });
      out.push(panel('#059669', '#ECFDF5', 'PLACES TO SEE', lines));
    }
    if (!out.length) return [];
    const first = { stack: [heading, out[0]], unbreakable: true };      // the name never sits alone at the foot of a page
    return [first].concat(out.slice(1));
  }

  /**
   * deps: { beforeYouGoInfo(city), accessInfo(city), seasonsFor(city) -> [{span, tempLabel, avgTemp, rainLabel}], logo (data URL) }
   * Each day is a page: its steps, then a panel group for every city it touches (the first time that city appears).
   */
  function buildDocDefinition(plan, deps) {
    deps = deps || {};
    const content = [];
    const dayCount = plan.days.filter(d => d.day >= 1).length;
    const route = plan.cities.map(c => clean(c.name)).join(', ');
    const facts = [plan.origin && plan.origin !== '0' ? `From ${clean(plan.origin)}` : '', dayCount ? `${dayCount} day${dayCount === 1 ? '' : 's'}` : ''].filter(Boolean).join('   |   ');

    // Cover
    content.push({
      table: { widths: ['*'], body: [[{ stack: [
        deps.logo ? { image: deps.logo, width: 40, margin: [0, 0, 0, 10] } : { text: '' },
        { text: 'KYT - KNOW YOUR TRAVEL', fontSize: 8, bold: true, color: '#BFDBFE', characterSpacing: 2, margin: [0, 0, 0, 14] },
        { text: plan.title, fontSize: 28, bold: true, color: '#FFFFFF' },
        plan.tagline ? { text: plan.tagline, fontSize: 12, color: '#DBEAFE', margin: [0, 6, 0, 0] } : { text: '' },
        facts ? { text: facts, fontSize: 11, bold: true, color: '#BFDBFE', margin: [0, 14, 0, 0] } : { text: '' },
        route ? { text: route, fontSize: 10, color: '#DBEAFE', margin: [0, 3, 0, 0] } : { text: '' }
      ], fillColor: '#1E3A8A', margin: [22, 22, 22, 24] }]] },
      layout: FLAT, margin: [0, 0, 0, 16]
    });
    const glance = plan.days.map(d => {
      const stops = d.steps.filter(s => s.type !== 'travel' && s.type !== 'stay').slice(0, 3).map(s => clean(s.title)).join(', ');
      return [{ text: d.day === 0 ? 'Start' : 'Day ' + d.day, bold: true, fontSize: 10, color: COLORS.blue }, { stack: [{ text: d.sub || 'Itinerary', bold: true, fontSize: 10, color: COLORS.ink }, stops ? { text: stops, fontSize: 9, color: COLORS.muted, margin: [0, 1, 0, 0] } : { text: '' }] }];
    });
    if (glance.length) {
      content.push({ text: 'AT A GLANCE', fontSize: 9, bold: true, color: COLORS.blue, characterSpacing: 2, margin: [0, 0, 0, 2] });
      content.push({ table: { widths: [44, '*'], body: glance, dontBreakRows: true }, layout: { hLineWidth: i => (i === 0 ? 1 : 0.5), hLineColor: () => COLORS.line, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 6, paddingBottom: () => 6 } });
    }
    const mNotes = plan.month && deps.monthNotes ? deps.monthNotes(plan.cities, plan.month) : [];
    if (mNotes.length) {
      const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const bad = mNotes.some(n => n.kind === 'closed' || n.kind === 'wet' || n.kind === 'hot');
      content.push(panel(bad ? '#D97706' : '#0284C7', bad ? '#FFFBEB' : '#F0F9FF', 'TRAVELLING IN ' + names[plan.month - 1].toUpperCase(),
        mNotes.map(n => ({ text: [{ text: (n.kind === 'closed' ? 'Closed. ' : n.kind === 'wet' ? 'Wet. ' : n.kind === 'hot' ? 'Hot. ' : ''), bold: true }, clean(n.text)], fontSize: 9.5, color: COLORS.body, margin: [0, 0, 0, 2] }))));
    }
    content.push({ text: 'Tap a blue "Open in Google Maps" link to see the place or get directions. Sources are numbered, with the full web address printed under each list. Times are indicative: check roads, weather and opening hours close to your day.', fontSize: 8.5, italics: true, color: COLORS.muted, margin: [0, 14, 0, 0] });

    // Days, each with the panels of the cities it touches
    const placed = new Set();
    const byName = n => plan.cities.find(c => clean(c.name).toLowerCase() === clean(n).toLowerCase());
    plan.days.forEach(d => {
      const head = dayHeader(d);
      head.pageBreak = 'before';
      content.push(head);
      content.push(stepsTable(d.steps));
      const names = [];
      d.steps.forEach(s => (s.type === 'travel' ? [s.from, s.to] : [s.cityName]).forEach(n => { const c = n && byName(n); if (c && !names.includes(c.id)) names.push(c.id); }));
      names.forEach(id => {
        if (placed.has(id)) return;
        placed.add(id);
        cityPanels(plan.cities.find(c => c.id === id), deps).forEach(x => content.push(x));
      });
    });

    // Cities no day mentions still get their panels
    const rest = plan.cities.filter(c => !placed.has(c.id));
    const restBlocks = [];
    rest.forEach(c => cityPanels(c, deps).forEach(x => restBlocks.push(x)));
    if (restBlocks.length) {
      content.push({ text: 'MORE ABOUT YOUR DESTINATIONS', fontSize: 10, bold: true, color: COLORS.blue, characterSpacing: 2, margin: [0, 0, 0, 2], pageBreak: 'before' });
      content.push(rule(1));
      restBlocks.forEach(x => content.push(x));
    }

    return {
      pageSize: 'A4',
      pageMargins: [50, 50, 50, 55],
      info: { title: plan.title + ' - trip plan', author: 'KYT' },
      footer: (page, pages) => ({ text: `${plan.title}   |   KYT - Know Your Travel - vividnova.com/kyt/   |   Page ${page} of ${pages}`, alignment: 'center', fontSize: 8, color: COLORS.faint, margin: [0, 16, 0, 0] }),
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
      monthNotes: ui.monthNotes,
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
