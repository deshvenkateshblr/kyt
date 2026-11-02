/* Run: node admin/tests/core.test.js   (optionally with TZ=Asia/Kolkata or TZ=America/Los_Angeles) */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
var K = require('../core.js');

var passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

// Real catalog, if available (symlinked data/ folder)
var catalog = [];
try {
  var ctx0 = {}; ctx0.window = ctx0; vm.createContext(ctx0);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'cities.js'), 'utf8'), ctx0);
  catalog = ctx0.KYT_CITIES || [];
} catch (e) { /* tests that need the catalog are skipped */ }
var ctx = { catalog: catalog, catalogIndex: K.buildCatalogIndex(catalog) };

function goodTrip(over) {
  return Object.assign({
    title: 'Hampi: ruins and sunsets', tagline: 'Two days among ruins', originCity: 'bengaluru', kind: 'long-weekend',
    bestMonths: [10, 11, 12, 1, 2], taste: { intent: 'cultural', diet: 'any', pace: 'standard' }, audience: ['friends'],
    budget: 'mid', transport: { mode: 'road', note: 'Drive or overnight bus', approxTravelHours: 6.5 },
    cities: ['hampi'], highlights: ['Virupaksha Temple'], tips: ['Carry cash'],
    days: [
      { day: 1, title: 'Arrive', city: 'hampi', steps: [
        { time: '06:30', title: 'Drive to Hampi', where: 'Bengaluru to Hampi', icon: 'car' },
        { time: '10:00', title: 'Virupaksha Temple', where: 'Virupaksha Temple, Hampi', icon: 'landmark', notes: 'Go early.' }] },
      { day: 2, title: 'Return', city: 'hampi', steps: [
        { time: '07:00', title: 'Matanga Hill sunrise', where: 'Matanga Hill, Hampi', icon: 'sun' },
        { time: '15:00', title: 'Drive back', where: 'Hampi to Bengaluru', icon: 'car' }] }
    ]
  }, over || {});
}

console.log('extractJson');
test('plain object', function () { assert.strictEqual(K.extractJson('{"title":"A","days":[]}').value.title, 'A'); });
test('fenced block with chatter around it', function () {
  var r = K.extractJson('Sure! Here you go:\n```json\n{"trips":[{"title":"A","days":[]}]}\n```\nLet me know if you want more.');
  assert.strictEqual(r.value.trips[0].title, 'A');
});
test('curly quotes and trailing commas are repaired', function () {
  var r = K.extractJson('{“title”: “A”, "days": [],}');
  assert.strictEqual(r.value.title, 'A'); assert.ok(r.notes.length >= 1);
});
test('first fenced block is irrelevant, second has the trips', function () {
  var r = K.extractJson('```json\n{"hello": 1}\n```\n```json\n{"trips":[{"title":"B","days":[]}]}\n```');
  assert.strictEqual(r.value.trips[0].title, 'B');
});
test('braces inside strings do not confuse the scanner', function () {
  var r = K.extractJson('{"title":"A } tricky { title","days":[]}');
  assert.strictEqual(r.value.title, 'A } tricky { title');
});
test('truncated output gives a clear message', function () {
  assert.throws(function () { K.extractJson('```json\n{"trips":[{"title":"A","days":[{"day":1,"steps":[{"title":"x"'); }, /cut off/);
});
test('syntax error reports a position', function () {
  assert.throws(function () { K.extractJson('{"title": A, "days": []}'); }, /Could not read the JSON/);
});
test('no JSON at all', function () { assert.throws(function () { K.extractJson('I cannot help with that.'); }, /No JSON found/); });
test('empty input', function () { assert.throws(function () { K.extractJson('   '); }, /Nothing to parse/); });

