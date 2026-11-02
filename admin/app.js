/* KYT Admin UI. All AI-supplied text is placed with textContent / value (never innerHTML). */
(function () {
  'use strict';
  var K = window.KYTAdmin;
  var CATALOG = Array.isArray(window.KYT_CITIES) ? window.KYT_CITIES.map(function (c) {
    return {
      id: c.id,
      name: c.name,
      aliases: c.aliases,
      lat: c.lat,
      lng: c.lng,
      state: c.state,
      desc: c.desc,
      notes: c.notes,
      beats: c.beats
    };
  }) : [];
  var CTX = { catalog: CATALOG, catalogIndex: K.buildCatalogIndex(CATALOG) };

  var LS_TRIPS = 'kyt_admin_trips_v1',
    LS_CURATE = 'kyt_admin_curate_v2',
    LS_BRIEF = 'kyt_admin_brief_v1',
    LS_IDEAS = 'kyt_admin_ideas_v1',
    LS_SET = 'kyt_admin_settings_v1';
  var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

  var PRESETS = [
    { label: 'Pune & 3 Jyotirlingas', origin: 'bengaluru', cities: ['pune', 'bhimashankar', 'aurangabad', 'nashik'], days: 5, intent: 'spiritual', diet: 'satvik' },
    { label: 'Tirupati & Tirumala', origin: 'bengaluru', cities: ['bengaluru', 'tirupati'], days: 2, intent: 'spiritual', diet: 'satvik' },
    { label: 'Golden Triangle', origin: 'delhi', cities: ['delhi', 'agra', 'jaipur'], days: 4, intent: 'cultural', diet: 'any' },
    { label: 'Varanasi & Ayodhya', origin: 'delhi', cities: ['varanasi', 'ayodhya', 'prayagraj'], days: 4, intent: 'spiritual', diet: 'satvik' },
    { label: 'Coastal Karnataka', origin: 'bengaluru', cities: ['udupi', 'murudeshwar', 'gokarna'], days: 4, intent: 'mixed', diet: 'veg' },
    { label: 'Madurai & Rameswaram', origin: 'chennai', cities: ['madurai', 'rameswaram'], days: 3, intent: 'spiritual', diet: 'satvik' }
  ];

  var QUICK_TWISTS = [
    '🌟 Morning darshan & aarti timings',
    '🍲 Strictly Satvik & legendary pure-veg thali dining',
    '👨‍👩‍👧‍👦 Senior citizen & family friendly (minimal stairs)',
    '⏰ Afternoon temple closure windows (12:30 - 4:00 PM)',
    '🚗 Scenic road transit & highway food recommendations',
    '🏰 Deep architectural, mythological & heritage depth'
  ];

  // ------------------------------------------------------------ storage
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  var storageOk = true;
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { storageOk = false; renderStatus(); }
  }

  // Backwards compatibility: load previous brief if new curate settings not yet saved
  var savedCurate = load(LS_CURATE, null) || load(LS_BRIEF, {});

  var state = {
    tab: 'curate', // 'curate' | 'review' | 'library'
    trips: [],
    selected: null,
    curate: Object.assign({
      originCity: 'bengaluru',
      originName: 'Bengaluru',
      destinationCities: ['pune', 'bhimashankar', 'aurangabad', 'nashik'],
      days: 5,
      intent: 'spiritual',
      faiths: ['hindu'],
      diet: 'satvik',
      pace: 'standard',
      months: [],
      notes: '',
      target: 'gemini',
      includeCatalog: true
    }, savedCurate),
    ideas: [],
    devMsg: null,
    ideaMsg: null,
    settings: Object.assign({ model: 'gemini-2.5-flash', useMaps: true, lat: '', lng: '', rememberKey: false, apiKey: '' }, load(LS_SET, {})),
    importNotes: {},
    paste: '',
    pasteMsg: null,
    previewTrip: null,
    previewIssues: [],
    gemini: { busy: false, msg: null },
    includeDrafts: false,
    exportMsg: null,
    importPolicy: 'skip'
  };

  (function init() {
    var saved = load(LS_TRIPS, []);
    if (Array.isArray(saved)) {
      saved.forEach(function (t) {
        var v = K.validateTrip(t, CTX);
        if (v.trip && t && t.id) {
          v.trip.id = String(t.id);
          state.trips.push(v.trip);
        }
      });
    }
    var savedIdeas = load(LS_IDEAS, []);
    if (Array.isArray(savedIdeas)) {
      savedIdeas.forEach(function (i) {
        var p = K.parseIdeas([i], CTX)[0];
        if (p) {
          p.id = i.id || p.id;
          if (i.dismissed) p.dismissed = true;
          state.ideas.push(p);
        }
      });
    }
    ['months', 'faiths', 'destinationCities'].forEach(function (k) {
      if (!Array.isArray(state.curate[k])) state.curate[k] = [];
    });
    if (!state.settings.rememberKey) state.settings.apiKey = '';
  })();

  function persistTrips() { save(LS_TRIPS, state.trips); }
  function persistCurate() { save(LS_CURATE, state.curate); }
  function persistSettings() {
    var s = Object.assign({}, state.settings);
    if (!s.rememberKey) s.apiKey = '';
    save(LS_SET, s);
  }

  // ------------------------------------------------------------ DOM helpers
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  var seq = 0;
  function field(label, control, hint) {
    var id = 'f' + (++seq);
    control.id = id;
    return h('div', { class: 'field' },
      h('label', { class: 'label', for: id, text: label }),
      control,
      hint ? h('span', { class: 'hint', text: hint }) : null
    );
  }
  function select(opts, value, onchange) {
    var s = h('select', { onchange: function () { onchange(s.value); } });
    opts.forEach(function (o) {
      var v = typeof o === 'string' ? o : o[0], l = typeof o === 'string' ? o : o[1];
      s.appendChild(h('option', { value: v, text: l, selected: v === value }));
    });
    return s;
  }
  function chips(list, selected, onchange, labels) {
    var wrap = h('div', { class: 'chips' });
    list.forEach(function (v) {
      var isArr = Array.isArray(selected);
      var isChecked = isArr ? selected.indexOf(v) >= 0 : selected === v;
      var cb = h('input', { type: isArr ? 'checkbox' : 'radio', name: isArr ? undefined : 'radio_' + seq, checked: isChecked });
      var lab = h('label', { class: 'chip' + (isChecked ? ' on' : '') }, cb, (labels && labels[v]) || String(v));
      cb.addEventListener('change', function () {
        if (isArr) {
          lab.classList.toggle('on', cb.checked);
          onchange(v, cb.checked);
        } else {
          wrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); });
          lab.classList.add('on');
          onchange(v, true);
        }
      });
      wrap.appendChild(lab);
    });
    return wrap;
  }
  function toggleIn(arr, v, on) {
    var i = arr.indexOf(v);
    if (on && i < 0) arr.push(v);
    if (!on && i >= 0) arr.splice(i, 1);
  }
  function btn(text, cls, fn, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick: fn, text: text }, extra || {}));
  }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function copyText(text, successMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        toast(successMsg || 'Copied to clipboard.');
      }, function () {
        toast('Copy was blocked. Select the text and copy by hand.');
      });
    }
    toast('Copy is not available here. Select the text and copy by hand.');
  }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function issueList(issues) {
    if (!issues.length) return h('p', { class: 'notice ok', text: 'No problems found.' });
    var ul = h('ul', { class: 'issues' });
    issues.forEach(function (i) {
      ul.appendChild(h('li', { class: i.level }, h('span', { class: 'lvl', text: i.level }), (i.path ? i.path + ': ' : '') + i.msg));
    });
    return ul;
  }

  // ------------------------------------------------------------ Gemini API
  async function callGemini(prompt) {
    var s = state.settings;
    if (!s.apiKey.trim()) throw new Error('Add a Gemini API key under "AI Connection" first.');
    var body = { model: s.model.trim() || 'gemini-2.5-flash', input: prompt };
    if (s.useMaps) {
      var tool = { type: 'google_maps' }, o = CTX.catalogIndex.byId[state.curate.originCity];
      var la = parseFloat(s.lat !== '' ? s.lat : (o && o.lat)), lo = parseFloat(s.lng !== '' ? s.lng : (o && o.lng));
      if (isFinite(la) && isFinite(lo)) { tool.latitude = la; tool.longitude = lo; }
      body.tools = [tool];
    }
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 240000);
    try {
      var res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey.trim() },
        body: JSON.stringify(body),
        signal: ctl.signal
      });
      var data = null, raw = '';
      try { raw = await res.text(); data = JSON.parse(raw); } catch (e) { /* non-JSON */ }
      if (!res.ok) {
        var em = data && data.error && data.error.message ? String(data.error.message) : raw.slice(0, 200);
        throw new Error('Gemini returned ' + res.status + (em ? ': ' + K.cleanTo(em, 300) : '') + '.');
      }
      var text = K.extractGeminiText(data);
      if (!text) throw new Error('Gemini answered but no text could be found. Check model or copy/paste directly.');
      return { text: text, model: body.model, sources: K.extractSources(data) };
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('Timed out after 4 minutes.');
      if (e instanceof TypeError) throw new Error('Could not reach Gemini (network, blocked request, or invalid key).');
      throw e;
    } finally { clearTimeout(timer); }
  }

  function geminiMeta(g) {
    return { generated: { via: 'gemini-api', model: g.model, at: new Date().toISOString() }, sources: g.sources };
  }

  // ------------------------------------------------------------ Trip Management
  function rawForEdit(t) {
    var c = JSON.parse(JSON.stringify(t));
    c.days.forEach(function (d) { d.steps.forEach(function (s) { s.time = K.pad(s.hour) + ':' + K.pad(s.minute); }); });
    return c;
  }
  function validateTrip(t) { return K.validateTrip(t, CTX); }
  function addTrips(rawList, meta, policy) {
    var added = 0, replaced = 0, skipped = 0, firstId = null, reports = [];
    rawList.forEach(function (raw, i) {
      if (raw && typeof raw === 'object') {
        raw = JSON.parse(JSON.stringify(raw));
        if (meta) {
          raw.generated = Object.assign({}, raw.generated, meta.generated);
          if (meta.sources && meta.sources.length && !(raw.sources && raw.sources.length)) raw.sources = meta.sources;
          raw.status = 'approved'; // Curated trips ingested by curators default to ready/approved
        }
      }
      var v = validateTrip(raw);
      if (!v.trip) { reports.push('Item ' + (i + 1) + ': not a trip.'); return; }
      var t = v.trip, ids = state.trips.map(function (x) { return x.id; });
      var existing = t.id ? state.trips.filter(function (x) { return x.id === t.id; })[0] : null;
      if (existing && policy === 'skip') { skipped++; return; }
      if (existing && policy === 'replace') {
        state.trips[state.trips.indexOf(existing)] = t; replaced++; firstId = firstId || t.id; return;
      }
      if (!t.id) t.id = K.makeId(t, ids);
      else if (ids.indexOf(t.id) >= 0) t.id = K.makeId(t, ids);
      if (meta) state.importNotes[t.id] = v.issues.filter(function (x) { return x.level !== 'error'; });
      t.updatedAt = new Date().toISOString();
      state.trips.push(t); added++; firstId = firstId || t.id;
    });
    persistTrips();
    return { added: added, replaced: replaced, skipped: skipped, firstId: firstId, reports: reports };
  }
  function tripById(id) { return state.trips.filter(function (t) { return t.id === id; })[0]; }
  function replaceTrip(id, raw) {
    var v = validateTrip(raw);
    if (!v.trip) return;
    v.trip.id = id; v.trip.updatedAt = new Date().toISOString();
    var i = state.trips.map(function (t) { return t.id; }).indexOf(id);
    if (i >= 0) state.trips[i] = v.trip;
    persistTrips();
  }
  function edit(id, fn, rerender) {
    var t = tripById(id); if (!t) return;
    var raw = rawForEdit(t); fn(raw);
    replaceTrip(id, raw);
    if (rerender !== false) render();
  }

  function getCuratePrompt() {
    var c = state.curate;
    var promptObj = {
      originCity: c.originCity,
      originName: c.originName,
      destinationCities: c.destinationCities,
      days: c.days || (c.destinationCities.length ? Math.min(14, Math.max(1, c.destinationCities.length)) : 2),
      intent: c.intent,
      intents: c.intent ? [c.intent] : [],
      faiths: c.intent === 'spiritual' ? c.faiths : [],
      diet: c.diet,
      pace: c.pace,
      months: c.months,
      notes: c.notes,
      variant: c.target === 'other' ? 'generic' : 'gemini',
      includeCatalog: c.includeCatalog
    };
    return K.buildPrompt(promptObj, CTX);
  }

  var settingsTimer;
  function persistSettingsDeferred() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(persistSettings, 400);
  }

  function aiCard() {
    var s = state.settings, origin = CTX.catalogIndex.byId[state.curate.originCity];
    return h('details', { class: 'card', open: !s.apiKey },
      h('summary', { text: '⚙️ AI Connection Settings (Optional — only needed for in-browser API generation)' }),
      h('p', { class: 'hint', text: 'Requests run straight from your browser to Google. If you do not have an API key, you can click "Copy Prompt & Open Gemini ↗" to use the free web version.' }),
      h('div', { class: 'grid cols-3' },
        field('API Key', h('input', { type: 'password', autocomplete: 'off', placeholder: 'AIzaSy...', value: s.apiKey, oninput: function (e) { s.apiKey = e.target.value; persistSettingsDeferred(); } })),
        field('Model', h('input', { type: 'text', value: s.model, oninput: function (e) { s.model = e.target.value; persistSettingsDeferred(); } }), 'e.g. gemini-2.5-flash'),
        h('div', { class: 'field' },
          h('span', { class: 'label', text: 'Key Storage' }),
          h('label', { class: 'chip' + (s.rememberKey ? ' on' : '') },
            h('input', { type: 'checkbox', checked: s.rememberKey, onchange: function (e) { s.rememberKey = e.target.checked; persistSettings(); render(); } }),
            'Remember key in this browser'
          )
        )
      ),
      h('label', { class: 'chip' + (s.useMaps ? ' on' : '') },
        h('input', { type: 'checkbox', checked: s.useMaps, onchange: function (e) { s.useMaps = e.target.checked; persistSettings(); render(); } }),
        'Ground answers with Google Maps' + (origin && origin.lat != null ? ' (around ' + origin.name + ')' : '')
      )
    );
  }

  // ------------------------------------------------------------ View 1: Curate Trip (The Core Refined Flow)
  function viewCurate() {
    var c = state.curate, root = h('div');
    function refreshPrompt() {
      persistCurate();
      if (promptTa) {
        var txt = getCuratePrompt();
        promptTa.value = txt;
        if (promptInfo) promptInfo.textContent = 'Structured Gemini prompt with exact destination sequence and catalog beats (' + txt.length + ' chars).';
      }
    }
    function set(k, v) { c[k] = v; refreshPrompt(); }

    root.appendChild(h('h2', { text: 'Curate Trip with AI' }));
    root.appendChild(h('p', { class: 'lead', text: 'Build production-ready curated itineraries for KYT. Select your starting city and destination circuit, customize intent & pace, copy the prompt for Gemini, and instantly preview and ingest the output.' }));

    // SECTION 1: Route & Destinations
    var originOpts = [['', 'Choose starting city']].concat(CATALOG.map(function (city) { return [city.id, city.name + (city.state ? ' (' + city.state + ')' : '')]; }));

    var destChipsWrap = h('div', { class: 'dest-chips-wrap' });
    function renderDestChips() {
      destChipsWrap.textContent = '';
      if (!c.destinationCities.length) {
        destChipsWrap.appendChild(h('span', { class: 'hint', text: 'No destinations selected yet. Search below or choose a preset circuit.' }));
        return;
      }
      c.destinationCities.forEach(function (cityId, idx) {
        var cityObj = CTX.catalogIndex.byId[cityId];
        var name = cityObj ? cityObj.name : cityId;
        var chip = h('div', { class: 'dest-chip' },
          h('span', { class: 'num', text: String(idx + 1) }),
          h('span', { text: name })
        );
        if (idx > 0) {
          chip.appendChild(h('button', { class: 'dest-nav-btn', title: 'Move earlier in sequence', onclick: function () {
            var temp = c.destinationCities[idx - 1];
            c.destinationCities[idx - 1] = cityId;
            c.destinationCities[idx] = temp;
            renderDestChips();
            refreshPrompt();
          } }, '◀'));
        }
        if (idx < c.destinationCities.length - 1) {
          chip.appendChild(h('button', { class: 'dest-nav-btn', title: 'Move later in sequence', onclick: function () {
            var temp = c.destinationCities[idx + 1];
            c.destinationCities[idx + 1] = cityId;
            c.destinationCities[idx] = temp;
            renderDestChips();
            refreshPrompt();
          } }, '▶'));
        }
        chip.appendChild(h('button', { class: 'dest-del-btn', title: 'Remove destination', onclick: function () {
          c.destinationCities.splice(idx, 1);
          renderDestChips();
          refreshPrompt();
        } }, '✕'));
        destChipsWrap.appendChild(chip);
      });
    }
    renderDestChips();

    // City search autocomplete
    var searchInput = h('input', { type: 'text', placeholder: '🔍 Search destination to add (e.g. Pune, Bhimashankar, Nashik)...', autocomplete: 'off' });
    var dropdownBox = h('div', { class: 'search-results-dropdown', hidden: true });
    var searchWrap = h('div', { style: 'position:relative; flex:1' }, searchInput, dropdownBox);

    function doSearch(val) {
      dropdownBox.textContent = '';
      var query = (val || '').toLowerCase().trim();
      if (!query || query.length < 2) { dropdownBox.hidden = true; return; }
      var matches = CATALOG.filter(function (ci) {
        if (c.destinationCities.indexOf(ci.id) >= 0) return false;
        if (ci.id.toLowerCase().indexOf(query) >= 0) return true;
        if (ci.name && ci.name.toLowerCase().indexOf(query) >= 0) return true;
        if (ci.aliases && ci.aliases.some(function (a) { return a.toLowerCase().indexOf(query) >= 0; })) return true;
        return false;
      }).slice(0, 10);

      if (!matches.length) {
        dropdownBox.appendChild(h('div', { class: 'search-result-item hint', text: 'No matching cities found in catalog.' }));
      } else {
        matches.forEach(function (m) {
          var item = h('div', { class: 'search-result-item' },
            h('strong', { text: m.name }),
            h('span', { class: 'hint', text: m.state || 'India' })
          );
          item.addEventListener('click', function () {
            c.destinationCities.push(m.id);
            if (!c.days || c.days < c.destinationCities.length) c.days = Math.min(10, c.destinationCities.length + 1);
            searchInput.value = '';
            dropdownBox.hidden = true;
            renderDestChips();
            refreshPrompt();
            render();
          });
          dropdownBox.appendChild(item);
        });
      }
      dropdownBox.hidden = false;
    }

    searchInput.addEventListener('input', function (e) { doSearch(e.target.value); });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') dropdownBox.hidden = true;
    });
    document.addEventListener('click', function (e) {
      if (!searchWrap.contains(e.target)) dropdownBox.hidden = true;
    });

    var selectAllCity = select([['', 'Select from 159 cities...']].concat(CATALOG.map(function (ci) {
      return [ci.id, ci.name + (ci.state ? ' (' + ci.state + ')' : '')];
    })), '', function (val) {
      if (val && c.destinationCities.indexOf(val) < 0) {
        c.destinationCities.push(val);
        if (!c.days || c.days < c.destinationCities.length) c.days = Math.min(10, c.destinationCities.length + 1);
        selectAllCity.value = '';
        renderDestChips();
        refreshPrompt();
        render();
      }
    });

    // Presets bar
    var presetBar = h('div', { class: 'preset-bar' }, h('span', { class: 'hint', text: 'Quick circuits:' }));
    PRESETS.forEach(function (pr) {
      presetBar.appendChild(h('button', { type: 'button', class: 'preset-btn', text: pr.label, onclick: function () {
        c.originCity = pr.origin;
        c.destinationCities = pr.cities.slice();
        c.days = pr.days;
        c.intent = pr.intent;
        c.diet = pr.diet;
        render();
        toast('Loaded preset: ' + pr.label);
      } }));
    });

    // Day duration options
    var dayOpts = [['0', 'Auto (matches cities)']];
    for (var d = 1; d <= 10; d++) dayOpts.push([String(d), d + ' Day' + (d > 1 ? 's' : '')]);

    var showFaith = c.intent === 'spiritual';

    // SECTION 1 CARD: Route & Logistics
    var routeCard = h('div', { class: 'card' },
      h('h3', { text: '1. Route & Travel Circuit' }),
      h('div', { class: 'grid cols-3' },
        field('Starting Point (Origin)', select(originOpts, c.originCity, function (v) { set('originCity', v); render(); }), 'Trips begin and return here.'),
        field('Trip Duration', select(dayOpts, String(c.days || 0), function (v) { set('days', parseInt(v, 10) || 0); }), 'Total days for the itinerary.'),
        field('Target Model / AI', select([['gemini', 'Google Gemini (with Google Maps)'], ['other', 'Generic LLM']], c.target || 'gemini', function (v) { set('target', v); render(); }), 'Prompt is tuned for Gemini with live Maps.')
      ),
      h('div', { class: 'field' },
        h('label', { class: 'label', text: 'Ordered Destination Circuit' }),
        destChipsWrap,
        h('div', { class: 'row', style: 'margin-top:8px' }, searchWrap, selectAllCity),
        presetBar
      ),
      h('div', { class: 'grid cols-3', style: 'margin-top:12px' },
        h('div', { class: 'field' },
          h('span', { class: 'label', text: 'Travel Intent / Style' }),
          chips(['spiritual', 'cultural', 'adventure', 'culinary', 'mixed'], c.intent, function (v) { set('intent', v); render(); }, {
            spiritual: 'Spiritual', cultural: 'Cultural', adventure: 'Nature/Adventure', culinary: 'Culinary', mixed: 'Mixed'
          })
        ),
        h('div', { class: 'field' },
          h('span', { class: 'label', text: 'Food / Diet Preference' }),
          chips(['any', 'veg', 'jain', 'satvik'], c.diet, function (v) { set('diet', v); refreshPrompt(); }, {
            any: 'Any food', veg: 'Vegetarian', jain: 'Jain', satvik: 'Satvik (No onion/garlic)'
          })
        ),
        h('div', { class: 'field' },
          h('span', { class: 'label', text: 'Itinerary Pace' }),
          chips(['short', 'standard', 'deep'], c.pace, function (v) { set('pace', v); refreshPrompt(); }, {
            short: 'Relaxed (few stops)', standard: 'Standard', deep: 'Deep / Packed'
          })
        )
      ),
      showFaith ? h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Spiritual Focus / Faith' }),
        chips(K.FAITHS, c.faiths, function (v, on) { toggleIn(c.faiths, v, on); refreshPrompt(); }),
        h('span', { class: 'hint', text: 'Temple and sacred site beats will be prioritized for selected faiths.' })
      ) : null,
      h('div', { class: 'field' },
        h('span', { class: 'label', text: 'Best Travel Months (Optional)' }),
        chips([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], c.months, function (v, on) { toggleIn(c.months, v, on); refreshPrompt(); },
          K.MONTH_NAMES.reduce(function (o, n, i) { o[i + 1] = n.slice(0, 3); return o; }, {})),
        h('span', { class: 'hint', text: 'Leave empty to allow Gemini to recommend the ideal travel months.' })
      )
    );
    root.appendChild(routeCard);

    // SECTION 2 CARD: Curator Twist & Notes
    var twistBar = h('div', { class: 'twist-bar' });
    QUICK_TWISTS.forEach(function (tw) {
      twistBar.appendChild(h('button', { type: 'button', class: 'twist-chip', text: tw, onclick: function () {
        var clean = tw.replace(/^[\uD800-\uDBFF\uDC00-\uDFFF\s]+/, '').trim();
        var cur = c.notes ? c.notes.trim() : '';
        if (cur.indexOf(clean) >= 0) return;
        c.notes = cur ? (cur + '. ' + clean) : clean;
        notesTa.value = c.notes;
        refreshPrompt();
      } }));
    });

    var notesTa = h('textarea', { rows: 3, placeholder: 'Add specific requirements, must-visit spots, or darshan timings...', oninput: function (e) { set('notes', e.target.value); } }, c.notes || '');

    var twistCard = h('div', { class: 'card' },
      h('h3', { text: '2. Curator Twist & Special Guidance' }),
      h('span', { class: 'hint', text: 'Click quick twist chips to add verified guidelines to the prompt:' }),
      twistBar,
      h('div', { style: 'margin-top:10px' }, notesTa)
    );
    root.appendChild(twistCard);

    // SECTION 3 CARD: Prompt & Action Bar
    var promptTa = null, promptInfo = null;
    var promptText = getCuratePrompt();

    var geminiActionBtn = btn('⚡ Generate with Gemini API', 'btn-lg', async function () {
      geminiActionBtn.disabled = true;
      toast('Generating curated trip with Gemini. Please wait...');
      try {
        var g = await callGemini(getCuratePrompt());
        state.paste = g.text;
        toast('Gemini response received! Ingesting...');
        doIngestAndPreview(g.text, geminiMeta(g));
      } catch (err) {
        toast('Gemini API Error: ' + err.message);
      } finally {
        geminiActionBtn.disabled = false;
      }
    });

    var copyAndOpenBtn = h('button', {
      type: 'button',
      class: 'btn-lg btn-copy-gemini',
      onclick: function () {
        copyText(getCuratePrompt(), 'Prompt copied to clipboard! Paste it into Gemini in the newly opened tab.');
        window.open('https://gemini.google.com/app', '_blank', 'noopener');
      }
    }, '📋 Copy Prompt & Open Gemini ↗');

    var actionHero = h('div', { class: 'action-hero' },
      copyAndOpenBtn,
      state.settings.apiKey ? geminiActionBtn : null
    );

    var promptDisclosure = h('details', null,
      (promptInfo = h('summary', { text: '👁 Preview Full Prompt (' + promptText.length + ' characters)' })),
      (promptTa = h('textarea', { class: 'mono', rows: 8, readonly: true, 'aria-label': 'Prompt preview' }, promptText)),
      h('div', { class: 'row', style: 'margin-top:6px' }, btn('Copy prompt only', 'small', function () { copyText(promptTa.value); }))
    );

    var promptCard = h('div', { class: 'card' },
      h('h3', { text: '3. Generate Itinerary' }),
      h('p', { class: 'hint', text: '1-click to copy the detailed prompt (including candidate beats from our 159-city catalog) and open Gemini. After Gemini replies with the JSON, paste it below.' }),
      actionHero,
      promptDisclosure
    );
    root.appendChild(promptCard);

    // SECTION 4 CARD: Instant Paste, Live Ingest & Preview Card
    var pasteTa = h('textarea', {
      class: 'mono',
      rows: 7,
      placeholder: 'Paste the JSON code block from Gemini here...\n\n(Click "Read & Preview Trip" or paste directly from clipboard)',
      oninput: function (e) { state.paste = e.target.value; }
    }, state.paste);

    var previewContainer = h('div', { id: 'live-preview-box' });

    function doIngestAndPreview(rawText, meta) {
      if (!rawText || !rawText.trim()) { toast('Please paste an AI response first.'); return; }
      try {
        var parsed = K.extractJson(rawText);
        var tripList = K.toTripList(parsed.value);
        if (!tripList.length) throw new Error('No trips found in the JSON.');
        var rawTrip = tripList[0];
        if (meta) {
          rawTrip.generated = Object.assign({}, rawTrip.generated, meta.generated);
          if (meta.sources && meta.sources.length) rawTrip.sources = meta.sources;
        }
        var validation = validateTrip(rawTrip);
        if (!validation.trip) throw new Error('Validation failed to parse trip structure.');
        state.previewTrip = validation.trip;
        state.previewIssues = validation.issues;
        renderPreviewCard();
        toast('Itinerary parsed and validated successfully!');
      } catch (e) {
        toast('Parse Error: ' + e.message);
        previewContainer.textContent = '';
        previewContainer.appendChild(h('p', { class: 'notice err', text: 'Failed to read response: ' + e.message }));
      }
    }

    function renderPreviewCard() {
      previewContainer.textContent = '';
      var t = state.previewTrip;
      if (!t) return;
      var v = validateTrip(t);
      var issues = v.issues || [];
      var errors = v.errors || 0;

      var routeText = (t.originName || t.originCity || 'Origin') + ' → ' + (t.cities.length ? t.cities.map(function (cid) {
        var co = CTX.catalogIndex.byId[cid]; return co ? co.name : cid;
      }).join(' → ') : 'Circuit');

      var card = h('div', { class: 'preview-card' },
        h('div', { class: 'row', style: 'justify-content:space-between; margin-bottom:10px' },
          h('div', null,
            h('h3', { style: 'margin:0; font-size:18px', text: t.title }),
            h('p', { style: 'margin:2px 0 6px; color:var(--muted)', text: t.tagline })
          ),
          h('div', { class: 'row' },
            h('span', { class: 'pill ' + (errors ? 'err' : 'approved'), text: errors ? errors + ' errors' : '✓ Schema Valid' }),
            h('span', { class: 'pill draft', text: t.durationDays + ' Days' })
          )
        ),
        h('div', { class: 'row', style: 'margin-bottom:12px; gap:6px' },
          h('span', { class: 'route-badge', text: '📍 ' + routeText }),
          h('span', { class: 'pill info', text: t.taste.intent.toUpperCase() }),
          h('span', { class: 'pill info', text: t.taste.diet.toUpperCase() }),
          h('span', { class: 'pill info', text: t.taste.pace.toUpperCase() })
        ),
        // Day-by-Day timeline summary
        h('h4', { text: 'Day-by-Day Timeline (' + t.days.length + ' days, ' + v.stats.steps + ' activities)' }),
        h('div', null, t.days.map(function (d) {
          return h('div', { class: 'preview-day' },
            h('div', { class: 'row', style: 'justify-content:space-between; font-weight:600; margin-bottom:6px' },
              h('span', { text: 'Day ' + d.day + ': ' + (d.title || d.cityName || '') }),
              h('span', { class: 'hint', text: d.steps.length + ' steps' })
            ),
            h('div', null, d.steps.map(function (st) {
              return h('div', { class: 'preview-step' },
                h('span', { class: 'step-time', text: K.pad(st.hour) + ':' + K.pad(st.minute) }),
                h('span', { class: 'step-name', text: st.title }),
                st.where ? h('span', { class: 'step-where', text: '(' + st.where + ')' }) : null,
                st.mapsUrl ? h('a', { class: 'step-map', href: st.mapsUrl, target: '_blank', rel: 'noopener noreferrer', text: '📍 Map' }) : h('span', { class: 'step-map hint', text: 'No map' })
              );
            }))
          );
        })),
        // Before you go & special days summary if present
        (t.beforeYouGo && t.beforeYouGo.length) ? h('div', { style: 'margin-top:10px' },
          h('strong', { text: 'Before You Go: ' }),
          h('span', { class: 'hint', text: t.beforeYouGo.map(function (b) { return b.text; }).join(' • ') })
        ) : null,
        // Validation checks
        issues.length ? h('details', { style: 'margin-top:10px' },
          h('summary', { text: 'Verification Checks (' + issues.length + ' notes)' }),
          issueList(issues)
        ) : null,
        // Action buttons
        h('div', { class: 'row', style: 'margin-top:16px; justify-content:space-between' },
          h('div', { class: 'row' },
            btn('✓ Add to Curated Library', 'btn-lg primary', function () {
              var r = addTrips([t], { generated: { via: 'curate-ai', at: new Date().toISOString() } }, 'replace');
              state.selected = r.firstId || state.selected;
              toast('✓ Added "' + t.title + '" to Curated Library!');
              go('review');
            }, { disabled: errors > 0 }),
            btn('Cancel Preview', '', function () {
              state.previewTrip = null;
              renderPreviewCard();
            })
          ),
          btn('Edit in Review Tab →', '', function () {
            var r = addTrips([t], { generated: { via: 'curate-ai', at: new Date().toISOString() } }, 'replace');
            state.selected = r.firstId || state.selected;
            go('review');
          })
        )
      );
      previewContainer.appendChild(card);
    }

    if (state.previewTrip) renderPreviewCard();

    var pasteCard = h('div', { class: 'card' },
      h('h3', { text: '4. Ingest AI Output & Live Preview' }),
      h('p', { class: 'hint', text: 'Paste Gemini\'s output below. We validate the schema, check Google Maps links, and render a live timeline preview before saving.' }),
      pasteTa,
      h('div', { class: 'row', style: 'margin-top:8px' },
        btn('Read & Preview Trip', 'primary', function () {
          doIngestAndPreview(pasteTa.value, { generated: { via: 'paste', at: new Date().toISOString() } });
        }),
        btn('📋 Paste from Clipboard', '', async function () {
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              var clipText = await navigator.clipboard.readText();
              if (clipText) {
                pasteTa.value = clipText;
                state.paste = clipText;
                doIngestAndPreview(clipText, { generated: { via: 'paste', at: new Date().toISOString() } });
              } else {
                toast('Clipboard is empty.');
              }
            } else {
              toast('Clipboard read not permitted. Paste into the box manually.');
            }
          } catch (e) {
            toast('Clipboard read failed: ' + e.message);
          }
        }),
        btn('Clear', '', function () {
          pasteTa.value = '';
          state.paste = '';
          state.previewTrip = null;
          previewContainer.textContent = '';
        })
      ),
      previewContainer
    );
    root.appendChild(pasteCard);

    // SECTION 5: AI Settings (Collapsible)
    root.appendChild(aiCard());

    // SECTION 6: Optional Brainstorm Ideas Menu Mode
    var menuText = K.buildMenuPrompt(Object.assign({}, state.curate, { variant: state.curate.target === 'other' ? 'generic' : 'gemini' }), CTX);
    var menuTa = null, menuInfo = null, imsg = h('div');
    function showMsg(el, m) { el.textContent = ''; if (m) el.appendChild(h('p', { class: 'notice ' + m.kind, text: m.text })); }
    showMsg(imsg, state.ideaMsg); state.ideaMsg = null;

    function takeIdeas(text) {
      var parsed = K.extractJson(text), ideas = K.parseIdeas(parsed.value, CTX);
      if (!ideas.length) throw new Error('No ideas found in that answer.');
      var have = state.ideas.map(function (i) { return i.id; }), titles = state.ideas.map(function (i) { return i.title.toLowerCase(); }), added = 0;
      ideas.forEach(function (i) {
        if (titles.indexOf(i.title.toLowerCase()) >= 0) return;
        titles.push(i.title.toLowerCase());
        var base = i.id, n = 2;
        while (have.indexOf(i.id) >= 0) i.id = base + '-' + (n++);
        have.push(i.id);
        state.ideas.push(i);
        added++;
      });
      save(LS_IDEAS, state.ideas);
      if (!added) throw new Error('Those ideas are already in the list.');
      return added;
    }

    var brainstormDetails = h('details', { class: 'card' },
      h('summary', { text: '💡 Need Inspiration? Brainstorm 12 Trip Ideas with Gemini (Optional)' }),
      h('p', { class: 'hint', text: 'If you are unsure which destinations to pick, ask Gemini for a menu of 12 ideas from ' + (state.curate.originName || 'your origin') + '. You can then pick any idea to curate.' }),
      (menuInfo = h('p', { class: 'hint', text: 'Ideas prompt (' + menuText.length + ' chars).' })),
      (menuTa = h('textarea', { class: 'mono', readonly: true, rows: 5, 'aria-label': 'Ideas prompt' }, menuText)),
      h('div', { class: 'row', style: 'margin:8px 0' },
        btn('Copy ideas prompt', 'primary', function () { copyText(menuTa.value); }),
        state.settings.apiKey ? btn('Get ideas with Gemini API', '', async function () {
          showMsg(imsg, { kind: '', text: 'Asking Gemini for ideas...' });
          try {
            var g = await callGemini(menuTa.value);
            var n = takeIdeas(g.text);
            state.ideaMsg = { kind: 'ok', text: n + ' ideas added.' };
            render();
          } catch (e) { state.ideaMsg = { kind: 'err', text: e.message }; showMsg(imsg, state.ideaMsg); }
        }) : null
      ),
      h('textarea', { class: 'mono', rows: 4, placeholder: 'Paste the ideas JSON answer here...', oninput: function (e) { state.paste = e.target.value; } }),
      imsg,
      h('div', { class: 'row', style: 'margin-top:6px' }, btn('Read ideas', '', function () {
        try { var n = takeIdeas(state.paste); state.ideaMsg = { kind: 'ok', text: n + ' ideas added.' }; render(); }
        catch (e) { state.ideaMsg = { kind: 'err', text: e.message }; showMsg(imsg, state.ideaMsg); }
      }))
    );
    root.appendChild(brainstormDetails);

    return root;
  }

  // ------------------------------------------------------------ View 2: Review and Edit
  function tripPill(t, v) {
    return h('span', {
      class: 'pill ' + (v.errors ? 'err' : t.status === 'approved' ? 'approved' : 'draft'),
      text: v.errors ? v.errors + ' error' + (v.errors > 1 ? 's' : '') : t.status
    });
  }

  function viewReview() {
    var root = h('div');
    root.appendChild(h('h2', { text: 'Review and Edit Curated Trips' }));
    root.appendChild(h('p', { class: 'lead', text: 'Verify every stop, timing, darshan queue notes, and Google Maps link. Approve a trip when ready for export into curated_trips.js.' }));

    if (!state.trips.length) {
      root.appendChild(h('div', { class: 'card empty' },
        h('p', { text: 'No curated trips in library yet.' }),
        btn('Curate a New Trip →', 'primary', function () { go('curate'); })
      ));
      return root;
    }

    if (!tripById(state.selected)) state.selected = state.trips[0].id;
    var list = h('div', { class: 'list', role: 'list' });
    state.trips.forEach(function (t) {
      var v = validateTrip(t);
      list.appendChild(h('button', {
        type: 'button',
        class: 'item',
        'aria-current': t.id === state.selected ? 'true' : 'false',
        onclick: function () { state.selected = t.id; render(); }
      },
        h('span', { class: 't', text: t.title || '(untitled)' }),
        h('span', { class: 'm' }, (t.originName || '?') + ' · ' + t.kind + ' · ' + t.durationDays + 'd ', tripPill(t, v))
      ));
    });

    root.appendChild(h('div', { class: 'split' }, list, editor(tripById(state.selected))));
    return root;
  }

  function editor(t) {
    var v = validateTrip(t), id = t.id, wrap = h('div');
    function txt(label, get, setf, opts) {
      opts = opts || {};
      var el = opts.area ? h('textarea', { rows: opts.rows || 2 }, get()) : h('input', { type: 'text', value: get() });
      el.addEventListener('change', function () { edit(id, function (r) { setf(r, el.value); }); });
      return field(label, el, opts.hint);
    }

    // Header Card
    var head = h('div', { class: 'card' },
      h('div', { class: 'row', style: 'justify-content:space-between' },
        h('h3', { text: 'Trip Details: ' + (t.title || 'Untitled') }),
        h('div', { class: 'row' },
          tripPill(t, v),
          t.generated && t.generated.via ? h('span', { class: 'hint', text: 'via ' + t.generated.via + (t.generated.model ? ' (' + t.generated.model + ')' : '') }) : null
        )
      ),
      h('div', { class: 'grid cols-2' },
        txt('Title', function () { return t.title; }, function (r, x) { r.title = x; }),
        txt('Tagline', function () { return t.tagline; }, function (r, x) { r.tagline = x; })
      ),
      h('div', { class: 'grid cols-4' },
        field('Type', select(K.KINDS, t.kind, function (x) { edit(id, function (r) { r.kind = x; }); })),
        field('Starting city', CATALOG.length ? select([['', '(not in catalog)']].concat(CATALOG.map(function (c) { return [c.id, c.name]; })), t.originCity, function (x) { edit(id, function (r) { r.originCity = x; if (!x) r.originName = t.originName; }); }) : h('input', { type: 'text', value: t.originName, disabled: true })),
        txt('Best months', function () { return t.bestMonths.map(function (m) { return K.MONTH_NAMES[m - 1].slice(0, 3); }).join(', '); }, function (r, x) { r.bestMonths = x; }, { hint: 'e.g. Oct, Nov, Dec, Jan' }),
        field('Budget', select(K.BUDGETS, t.budget, function (x) { edit(id, function (r) { r.budget = x; }); }))
      ),
      h('div', { class: 'grid cols-3' },
        field('Interest', select(K.INTENTS, t.taste.intent, function (x) { edit(id, function (r) { r.taste.intent = x; }); })),
        field('Food', select(K.DIETS, t.taste.diet, function (x) { edit(id, function (r) { r.taste.diet = x; }); })),
        field('Pace', select(K.PACES, t.taste.pace, function (x) { edit(id, function (r) { r.taste.pace = x; }); }))
      ),
      h('div', { class: 'grid cols-3' },
        field('Transport Mode', select(K.MODES, t.transport.mode, function (x) { edit(id, function (r) { r.transport.mode = x; }); })),
        txt('Travel hours one way', function () { return t.transport.approxTravelHours == null ? '' : String(t.transport.approxTravelHours); }, function (r, x) { r.transport.approxTravelHours = x; }),
        txt('Transport note', function () { return t.transport.note; }, function (r, x) { r.transport.note = x; })
      ),
      h('div', { class: 'grid cols-3' },
        txt('Track (Theme badge)', function () { return t.track; }, function (r, x) { r.track = x; }, { hint: 'e.g. Jyotirlinga Trail, Heritage Circuit' }),
        h('div', { class: 'field' }, h('span', { class: 'label', text: 'Faiths' }), chips(K.FAITHS, t.faiths, function (v, on) { edit(id, function (r) { r.faiths = (r.faiths || []).slice(); toggleIn(r.faiths, v, on); }); })),
        h('div', { class: 'field' }, h('span', { class: 'label', text: 'Audience' }), chips(K.AUDIENCES, t.audience, function (v, on) { edit(id, function (r) { r.audience = (r.audience || []).slice(); toggleIn(r.audience, v, on); }); }))
      ),
      txt('Highlights (one per line)', function () { return t.highlights.join('\n'); }, function (r, x) { r.highlights = x; }, { area: true, rows: 3 }),
      txt('Tips (one per line)', function () { return t.tips.join('\n'); }, function (r, x) { r.tips = x; }, { area: true, rows: 3 }),
      t.sources.length ? h('details', null, h('summary', { text: 'Sources reported by AI (' + t.sources.length + ')' }),
        h('ul', null, t.sources.map(function (s) { return h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.name })); }))) : null
    );
    wrap.appendChild(head);

    // Validation Issues Card
    wrap.appendChild(h('div', { class: 'card' }, h('h3', { text: 'Validation Checks' }), issueList(v.issues)));

    // Variation prompt
    var twist = h('input', { type: 'text', list: 'twists', placeholder: 'What should change? Pick a suggestion or type your own', maxlength: 400 });
    var vmsg = h('div'), twistList = h('datalist', { id: 'twists' }, ['Slower pace, fewer stops', 'Strictly Jain satvik friendly', 'Budget road-trip version', 'With young children & seniors', 'Same circuit in monsoon'].map(function (x) { return h('option', { value: x }); }));
    var vrun = btn('Make with Gemini API', 'primary', async function () {
      vrun.disabled = true; vmsg.textContent = ''; vmsg.appendChild(h('p', { class: 'notice', text: 'Asking Gemini...' }));
      try {
        var g = await callGemini(K.buildVariationPrompt(t, twist.value, { originCity: t.originCity, originName: t.originName, variant: 'gemini' }, CTX));
        var parsed = K.extractJson(g.text);
        var tripList = K.toTripList(parsed.value);
        if (tripList.length) {
          var r = addTrips(tripList, geminiMeta(g), 'replace');
          state.selected = r.firstId || state.selected;
          toast('Variation created in library!');
          render();
        }
      } catch (e) {
        vmsg.textContent = ''; vmsg.appendChild(h('p', { class: 'notice err', text: e.message }));
        vrun.disabled = false;
      }
    });

    wrap.appendChild(h('details', { class: 'card' },
      h('summary', { text: '✨ Make a Variation of this Trip with AI' }),
      h('p', { class: 'hint', text: 'Generates a prompt keeping this trip as base and modifying pace, diet, or theme.' }),
      twist, twistList, vmsg,
      h('div', { class: 'row', style: 'margin-top:8px' },
        btn('Copy Variation Prompt', '', function () { copyText(K.buildVariationPrompt(t, twist.value, { originCity: t.originCity, originName: t.originName }, CTX)); }),
        state.settings.apiKey ? vrun : null
      )
    ));

    // Before you go & Special days
    function rowList(title, hint, items, makeRow, addLabel, blank, fieldName) {
      var box = h('div', { class: 'card' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('h3', { text: title }),
          btn(addLabel, 'small', function () { edit(id, function (r) { r[fieldName] = (r[fieldName] || []).concat([blank]); }); })
        ),
        h('p', { class: 'hint', text: hint })
      );
      if (!items.length) box.appendChild(h('p', { class: 'hint', text: 'None yet.' }));
      items.forEach(function (it, i) { box.appendChild(makeRow(it, i)); });
      return box;
    }
    function bind(el, fieldName, i, key) {
      el.addEventListener('change', function () { edit(id, function (r) { r[fieldName][i][key] = el.value; }); });
      return el;
    }
    function remove(fieldName, i) {
      return btn('Remove', 'small danger', function () { edit(id, function (r) { r[fieldName].splice(i, 1); }); });
    }

    wrap.appendChild(rowList('Before you go', 'Prerequisites: bookings, ID proofs, dress codes, queue rules, permits.', t.beforeYouGo, function (it, i) {
      return h('div', { class: 'step' },
        h('div', { class: 'step-grid', style: 'grid-template-columns:150px 1fr' },
          field('Type', bind(select(K.BYG_TYPES, it.type, function () {}), 'beforeYouGo', i, 'type')),
          field('What to do', bind(h('input', { type: 'text', value: it.text }), 'beforeYouGo', i, 'text'))
        ),
        h('div', { class: 'row right' }, remove('beforeYouGo', i))
      );
    }, 'Add item', { type: 'other', text: 'New item' }, 'beforeYouGo'));

    wrap.appendChild(rowList('Special days', 'Festivals, special darshan timings, temple closures, and crowd peaks.', t.specialDays, function (it, i) {
      return h('div', { class: 'step' },
        h('div', { class: 'step-grid', style: 'grid-template-columns:1fr 1fr 150px' },
          field('Occasion', bind(h('input', { type: 'text', value: it.name }), 'specialDays', i, 'name')),
          field('When', bind(h('input', { type: 'text', value: it.when }), 'specialDays', i, 'when')),
          field('Effect', bind(select(K.DAY_EFFECTS, it.effect, function () {}), 'specialDays', i, 'effect'))
        ),
        field('What it means for visitor', bind(h('input', { type: 'text', value: it.note }), 'specialDays', i, 'note')),
        h('div', { class: 'row right' }, remove('specialDays', i))
      );
    }, 'Add special day', { name: 'New special day', when: '', effect: 'other', note: '' }, 'specialDays'));

    // Days and Steps
    t.days.forEach(function (d, di) {
      var dayBox = h('div', { class: 'day' },
        h('div', { class: 'row', style: 'justify-content:space-between' },
          h('h4', { text: 'Day ' + d.day + (d.cityName ? ' · ' + d.cityName : '') }),
          btn('Add step', 'small', function () { edit(id, function (r) { r.days[di].steps.push({ time: '12:00', title: 'New step', where: '', icon: 'map-pin', notes: '', verify: [] }); }); })
        )
      );
      dayBox.appendChild(txt('Day title', function () { return d.title; }, function (r, x) { r.days[di].title = x; }));
      d.steps.forEach(function (s, si) {
        var ic = select(K.ICONS.concat(K.TRAVEL_ICONS.filter(function (x) { return K.ICONS.indexOf(x) < 0; })), s.icon, function (x) { edit(id, function (r) { r.days[di].steps[si].icon = x; }); });
        var time = h('input', { type: 'time', value: K.pad(s.hour) + ':' + K.pad(s.minute) });
        time.addEventListener('change', function () { if (time.value) edit(id, function (r) { r.days[di].steps[si].time = time.value; }); });
        var title = h('input', { type: 'text', value: s.title }), where = h('input', { type: 'text', value: s.where });
        title.addEventListener('change', function () { edit(id, function (r) { var st = r.days[di].steps[si]; st.title = title.value; if (st.mapsAuto) { st.mapsUrl = ''; delete st.mapsAuto; } }); });
        where.addEventListener('change', function () { edit(id, function (r) { var st = r.days[di].steps[si]; st.where = where.value; if (st.mapsAuto) { st.mapsUrl = ''; delete st.mapsAuto; } }); });
        var map = h('input', { type: 'text', value: s.mapsUrl });
        map.addEventListener('change', function () { edit(id, function (r) { var st = r.days[di].steps[si]; st.mapsUrl = map.value; delete st.mapsAuto; }); });
        var notes = h('textarea', { rows: 2 }, s.notes), verify = h('textarea', { rows: 2 }, s.verify.join('\n'));
        notes.addEventListener('change', function () { edit(id, function (r) { r.days[di].steps[si].notes = notes.value; }); });
        verify.addEventListener('change', function () { edit(id, function (r) { r.days[di].steps[si].verify = verify.value; }); });

        var stBox = h('div', { class: 'step' },
          h('div', { class: 'step-grid' }, field('Time', time), field('Title', title), field('Place', where), field('Icon', ic)),
          field('Google Maps Link' + (s.mapsAuto ? ' (search link generated)' : ''), map),
          h('div', { class: 'grid cols-2' }, field('Notes & Tips', notes), field('Verify before publish (one per line)', verify)),
          h('div', { class: 'row right' },
            s.mapsUrl ? h('a', { class: 'hint', href: s.mapsUrl, target: '_blank', rel: 'noopener noreferrer', text: '📍 Open Maps link' }) : null,
            btn('Remove step', 'small danger', function () { edit(id, function (r) { r.days[di].steps.splice(si, 1); }); })
          )
        );
        dayBox.appendChild(stBox);
      });
      wrap.appendChild(dayBox);
    });

    // Approval / Actions
    var approveBtn = t.status === 'approved'
      ? btn('Return to draft', '', function () { edit(id, function (r) { r.status = 'draft'; }); toast('Returned to draft.'); })
      : btn('✓ Approve for Export', 'primary', function () {
        var cur = validateTrip(t);
        if (cur.errors) { toast('Fix validation errors first.'); return; }
        var raw = rawForEdit(t);
        raw.status = 'approved';
        raw.rev = (t.rev || 1) + 1;
        replaceTrip(id, raw);
        render();
        toast('Approved for export.');
      }, { disabled: v.errors > 0 });

    wrap.appendChild(h('div', { class: 'card row', style: 'justify-content:space-between; margin-top:16px' },
      approveBtn,
      btn('Delete Trip', 'danger', function () {
        if (!confirm('Delete "' + (t.title || 'this trip') + '" from library?')) return;
        state.trips = state.trips.filter(function (x) { return x.id !== id; });
        state.selected = null;
        persistTrips();
        render();
        toast('Deleted.');
      })
    ));

    return wrap;
  }

  // ------------------------------------------------------------ View 3: Library & Export
  function viewLibrary() {
    var root = h('div'), approved = state.trips.filter(function (t) { return t.status === 'approved'; });
    root.appendChild(h('h2', { text: 'Curated Library & Export' }));
    root.appendChild(h('p', { class: 'lead', text: 'Export writes data/curated_trips.js for KYT. Only approved trips are exported into production builds.' }));

    var rows = state.trips.map(function (t) {
      var v = validateTrip(t);
      return h('tr', null,
        h('td', null, h('a', { href: '#', onclick: function (e) { e.preventDefault(); state.selected = t.id; go('review'); } }, t.title || '(untitled)')),
        h('td', { text: t.originName || t.originCity }),
        h('td', { text: t.kind + ' · ' + t.durationDays + 'd' }),
        h('td', { text: [t.track, t.taste.intent].filter(Boolean).join(' · ') }),
        h('td', { text: String(v.stats ? v.stats.steps : 0) }),
        h('td', null, tripPill(t, v)),
        h('td', { text: String(v.warnings) })
      );
    });

    root.appendChild(h('div', { class: 'card' },
      state.trips.length
        ? h('table', null,
          h('thead', null, h('tr', null, ['Title', 'From', 'Duration', 'Track', 'Steps', 'Status', 'Warnings'].map(function (x) { return h('th', { text: x }); }))),
          h('tbody', null, rows)
        )
        : h('p', { class: 'empty', text: 'Library is currently empty. Curate a trip to add.' })
    ));

    var msg = h('div');
    function showE() { msg.textContent = ''; if (state.exportMsg) msg.appendChild(h('p', { class: 'notice ' + state.exportMsg.kind, text: state.exportMsg.text })); }
    showE();

    function buildJs() {
      try {
        var text = K.exportJs(state.trips, { includeDrafts: state.includeDrafts, ctx: CTX });
        if (!/window\.KYT_CURATED_TRIPS = \[/.test(text)) throw new Error('Nothing to export.');
        return text;
      } catch (e) { state.exportMsg = { kind: 'err', text: e.message }; showE(); return null; }
    }

    var count = state.includeDrafts ? state.trips.length : approved.length;
    root.appendChild(h('div', { class: 'card' },
      h('h3', { text: 'Export to curated_trips.js' }),
      h('label', { class: 'chip' + (state.includeDrafts ? ' on' : '') },
        h('input', { type: 'checkbox', checked: state.includeDrafts, onchange: function (e) { state.includeDrafts = e.target.checked; render(); } }),
        'Include drafts (for testing unfinished trips)'
      ),
      h('p', { class: 'hint', text: count + ' trip(s) ready for export (' + approved.length + ' approved).' }),
      msg,
      h('div', { class: 'row' },
        btn('📥 Download curated_trips.js', 'primary btn-lg', function () {
          var t = buildJs(); if (t == null) return;
          if (!count) { state.exportMsg = { kind: 'err', text: 'No approved trips. Approve at least one trip in Review & Edit.' }; showE(); return; }
          download('curated_trips.js', t);
          state.exportMsg = { kind: 'ok', text: 'Downloaded ' + count + ' trip(s). Save to data/curated_trips.js in the KYT repository.' };
          showE();
        }),
        btn('📋 Copy JS to Clipboard', '', function () {
          var t = buildJs();
          if (t != null && count) copyText(t, 'Copied curated_trips.js code to clipboard!');
        })
      )
    ));

    // Load existing file
    var imsg = h('div'), fileInput = h('input', { type: 'file', accept: '.js,.json,.txt', 'aria-label': 'Choose a file' });
    function showI(m) { imsg.textContent = ''; if (m) imsg.appendChild(h('p', { class: 'notice ' + m.kind, text: m.text })); }
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { showI({ kind: 'err', text: 'File exceeds 8 MB.' }); return; }
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var text = String(rd.result), list;
          if (/window\.KYT_CURATED_TRIPS\s*=/.test(text)) list = K.parseExport(text);
          else list = K.toTripList(JSON.parse(text).trips ? JSON.parse(text) : JSON.parse(text));
          if (!Array.isArray(list)) throw new Error('No trip list found.');
          var raws = list.map(function (t) { return t && typeof t === 'object' ? Object.assign({}, t) : t; });
          var before = state.trips.length, r = addTrips(raws, null, state.importPolicy);
          showI({ kind: 'ok', text: 'Imported ' + r.added + ' added, ' + r.replaced + ' replaced, ' + r.skipped + ' skipped (previously ' + before + ').' });
          renderTabs();
        } catch (e) { showI({ kind: 'err', text: 'Could not load file: ' + e.message }); }
      };
      rd.readAsText(f);
    });

    root.appendChild(h('div', { class: 'card' },
      h('h3', { text: 'Import Existing curated_trips.js or Backup' }),
      h('p', { class: 'hint', text: 'Load existing curated trips to append or update your admin library.' }),
      field('Conflict Resolution', select([['skip', 'Keep trips already in library'], ['replace', 'Overwrite with loaded file']], state.importPolicy, function (v) { state.importPolicy = v; })),
      fileInput, imsg
    ));

    // Backup & Reset
    root.appendChild(h('div', { class: 'card' },
      h('h3', { text: 'Backup & Maintenance' }),
      h('p', { class: 'hint', text: 'Your library is safely preserved in browser local storage. Download JSON backups periodically.' }),
      h('div', { class: 'row' },
        btn('Download Full JSON Backup', '', function () {
          try { download('kyt_admin_backup.json', JSON.stringify(state.trips, null, 2)); } catch (e) { toast('Could not export backup.'); }
        }),
        btn('Clear Library', 'danger', function () {
          if (!state.trips.length) return;
          if (!confirm('Clear all ' + state.trips.length + ' trips from browser storage?')) return;
          state.trips = []; state.selected = null; persistTrips(); render(); toast('Library cleared.');
        })
      )
    ));

    return root;
  }

  // ------------------------------------------------------------ Shell Navigation
  var TABS = [
    ['curate', '1. Curate Trip'],
    ['review', '2. Review & Edit'],
    ['library', '3. Curated Library & Export']
  ];

  function go(tab) { state.tab = tab; render(); window.scrollTo(0, 0); }
  function renderStatus() {
    var el = document.getElementById('status'); if (!el) return;
    var ap = state.trips.filter(function (t) { return t.status === 'approved'; }).length;
    el.textContent = state.trips.length + ' trips (' + ap + ' approved)' + (CATALOG.length ? '' : ' · missing catalog') + (storageOk ? '' : ' · storage disabled');
  }
  function renderTabs() {
    var nav = document.getElementById('tabs'); nav.textContent = '';
    TABS.forEach(function (t) {
      var b = h('button', {
        type: 'button',
        class: 'tab',
        role: 'tab',
        'aria-selected': state.tab === t[0] ? 'true' : 'false',
        onclick: function () { go(t[0]); }
      }, t[1]);
      if (t[0] === 'review' && state.trips.length) {
        b.appendChild(h('span', { class: 'badge', text: String(state.trips.length) }));
      }
      nav.appendChild(b);
    });
    renderStatus();
  }
  function render() {
    var y = window.scrollY, view = document.getElementById('view'); view.textContent = '';
    var v = state.tab === 'curate' ? viewCurate : state.tab === 'review' ? viewReview : viewLibrary;
    view.appendChild(v());
    renderTabs();
    window.scrollTo(0, y);
  }

  render();
  window.KYTAdminApp = { state: state, render: render, go: go };
})();

