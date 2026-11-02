/**
 * core.js - KYT Admin: schema, tolerant parsing, validation, prompt builder, export.
 * Pure functions, no DOM. Works in the browser (window.KYTAdmin) and in Node (module.exports).
 *
 * Everything that comes from an AI model is treated as untrusted text:
 * it is cleaned, length-capped, stripped of HTML-like tags, and links are allow-listed.
 */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;

  // Icons verified to exist in KYT's bundled lucide build.
  var ICONS = ['map-pin', 'landmark', 'utensils', 'coffee', 'camera', 'shopping-bag', 'waves', 'tree-pine', 'tree-palm',
    'mountain', 'mountain-snow', 'sunset', 'sun', 'wine', 'heart', 'plane', 'bed', 'hotel', 'ticket', 'train-front', 'bus',
    'car', 'bike', 'tent', 'church', 'castle', 'ship', 'sailboat', 'flower-2', 'building-2', 'music', 'binoculars',
    'footprints', 'compass', 'gem', 'star', 'fish', 'bird', 'umbrella', 'cable-car', 'fuel'];
  var TRAVEL_ICONS = ['plane', 'train-front', 'bus', 'car', 'ship', 'cable-car', 'fuel'];

  var KINDS = ['weekend', 'long-weekend'];
  var INTENTS = ['mixed', 'spiritual', 'cultural', 'adventure', 'culinary'];
  var DIETS = ['any', 'veg', 'jain', 'satvik'];
  var PACES = ['short', 'standard', 'deep'];
  var BUDGETS = ['budget', 'mid', 'premium'];
  var AUDIENCES = ['family', 'friends', 'couple', 'solo'];
  var MODES = ['road', 'train', 'flight', 'mixed'];
  var BYG_TYPES = ['booking', 'id', 'dress', 'rules', 'timing', 'other'];
  var DAY_EFFECTS = ['festival', 'special-darshan', 'closed', 'crowded', 'other'];
  var FAITHS = ['hindu', 'sikh', 'buddhist', 'jain', 'muslim', 'christian', 'other'];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // Generous bounds that only stop runaway or hostile input. They are not editorial limits.
  var LIMITS = { title: 200, tagline: 300, where: 200, notes: 2000, highlight: 300, tip: 400, transportNote: 600,
    verify: 200, stepsPerDay: 60, maxDays: 14, maxTrips: 100, listItems: 12 };

  // ---------------------------------------------------------------- helpers
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function cleanTo(v, max, issues, path) {
    if (typeof v === 'number' && isFinite(v)) v = String(v);
    if (typeof v !== 'string') return '';
    var s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, ' ');
    var stripped = s.replace(/<\/?[a-zA-Z!][^>]*>?/g, ' ');
    if (stripped !== s && issues) issues.push({ level: 'warn', path: path, msg: 'HTML-like tags were removed from the text.' });
    s = stripped.replace(/\s+/g, ' ').trim();
    if (max && s.length > max) {
      s = s.slice(0, max - 1).trimEnd() + '…';
      if (issues) issues.push({ level: 'info', path: path, msg: 'Text was shortened to ' + max + ' characters.' });
    }
    return s;
  }

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function pickEnum(v, list) {
    if (typeof v !== 'string') return '';
    v = v.trim().toLowerCase();
    return list.indexOf(v) >= 0 ? v : '';
  }

  function toInt(v, lo, hi) {
    var n = typeof v === 'string' ? parseFloat(v) : v;
    if (typeof n !== 'number' || !isFinite(n)) return null;
    n = Math.round(n);
    return n < lo || n > hi ? null : n;
  }

  function stringList(v, max, itemMax, issues, path) {
    if (typeof v === 'string') v = v.split(/\n|;/);
    if (!Array.isArray(v)) return [];
    var out = [];
    for (var i = 0; i < v.length && out.length < max; i++) {
      var s = cleanTo(v[i], itemMax, issues, path + '[' + i + ']');
      if (s) out.push(s);
    }
    return out;
  }

  // ---------------------------------------------------------------- time
  function parseTime(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
      if (!isFinite(v) || v < 0 || v >= 24) return null;
      var h = Math.floor(v), m = Math.round((v - h) * 60);
      if (m === 60) { h += 1; m = 0; }
      return h > 23 ? null : { h: h, m: m };
    }
    var s = String(v).trim().toLowerCase();
    var mt = s.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?\s*(am|pm)?$/);
    if (!mt) return null;
    var hh = parseInt(mt[1], 10), mm = mt[2] ? parseInt(mt[2], 10) : 0, ap = mt[3];
    if (ap) {
      if (hh < 1 || hh > 12) return null;
      if (ap === 'pm' && hh < 12) hh += 12;
      if (ap === 'am' && hh === 12) hh = 0;
    }
    if (hh > 23 || mm > 59) return null;
    return { h: hh, m: mm };
  }

  // ---------------------------------------------------------------- links
  function safeMapsUrl(u) {
    if (typeof u !== 'string' || u.length > 600) return '';
    var url;
    try { url = new URL(u.trim()); } catch (e) { return ''; }
    if (url.protocol !== 'https:') return '';
    var host = url.hostname.toLowerCase(), path = url.pathname;
    var ok = (/^(www\.)?google\.(com|co\.in)$/.test(host) && path.indexOf('/maps') === 0) ||
      (host === 'maps.google.com') || (host === 'maps.app.goo.gl') ||
      (host === 'goo.gl' && path.indexOf('/maps') === 0);
    return ok ? url.href : '';
  }

  function safeSourceUrl(u) {
    if (typeof u !== 'string' || u.length > 600) return '';
    try { var url = new URL(u.trim()); return url.protocol === 'https:' ? url.href : ''; } catch (e) { return ''; }
  }

  function searchUrl(query) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

  // ---------------------------------------------------------------- catalog
  function buildCatalogIndex(catalog) {
    var idx = { byKey: {}, byId: {}, size: 0 };
    (catalog || []).forEach(function (c) {
      if (!c || !c.id) return;
      idx.byId[c.id] = c; idx.size++;
      idx.byKey[String(c.id).toLowerCase()] = c.id;
      if (c.name) idx.byKey[String(c.name).toLowerCase()] = c.id;
      (c.aliases || []).forEach(function (a) { if (a) idx.byKey[String(a).toLowerCase()] = c.id; });
    });
    return idx;
  }

  function resolveCity(token, idx) {
    if (!idx || !idx.size || typeof token !== 'string') return '';
    var t = token.trim().toLowerCase();
    if (!t) return '';
    if (idx.byKey[t]) return idx.byKey[t];
    var first = t.split(',')[0].trim();
    if (idx.byKey[first]) return idx.byKey[first];
    var code = CODES[t] || CODES[first];
    return code && idx.byId[code] ? code : '';
  }
  // Airport / station style short codes people (and AIs) use for the main origin cities.
  var CODES = { blr: 'bengaluru', bng: 'bengaluru', del: 'delhi', ndls: 'delhi', bom: 'mumbai', mmct: 'mumbai', maa: 'chennai', hyd: 'hyderabad', ccu: 'kolkata', pnq: 'pune', amd: 'ahmedabad', goi: 'goa', jai: 'jaipur', cok: 'kochi' };

  /** Catalog id for the most common place named in a day's steps (exact matches only), or ''. */
  function inferDayCity(steps, idx, skipId) {
    if (!idx || !idx.size) return '';
    var count = {}, order = [];
    steps.forEach(function (s) {
      var w = s.where || '', parts = w.split(','), seen = {};
      [w, parts[parts.length - 1], parts[0]].forEach(function (tok) {
        var t = (tok || '').trim().toLowerCase(); if (!t || t.length < 3) return;
        var id = idx.byKey[t] || '';
        if (id && !seen[id]) { seen[id] = 1; if (!count[id]) { count[id] = 0; order.push(id); } count[id]++; }
      });
    });
    var best = '', bestN = 0;
    order.forEach(function (id) { if (id !== skipId && count[id] > bestN) { best = id; bestN = count[id]; } });
    return best;
  }

  /** Text used for an auto-made Google Maps search: a specific "place, town" is used as is; a bare town gets the title in front. */
  function placeQuery(title, where, cityName) {
    if (!where) return title + (cityName ? ', ' + cityName : '');
    if (title.toLowerCase().indexOf(where.toLowerCase()) >= 0) return title;
    if (where.indexOf(',') >= 0 || where.toLowerCase().indexOf(title.toLowerCase()) >= 0) return where;
    return title + ', ' + where;
  }

  // ---------------------------------------------------------------- guessing and normalising
  function guessIcon(title, where) {
    var t = (title + ' ' + where).toLowerCase();
    var rules = [
      [/depart|drive|road trip|cab to|taxi/, 'car'], [/train|railway|station/, 'train-front'], [/\bbus\b/, 'bus'],
      [/flight|airport|\bfly\b/, 'plane'], [/check-?in|hotel|homestay|resort|\bstay\b/, 'bed'],
      [/breakfast|lunch|dinner|restaurant|thali|food|dhaba/, 'utensils'], [/cafe|coffee|tea\b/, 'coffee'],
      [/sunset/, 'sunset'], [/sunrise/, 'sun'], [/trek|hike|peak|summit|viewpoint|hill/, 'mountain'],
      [/beach|lake|river|waterfall|boat|ghat|backwater|coracle/, 'waves'], [/market|bazaar|shopping|mall/, 'shopping-bag'],
      [/church|cathedral/, 'church'], [/fort|palace|temple|ruins|tomb|monument|museum|mahal|mosque|stupa|cave/, 'landmark'],
      [/photo|camera/, 'camera'], [/park|forest|garden|safari|wildlife/, 'tree-pine']
    ];
    for (var i = 0; i < rules.length; i++) if (rules[i][0].test(t)) return rules[i][1];
    return 'map-pin';
  }

  function normIntent(v) {
    if (Array.isArray(v)) v = v[0];
    var s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (INTENTS.indexOf(s) >= 0) return s;
    var map = { culture: 'cultural', heritage: 'cultural', architecture: 'cultural', history: 'cultural', temple: 'spiritual',
      pilgrimage: 'spiritual', religious: 'spiritual', religion: 'spiritual', faith: 'spiritual', devotional: 'spiritual', spirituality: 'spiritual', food: 'culinary', foodie: 'culinary', trekking: 'adventure', trek: 'adventure', outdoor: 'adventure', wildlife: 'adventure', sports: 'adventure', gastronomy: 'culinary', cuisine: 'culinary',
      nature: 'mixed', leisure: 'mixed', relaxation: 'mixed', scenic: 'mixed' };
    return map[s] || '';
  }
  function normDiet(v) {
    var s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (DIETS.indexOf(s) >= 0) return s;
    if (/jain/.test(s)) return 'jain';
    if (/onion|garlic|satvik|sattvic/.test(s)) return 'satvik';
    if (/^veg/.test(s)) return 'veg';
    if (/non|any|all/.test(s)) return 'any';
    return '';
  }
  function normPace(v) {
    var s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (PACES.indexOf(s) >= 0) return s;
    if (/relax|slow|leisure|easy/.test(s)) return 'short';
    if (/pack|fast|intense|full/.test(s)) return 'deep';
    if (/moder|balanc|medium/.test(s)) return 'standard';
    return '';
  }

  function normFaith(v) {
    var s = typeof v === 'string' ? v.trim().toLowerCase() : '';
    if (FAITHS.indexOf(s) >= 0) return s;
    if (/hindu|vaishnav|shaiv|shakt/.test(s)) return 'hindu';
    if (/sikh/.test(s)) return 'sikh';
    if (/buddh/.test(s)) return 'buddhist';
    if (/jain/.test(s)) return 'jain';
    if (/islam|muslim|sufi/.test(s)) return 'muslim';
    if (/christ|catholic/.test(s)) return 'christian';
    return s ? 'other' : '';
  }
  function faithList(v) {
    var arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,;\/]|\band\b/) : []);
    var out = [];
    arr.forEach(function (x) { var f = normFaith(x); if (f && out.indexOf(f) < 0) out.push(f); });
    return out;
  }

  function parseMonths(v) {
    var out = [];
    function add(n) { if (n >= 1 && n <= 12 && out.indexOf(n) < 0) out.push(n); }
    function nameIdx(tok) { for (var i = 0; i < 12; i++) if (tok.slice(0, 3) === MONTHS[i]) return i + 1; return 0; }
    if (typeof v === 'string') {
      var names = (v.toLowerCase().match(/[a-z]{3,}/g) || []).map(nameIdx).filter(Boolean);
      var isRange = /\bto\b|-|–|—/.test(v) && names.length === 2;
      if (isRange) { var a = names[0], b = names[1], n = a; for (var g = 0; g < 12; g++) { add(n); if (n === b) break; n = n === 12 ? 1 : n + 1; } }
      else names.forEach(add);
    } else if (Array.isArray(v)) {
      v.forEach(function (x) {
        if (typeof x === 'number') add(Math.round(x));
        else if (typeof x === 'string') { var nn = parseInt(x, 10); if (!isNaN(nn) && /^\d+$/.test(x.trim())) add(nn); else add(nameIdx(x.trim().toLowerCase())); }
      });
    }
    return out.sort(function (x, y) { return x - y; });
  }

  // ---------------------------------------------------------------- tolerant JSON extraction
  // Returns index just past the end of the JSON value starting at `start`, or -1 if unbalanced (truncated).
  function findJsonEnd(text, start) {
    var open = text[start], close = open === '{' ? '}' : ']', depth = 0, inStr = false, esc = false;
    for (var i = start; i < text.length; i++) {
      var ch = text[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') { depth--; if (depth === 0) return text[i] === close ? i + 1 : -1; }
    }
    return -1;
  }

  function repairJson(s, notes) {
    var out = s;
    var a = out.replace(/ /g, ' ').replace(/[“”„]/g, '"').replace(/[‘’]/g, "'");
    if (a !== out) { notes.push('Replaced curly quotes.'); out = a; }
    a = out.replace(/^\s*\/\/.*$/gm, '');
    if (a !== out) { notes.push('Removed // comment lines.'); out = a; }
    a = out.replace(/,(\s*[}\]])/g, '$1');
    if (a !== out) { notes.push('Removed trailing commas.'); out = a; }
    return out;
  }

  function lineCol(text, pos) {
    var upto = text.slice(0, pos).split('\n');
    return 'line ' + upto.length + ', column ' + (upto[upto.length - 1].length + 1);
  }

  function tryParse(candidate, notes) {
    try { return { value: JSON.parse(candidate) }; } catch (e1) {
      var n2 = notes.slice();
      var fixed = repairJson(candidate, n2);
      if (fixed !== candidate) {
        try { var v = JSON.parse(fixed); n2.forEach(function (n) { if (notes.indexOf(n) < 0) notes.push(n); }); return { value: v }; } catch (e2) { return { error: e2 }; }
      }
      return { error: e1 };
    }
  }

  function looksLikeTrips(v) {
    if (Array.isArray(v)) return v.length > 0 && v.every(isObj);
    return isObj(v) && (Array.isArray(v.trips) || Array.isArray(v.ideas) || Array.isArray(v.days) || typeof v.title === 'string');
  }

  /** Pull the first JSON value that looks like trips out of whatever the model returned. */
  function extractJson(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Nothing to parse. Paste the model output first.');
    var notes = [], candidates = [], m, fence = /```(?:json|JSON)?\s*\n?([\s\S]*?)```/g;
    while ((m = fence.exec(text))) candidates.push(m[1]);
    if (!candidates.length) candidates.push(text);
    var lastErr = null, truncated = false, tries = 0;
    for (var c = 0; c < candidates.length; c++) {
      var body = candidates[c];
      for (var pos = body.search(/[{[]/); pos >= 0 && tries < 25; pos = nextOpen(body, pos + 1)) {
        tries++;
        var end = findJsonEnd(body, pos);
        if (end < 0) { truncated = true; continue; }
        var local = [];
        var res = tryParse(body.slice(pos, end), local);
        if (res.value !== undefined && looksLikeTrips(res.value)) {
          if (pos > 0 && body.slice(0, pos).trim()) notes.push('Ignored text before the JSON.');
          if (body.slice(end).trim()) notes.push('Ignored text after the JSON.');
          local.forEach(function (n) { notes.push(n); });
          return { value: res.value, notes: notes };
        }
        if (res.error) lastErr = { err: res.error, body: body.slice(pos, end), pos: pos };
        pos = end - 1; // skip past this value
      }
    }
    if (truncated && !lastErr) throw new Error('The JSON looks cut off (unbalanced brackets). The model probably stopped early. Ask it to continue, or request fewer trips per answer.');
    if (lastErr) {
      var pm = /position (\d+)/.exec(lastErr.err.message || '');
      var where = pm ? ' near ' + lineCol(lastErr.body, parseInt(pm[1], 10)) : '';
      throw new Error('Could not read the JSON' + where + ': ' + (lastErr.err.message || 'syntax error'));
    }
    throw new Error('No JSON found in the text. The model should return one JSON object in a code block.');
  }
  function nextOpen(s, from) { var r = s.slice(from).search(/[{[]/); return r < 0 ? -1 : from + r; }

  function toTripList(value) {
    if (Array.isArray(value)) return value;
    if (isObj(value) && Array.isArray(value.trips)) return value.trips;
    if (isObj(value)) return [value];
    return [];
  }

  function bygType(text) {
    var t = String(text || '').toLowerCase();
    if (/book|ticket|reserv|slot|advance|permit|quota|lottery/.test(t)) return 'booking';
    if (/\bid\b|aadhaar|aadhar|passport|identity|proof/.test(t)) return 'id';
    if (/dress|dhoti|saree|kurta|attire|cover|shorts|modest/.test(t)) return 'dress';
    if (/phone|mobile|camera|bag|leather|locker|footwear|shoes|prohibit|not allowed|banned/.test(t)) return 'rules';
    if (/early|queue|opens|closes|timing|hours|arrive/.test(t)) return 'timing';
    return 'other';
  }
  function sanitizeBeforeYouGo(v, issues) {
    var arr = typeof v === 'string' ? v.split(/\n/) : (Array.isArray(v) ? v : []), out = [];
    for (var i = 0; i < arr.length && out.length < LIMITS.listItems; i++) {
      var x = arr[i], text, type;
      if (isObj(x)) { text = cleanTo(x.text || x.note || x.title || x.item, 300, issues, 'beforeYouGo[' + i + ']'); type = pickEnum(x.type || x.kind, BYG_TYPES); }
      else { text = cleanTo(x, 300, issues, 'beforeYouGo[' + i + ']'); }
      if (!text) continue;
      out.push({ type: type || bygType(text), text: text });
    }
    return out;
  }
  function sanitizeSpecialDays(v, issues) {
    var arr = typeof v === 'string' ? v.split(/\n/) : (Array.isArray(v) ? v : []), out = [];
    for (var i = 0; i < arr.length && out.length < LIMITS.listItems; i++) {
      var x = arr[i], p = 'specialDays[' + i + ']', name, when = '', note = '', effect = '';
      if (isObj(x)) { name = cleanTo(x.name || x.title || x.occasion, 120, issues, p); when = cleanTo(x.when || x.date || x.timing, 120, issues, p); note = cleanTo(x.note || x.description || x.details, 300, issues, p); effect = pickEnum(x.effect || x.type || x.kind, DAY_EFFECTS); }
      else { name = cleanTo(x, 120, issues, p); }
      if (!name) continue;
      if (!effect) {
        var all = (name + ' ' + note).toLowerCase();
        effect = /closed|shut|no darshan/.test(all) ? 'closed' : /crowd|rush|heavy|busiest|peak/.test(all) ? 'crowded'
          : /festival|utsav|utsavam|brahmotsav|jayanti|ekadasi|ekadashi|navratri|diwali|holi|purnima|amavasya|mela|yatra/.test(all) ? 'festival'
          : /darshan|seva|aarti|abhishek|puja|pooja/.test(all) ? 'special-darshan' : 'other';
      }
      out.push({ name: name, when: when, effect: effect, note: note });
    }
    return out;
  }

  function isNoMapStep(title, where, icon) {
    if (TRAVEL_ICONS.indexOf(icon) >= 0) return true;
    if (icon === 'hotel' || icon === 'bed') return true;
    var t = ((title || '') + ' ' + (where || '')).toLowerCase();
    if (/hotel|check[- ]?in|checkout|check[- ]?out|stay|lodge|resort|accommodation/i.test(t)) return true;
    if (/train to|flight to|bus to|drive to|head to|return to|journey back/i.test(t)) return true;
    if (/^lunch|^dinner|^breakfast|thali/i.test(t) && !/annaprasadam|iskcon|temple/i.test(t)) return true;
    return false;
  }

  // ---------------------------------------------------------------- sanitise + validate
  function sanitizeStep(raw, path, ctx, issues, cityName) {
    if (!isObj(raw)) { issues.push({ level: 'warn', path: path, msg: 'Step is not an object and was dropped.' }); return null; }
    var title = cleanTo(raw.title || raw.name, LIMITS.title, issues, path + '.title');
    if (!title) { issues.push({ level: 'warn', path: path, msg: 'Step has no title and was dropped.' }); return null; }
    var where = cleanTo(raw.where || raw.place || raw.location, LIMITS.where, issues, path + '.where');
    var t = parseTime(raw.time != null ? raw.time : raw.startTime);
    if (!t && raw.hour != null) {
      var hv = typeof raw.hour === 'string' ? parseTime(raw.hour) : null;
      if (hv) t = hv;
      else if (typeof raw.hour === 'number') { t = parseTime(raw.hour + (raw.minute ? raw.minute / 60 : 0)); }
    }
    var icon = typeof raw.icon === 'string' && ICONS.indexOf(raw.icon.trim()) >= 0 ? raw.icon.trim() : '';
    if (!icon) {
      icon = guessIcon(title, where);
      if (raw.icon) issues.push({ level: 'info', path: path + '.icon', msg: 'Unknown icon "' + cleanTo(raw.icon, 30) + '" replaced with "' + icon + '".' });
    }
    var step = { title: title, where: where, hour: t ? t.h : null, minute: t ? t.m : 0, icon: icon, mapsUrl: '', notes: '', verify: [] };
    var url = safeMapsUrl(raw.mapsUrl || raw.mapUrl || raw.maps_url || raw.map);
    if (url) {
      step.mapsUrl = url;
      // keep the "auto-generated" mark across re-validation (a search link we built ourselves)
      if (raw.mapsAuto === true && url.indexOf(searchUrl('')) === 0 && !isNoMapStep(title, where, icon)) {
        step.mapsAuto = true;
        step.mapsUrl = searchUrl(placeQuery(title, where, cityName));
      } else if (raw.mapsAuto === true && url.indexOf(searchUrl('')) === 0) {
        step.mapsAuto = true;
      }
    } else {
      if (raw.mapsUrl || raw.mapUrl) issues.push({ level: 'info', path: path + '.mapsUrl', msg: 'Map link was not a Google Maps link and was replaced by a search link.' });
      if (!isNoMapStep(title, where, icon)) {
        step.mapsUrl = searchUrl(placeQuery(title, where, cityName));
        step.mapsAuto = true;
      }
    }
    step.notes = cleanTo(raw.notes || raw.description || raw.tip, LIMITS.notes, issues, path + '.notes');
    var d = toInt(raw.durationMin != null ? raw.durationMin : raw.duration, 5, 720);
    if (d) step.durationMin = d;
    step.verify = stringList(raw.verify, 10, LIMITS.verify, issues, path + '.verify');
    return step;
  }

  function sanitizeTrip(raw, ctx) {
    ctx = ctx || {};
    var idx = ctx.catalogIndex || buildCatalogIndex(ctx.catalog);
    var issues = [];
    if (!isObj(raw)) return { trip: null, issues: [{ level: 'error', path: '', msg: 'Trip is not an object.' }] };

    var t = { schema: SCHEMA_VERSION };
    t.id = slug(raw.id) || '';
    t.rev = toInt(raw.rev, 1, 100000) || 1;
    t.status = raw.status === 'approved' ? 'approved' : 'draft';
    t.title = cleanTo(raw.title, LIMITS.title, issues, 'title');
    t.tagline = cleanTo(raw.tagline || raw.subtitle, LIMITS.tagline, issues, 'tagline');

    var originTok = raw.originCity || raw.origin || raw.from || raw.originName || '';
    if (isObj(originTok)) originTok = originTok.id || originTok.name || '';
    var originId = resolveCity(String(originTok), idx);
    t.originCity = originId;
    t.originName = originId ? idx.byId[originId].name : cleanTo(raw.originName || String(originTok), 60, issues, 'originName');

    // days
    var rawDays = Array.isArray(raw.days) ? raw.days.slice() : [];
    if (rawDays.length && rawDays.every(function (d) { return isObj(d) && typeof d.day === 'number'; })) {
      var sorted = rawDays.slice().sort(function (a, b) { return a.day - b.day; });
      if (sorted.some(function (d, i) { return d !== rawDays[i]; })) issues.push({ level: 'info', path: 'days', msg: 'Days were put in numeric order.' });
      rawDays = sorted;
    }
    if (rawDays.length > LIMITS.maxDays) { issues.push({ level: 'warn', path: 'days', msg: 'Only the first ' + LIMITS.maxDays + ' days were kept.' }); rawDays = rawDays.slice(0, LIMITS.maxDays); }
    t.days = [];
    var guessedTimes = 0, inferred = [];
    rawDays.forEach(function (rd, di) {
      var dp = 'days[' + di + ']';
      if (!isObj(rd)) { issues.push({ level: 'warn', path: dp, msg: 'Day is not an object and was dropped.' }); return; }
      var dayCityTok = rd.city || rd.cityId || rd.location || '';
      var dayCityId = resolveCity(String(dayCityTok), idx);
      var dayCityName = dayCityId ? idx.byId[dayCityId].name : cleanTo(String(dayCityTok), 60, issues, dp + '.city');
      var day = { day: t.days.length + 1, title: cleanTo(rd.title, LIMITS.title, issues, dp + '.title'), cityId: dayCityId, cityName: dayCityName, steps: [] };
      var rawSteps = Array.isArray(rd.steps) ? rd.steps : [];
      if (rawSteps.length > LIMITS.stepsPerDay) { issues.push({ level: 'warn', path: dp + '.steps', msg: 'Only the first ' + LIMITS.stepsPerDay + ' steps were kept.' }); rawSteps = rawSteps.slice(0, LIMITS.stepsPerDay); }
      rawSteps.forEach(function (rs, si) {
        var st = sanitizeStep(rs, dp + '.steps[' + si + ']', ctx, issues, dayCityName);
        if (st) day.steps.push(st);
      });
      // fill missing times: continue from the previous step, one hour apart, starting at 09:00
      var prev = null;
      day.steps.forEach(function (st, si) {
        if (st.hour == null) {
          guessedTimes++;
          st.hour = prev ? Math.min(23, prev.hour + 1) : 9; st.minute = prev ? prev.minute : 0;
        }
        prev = st;
      });
      var before = day.steps.map(function (s) { return s.title; }).join('|');
      day.steps = day.steps.map(function (s, i) { return { s: s, i: i }; })
        .sort(function (a, b) { return (a.s.hour * 60 + a.s.minute) - (b.s.hour * 60 + b.s.minute) || a.i - b.i; })
        .map(function (o) { return o.s; });
      if (before !== day.steps.map(function (s) { return s.title; }).join('|')) issues.push({ level: 'info', path: dp + '.steps', msg: 'Steps were out of time order and have been sorted.' });
      if (!day.cityId && idx.size && day.steps.length) {
        var inf = inferDayCity(day.steps, idx, originId);
        if (inf) { day.cityId = inf; day.cityName = idx.byId[inf].name; inferred.push(inf); }
      }
      t.days.push(day);
    });
    if (inferred.length) issues.push({ level: 'info', path: 'days', msg: 'City was missing from the day headers, so it was taken from the step places: ' + inferred.filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ') + '.' });
    if (guessedTimes) issues.push({ level: 'warn', path: 'days', msg: guessedTimes + ' step(s) had no usable time and were given placeholder times. Check them.' });
    t.durationDays = t.days.length;
    var statedDays = toInt(raw.durationDays, 1, 14);
    if (statedDays && statedDays !== t.durationDays) issues.push({ level: 'info', path: 'durationDays', msg: 'Stated ' + statedDays + ' days but ' + t.durationDays + ' day(s) of steps were found. Using ' + t.durationDays + '.' });

    t.kind = pickEnum(raw.kind || raw.type, KINDS);
    if (!t.kind) {
      t.kind = t.durationDays <= 2 ? 'weekend' : 'long-weekend';
      issues.push({ level: 'info', path: 'kind', msg: 'Trip type was missing or unknown; set to "' + t.kind + '" from the number of days.' });
    }

    t.bestMonths = parseMonths(raw.bestMonths || raw.bestTime || raw.months);
    t.faiths = faithList(raw.faiths != null ? raw.faiths : raw.faith);
    var tasteIn = isObj(raw.taste) ? raw.taste : {};
    var intent = normIntent(tasteIn.intent != null ? tasteIn.intent : raw.intent);
    var diet = normDiet(tasteIn.diet != null ? tasteIn.diet : raw.diet);
    var pace = normPace(tasteIn.pace != null ? tasteIn.pace : raw.pace);
    if (!intent && t.faiths.length) intent = 'spiritual';
    if (!intent) { intent = 'mixed'; issues.push({ level: 'info', path: 'taste.intent', msg: 'Interest missing or unknown; set to "mixed".' }); }
    if (!diet) { diet = 'any'; issues.push({ level: 'info', path: 'taste.diet', msg: 'Food preference missing or unknown; set to "any".' }); }
    if (!pace) { pace = 'standard'; issues.push({ level: 'info', path: 'taste.pace', msg: 'Pace missing or unknown; set to "standard".' }); }
    t.taste = { intent: intent, diet: diet, pace: pace };
    t.audience = (Array.isArray(raw.audience) ? raw.audience : (typeof raw.audience === 'string' ? [raw.audience] : []))
      .map(function (a) { return pickEnum(a, AUDIENCES); }).filter(function (a, i, arr) { return a && arr.indexOf(a) === i; });
    t.budget = pickEnum(raw.budget, BUDGETS) || 'mid';
    t.track = cleanTo(raw.track || raw.theme, 60, issues, 'track');
    t.ideaId = slug(raw.ideaId);
    t.variantOf = slug(raw.variantOf);

    var tr = isObj(raw.transport) ? raw.transport : {};
    var hours = typeof tr.approxTravelHours === 'number' ? tr.approxTravelHours : parseFloat(tr.approxTravelHours);
    t.transport = {
      mode: pickEnum(tr.mode, MODES) || 'road',
      note: cleanTo(tr.note, LIMITS.transportNote, issues, 'transport.note'),
      approxTravelHours: isFinite(hours) && hours > 0 && hours <= 48 ? Math.round(hours * 10) / 10 : null
    };

    // cities (catalog ids only)
    var cityIds = [], unmatched = [];
    var tokens = (Array.isArray(raw.cities) ? raw.cities : []).slice(0, 12);
    tokens.forEach(function (c) {
      var tok = isObj(c) ? (c.id || c.name) : c;
      if (typeof tok !== 'string') return;
      var id = resolveCity(tok, idx);
      if (id) { if (cityIds.indexOf(id) < 0) cityIds.push(id); }
      else if (idx.size) unmatched.push(cleanTo(tok, 60));
    });
    t.days.forEach(function (d) { if (d.cityId && cityIds.indexOf(d.cityId) < 0) cityIds.push(d.cityId); else if (!d.cityId && d.cityName && idx.size) unmatched.push(d.cityName); });
    t.cities = cityIds;
    unmatched = unmatched.filter(function (n, i, a) { return n && a.indexOf(n) === i; });
    if (unmatched.length) issues.push({ level: 'warn', path: 'cities', msg: 'Not in the KYT city catalog (kept out of "cities"): ' + unmatched.join(', ') + '.' });
    if (!idx.size) issues.push({ level: 'warn', path: 'cities', msg: 'City catalog not loaded, so city ids could not be checked.' });

    t.highlights = stringList(raw.highlights, 12, LIMITS.highlight, issues, 'highlights');
    t.tips = stringList(raw.tips, 12, LIMITS.tip, issues, 'tips');

    t.beforeYouGo = sanitizeBeforeYouGo(raw.beforeYouGo != null ? raw.beforeYouGo : raw.beforeYouGoList, issues);
    t.specialDays = sanitizeSpecialDays(raw.specialDays != null ? raw.specialDays : raw.festivals, issues);

    t.sources = [];
    (Array.isArray(raw.sources) ? raw.sources : []).slice(0, 10).forEach(function (s) {
      if (!isObj(s)) return;
      var u = safeSourceUrl(s.url);
      if (u) t.sources.push({ name: cleanTo(s.name || s.title, 120) || u, url: u });
    });
    var g = isObj(raw.generated) ? raw.generated : {};
    t.generated = { via: pickEnum(g.via, ['paste', 'gemini-api', 'manual']) || 'manual', model: cleanTo(g.model, 60), at: cleanTo(g.at, 40) };
    t.updatedAt = cleanTo(raw.updatedAt, 40) || '';

    return { trip: t, issues: issues };
  }

  /**
   * Checks a sanitised trip. Only hard problems are errors. Everything editorial (length, pace, travel time,
   * duplicates, how packed a day is) is left to the editorial round, so nothing is flagged for it here.
   */
  function checkTrip(t) {
    var issues = [];
    function add(level, path, msg) { issues.push({ level: level, path: path, msg: msg }); }
    if (!t.title) add('error', 'title', 'Title is required.');
    if (!t.days.length) add('error', 'days', 'The trip has no days with steps.');
    if (!t.originCity) add('info', 'originCity', 'Starting city is not a catalog city.');
    if (!t.cities.length) add('info', 'cities', 'No catalog cities linked.');
    if (!t.bestMonths.length) add('info', 'bestMonths', 'No best months given.');
    if (t.taste.intent === 'spiritual' || t.faiths.length) {
      if (!t.beforeYouGo.length) add('info', 'beforeYouGo', 'Spiritual trip with no "Before you go" items (bookings, ID, dress code, rules).');
      if (!t.specialDays.length) add('info', 'specialDays', 'Spiritual trip with no special days (festivals, special darshan, closures, crowd peaks).');
    }
    t.days.forEach(function (d, di) {
      d.steps.forEach(function (s, si) {
        if (!s.where && TRAVEL_ICONS.indexOf(s.icon) < 0) add('info', 'days[' + di + '].steps[' + si + ']', 'Step "' + s.title + '" has no place.');
      });
    });
    return issues;
  }

  function summarise(t) {
    var steps = 0, verify = 0, auto = 0;
    t.days.forEach(function (d) { d.steps.forEach(function (s) { steps++; verify += s.verify.length ? 1 : 0; auto += s.mapsAuto ? 1 : 0; }); });
    return { steps: steps, perDay: t.days.map(function (d) { return d.steps.length; }), toVerify: verify, autoMapLinks: auto };
  }

  /** Full pipeline: sanitise then check. Idempotent, so the same call re-validates an edited trip. */
  function validateTrip(raw, ctx) {
    var r = sanitizeTrip(raw, ctx);
    if (!r.trip) return { trip: null, issues: r.issues, errors: 1, warnings: 0, stats: null };
    var all = r.issues.concat(checkTrip(r.trip));
    var errors = 0, warnings = 0;
    all.forEach(function (i) { if (i.level === 'error') errors++; else if (i.level === 'warn') warnings++; });
    return { trip: r.trip, issues: all, errors: errors, warnings: warnings, stats: summarise(r.trip) };
  }

  function makeId(trip, existingIds) {
    var tslug = slug(trip.title), base = slug([trip.originCity || trip.originName || 'any', trip.title, tslug.indexOf(trip.kind) >= 0 ? '' : trip.kind].join(' ')) || 'trip';
    var id = base, n = 2;
    while (existingIds.indexOf(id) >= 0) id = base + '-' + (n++);
    return id;
  }

  // ---------------------------------------------------------------- prompt
  var KIND_LABEL = { weekend: 'weekend (2 days)', 'long-weekend': 'long-weekend' };
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function briefOrigin(b, idx) {
    var known = b.originCity && idx.byId[b.originCity];
    return { name: known ? idx.byId[b.originCity].name : (cleanTo(b.originName, 60) || 'the origin city'), id: known ? b.originCity : '' };
  }

  function briefLines(b, origin, idx) {
    var months = (b.months || []).map(function (m) { return MONTH_NAMES[m - 1]; }).filter(Boolean);
    var days = toInt(b.days, 1, 14);
    var L = ['BRIEF'];
    L.push('- Starting and ending in: ' + origin.name);
    var destCities = Array.isArray(b.destinationCities) ? b.destinationCities : (Array.isArray(b.cities) ? b.cities : []);
    if (destCities.length) {
      var destNames = destCities.map(function (c) {
        var id = typeof c === 'string' ? c : (c && (c.id || c.name));
        var cityObj = idx && idx.byId ? idx.byId[id] : null;
        return cityObj ? cityObj.name : id;
      }).filter(Boolean);
      if (destNames.length) {
        L.push('- Destinations to visit in sequence: ' + destNames.join(' → '));
      }
    }
    L.push('- Length: ' + (days ? days + ' days' : 'a mix of 2-day weekend trips and 3 to 4 day long-weekend trips; state the days for each'));
    L.push('- Travelling in: ' + (months.length ? months.join(', ') : 'any month (give the best months for each)'));
    var intents = (b.intents || []).filter(function (i) { return INTENTS.indexOf(i) >= 0 && i !== 'mixed'; });
    if (b.intent && intents.indexOf(b.intent) < 0 && INTENTS.indexOf(b.intent) >= 0 && b.intent !== 'mixed') {
      intents.push(b.intent);
    }
    var faiths = (b.faiths || []).filter(function (f) { return FAITHS.indexOf(f) >= 0; });
    if (intents.length || faiths.length) {
      L.push('- Interests: ' + (intents.length ? intents.join(', ') : 'open') + (faiths.length && intents.indexOf('spiritual') >= 0 ? '. For the spiritual trips focus on these faiths: ' + faiths.join(', ') : ''));
    }
    if (b.diet && b.diet !== 'any') {
      L.push('- Food / Diet preference: ' + b.diet);
    }
    if (b.pace && b.pace !== 'standard') {
      L.push('- Pace: ' + b.pace);
    }
    if (b.notes) L.push('- Notes: ' + cleanTo(b.notes, 600));
    return L;
  }

  function catalogLines(b, ctx, idx, originId) {
    if (b.includeCatalog === false || !idx.size) return [];
    return ['', 'CITY IDS (id=name)' + (originId ? '; the origin is ' + originId : ''), (ctx.catalog || []).map(function (c) { return c.id + '=' + c.name; }).join('; ')];
  }

  var TAG_HELP = [
    'Tag every trip so the app can filter it:',
    '- "intent": ' + INTENTS.join(' | ') + ' (the main reason to go).',
    '- "faiths": only for spiritual trips, one or more of ' + FAITHS.join(', ') + '; otherwise an empty list.',
    '- "pace": short (relaxed, few stops) | standard | deep (packed, many stops).',
    '- "diet": veg, jain or satvik only if every meal stop suits it, else any.',
    '- "audience": any of ' + AUDIENCES.join(', ') + ' that the trip really suits.',
    '- "budget": ' + BUDGETS.join(' | ') + '. "mode": how most people would travel: ' + MODES.join(' | ') + '.',
    '- "track": a 2 to 3 word theme label such as "Hill escape" or "Temple trail".'
  ];

  /** Step 1: ask for a menu of ideas (no itineraries), so the editor can choose what to develop. */
  function buildMenuPrompt(b, ctx) {
    ctx = ctx || {};
    var idx = ctx.catalogIndex || buildCatalogIndex(ctx.catalog), origin = briefOrigin(b, idx);
    var count = toInt(b.ideaCount, 1, 40) || 12;
    var L = ['You are an editor at an Indian travel app that publishes a small set of hand-picked weekend and long-weekend trips from major cities.',
      'Propose ' + count + ' distinct trip IDEAS from ' + origin.name + '. Do not write itineraries yet; only the ideas.', ''];
    L = L.concat(briefLines(b, origin, idx));
    L.push('');
    L.push('RULES');
    L.push('1. Make the set varied: different destinations, a spread of interests, travellers, paces and seasons, so the app can offer a real choice. Do not repeat a destination unless the experience is clearly different.');
    L.push('2. Use only real places that are open to visitors, reachable from ' + origin.name + ' within a sensible journey for the trip length.');
    L.push('3. "pitch": one or two sentences saying why this trip is worth taking.');
    TAG_HELP.forEach(function (x, i) { L.push((i ? '' : '4. ') + x); });
    if (b.variant === 'gemini') { L.push('5. Use Google Maps to confirm each place exists and to estimate journey times.'); }
    L.push('');
    L.push('OUTPUT FORMAT');
    L.push('Return only one JSON object in a single ```json code block, with no text before or after it:');
    L.push('```json');
    L.push(JSON.stringify({ ideas: [{
      id: '<short-lowercase-id>', title: '<destination>: <short hook>', pitch: '<why go>', track: '<theme>', days: 2, bestMonths: [10, 11, 12, 1, 2],
      intent: '<' + INTENTS.join('|') + '>', faiths: [], pace: '<' + PACES.join('|') + '>', diet: '<' + DIETS.join('|') + '>',
      audience: ['<' + AUDIENCES.join('|') + '>'], budget: '<' + BUDGETS.join('|') + '>', mode: '<' + MODES.join('|') + '>',
      approxTravelHours: 0, cities: ['<city id>']
    }] }, null, 2));
    L.push('```');
    return L.concat(catalogLines(b, ctx, idx, origin.id)).join('\n');
  }

  function tripShape(days, ideaId) {
    return JSON.stringify({
      kytCurated: 1,
      trips: [{
        ideaId: ideaId || '', title: '<destination>: <short hook>', tagline: '<one line>', track: '<theme>',
        originCity: '<city id>', bestMonths: [10, 11, 12, 1, 2],
        taste: { intent: '<' + INTENTS.join('|') + '>', diet: '<' + DIETS.join('|') + '>', pace: '<' + PACES.join('|') + '>' },
        faiths: [], audience: ['<' + AUDIENCES.join('|') + '>'], budget: '<' + BUDGETS.join('|') + '>',
        transport: { mode: '<' + MODES.join('|') + '>', note: '<how to get there and back>', approxTravelHours: 0 },
        cities: ['<city id>'], highlights: ['<a few short items>'], tips: ['<a few short items>'],
        beforeYouGo: [{ type: '<' + BYG_TYPES.join('|') + '>', text: '<what the traveller must sort out first>' }],
        specialDays: [{ name: '<occasion or special day>', when: '<usual months or weekday>', effect: '<' + DAY_EFFECTS.join('|') + '>', note: '<what it means for a visitor>' }],
        days: [{ day: 1, title: '<day theme>', city: '<city id, or the town name if it is not in the list>', steps: [
          { time: 'HH:MM', title: '<name>', where: '<place, town>', icon: '<icon>', mapsUrl: '<optional Google Maps link>', notes: '<practical note>', durationMin: 60, verify: ['<optional>'] }
        ] }]
      }]
    }, null, 2);
  }

  function itineraryRules(b, ctx, idx) {
    var L = ['RULES'];
    L.push('1. Use only real places that are open to visitors today. Use each place\'s exact name as Google Maps shows it, and put the town in "where".');
    L.push('2. "time" is local 24-hour "HH:MM". List steps in time order. Day 1 starts with the journey out and the last day ends with the journey back, each as its own step with a travel icon.');
    L.push('3. Travel options: Day 1 departure and final day return steps must offer clear travel options in "notes" (e.g. By Express Train: ~X hrs; By Road/Cab: ~Y hrs; By Flight/Bus: ~Z hrs) so travellers can choose. Do NOT include a mapsUrl on transit steps.');
    L.push('4. Stay options: Stay steps must be open placeholders (title: "Hotel Check-in & Freshen up", icon: "hotel" or "bed"). In "notes", recommend the best neighborhood to stay in, and explicitly add: "Placeholder: Place your hotel Google Maps link here when you have reservations." Leave "mapsUrl" empty.');
    L.push('5. Meals: In "notes", recommend 2-3 genuine local spots or regional specialties. Leave "mapsUrl" empty unless it is an iconic, non-negotiable landmark dining hall (like temple Annaprasadam).');
    L.push('6. Google Maps links: "mapsUrl" must ONLY be included for specific, fixed destinations (temples, monuments, viewpoints, museums, shrines). Never invent links; if unsure, omit mapsUrl.');
    L.push('7. Pace it realistically, with travel time between places and proper meal breaks.');
    L.push('8. "verify": for anything that could be wrong or seasonal (opening hours, closed days, ticket prices, booking needs, train or bus timings) add a short phrase such as "closed Mondays". Do not invent prices or timetables; write "approx." when estimating.');
    L.push('9. "notes": short and practical. What it is, how long it takes, one tip.');
    L.push('10. Respect the food preference at every meal step.');
    L.push('11. "icon" must be one of: ' + ICONS.join(', ') + '.');
    if (b.includeCatalog !== false && idx.size) L.push('12. "cities" and "originCity" must use ids from the list at the end of this message. If a destination is not in the list, leave it out of "cities" but still use it in the steps.');
    L.push('Before you go: "beforeYouGo" lists the hard prerequisites a traveller must sort out first, each with a "type" of ' + BYG_TYPES.join(' | ') + '. Examples: darshan or ticket booking windows, original ID needed, dress code, phone and camera rules, permits. Use an empty list if there are none.');
    L.push('Special days: "specialDays" is for temples and other sacred places on the trip: festivals, special darshan or seva days, weekly special days, days the place is closed, and the busiest periods. Give "name", "when", "effect" (' + DAY_EFFECTS.join(' | ') + ') and a short "note" on what it means for a visitor. Many follow the lunar calendar, so do not give exact dates; give the occasion and the usual months, and say to confirm with the temple. Leave the list empty if the trip has no sacred places.');
    L.push('Do not put prices in "tips". If a fee matters, write "approx." and add it to "verify".');
    TAG_HELP.forEach(function (x) { L.push(x); });
    L.push(b.variant === 'gemini'
      ? 'Use Google Maps to confirm that each place exists and is open to visitors, and to estimate realistic travel times between stops.'
      : 'If you cannot check live information, say so by adding "verify" notes to the affected steps. Do not guess.');
    return L;
  }

  function outputBlock(days, ideaId) {
    return ['', 'OUTPUT FORMAT', 'Return only one JSON object in a single ```json code block, with no text before or after it. Use this shape:', '```json', tripShape(days, ideaId), '```'];
  }

  /** Step 2: full itinerary. Pass b.idea (a sanitised idea) to develop one idea; otherwise one trip from the brief. */
  function buildPrompt(b, ctx) {
    ctx = ctx || {};
    var idx = ctx.catalogIndex || buildCatalogIndex(ctx.catalog), origin = briefOrigin(b, idx), idea = b.idea;
    var L = [];
    if (idea) {
      var days = toInt(idea.days, 1, 14) || toInt(b.days, 1, 14) || 2;
      L.push('You are an editor at an Indian travel app. Write the full ' + days + '-day itinerary for this one trip idea, starting and ending in ' + origin.name + '.', '');
      L.push('TRIP IDEA');
      L.push(JSON.stringify({ id: idea.id, title: idea.title, pitch: idea.pitch, track: idea.track, days: days, bestMonths: idea.bestMonths, intent: idea.intent, faiths: idea.faiths,
        pace: idea.pace, diet: idea.diet, audience: idea.audience, budget: idea.budget, mode: idea.mode, cities: idea.cities }, null, 2));
      L.push('Keep the idea\'s id as "ideaId", and keep its tags unless the research shows a tag is wrong.');
      if (b.notes) { L.push(''); L.push('Extra notes: ' + cleanTo(b.notes, 600)); }
      L.push('');
      return L.concat(itineraryRules(b, ctx, idx), outputBlock(days, idea.id), catalogLines(b, ctx, idx, origin.id)).join('\n');
    }
    var destCities = Array.isArray(b.destinationCities) ? b.destinationCities : (Array.isArray(b.cities) ? b.cities : []);
    var days = toInt(b.days, 1, 14) || (destCities.length ? Math.min(14, Math.max(1, destCities.length)) : 2);
    L.push('You are an editor at an Indian travel app. Create one curated trip, starting and ending in ' + origin.name + '.', '');
    L = L.concat(briefLines(b, origin, idx), ['']);

    if (destCities.length && idx && idx.byId) {
      var beatsLines = [];
      destCities.forEach(function (c) {
        var id = typeof c === 'string' ? c : (c && (c.id || c.name));
        var city = idx.byId[id];
        if (city && ((city.beats && city.beats.length) || city.notes || city.desc)) {
          beatsLines.push('City: ' + city.name + (city.state ? ' (' + city.state + ')' : ''));
          if (city.notes || city.desc) beatsLines.push('Overview: ' + (city.notes || city.desc));
          if (city.beats && city.beats.length) {
            beatsLines.push('Key Candidate Attractions & Experiences:');
            city.beats.forEach(function (bt) {
              var timeHint = bt.hour != null ? ' ~ ' + pad(bt.hour) + ':00' : '';
              var verifyHint = bt.verify && bt.verify.length ? ' [Rules/Timings: ' + bt.verify.join('; ') + ']' : '';
              var mapHint = bt.mapsUrl ? ' [Map: ' + bt.mapsUrl + ']' : '';
              beatsLines.push('  - ' + bt.title + ' (' + (bt.where || city.name) + ')' + timeHint + verifyHint + mapHint);
              if (bt.notes) beatsLines.push('    Notes: ' + bt.notes);
            });
          }
          beatsLines.push('');
        }
      });
      if (beatsLines.length) {
        L.push('CANDIDATE ATTRACTIONS & CITY BEATS FROM KYT CATALOG:');
        L = L.concat(beatsLines);
      }
    }

    return L.concat(itineraryRules(b, ctx, idx), outputBlock(days, ''), catalogLines(b, ctx, idx, origin.id)).join('\n');
  }

  /** Variation of an existing trip, for a different audience, pace, season or focus. */
  function buildVariationPrompt(trip, twist, b, ctx) {
    ctx = ctx || {}; b = b || {};
    var idx = ctx.catalogIndex || buildCatalogIndex(ctx.catalog), origin = briefOrigin({ originCity: trip.originCity, originName: trip.originName }, idx);
    var compact = {
      title: trip.title, tagline: trip.tagline, track: trip.track, bestMonths: trip.bestMonths, taste: trip.taste, faiths: trip.faiths, audience: trip.audience, budget: trip.budget,
      days: trip.days.map(function (d) { return { day: d.day, title: d.title, city: d.cityId || d.cityName, steps: d.steps.map(function (s) { return s.hour != null ? pad(s.hour) + ':' + pad(s.minute) + ' ' + s.title + (s.where ? ' (' + s.where + ')' : '') : s.title; }) }; })
    };
    var L = ['You are an editor at an Indian travel app. Below is an existing trip. Write a VARIATION of it, starting and ending in ' + origin.name + '.', '',
      'EXISTING TRIP', JSON.stringify(compact, null, 2), '',
      'WHAT TO CHANGE', cleanTo(twist, 400) || 'Make it suit a different kind of traveller.',
      'Keep what still works. Change the places, timings, meals and tags that the change requires, and give it a new title. Set "ideaId" to "' + slug(trip.ideaId || trip.id) + '" and add "variantOf": "' + slug(trip.id) + '".', ''];
    return L.concat(itineraryRules(b, ctx, idx), outputBlock(trip.durationDays, slug(trip.ideaId || trip.id)), catalogLines(b, ctx, idx, origin.id)).join('\n');
  }

  // ---------------------------------------------------------------- ideas (step 1 of the flow)
  function sanitizeIdea(raw, ctx) {
    ctx = ctx || {};
    var idx = ctx.catalogIndex || buildCatalogIndex(ctx.catalog), issues = [];
    if (!isObj(raw)) return null;
    var title = cleanTo(raw.title || raw.name, LIMITS.title, issues, 'title');
    if (!title) return null;
    var days = toInt(raw.days != null ? raw.days : raw.durationDays, 1, 14) || 2;
    var cities = [];
    (Array.isArray(raw.cities) ? raw.cities : []).slice(0, 12).forEach(function (c) {
      var id = resolveCity(String(isObj(c) ? (c.id || c.name || '') : c), idx);
      if (id && cities.indexOf(id) < 0) cities.push(id);
    });
    var hours = typeof raw.approxTravelHours === 'number' ? raw.approxTravelHours : parseFloat(raw.approxTravelHours);
    return {
      id: slug(raw.id) || slug(title), title: title, pitch: cleanTo(raw.pitch || raw.tagline || raw.description, 600),
      track: cleanTo(raw.track || raw.theme, 60), days: days, kind: days <= 2 ? 'weekend' : 'long-weekend', bestMonths: parseMonths(raw.bestMonths || raw.months),
      intent: normIntent(raw.intent) || 'mixed', faiths: faithList(raw.faiths != null ? raw.faiths : raw.faith), pace: normPace(raw.pace) || 'standard', diet: normDiet(raw.diet) || 'any',
      audience: (Array.isArray(raw.audience) ? raw.audience : (typeof raw.audience === 'string' ? [raw.audience] : [])).map(function (a) { return pickEnum(a, AUDIENCES); }).filter(function (a, i, arr) { return a && arr.indexOf(a) === i; }),
      budget: pickEnum(raw.budget, BUDGETS) || 'mid', mode: pickEnum(raw.mode || (isObj(raw.transport) && raw.transport.mode), MODES) || 'road',
      approxTravelHours: isFinite(hours) && hours > 0 && hours <= 48 ? Math.round(hours * 10) / 10 : null, cities: cities
    };
  }

  /** Accepts {ideas:[...]}, a bare array, or a single idea. Returns sanitised ideas with unique ids. */
  function parseIdeas(value, ctx) {
    var list = Array.isArray(value) ? value : (isObj(value) && Array.isArray(value.ideas) ? value.ideas : (isObj(value) ? [value] : []));
    var out = [], seen = {};
    list.slice(0, 60).forEach(function (r) {
      var it = sanitizeIdea(r, ctx); if (!it) return;
      var base = it.id || 'idea', id = base, n = 2;
      while (seen[id]) id = base + '-' + (n++);
      it.id = id; seen[id] = 1; out.push(it);
    });
    return out;
  }

  // ---------------------------------------------------------------- export / import of the data file
  function stableSort(trips) {
    return trips.slice().sort(function (a, b) {
      return (a.originCity || '').localeCompare(b.originCity || '') || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title);
    });
  }

  function exportJs(trips, opts) {
    opts = opts || {};
    var list = trips.filter(function (t) { return opts.includeDrafts || t.status === 'approved'; });
    var bad = [];
    list.forEach(function (t) { var v = validateTrip(t, opts.ctx); if (!v.trip || v.errors) bad.push(t.title || t.id || '(untitled)'); });
    if (bad.length) throw new Error('Fix errors before export: ' + bad.join(', '));
    var clean = stableSort(list.map(function (t) { return validateTrip(t, opts.ctx).trip; }));
    var json = JSON.stringify(clean, null, 2).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return '/* KYT curated trips. Generated by KYT Admin; edit in the admin app, not by hand. */\n' +
      'window.KYT_CURATED_TRIPS_SCHEMA = ' + SCHEMA_VERSION + ';\n' +
      'window.KYT_CURATED_TRIPS_GENERATED_AT = ' + JSON.stringify(opts.generatedAt || new Date().toISOString()) + ';\n' +
      'window.KYT_CURATED_TRIPS = ' + json + ';\n';
  }

  /** Reads a file written by exportJs without evaluating it. */
  function parseExport(text) {
    var marker = 'window.KYT_CURATED_TRIPS =';
    var at = typeof text === 'string' ? text.indexOf(marker) : -1;
    if (at < 0) throw new Error('This does not look like a curated_trips.js file.');
    var open = text.indexOf('[', at);
    if (open < 0) throw new Error('No trip list found in the file.');
    var end = findJsonEnd(text, open);
    if (end < 0) throw new Error('The trip list in the file is cut off.');
    var arr = JSON.parse(text.slice(open, end));
    if (!Array.isArray(arr)) throw new Error('The trip list is not an array.');
    return arr;
  }

  // ---------------------------------------------------------------- KYT-side conversions (same logic KYT needs)
  function parseDateOnly(v) {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  /** Steps in the shape KYT's main trip store uses. */
  function toKytSteps(trip, startDate, idBase) {
    var start = parseDateOnly(startDate) || parseDateOnly(new Date());
    var base = idBase || Date.now();
    var out = [], n = 0;
    trip.days.forEach(function (d) {
      d.steps.forEach(function (s) {
        var when = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (d.day - 1), s.hour, s.minute, 0, 0);
        out.push({ id: base + (n++), title: s.title, icon: s.icon, where: s.where || d.cityName || '', mapUrl: s.mapsUrl || '',
          notes: s.notes || '', targetTime: when, status: 'todo', attachments: [] });
      });
    });
    return out;
  }

  /** A virtual-trip record (same shape KYT's Virtual Trips screen stores), ready to open in KYT. */
  function toVirtualTrip(trip, idBase) {
    var base = idBase || Date.now().toString(36);
    var steps = [], n = 0;
    trip.days.forEach(function (d) {
      d.steps.forEach(function (s) {
        steps.push({ id: base + '-' + (n++), dayId: d.day, cityName: d.cityName, title: s.title, notes: s.notes, icon: s.icon,
          hour: s.hour, minute: s.minute, where: s.where, mapsUrl: s.mapsUrl });
      });
    });
    return { id: base, name: trip.title, cities: trip.cities.slice(), taste: Object.assign({}, trip.taste), steps: steps, curatedId: trip.id, curatedRev: trip.rev };
  }

  // ---------------------------------------------------------------- Gemini response helpers
  function extractGeminiText(resp) {
    if (!isObj(resp)) return '';
    if (typeof resp.output_text === 'string') return resp.output_text;
    var texts = [];
    if (Array.isArray(resp.steps)) {
      for (var i = resp.steps.length - 1; i >= 0; i--) {
        var st = resp.steps[i], here = [];
        var blocks = Array.isArray(st.content) ? st.content : [];
        blocks.forEach(function (b) { if (b && typeof b.text === 'string' && b.type !== 'thought') here.push(b.text); });
        if (here.length) { texts = here.concat(texts); } else if (texts.length) break;
      }
      if (texts.length) return texts.join('');
    }
    if (Array.isArray(resp.candidates) && resp.candidates[0] && resp.candidates[0].content && Array.isArray(resp.candidates[0].content.parts)) {
      return resp.candidates[0].content.parts.map(function (p) { return typeof p.text === 'string' ? p.text : ''; }).join('');
    }
    return '';
  }

  /** Best-effort: collect {name,url} pairs found under any "annotations" array in the response. */
  function extractSources(resp) {
    var found = [], seen = {};
    (function walk(v, inAnn, depth) {
      if (depth > 12 || v == null) return;
      if (Array.isArray(v)) { v.forEach(function (x) { walk(x, inAnn, depth + 1); }); return; }
      if (!isObj(v)) return;
      if (inAnn && typeof v.url === 'string') {
        var u = safeSourceUrl(v.url);
        if (u && !seen[u]) { seen[u] = 1; found.push({ name: cleanTo(v.title || v.name || v.source_name || '', 120) || u, url: u }); }
      }
      Object.keys(v).forEach(function (k) { walk(v[k], inAnn || k === 'annotations', depth + 1); });
    })(resp, false, 0);
    return found.slice(0, 10);
  }

  var API = {
    SCHEMA_VERSION: SCHEMA_VERSION, ICONS: ICONS, TRAVEL_ICONS: TRAVEL_ICONS, KINDS: KINDS, INTENTS: INTENTS, DIETS: DIETS,
    PACES: PACES, BUDGETS: BUDGETS, AUDIENCES: AUDIENCES, MODES: MODES, MONTH_NAMES: MONTH_NAMES, LIMITS: LIMITS,
    cleanTo: cleanTo, slug: slug, parseTime: parseTime, safeMapsUrl: safeMapsUrl, searchUrl: searchUrl,
    buildCatalogIndex: buildCatalogIndex, resolveCity: resolveCity, parseMonths: parseMonths,
    extractJson: extractJson, toTripList: toTripList, validateTrip: validateTrip, makeId: makeId, pad: pad,
    buildPrompt: buildPrompt, buildMenuPrompt: buildMenuPrompt, buildVariationPrompt: buildVariationPrompt, parseIdeas: parseIdeas, FAITHS: FAITHS, BYG_TYPES: BYG_TYPES, DAY_EFFECTS: DAY_EFFECTS, exportJs: exportJs, parseExport: parseExport, toKytSteps: toKytSteps, toVirtualTrip: toVirtualTrip,
    extractGeminiText: extractGeminiText, extractSources: extractSources
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.KYTAdmin = API;
})(typeof window !== 'undefined' ? window : globalThis);
