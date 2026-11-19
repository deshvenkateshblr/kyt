/**
 * KYT.journey: the loop that connects Passport, quests and trip planning.
 *   - quest math: progress, the next quest to suggest, the nearest unstamped cities of a quest
 *   - celebrations: a sheet when a stamp finishes a quest, levels up the passport or hits a milestone; a toast otherwise
 *   - planning: "Plan this trip" opens Virtual Trips with a quest's next stops (virtual_trip.html?quest=<id>)
 *   - sharing: the Passport share link, and the call-to-action bar for people who arrive from a shared link
 * Needs data/quests.js and data/cities.js; uses PassportStore / PassportExtras when the page has them.
 */
(function () {
  'use strict';
  const KYT = window.KYT = window.KYT || {};

  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SEEN_KEY = 'kyt_journey_seen';
  const MILESTONES = [10, 25, 50, 100];
  const MAX_STOPS = 5;                                 // a quest has up to a dozen places; a trip takes the nearest few
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const quests = () => (window.KYT_QUESTS || []).filter(q => q && Array.isArray(q.cityIds) && q.cityIds.length);
  const questById = id => quests().find(q => q.id === id) || null;
  const cityById = id => (window.KYT_CITIES || []).find(c => c.id === id) || null;
  const cityName = id => { const c = cityById(id); return c ? c.name : id; };

  /** Ids of the cities stamped on this device. */
  function visitedIds() {
    try {
      if (window.PassportStore && PassportStore.getPassportCities) return new Set(PassportStore.getPassportCities().filter(c => c.visited).map(c => c.id));
    } catch (e) { /* fall through */ }
    return new Set();
  }

  // ── Quest math ──────────────────────────────────────────────────────────────────────────────────
  function progress(q, visited) {
    const v = visited || visitedIds();
    const have = q.cityIds.filter(id => v.has(id));
    const remaining = q.cityIds.filter(id => !v.has(id));
    return { id: q.id, title: q.title, icon: q.icon || 'compass', got: have.length, of: q.cityIds.length, left: remaining.length,
      pct: q.cityIds.length ? have.length / q.cityIds.length : 0, done: remaining.length === 0, remaining };
  }

  /** Quests the person has begun come first, closest to finished first; with none begun, the shortest quests make the easiest start. */
  function nextQuests(visited, limit = 3, skipId) {
    const v = visited || visitedIds();
    const open = quests().filter(q => q.id !== skipId).map(q => progress(q, v)).filter(p => !p.done);
    const begun = open.filter(p => p.got > 0).sort((a, b) => a.left - b.left || b.pct - a.pct);
    const fresh = open.filter(p => p.got === 0).sort((a, b) => a.of - b.of);
    return begun.concat(fresh).slice(0, limit);
  }

  function kmBetween(a, b) {
    const m = window.KYT_DISTANCE_MATRIX;
    const v = m && ((m[a] && m[a][b]) ?? (m[b] && m[b][a]));
    return typeof v === 'number' ? v : null;
  }

  /** The quest's unstamped cities as a short route: start nearest to somewhere already stamped, then always the closest next one. */
  function nextStops(q, visited, max = MAX_STOPS) {
    const v = visited || visitedIds();
    let left = q.cityIds.filter(id => !v.has(id) && cityById(id));
    if (!left.length) return [];
    const near = id => {
      const ds = [...v].map(x => kmBetween(id, x)).filter(d => d != null);
      return ds.length ? Math.min(...ds) : Infinity;
    };
    left.sort((a, b) => near(a) - near(b));
    const route = [left.shift()];
    while (left.length && route.length < max) {
      const last = route[route.length - 1];
      left.sort((a, b) => (kmBetween(last, a) ?? 1e9) - (kmBetween(last, b) ?? 1e9));
      route.push(left.shift());
    }
    return route;
  }

  const planUrl = id => `virtual_trip.html?quest=${encodeURIComponent(id)}`;

  /** What a new virtual trip for this quest looks like: a name and the cities, or null when the quest is unknown or finished. */
  function planFor(id) {
    const q = questById(id);
    if (!q) return null;
    const cities = nextStops(q, visitedIds());
    if (!cities.length) return null;
    return { name: `${q.title}: next stops`, cities };
  }

  /** The quests a city belongs to, with how far each has got; used on the city sheet. */
  function questsForCity(cityId) {
    const v = visitedIds();
    return quests().filter(q => q.cityIds.includes(cityId)).map(q => progress(q, v));
  }

  // ── Achievements ────────────────────────────────────────────────────────────────────────────────
  function levelIndex(v) {
    try {
      if (window.PassportExtras && PassportStore.getPassportCities) {
        const list = PassportStore.getPassportCities().filter(c => v.has(c.id));
        return PassportExtras.persona(list).level;
      }
    } catch (e) { /* no levels on this page */ }
    return 1;
  }
  function levelTitle(n) { const L = window.PassportExtras && PassportExtras.LEVELS; return L && L[n - 1] ? L[n - 1].title : ''; }

  function snapshot() {
    const v = visitedIds();
    return { count: v.size, done: quests().filter(q => q.cityIds.every(id => v.has(id))).map(q => q.id), level: levelIndex(v) };
  }
  function readSeen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch (e) { return null; } }
  function writeSeen(s) { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }

  /** What a stamp (or a trip that stamped several cities) achieved: a list of events, most exciting first. */
  function achievements(before, after) {
    const ev = [];
    after.done.filter(id => !before.done.includes(id)).forEach(id => ev.push({ kind: 'quest', quest: questById(id) }));
    if (after.level > before.level) ev.push({ kind: 'level', level: after.level, title: levelTitle(after.level) });
    const mile = MILESTONES.filter(n => before.count < n && after.count >= n).pop();
    if (mile) ev.push({ kind: 'milestone', n: mile });
    if (before.count === 0 && after.count >= 1) ev.push({ kind: 'first' });
    return ev.filter(e => e.kind !== 'quest' || e.quest);
  }

  /** Call right after a stamp with the snapshot taken just before it. Celebrates an achievement, otherwise a quiet toast. */
  function afterStamp(before, cityId) {
    const after = snapshot();
    writeSeen(after);
    const ev = achievements(before, after);
    // The first stamp is a toast, not a sheet: someone stamping a dozen places in a row must not be stopped by it
    const sheetEvents = ev.filter(e => e.kind !== 'first');
    if (sheetEvents.length) { showCelebration(sheetEvents, after); return ev; }
    if (ev.length) { toast('Your first stamp. Your India passport is open.', nextQuests(null, 1)[0]); return ev; }
    const mine = questsForCity(cityId).filter(p => !p.done);
    toast(mine.length
      ? `Stamped ${cityName(cityId)}. ${mine.slice(0, 2).map(p => `${p.title} ${p.got}/${p.of}`).join(' · ')}`
      : `Stamped ${cityName(cityId)}.`, nextQuests(null, 1)[0]);
    return ev;
  }

  /** Call when Passport opens. A first visit only records where things stand; later, anything achieved elsewhere (a trip that ended and stamped its cities) is celebrated now. */
  function reconcile() {
    const now = snapshot(), seen = readSeen();
    writeSeen(now);
    if (!seen) return [];
    const ev = achievements(seen, now);
    const sheetEvents = ev.filter(e => e.kind !== 'first');
    if (sheetEvents.length) showCelebration(sheetEvents, now);
    return ev;
  }
  function afterUnstamp() { writeSeen(snapshot()); }

  // ── UI: celebration sheet and toast ─────────────────────────────────────────────────────────────
  function headline(ev) {
    if (ev.kind === 'quest') return { icon: 'trophy', title: `Quest complete: ${ev.quest.title}`, line: `You have stamped all ${ev.quest.cityIds.length} places.` };
    if (ev.kind === 'level') return { icon: 'award', title: `${ev.title} level reached`, line: 'Your passport just levelled up.' };
    if (ev.kind === 'milestone') return { icon: 'flag', title: `${ev.n} places stamped`, line: `${ev.n} stamps in your India passport.` };
    return { icon: 'stamp', title: 'Your first stamp', line: 'Your India passport is open. Every place you add brings the next quest closer.' };
  }

  function confettiHtml() {
    if (reduceMotion()) return '';
    const colors = ['#f59e0b', '#2563eb', '#10b981', '#e11d48', '#8b5cf6'];
    return Array.from({ length: 22 }, (_, i) =>
      `<i class="kyt-confetti" style="left:${(i * 4.7 + 3) % 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 7) * 0.12}s;animation-duration:${1.6 + (i % 5) * 0.25}s"></i>`).join('');
  }

  function ensureStyles() {
    if (document.getElementById('kyt-journey-css')) return;
    const st = document.createElement('style');
    st.id = 'kyt-journey-css';
    st.textContent = `
      .kyt-confetti{position:absolute;top:-12px;width:7px;height:12px;border-radius:2px;opacity:.9;animation:kyt-fall linear 1 forwards}
      @keyframes kyt-fall{to{transform:translateY(340px) rotate(540deg);opacity:0}}
      @keyframes kyt-pop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
      .kyt-pop{animation:kyt-pop .22s ease-out both}
      .kyt-has-cta #city-detail-panel{padding-bottom:4.5rem}
      .kyt-has-cta main{padding-bottom:4.5rem}
      @media (prefers-reduced-motion: reduce){.kyt-pop{animation:none}}`;
    document.head.appendChild(st);
  }

  function nextQuestBlock(skipId) {
    const next = nextQuests(null, 1, skipId)[0];
    if (!next) return `<p class="text-sm font-semibold text-emerald-700 text-center">Every quest is complete. Stamp new places to keep your passport growing.</p>`;
    const stops = nextStops(questById(next.id), visitedIds(), 3).map(cityName);
    return `<div class="rounded-2xl border border-blue-100 bg-blue-50/70 p-3.5 text-left">
      <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Next quest</p>
      <p class="text-sm font-extrabold text-slate-800 mt-0.5">${esc(next.title)}</p>
      <p class="text-xs text-slate-500 mt-0.5">${next.got ? `${next.got} of ${next.of} stamped, ${next.left} to go` : `${next.of} places`}${stops.length ? `. Nearest: ${esc(stops.join(', '))}` : ''}</p>
      <div class="flex gap-2 mt-3">
        <button type="button" data-j-open="${esc(next.id)}" class="flex-1 px-3 py-2 rounded-xl bg-white border border-blue-200 text-blue-700 text-xs font-extrabold cursor-pointer">See the quest</button>
        <a href="${esc(planUrl(next.id))}" data-j-plan class="flex-1 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-extrabold text-center">Plan this trip</a>
      </div></div>`;
  }

  function showCelebration(events, after) {
    ensureStyles();
    const old = document.getElementById('kyt-celebrate'); if (old) old.remove();
    const top = headline(events[0]);
    const extra = events.slice(1).map(headline).map(h => `<li>${esc(h.title)}</li>`).join('');
    const o = document.createElement('div');
    o.id = 'kyt-celebrate';
    o.className = 'fixed inset-0 z-[120] bg-slate-900/60 flex items-end sm:items-center justify-center p-4';
    o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-labelledby', 'kyt-celebrate-title');
    o.innerHTML = `<div class="kyt-pop relative overflow-hidden w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 text-center">
        <div aria-hidden="true">${confettiHtml()}</div>
        <div class="relative mx-auto w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center"><i data-lucide="${top.icon}" class="w-8 h-8"></i></div>
        <h2 id="kyt-celebrate-title" class="relative mt-3 text-xl font-black text-slate-900 leading-tight">${esc(top.title)}</h2>
        <p class="relative text-sm text-slate-600 mt-1">${esc(top.line)}</p>
        ${extra ? `<ul class="relative text-xs font-bold text-amber-700 mt-2 space-y-0.5">${extra}</ul>` : ''}
        <div class="relative mt-4">${nextQuestBlock(events[0].kind === 'quest' ? events[0].quest.id : null)}</div>
        <div class="relative flex gap-2 mt-3">
          <button type="button" id="kyt-celebrate-share" class="flex-1 px-3 py-2.5 rounded-xl bg-amber-400 text-slate-900 text-xs font-extrabold cursor-pointer">Share my passport</button>
          <button type="button" id="kyt-celebrate-close" class="flex-1 px-3 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-extrabold cursor-pointer">Keep exploring</button>
        </div></div>`;
    document.body.appendChild(o);
    if (window.lucide) window.lucide.createIcons();
    const close = () => { o.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    o.addEventListener('click', e => {
      if (e.target === o || e.target.closest('#kyt-celebrate-close')) return close();
      if (e.target.closest('#kyt-celebrate-share')) { close(); const b = document.getElementById('btn-share-passport'); if (b && !b.disabled) b.click(); return; }
      const open = e.target.closest('[data-j-open]');
      if (open) { close(); openQuest(open.dataset.jOpen); }
    });
    const closeBtn = o.querySelector('#kyt-celebrate-close'); if (closeBtn) closeBtn.focus();
  }

  /** Show one quest's cities on the Passport page. */
  function openQuest(id) {
    if (window.PassportExtras && PassportExtras.getActiveQuest && PassportExtras.getActiveQuest() && PassportExtras.getActiveQuest().id === id) { /* already open */ }
    else if (window.PassportExtras && PassportExtras.setActiveQuest) PassportExtras.setActiveQuest(id);
    if (window.PassportExtras && PassportExtras.notifyChange) PassportExtras.notifyChange();
    const grid = document.getElementById('quest-explainer-card') || document.getElementById('cards-container');
    if (grid && grid.scrollIntoView) grid.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  let toastTimer = null;
  function toast(text, next) {
    ensureStyles();
    const old = document.getElementById('kyt-journey-toast'); if (old) old.remove();
    clearTimeout(toastTimer);
    const t = document.createElement('div');
    t.id = 'kyt-journey-toast'; t.setAttribute('role', 'status');
    t.className = 'kyt-pop fixed left-1/2 -translate-x-1/2 bottom-16 z-[110] max-w-[92vw] bg-slate-900 text-white text-xs font-semibold rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-3';
    t.innerHTML = `<span>${esc(text)}</span>${next ? `<button type="button" data-j-open="${esc(next.id)}" class="shrink-0 text-amber-300 font-extrabold underline cursor-pointer">Next: ${esc(next.title)}</button>` : ''}`;
    t.addEventListener('click', e => { const o = e.target.closest('[data-j-open]'); if (o) { t.remove(); openQuest(o.dataset.jOpen); } });
    document.body.appendChild(t);
    toastTimer = setTimeout(() => t.remove(), 5000);
  }

  // ── Sharing ─────────────────────────────────────────────────────────────────────────────────────
  const SHARE_BASE = 'https://vividnova.com/kyt/';

  /** The link in a shared Passport card: it opens Passport on the quest the sender is closest to finishing. */
  function passportShareUrl() {
    const top = nextQuests(null, 1)[0];
    return `${SHARE_BASE}visited.html?from=share${top ? `&quest=${encodeURIComponent(top.id)}` : ''}`;
  }

  /** "A friend shared their passport": a banner on Passport for people who arrive from a shared card link. */
  function renderPassportInvite() {
    const p = new URLSearchParams(window.location.search);
    if (p.get('from') !== 'share') return;
    const host = document.getElementById('passport-invite');
    if (!host) return;
    const q = questById(p.get('quest'));
    host.innerHTML = `<div class="rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 shadow-lg flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-extrabold">A friend shared their India passport with you</p>
          <p class="text-xs text-blue-100 mt-0.5">How much of India have you seen? Tap the places you have been to stamp them${q ? `, starting with ${esc(q.title)}` : ''}. Free, and it stays on your phone.</p>
        </div>
        <div class="flex gap-2 shrink-0">
          ${q ? `<button type="button" data-j-open="${esc(q.id)}" class="px-4 py-2 rounded-xl bg-white text-blue-700 text-xs font-extrabold cursor-pointer">Try this quest</button>` : ''}
          <button type="button" data-j-quests class="px-4 py-2 rounded-xl bg-blue-500/60 border border-white/30 text-white text-xs font-extrabold cursor-pointer">Browse quests</button>
        </div></div>`;
    host.classList.remove('hidden');
    host.addEventListener('click', e => {
      const o = e.target.closest('[data-j-open]');
      if (o) return openQuest(o.dataset.jOpen);
      if (e.target.closest('[data-j-quests]') && window.PassportExtras) PassportExtras.openQuestsSheet();
    });
  }

  /** The "Next quest" card in the passport header, and its "Plan this trip" button. */
  function renderNextQuest(host) {
    if (!host) return;
    const next = nextQuests(null, 1)[0];
    if (!next) {
      host.innerHTML = `<p class="text-xs font-bold text-emerald-300">Every quest complete. Add places to keep growing your passport.</p>`;
      return;
    }
    const stops = nextStops(questById(next.id), visitedIds(), 3).map(cityName);
    host.innerHTML = `<p class="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">${next.got ? 'Next quest' : 'Start here'}</p>
      <p class="text-sm font-extrabold text-white mt-0.5">${esc(next.title)}</p>
      <p class="text-xs text-slate-300 mt-0.5">${next.got ? `${next.got} of ${next.of} stamped, ${next.left} to go` : `${next.of} places to stamp`}${stops.length ? `. Nearest: ${esc(stops.join(', '))}` : ''}</p>
      <div class="flex gap-2 mt-2.5">
        <button type="button" data-j-open="${esc(next.id)}" class="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-bold cursor-pointer">See the quest</button>
        <a href="${esc(planUrl(next.id))}" class="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-900 text-xs font-extrabold">Plan this trip</a>
      </div>`;
    if (!host.dataset.wired) {
      host.dataset.wired = '1';
      host.addEventListener('click', e => { const o = e.target.closest('[data-j-open]'); if (o) openQuest(o.dataset.jOpen); });
    }
  }

  /** Quest chips for the city sheet: which quests this place belongs to, and a way into each. */
  function renderCityQuests(cityId, id) {
    const list = questsForCity(cityId);
    if (!list.length) return '';
    return `<div ${id ? `id="${id}" ` : ''}class="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
      <p class="text-[11px] font-extrabold uppercase tracking-wider text-blue-500">Part of ${list.length === 1 ? 'a quest' : 'these quests'}</p>
      <div class="flex flex-wrap gap-1.5 mt-1.5">${list.map(p =>
        `<a href="visited.html?quest=${encodeURIComponent(p.id)}" class="text-[11px] font-bold px-2 py-1 rounded-full bg-white border border-blue-200 text-blue-700">${esc(p.title)} · ${p.got}/${p.of}</a>`).join('')}</div></div>`;
  }

  // ── Calls to action for people who arrive from a shared link ───────────────────────────────────
  const CTA = {
    trip: { line: 'This trip was planned with KYT: free, works offline, nothing to sign up for.', primary: ['Plan your own trip', 'virtual_trip.html'], secondary: ['Stamp your Passport', 'visited.html'] },
    city: { line: 'Shared from KYT, a free India travel planner that works offline.', primary: ['Plan a trip here', 'virtual_trip.html'], secondary: ['Open Passport', 'visited.html'] }
  };
  const DISMISS_KEY = 'kyt_cta_dismissed';

  /** A bar at the foot of the page for a shared view ("trip" or "city"). It can be closed, and stays closed for the session. */
  function showSharedCta(kind) {
    const c = CTA[kind];
    if (!c || document.getElementById('kyt-shared-cta')) return;
    try { if (sessionStorage.getItem(DISMISS_KEY + kind)) return; } catch (e) { /* storage unavailable */ }
    const bar = document.createElement('div');
    bar.id = 'kyt-shared-cta';
    bar.dataset.kind = kind;
    bar.className = 'fixed inset-x-0 bottom-0 z-[130] bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-6px_20px_rgba(15,23,42,0.08)] px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))]';
    bar.innerHTML = `<div class="max-w-3xl mx-auto flex items-center gap-2.5">
        <p class="flex-1 min-w-0 text-[11px] sm:text-xs text-slate-600 font-semibold leading-snug">${esc(c.line)}</p>
        <a href="${esc(c.secondary[1])}" class="shrink-0 hidden sm:inline-flex px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-extrabold">${esc(c.secondary[0])}</a>
        <a href="${esc(c.primary[1])}" class="shrink-0 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-extrabold">${esc(c.primary[0])}</a>
        <button type="button" aria-label="Close" class="shrink-0 p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
    bar.querySelector('button').addEventListener('click', () => { bar.remove(); document.body.classList.remove('kyt-has-cta'); try { sessionStorage.setItem(DISMISS_KEY + kind, '1'); } catch (e) { /* storage unavailable */ } });
    document.body.appendChild(bar);
    document.body.classList.add('kyt-has-cta');
    ensureStyles();
    if (window.lucide) window.lucide.createIcons();
  }

  KYT.journey = { quests, questById, progress, nextQuests, nextStops, planUrl, planFor, questsForCity, snapshot, achievements,
    afterStamp, afterUnstamp, reconcile, showCelebration, openQuest, toast, passportShareUrl, renderPassportInvite, renderNextQuest,
    renderCityQuests, showSharedCta };
})();