console.log('validateTrip');
test('good trip has no errors and sensible stats', function () {
  var v = K.validateTrip(goodTrip(), ctx);
  assert.strictEqual(v.errors, 0, JSON.stringify(v.issues.filter(function (i) { return i.level === 'error'; })));
  assert.strictEqual(v.stats.steps, 4); assert.strictEqual(v.trip.durationDays, 2);
});
test('HTML in text is stripped and flagged', function () {
  var v = K.validateTrip(goodTrip({ title: '<img src=x onerror=alert(1)>Goa <b>trip</b>' }), ctx);
  assert.ok(!/[<>]/.test(v.trip.title), v.trip.title);
  assert.ok(v.issues.some(function (i) { return /tags were removed/.test(i.msg); }));
});
test('javascript: and non-Google map links are replaced', function () {
  var t = goodTrip(); t.days[0].steps[1].mapsUrl = 'javascript:alert(1)'; t.days[1].steps[0].mapsUrl = 'https://evil.example/maps/x';
  var v = K.validateTrip(t, ctx);
  v.trip.days.forEach(function (d) { d.steps.forEach(function (s) { assert.ok(!s.mapsUrl || /^https:\/\/www\.google\.com\/maps\//.test(s.mapsUrl), s.mapsUrl); }); });
  assert.ok(v.trip.days[0].steps[1].mapsAuto);
});
test('real Google Maps links are kept', function () {
  var t = goodTrip(); t.days[0].steps[1].mapsUrl = 'https://maps.app.goo.gl/abc123';
  assert.strictEqual(K.validateTrip(t, ctx).trip.days[0].steps[1].mapsUrl, 'https://maps.app.goo.gl/abc123');
});
test('travel, hotel, and check-in steps get no auto map link', function () {
  var t = goodTrip();
  t.days[0].steps.push({ time: '12:00', title: 'Hotel Check-in & Freshen up', where: 'Hampi Bazaar, Hampi', icon: 'bed' });
  var v = K.validateTrip(t, ctx);
  assert.strictEqual(v.trip.days[0].steps[0].mapsUrl, ''); // travel step
  assert.strictEqual(v.trip.days[0].steps[2].mapsUrl, ''); // hotel step
});
test('times: am/pm, 24h, numbers, and bad values', function () {
  assert.deepStrictEqual(K.parseTime('9:30 am'), { h: 9, m: 30 }); assert.deepStrictEqual(K.parseTime('9 pm'), { h: 21, m: 0 });
  assert.deepStrictEqual(K.parseTime('21:05'), { h: 21, m: 5 }); assert.deepStrictEqual(K.parseTime(9.5), { h: 9, m: 30 });
  assert.deepStrictEqual(K.parseTime('12 am'), { h: 0, m: 0 });
  assert.strictEqual(K.parseTime('25:00'), null); assert.strictEqual(K.parseTime('soon'), null); assert.strictEqual(K.parseTime(24), null);
});
test('unsorted steps are sorted and flagged', function () {
  var t = goodTrip(); t.days[0].steps.reverse();
  var v = K.validateTrip(t, ctx);
  assert.strictEqual(v.trip.days[0].steps[0].title, 'Drive to Hampi');
  assert.ok(v.issues.some(function (i) { return /out of time order/.test(i.msg); }));
});
test('missing times get placeholders and a warning', function () {
  var t = goodTrip(); t.days[0].steps.forEach(function (s) { delete s.time; });
  var v = K.validateTrip(t, ctx);
  assert.strictEqual(v.trip.days[0].steps[0].hour, 9); assert.ok(v.issues.some(function (i) { return /placeholder times/.test(i.msg); }));
});
test('unknown icon is replaced by a guess', function () {
  var t = goodTrip(); t.days[0].steps[1].icon = 'museum'; t.days[0].steps[1].title = 'City Museum';
  assert.strictEqual(K.validateTrip(t, ctx).trip.days[0].steps[1].icon, 'landmark');
});
test('no days is an error', function () { assert.ok(K.validateTrip(goodTrip({ days: [] }), ctx).errors >= 1); });
test('no title is an error', function () { assert.ok(K.validateTrip(goodTrip({ title: '' }), ctx).errors >= 1); });
test('long trips and busy days are not flagged (editorial round decides)', function () {
  var d = goodTrip().days; var t = goodTrip({ kind: 'weekend', transport: { mode: 'road', note: '', approxTravelHours: 9 }, days: [d[0], d[1], d[0], d[1], d[0], d[1], d[0]] });
  var v = K.validateTrip(t, ctx);
  assert.strictEqual(v.trip.days.length, 7); assert.strictEqual(v.errors, 0); assert.strictEqual(v.warnings, 0);
});
test('hostile input is still bounded', function () {
  var t = goodTrip(); t.days = []; for (var i = 0; i < 40; i++) t.days.push(goodTrip().days[0]);
  assert.strictEqual(K.validateTrip(t, ctx).trip.days.length, 14);
});
test('stated day count that disagrees is corrected with a warning', function () {
  var v = K.validateTrip(goodTrip({ durationDays: 4 }), ctx);
  assert.strictEqual(v.trip.durationDays, 2); assert.ok(v.issues.some(function (i) { return i.path === 'durationDays'; }));
});
test('faiths normalise and track/ideaId are kept', function () {
  var v = K.validateTrip(goodTrip({ faiths: ['Sikhism', 'islam', 'Hindu', 'hindu', 'Zoroastrian'], track: 'Temple <b>trail</b>', ideaId: 'Amritsar Gold' }), ctx);
  assert.deepStrictEqual(v.trip.faiths, ['sikh', 'muslim', 'hindu', 'other']);
  assert.strictEqual(v.trip.track, 'Temple trail'); assert.strictEqual(v.trip.ideaId, 'amritsar-gold');
});
test('missing intent becomes spiritual when faiths are given; religion is a synonym', function () {
  var v = K.validateTrip(goodTrip({ taste: { diet: 'any', pace: 'standard' }, faiths: ['sikh'] }), ctx);
  assert.strictEqual(v.trip.taste.intent, 'spiritual');
  assert.strictEqual(K.parseIdeas([{ title: 'X', intent: 'religion' }], ctx)[0].intent, 'spiritual');
});
test('ids do not repeat the trip kind', function () {
  assert.strictEqual(K.makeId({ originCity: 'delhi', title: 'Amritsar weekend', kind: 'weekend' }, []), 'delhi-amritsar-weekend');
});
test('faiths accept a comma string and are empty by default', function () {
  assert.deepStrictEqual(K.validateTrip(goodTrip({ faiths: 'Hindu, Buddhist and Jain' }), ctx).trip.faiths, ['hindu', 'buddhist', 'jain']);
  assert.deepStrictEqual(K.validateTrip(goodTrip(), ctx).trip.faiths, []);
});
test('taste synonyms map to KYT vocabulary', function () {
  var v = K.validateTrip(goodTrip({ taste: { intent: 'heritage', diet: 'vegetarian', pace: 'relaxed' } }), ctx);
  assert.deepStrictEqual(v.trip.taste, { intent: 'cultural', diet: 'veg', pace: 'short' });
});
test('months parse from names and ranges', function () {
  assert.deepStrictEqual(K.parseMonths('October to February'), [1, 2, 10, 11, 12]);
  assert.deepStrictEqual(K.parseMonths(['Oct', 'nov', 12, '1']), [1, 10, 11, 12]);
});
test('validation is idempotent (editing re-validates cleanly)', function () {
  var a = K.validateTrip(goodTrip(), ctx).trip, b = K.validateTrip(a, ctx).trip;
  assert.deepStrictEqual(a, b);
});
if (catalog.length) {
  test('catalog: alias resolves origin and unknown city is flagged', function () {
    var v = K.validateTrip(goodTrip({ originCity: 'Bangalore', cities: ['hampi', 'Narnia'] }), ctx);
    assert.strictEqual(v.trip.originCity, 'bengaluru');
    assert.ok(v.issues.some(function (i) { return /Narnia/.test(i.msg); }));
    assert.ok(v.trip.cities.indexOf('Narnia') < 0);
  });
}

console.log('real-world output (Bengaluru to Tirupati)');
function tirupatiTrip() {
  return { title: 'Tirupati: The Divine Hill Shrine', originCity: '', originName: 'blr', faiths: ['hindu'],
    days: [{ day: 1, title: 'Arrive', steps: [
      { time: '06:00', title: 'Morning Train to Tirupati', where: 'KSR Bengaluru / Yesvantpur', icon: 'train-front' },
      { time: '15:00', title: 'Sri Kapileswara Swamy Temple', where: 'Tirupati', icon: 'landmark' },
      { time: '18:30', title: "Dinner at Govinda's", where: 'ISKCON Campus, Tirupati', icon: 'utensils' }] },
      { day: 2, title: 'Darshan', steps: [
      { time: '06:30', title: 'Venkateswara Darshan', where: 'Tirumala', icon: 'landmark' },
      { time: '14:15', title: 'Collect Laddu Prasadam', where: 'Laddu Complex, Tirumala', icon: 'shopping-bag' }] }] };
}
if (catalog.length) {
  test('short codes like blr resolve to the catalog city', function () {
    assert.strictEqual(K.validateTrip(tirupatiTrip(), ctx).trip.originCity, 'bengaluru');
    assert.strictEqual(K.validateTrip(tirupatiTrip(), ctx).trip.originName, 'Bengaluru');
  });
  test('missing day cities and cities list are inferred from step places', function () {
    var t = K.validateTrip(tirupatiTrip(), ctx).trip;
    assert.deepStrictEqual(t.days.map(function (d) { return d.cityId; }), ['tirupati', 'tirupati']);
    assert.deepStrictEqual(t.cities, ['tirupati']);
  });
}
test('auto map links search for the place, not just the town', function () {
  var t = K.validateTrip(tirupatiTrip(), ctx).trip, q = function (s) { return decodeURIComponent(s.mapsUrl.split('query=')[1].replace(/\+/g, ' ')); };
  assert.strictEqual(q(t.days[0].steps[1]), 'Sri Kapileswara Swamy Temple, Tirupati');
  assert.strictEqual(q(t.days[0].steps[2]), 'ISKCON Campus, Tirupati');     // already a specific place
  assert.strictEqual(q(t.days[1].steps[1]), 'Laddu Complex, Tirumala');
  assert.strictEqual(t.days[0].steps[0].mapsUrl, '');                      // travel steps get no link
});
test('old town-only auto links are upgraded when re-validated', function () {
  var t = tirupatiTrip(); t.days[0].steps[1].mapsUrl = K.searchUrl('Tirupati'); t.days[0].steps[1].mapsAuto = true;
  var s = K.validateTrip(t, ctx).trip.days[0].steps[1];
  assert.ok(/Kapileswara/.test(decodeURIComponent(s.mapsUrl))); assert.strictEqual(s.mapsAuto, true);
});
test('a link the AI supplied is never rewritten', function () {
  var t = tirupatiTrip(); t.days[0].steps[1].mapsUrl = 'https://www.google.com/maps/place/Kapileswara';
  var s = K.validateTrip(t, ctx).trip.days[0].steps[1];
  assert.strictEqual(s.mapsUrl, 'https://www.google.com/maps/place/Kapileswara'); assert.ok(!s.mapsAuto);
});

console.log('before you go and special days');
test('beforeYouGo and specialDays are cleaned, typed and bounded', function () {
  var v = K.validateTrip(goodTrip({
    beforeYouGo: ['Book Special Entry darshan 2-3 months ahead', { text: 'Carry the original ID <b>used</b> while booking', type: 'id' }, { type: 'nonsense', text: 'Dhoti or saree only' }, '', { text: '' }],
    specialDays: [{ name: 'Brahmotsavam <img src=x onerror=alert(1)>', when: 'Usually Sep-Oct (lunar calendar)', note: 'Very heavy crowds' },
      'Every Friday: abhishekam', { name: 'Closed on Mondays' }, { note: 'no name, dropped' }] }), ctx).trip;
  assert.deepStrictEqual(v.beforeYouGo.map(function (b) { return b.type; }), ['booking', 'id', 'dress']);
  assert.strictEqual(v.beforeYouGo[1].text, 'Carry the original ID used while booking');
  assert.deepStrictEqual(v.specialDays.map(function (d) { return d.effect; }), ['crowded', 'special-darshan', 'closed']);
  assert.strictEqual(v.specialDays[0].name, 'Brahmotsavam'); assert.strictEqual(v.specialDays[0].when, 'Usually Sep-Oct (lunar calendar)');
});
test('both lists default to empty and survive re-validation', function () {
  var a = K.validateTrip(goodTrip(), ctx).trip; assert.deepStrictEqual(a.beforeYouGo, []); assert.deepStrictEqual(a.specialDays, []);
  var b = K.validateTrip(goodTrip({ beforeYouGo: ['Book ahead'], specialDays: [{ name: 'Navratri', effect: 'festival' }] }), ctx).trip;
  assert.deepStrictEqual(K.validateTrip(b, ctx).trip, b);
});
test('spiritual trips without them get an info note, other trips do not, and neither blocks', function () {
  var sp = K.validateTrip(goodTrip({ taste: { intent: 'spiritual' } }), ctx), pl = K.validateTrip(goodTrip(), ctx);
  assert.ok(sp.issues.some(function (i) { return i.path === 'beforeYouGo' && i.level === 'info'; })); assert.ok(sp.issues.some(function (i) { return i.path === 'specialDays'; }));
  assert.ok(!pl.issues.some(function (i) { return i.path === 'beforeYouGo'; })); assert.strictEqual(sp.errors, 0); assert.strictEqual(sp.warnings, 0);
});
test('itinerary prompt asks for both lists, no exact lunar dates and no prices in tips', function () {
  var p = K.buildPrompt({ originCity: 'bengaluru', variant: 'gemini' }, ctx);
  assert.ok(/"beforeYouGo"/.test(p)); assert.ok(/"specialDays"/.test(p)); assert.ok(/lunar calendar, so do not give exact dates/.test(p)); assert.ok(/Do not put prices in "tips"/.test(p));
});
test('export keeps both lists', function () {
  var t = K.validateTrip(goodTrip({ status: 'approved', beforeYouGo: ['Book ahead'], specialDays: [{ name: 'Navratri', effect: 'festival' }] }), ctx).trip;
  var out = new Function('window', K.exportJs([t], { ctx: ctx }) + '; return window.KYT_CURATED_TRIPS;')({});
  assert.strictEqual(out[0].beforeYouGo[0].text, 'Book ahead'); assert.strictEqual(out[0].specialDays[0].effect, 'festival');
});

console.log('prompts and ideas');
var BR = { originCity: 'delhi', days: 0, months: [11, 12], intents: ['spiritual', 'culinary'], faiths: ['sikh', 'jain'], notes: 'no overnight buses', variant: 'gemini' };
test('menu prompt asks for varied ideas and tags, with no itineraries', function () {
  var p = K.buildMenuPrompt(BR, ctx);
  assert.ok(/12 distinct trip IDEAS from Delhi/.test(p)); assert.ok(/Do not write itineraries/.test(p)); assert.ok(/November, December/.test(p));
  assert.ok(/focus on these faiths: sikh, jain/.test(p)); assert.ok(/no overnight buses/.test(p)); assert.ok(/"ideas"/.test(p)); assert.ok(/Use Google Maps/.test(p));
  assert.ok(/a mix of 2-day weekend/.test(p));
  if (catalog.length) assert.ok(/delhi=Delhi/.test(p));
  console.log('       menu prompt length: ' + p.length);
});
test('faith line only appears when spiritual is chosen', function () {
  var p = K.buildMenuPrompt({ originCity: 'delhi', intents: ['culinary'], faiths: ['sikh'] }, ctx);
  assert.ok(!/faiths: sikh/.test(p));
});
test('menu answer round-trips through extractJson and parseIdeas', function () {
  var raw = '```json\n{"ideas":[{"id":"Amritsar","title":"Amritsar: golden temple","days":3,"intent":"religion","faiths":["Sikhism"],"pace":"relaxed","audience":["family","aliens"],"budget":"mid","mode":"train","approxTravelHours":"5.5","bestMonths":"Oct-Mar","cities":["amritsar","Narnia"]},{"title":"<img src=x onerror=alert(1)>Jaipur"},{"title":"Amritsar: golden temple","id":"amritsar"},{"nope":1}]}\n```';
  var ideas = K.parseIdeas(K.extractJson(raw).value, ctx);
  assert.strictEqual(ideas.length, 3); assert.strictEqual(ideas[0].kind, 'long-weekend'); assert.deepStrictEqual(ideas[0].faiths, ['sikh']);
  assert.deepStrictEqual(ideas[0].audience, ['family']); assert.strictEqual(ideas[0].approxTravelHours, 5.5);
  assert.strictEqual(ideas[1].title, 'Jaipur'); assert.notStrictEqual(ideas[0].id, ideas[2].id);
});
test('itinerary prompt for an idea carries the idea, ideaId and tag rules', function () {
  var idea = K.parseIdeas({ ideas: [{ id: 'amritsar', title: 'Amritsar: golden temple', days: 3, intent: 'spiritual', faiths: ['sikh'] }] }, ctx)[0];
  var p = K.buildPrompt({ originCity: 'delhi', idea: idea, variant: 'gemini' }, ctx);
  assert.ok(/3-day itinerary/.test(p)); assert.ok(/"ideaId": "amritsar"/.test(p)); assert.ok(/"faiths"/.test(p)); assert.ok(/tree-pine/.test(p)); assert.ok(/Use Google Maps to confirm/.test(p));
  assert.ok(!/Do not write itineraries/.test(p));
});
test('generic itinerary prompt asks for verify notes instead of Maps; catalog optional', function () {
  var p = K.buildPrompt({ originCity: 'delhi', variant: 'generic', includeCatalog: false }, ctx);
  assert.ok(/cannot check live information/.test(p)); assert.ok(!/Use Google Maps to confirm/.test(p)); assert.ok(!/CITY IDS/.test(p));
});
test('direct itinerary prompt formats destination sequence, diet, pace and candidate beats', function () {
  var p = K.buildPrompt({
    originCity: 'bengaluru',
    destinationCities: ['pune', 'nashik'],
    days: 4,
    diet: 'satvik',
    pace: 'deep',
    notes: 'Morning darshan priority'
  }, ctx);
  assert.ok(/Destinations to visit in sequence: Pune → Nashik/.test(p));
  assert.ok(/Food \/ Diet preference: satvik/.test(p));
  assert.ok(/Pace: deep/.test(p));
  assert.ok(/Length: 4 days/.test(p));
  assert.ok(/Morning darshan priority/.test(p));
  if (catalog.length) {
    assert.ok(/CANDIDATE ATTRACTIONS & CITY BEATS FROM KYT CATALOG:/.test(p));
    assert.ok(/City: Pune/.test(p));
  }
});
test('variation prompt includes the old trip and the requested change', function () {
  var t = K.validateTrip(goodTrip({ id: 'blr-hampi', ideaId: 'hampi' }), ctx).trip;
  var p = K.buildVariationPrompt(t, 'Jain friendly and slower', {}, ctx);
  assert.ok(/EXISTING TRIP/.test(p)); assert.ok(/Hampi: ruins and sunsets/.test(p)); assert.ok(/Jain friendly and slower/.test(p)); assert.ok(/"variantOf": "blr-hampi"/.test(p));
  assert.ok(/06:30 Drive to Hampi/.test(p));
});

console.log('export / import');
test('export is approved-only, sorted, loads as plain JS and round-trips', function () {
  var a = K.validateTrip(goodTrip({ status: 'approved' }), ctx).trip; a.id = 'blr-hampi';
  var d = K.validateTrip(goodTrip({ title: 'Draft one' }), ctx).trip; d.id = 'blr-draft';
  var js = K.exportJs([d, a], { ctx: ctx, generatedAt: '2026-10-10T00:00:00.000Z' });
  var sandbox = {}; sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(js, sandbox);
  assert.strictEqual(sandbox.KYT_CURATED_TRIPS.length, 1); assert.strictEqual(sandbox.KYT_CURATED_TRIPS[0].id, 'blr-hampi');
  assert.strictEqual(JSON.stringify(K.parseExport(js)[0]), JSON.stringify(sandbox.KYT_CURATED_TRIPS[0]));
  assert.strictEqual(K.exportJs([d, a], { ctx: ctx, includeDrafts: true }).split('"status"').length - 1, 2);
});
test('export refuses trips with errors', function () {
  var bad = K.validateTrip(goodTrip({ status: 'approved' }), ctx).trip; bad.days = [];
  assert.throws(function () { K.exportJs([bad], { ctx: ctx }); }, /Fix errors/);
});
test('line-separator characters cannot break the file', function () {
  var a = K.validateTrip(goodTrip({ status: 'approved', tagline: 'a\u2028b' }), ctx).trip; a.id = 'x';
  var js = K.exportJs([a], { ctx: ctx });
  assert.ok(js.indexOf('\u2028') < 0);
});
test('parseExport rejects foreign files', function () { assert.throws(function () { K.parseExport('var x = 1;'); }, /does not look like/); });

console.log('KYT conversions');
test('toKytSteps puts steps on the right local day and time (no timezone drift)', function () {
  var t = K.validateTrip(goodTrip(), ctx).trip;
  var s = K.toKytSteps(t, '2026-11-15', 1000);
  assert.strictEqual(s.length, 4);
  assert.strictEqual(s[0].targetTime.getFullYear(), 2026); assert.strictEqual(s[0].targetTime.getMonth(), 10); assert.strictEqual(s[0].targetTime.getDate(), 15);
  assert.strictEqual(s[0].targetTime.getHours(), 6); assert.strictEqual(s[0].targetTime.getMinutes(), 30);
  assert.strictEqual(s[2].targetTime.getDate(), 16); assert.strictEqual(s[2].targetTime.getHours(), 7);
  assert.strictEqual(new Set(s.map(function (x) { return x.id; })).size, 4);
});
test('midnight step keeps hour 0', function () {
  var t = goodTrip(); t.days[0].steps[0].time = '00:15';
  var s = K.toKytSteps(K.validateTrip(t, ctx).trip, '2026-11-15', 1);
  assert.strictEqual(s[0].targetTime.getHours(), 0);
});
test('toVirtualTrip keeps KYT field names and unique ids', function () {
  var v = K.toVirtualTrip(K.validateTrip(goodTrip(), ctx).trip, 'abc');
  assert.strictEqual(v.steps.length, 4); assert.strictEqual(v.steps[0].dayId, 1); assert.strictEqual(v.steps[3].dayId, 2);
  assert.strictEqual(new Set(v.steps.map(function (x) { return x.id; })).size, 4); assert.ok('mapsUrl' in v.steps[0]);
});

console.log('Gemini helpers');
test('text from output_text, steps and candidates shapes', function () {
  assert.strictEqual(K.extractGeminiText({ output_text: 'hi' }), 'hi');
  assert.strictEqual(K.extractGeminiText({ steps: [{ type: 'thought', content: [{ type: 'thought', text: 'hmm' }] }, { type: 'model_output', content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }] }), 'AB');
  assert.strictEqual(K.extractGeminiText({ candidates: [{ content: { parts: [{ text: 'old' }] } }] }), 'old');
  assert.strictEqual(K.extractGeminiText({}), '');
});
test('sources are found under annotations and filtered to https', function () {
  var s = K.extractSources({ steps: [{ content: [{ text: 'x', annotations: [{ url: 'https://maps.google.com/?cid=1', title: 'Place A' }, { url: 'javascript:alert(1)', title: 'bad' }] }] }] });
  assert.strictEqual(s.length, 1); assert.strictEqual(s[0].name, 'Place A');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed  (TZ=' + (process.env.TZ || 'default') + ')');
process.exit(failed ? 1 : 0);
