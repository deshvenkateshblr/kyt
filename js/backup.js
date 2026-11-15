/**
 * backup.js — storage safety for a zero-server app.
 *
 *  - safeSet():            localStorage write that tells the user when it fails (quota, blocked storage).
 *  - requestPersistence(): asks the browser not to evict KYT's data when the device runs low on space.
 *  - buildBackup() / downloadBackup() / restoreFromText(): ONE file with the passport, virtual trips and the
 *    current trip, including photos and tickets (they live inside the trip's steps).
 *  - openSheet() / confirmEndTrip(): the two dialogs people see ("Save & Open", "End this trip?").
 *  - Save and Open: the same file, in words a first-time user understands. Tracks what changed since the last
 *    save (markChanged / status), shows a dot on the toolbar's Save button, and nudges gently, never blocking.
 *
 * No dependencies. Uses KYT.store for the current trip when it is on the page. Styles are inline so the
 * dialogs look the same on every page, with or without Tailwind.
 */
window.KYT = window.KYT || {};

window.KYT.backup = (() => {
  const KEYS = { passport: 'kyt_passport', vtrips: 'kyt_virtual_trips', shareName: 'kyt_share_name', lastBackup: 'kyt_last_backup', changedAt: 'kyt_changed_at', changes: 'kyt_change_count', snooze: 'kyt_save_snooze' };
  const NUDGE_QUIET_MS = 7 * 86400000;   // at most one reminder a week, however much changes
  const FORMAT = 1;

  // ── small helpers ─────────────────────────────────────────────────────────
  const readLocal = key => { try { return localStorage.getItem(key); } catch (e) { return null; } };
  const readJson = (key, fallback) => { try { const v = readLocal(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(message, ms) {
    const old = document.getElementById('kyt-toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'kyt-toast'; el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:16px;z-index:300;max-width:480px;margin:0 auto;padding:14px 16px;border-radius:14px;background:#7F1D1D;color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35)';
    el.innerHTML = esc(message) + ' <button type="button" style="margin-left:8px;background:none;border:0;color:#FECACA;font-weight:800;text-decoration:underline;font-size:14px" data-kyt-backup>Save now</button>';
    document.body.appendChild(el);
    bind(el);
    setTimeout(() => el.remove(), ms || 12000);
  }

  // ── safe localStorage write ───────────────────────────────────────────────
  let lastWarn = 0;
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); requestPersistence(); if (key === KEYS.passport || key === KEYS.vtrips) markChanged(); return true; }
    catch (e) {
      console.error('localStorage write failed for', key, e);
      if (Date.now() - lastWarn > 5000 && typeof document !== 'undefined' && document.body) {
        lastWarn = Date.now();
        toast('Your last change could not be saved: this device has no room left for KYT. Save a copy to a file, then free some space.');
      }
      return false;
    }
  }

  // ── what has changed since the last save ──────────────────────────────────
  const DAY = 86400000;
  let nudgeTimer = null;
  const IDLE_MS = 3000;
  let lastActivity = Date.now();
  if (typeof document !== 'undefined') ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); }, { capture: true, passive: true }));
  function markChanged() {
    try {
      localStorage.setItem(KEYS.changes, String((parseInt(readLocal(KEYS.changes), 10) || 0) + 1));
      if (!readLocal(KEYS.changedAt)) localStorage.setItem(KEYS.changedAt, new Date().toISOString());
    } catch (e) { /* storage blocked: nothing to track */ }
    refreshIndicators();
    if (typeof document !== 'undefined' && document.body) { clearTimeout(nudgeTimer); nudgeTimer = setTimeout(maybeNudge, 4000); }
  }
  function markSaved(at) {
    try {
      localStorage.setItem(KEYS.lastBackup, at || new Date().toISOString());
      localStorage.removeItem(KEYS.changedAt); localStorage.removeItem(KEYS.changes); localStorage.removeItem(KEYS.snooze);
    } catch (e) { /* not critical */ }
    refreshIndicators();
    const n = typeof document !== 'undefined' && document.getElementById('kyt-save-nudge'); if (n) n.remove();
  }
  /** { lastSaved: Date|null, changes: n, unsaved: bool, since: Date|null } */
  function status() {
    const last = readLocal(KEYS.lastBackup), since = readLocal(KEYS.changedAt);
    const changes = parseInt(readLocal(KEYS.changes), 10) || 0;
    return { lastSaved: last ? new Date(last) : null, changes, unsaved: changes > 0, since: since ? new Date(since) : null };
  }
  function refreshIndicators() {
    if (typeof document === 'undefined') return;
    const st = status();
    document.querySelectorAll('[data-kyt-save-dot]').forEach(el => { el.style.display = st.unsaved && st.since && Date.now() - st.since.getTime() > DAY ? 'block' : 'none'; });   // quiet at first: only once it has sat unsaved for a day
    document.querySelectorAll('[data-kyt-backup][title]').forEach(el => {
      if (el.id === 'kyt-nav-save') el.title = st.unsaved ? 'Save your trips: you have changes that are only on this device' : 'Save your trips to a file';
    });
  }
  /** A gentle, dismissible reminder: enough has changed (or it has been long enough) and nothing is saved. */
  function maybeNudge() {
    try {
      if (typeof document === 'undefined' || !document.body) return;
      if (document.getElementById('kyt-save-nudge') || document.getElementById('kyt-backup-sheet') || document.getElementById('kyt-end-sheet')) return;
      const st = status();
      if (!st.unsaved) return;
      const snooze = parseInt(readLocal(KEYS.snooze), 10) || 0;
      if (Date.now() < snooze) return;
      if (Date.now() - lastActivity < IDLE_MS) { clearTimeout(nudgeTimer); nudgeTimer = setTimeout(maybeNudge, 1500); return; }   // never while they are tapping or typing
      // Calm by design, like KYF: saving is the person's call. Nothing appears while they work. Only changes left unsaved for 3+ days
      // (a browser can clear a site's data if it is not used for a while) get one reminder, at most once a week.
      const age = st.since ? Date.now() - st.since.getTime() : 0;
      if (age <= 3 * DAY) return;
      const el = document.createElement('div');
      el.id = 'kyt-save-nudge'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:240;max-width:480px;margin:0 auto;padding:14px 16px;border-radius:16px;background:#fff;color:#0F172A;border:2px solid #BFDBFE;font:600 14px/1.45 system-ui,sans-serif;box-shadow:0 14px 30px rgba(15,23,42,.25)';
      const what = st.lastSaved ? 'Your latest changes are only on this device.' : 'Your trips are only on this device.';
      el.innerHTML = `<strong style="font-weight:900">Save a copy?</strong> ${what} Saving makes one file with all of it, which you keep. <div style="display:flex;gap:10px;margin-top:10px"><button type="button" id="kyt-nudge-save" style="flex:1;padding:10px;border-radius:12px;border:0;background:#2563EB;color:#fff;font:800 14px system-ui">Save now</button><button type="button" id="kyt-nudge-later" style="flex:1;padding:10px;border-radius:12px;border:2px solid #E2E8F0;background:#fff;color:#475569;font:800 14px system-ui">Not now</button></div>`;
      document.body.appendChild(el);
      const quiet = () => { try { localStorage.setItem(KEYS.snooze, String(Date.now() + NUDGE_QUIET_MS)); } catch (e) { /* */ } };
      quiet();                                         // shown once: whatever happens next, it does not come back this week
      el.querySelector('#kyt-nudge-later').onclick = () => el.remove();
      el.querySelector('#kyt-nudge-save').onclick = () => { el.remove(); openSheet(); };   // explains what will happen first, rather than jumping into the share sheet
    } catch (e) { /* never get in the way */ }
  }

  /** Once in a while, when the browser's allowance is nearly used: say so, with a way to deal with it. */
  async function maybeLowSpaceNotice() {
    try {
      if (typeof document === 'undefined' || !document.body) return;
      if (document.getElementById('kyt-space-notice') || document.getElementById('kyt-backup-sheet') || document.getElementById('kyt-end-sheet')) return;
      if (Date.now() < (parseInt(readLocal('kyt_space_snooze'), 10) || 0)) return;
      const st = await storageStatus();
      const m = meterInfo({}, st.usage, st.quota);
      if (m.level === 'ok') return;
      const el = document.createElement('div');
      el.id = 'kyt-space-notice'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:235;max-width:480px;margin:0 auto;padding:12px 14px;border-radius:14px;background:#FFFBEB;color:#78350F;border:2px solid #FCD34D;font:600 13.5px/1.45 system-ui,sans-serif;box-shadow:0 10px 24px rgba(0,0,0,.2)';
      el.innerHTML = `<strong style="font-weight:900">${m.level === 'full' ? 'KYT is almost out of room.' : 'KYT is getting full.'}</strong> Photos take the most. <div style="display:flex;gap:10px;margin-top:8px"><button type="button" id="kyt-space-open" style="flex:1;padding:8px;border-radius:10px;border:0;background:#D97706;color:#fff;font:800 13px system-ui">See what uses space</button><button type="button" id="kyt-space-later" style="flex:1;padding:8px;border-radius:10px;border:2px solid #FCD34D;background:#fff;color:#78350F;font:800 13px system-ui">Later</button></div>`;
      document.body.appendChild(el);
      const snooze = () => { try { localStorage.setItem('kyt_space_snooze', String(Date.now() + 3 * DAY)); } catch (e) { /* */ } el.remove(); };
      el.querySelector('#kyt-space-later').onclick = snooze;
      el.querySelector('#kyt-space-open').onclick = () => { snooze(); openSheet(); };
    } catch (e) { /* never get in the way */ }
  }

  // ── persistence ───────────────────────────────────────────────────────────
  let persistAsked = false;
  async function requestPersistence() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return false;
      if (await navigator.storage.persisted()) return true;
      if (persistAsked) return false;
      persistAsked = true;
      return await navigator.storage.persist();
    } catch (e) { return false; }
  }
  async function storageStatus() {
    const out = { persisted: null, usage: null, quota: null };
    try {
      if (navigator.storage && navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
      if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); out.usage = e.usage; out.quota = e.quota; }
    } catch (e) { /* unsupported */ }
    return out;
  }

  // ── how much room KYT is using ────────────────────────────────────────────
  const mb = n => (n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB');
  /**
   * Pure. parts = bytes of { live, past, other }, usage and quota from the browser (either may be null).
   * level: 'ok' | 'low' (70% of the allowance used) | 'full' (90%). The browser's usage also counts the app's own
   * files, so the share is of the whole allowance; the breakdown is only the traveller's own data.
   */
  function meterInfo(parts, usage, quota) {
    const live = parts.live || 0, past = parts.past || 0, other = parts.other || 0;
    const mine = live + past + other;
    const share = usage != null && quota ? usage / quota : null;
    const level = share == null ? 'ok' : (share >= 0.9 ? 'full' : (share >= 0.7 ? 'low' : 'ok'));
    return { live, past, other, mine, share, level, rows: [['Current trip', live], ['Past trips', past], ['Planned trips, passport and settings', other]] };
  }
  async function storageBreakdown() {
    let live = 0, past = 0, other = 0, pastCount = 0;
    try {
      if (window.KYT.store) {
        await KYT.store.loadData();
        const t = KYT.store.get();
        live = JSON.stringify(t.stepsData || []).length + (t.tripCoverImage ? String(t.tripCoverImage).length : 0);
      }
    } catch (e) { /* unknown */ }
    try {
      if (window.KYT.pastTrips) {
        const list = await KYT.pastTrips.all();
        pastCount = list.length;
        list.forEach(r => { past += JSON.stringify(r).length; });
      }
    } catch (e) { /* unknown */ }
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); other += k.length + (localStorage.getItem(k) || '').length; } } catch (e) { /* blocked */ }
    const st = await storageStatus();
    return { ...meterInfo({ live, past, other }, st.usage, st.quota), pastCount, usage: st.usage, quota: st.quota };
  }
  function meterHtml(m) {
    const color = m.level === 'full' ? '#B91C1C' : (m.level === 'low' ? '#B45309' : '#2563EB');
    const bar = m.share != null ? `<div style="height:8px;border-radius:9999px;background:#E2E8F0;overflow:hidden;margin:6px 0"><div style="height:100%;width:${Math.min(100, Math.max(2, Math.round(m.share * 100)))}%;background:${color}"></div></div>` : '';
    const line = m.share != null
      ? `KYT is using about ${Math.round(m.share * 100)}% of the room this browser allows it (${mb(m.usage)} of ${mb(m.quota)}). That count includes the app's own files.`
      : 'This browser did not say how much room KYT has.';
    const warn = m.level === 'full' ? '<p style="margin:6px 0 0;font-size:13px;font-weight:800;color:#B91C1C">Almost full. Save a file now, then remove photos from Past trips or delete old trips.</p>'
      : (m.level === 'low' ? '<p style="margin:6px 0 0;font-size:13px;font-weight:800;color:#B45309">Getting full. Removing photos from a past trip frees the most room.</p>' : '');
    const rows = m.rows.filter(r => r[1] > 0).map(r => `<div style="display:flex;justify-content:space-between;font-size:12.5px;color:#334155"><span>${esc(r[0])}${r[0] === 'Past trips' && m.pastCount ? ' (' + m.pastCount + ')' : ''}</span><strong>${esc(mb(r[1]))}</strong></div>`).join('');
    return `<div data-kyt-meter style="margin-top:12px;padding:10px 12px;border:1px solid #E2E8F0;border-radius:12px;background:#F8FAFC">
      <div style="font-size:12.5px;font-weight:800;color:#0F172A">Space on this device</div>${bar}
      <div style="font-size:12px;color:#64748B;line-height:1.4">${esc(line)}</div>
      <div style="margin-top:6px">${rows}</div>${warn}</div>`;
  }

  // ── "does storage work on this device?" ────────────────────────────────────
  async function selfTest() {
    const out = { local: false, idb: false, passportCities: 0, mode: 'a browser tab' };
    try { localStorage.setItem('kyt_probe', '1'); out.local = localStorage.getItem('kyt_probe') === '1'; localStorage.removeItem('kyt_probe'); } catch (e) { /* blocked or full */ }
    try {
      out.idb = await new Promise(resolve => {
        const r = indexedDB.open('kyt_probe', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('p');
        r.onerror = () => resolve(false);
        r.onsuccess = () => {
          const db = r.result;
          try {
            const tx = db.transaction('p', 'readwrite'); tx.objectStore('p').put('1', 'k');
            tx.oncomplete = () => { db.close(); indexedDB.deleteDatabase('kyt_probe'); resolve(true); };
            tx.onerror = () => { db.close(); resolve(false); };
          } catch (e) { db.close(); resolve(false); }
        };
      });
    } catch (e) { /* unsupported */ }
    out.passportCities = Object.keys(readJson(KEYS.passport, {})).length;
    if ((window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone) out.mode = 'the installed app';
    return out;
  }

  // ── build / download ──────────────────────────────────────────────────────
  async function buildBackup() {
    const backup = {
      kytBackup: FORMAT, app: 'KYT', createdAt: new Date().toISOString(),
      passport: readJson(KEYS.passport, {}),
      virtualTrips: readJson(KEYS.vtrips, []),
      shareName: readLocal(KEYS.shareName) || '',
      activeTrip: null,
      pastTrips: []
    };
    if (window.KYT.pastTrips) { try { backup.pastTrips = await KYT.pastTrips.all(); } catch (e) { backup.pastTrips = []; } }
    if (window.KYT.store) {
      await KYT.store.loadData();
      const t = KYT.store.get();
      if (t.stepsData && t.stepsData.length) {
        backup.activeTrip = { name: t.tripName, notes: t.tripNotes || '', cover: t.tripCoverImage || null, steps: t.stepsData };
      }
    }
    return backup;
  }

  function summary(b) {
    return {
      cities: Object.keys(b.passport || {}).length,
      virtualTrips: (b.virtualTrips || []).length,
      pastTrips: Array.isArray(b.pastTrips) ? b.pastTrips.length : 0,
      activeTrip: b.activeTrip ? b.activeTrip.name : null,
      steps: b.activeTrip ? b.activeTrip.steps.length : 0
    };
  }

  const fileName = () => `kyt-saved-${new Date().toISOString().slice(0, 10)}.kyt`;     // plain JSON inside; Open goes by content, so .json files from before still open

  /**
   * Saves everything to one file. On a phone the share sheet opens, so "Save to Files", Drive or WhatsApp are
   * one tap; elsewhere it downloads. Resolves to the summary, or null when the person closed the share sheet.
   */
  /** True in the installed (home screen) app, where iPhone gives a blob download no Downloads folder to land in. */
  const isInstalledApp = () => { try { return !!navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); } catch (e) { return false; } };
  const isPhone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  /** How Save works here: 'download' (straight to Downloads, like any file) or 'share' (the phone's share sheet). */
  function defaultMethod() { return isPhone() && navigator.share && isInstalledApp() ? 'share' : 'download'; }
  async function saveToFile(method) {
    const backup = await buildBackup();
    const text = JSON.stringify(backup);
    const name = fileName();
    const phone = (method || defaultMethod()) === 'share' && isPhone() && navigator.share;
    if (phone) {
      const file = new File([text], name, { type: 'application/json' });
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'My KYT trips' }); }
        catch (e) { if (e && e.name === 'AbortError') return null; throw e; }
        markSaved(backup.createdAt);
        return { ...summary(backup), method: 'share', name };
      }
    }
    const blob = new Blob([text], { type: isPhone() ? 'application/octet-stream' : 'application/json' });   // octet-stream: iOS keeps the .kyt name instead of renaming to .json
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    markSaved(backup.createdAt);
    return { ...summary(backup), method: 'download', name };
  }
  const downloadBackup = saveToFile;

  // ── restore ───────────────────────────────────────────────────────────────
  /** Returns {ok:true, summary} or {ok:false, reason}. `confirmFn` lets tests skip the browser confirm(). */
  async function restoreFromText(text, confirmFn) {
    let b;
    try { b = JSON.parse(text); } catch (e) { return { ok: false, reason: 'This is not a KYT saved file (it could not be read).' }; }
    if (b && b.kytVersion && !b.kytBackup) return { ok: false, reason: 'This is a single-trip file. Import it from Edit Trip, using Import Trip.' };
    if (!b || b.kytBackup !== FORMAT) return { ok: false, reason: 'This is not a KYT saved file.' };
    const passportOk = b.passport && typeof b.passport === 'object' && !Array.isArray(b.passport);
    const vtripsOk = Array.isArray(b.virtualTrips);
    const tripOk = !b.activeTrip || (Array.isArray(b.activeTrip.steps) && b.activeTrip.steps.every(s => s && s.targetTime && !isNaN(new Date(s.targetTime))));
    const pastOk = b.pastTrips == null || (Array.isArray(b.pastTrips) && b.pastTrips.every(r => r && Array.isArray(r.steps)));
    if (!passportOk || !vtripsOk || !tripOk || !pastOk) return { ok: false, reason: 'This saved file is damaged, so nothing was changed.' };

    const s = summary(b);
    const lines = [`Open this saved file? It replaces what is on this device now. (Save first if you want to keep what is here.)`, `• Passport: ${s.cities} ${s.cities === 1 ? 'city' : 'cities'}`, `• Virtual trips: ${s.virtualTrips}${s.virtualTrips ? ' (' + b.virtualTrips.slice(0, 3).map(t => t.name || 'Untitled').join(', ') + (s.virtualTrips > 3 ? ', …' : '') + ')' : ''}`, `• Past trips: ${s.pastTrips}`,
      s.activeTrip ? `• Current trip: "${s.activeTrip}" (${s.steps} steps)` : `• Current trip: none in the file, so yours stays as it is`];
    const here = await deviceSummary();
    // A device with nothing on it just needs a yes. A device with trips is offered: add the file, replace, or save first.
    let mode;
    if (confirmFn) mode = await confirmFn(lines.join('\n'), { summary: s, here });
    else if (here.any) mode = await chooseOpenMode(s, here);
    else mode = window.confirm(lines.join('\n'));
    if (mode === true) mode = 'replace';
    if (mode !== 'replace' && mode !== 'merge') return { ok: false, reason: 'cancelled' };
    if (mode === 'merge') return mergeFile(b, s);

    if (!safeSet(KEYS.passport, JSON.stringify(b.passport)) || !safeSet(KEYS.vtrips, JSON.stringify(b.virtualTrips))) {
      return { ok: false, reason: 'There is not enough space on this device to open this file. Nothing else was changed.' };
    }
    if (b.shareName) safeSet(KEYS.shareName, b.shareName);
    if (b.activeTrip && window.KYT.store) {
      const t = b.activeTrip;
      KYT.store.setTripName(t.name || 'My Trip');
      KYT.store.setTripNotes(t.notes || '');
      KYT.store.setCoverImage(t.cover || null);
      KYT.store.setStepsData(t.steps.map(x => ({ ...x, targetTime: new Date(x.targetTime) })));
      KYT.store.setCurrentIndex(0);
      await KYT.store.saveData();
    }
    if (window.KYT.pastTrips && Array.isArray(b.pastTrips)) { try { await KYT.pastTrips.replaceAll(b.pastTrips); } catch (e) { /* the rest was opened */ } }
    markSaved(b.createdAt);                                  // what is on screen now is exactly what the file holds
    return { ok: true, summary: s, mode: 'replace' };
  }

  /** What is on this device now: counts, and whether there is anything worth protecting. */
  async function deviceSummary() {
    const passport = readJson(KEYS.passport, {}), vtrips = readJson(KEYS.vtrips, []);
    let past = [], steps = 0, name = '';
    if (window.KYT.pastTrips) { try { past = await KYT.pastTrips.all(); } catch (e) { past = []; } }
    if (window.KYT.store) { try { await KYT.store.loadData(); const t = KYT.store.get(); steps = (t.stepsData || []).length; name = steps ? t.tripName : ''; } catch (e) { /* none */ } }
    const cities = Object.keys(passport && typeof passport === 'object' ? passport : {}).length;
    return { cities, virtualTrips: Array.isArray(vtrips) ? vtrips.length : 0, pastTrips: past.length, activeTrip: name || null, steps, any: !!(cities || (Array.isArray(vtrips) && vtrips.length) || past.length || steps) };
  }

  /**
   * Adds what the file has to what is here and keeps both. A passport city or a trip already on the device (same
   * id) stays as it is here; the rest of the file is added. The device's current trip is kept: a file's current trip
   * is only added when this device has none.
   */
  async function mergeFile(b, s) {
    const added = { cities: 0, virtualTrips: 0, pastTrips: 0, activeTrip: false, skippedActive: false };
    const passport = readJson(KEYS.passport, {});
    Object.keys(b.passport || {}).forEach(id => { if (!(id in passport)) { passport[id] = b.passport[id]; added.cities++; } });
    const vt = readJson(KEYS.vtrips, []);
    const have = new Set(vt.map(t => t && t.id));
    (b.virtualTrips || []).forEach(t => { if (t && !have.has(t.id)) { vt.push(t); have.add(t.id); added.virtualTrips++; } });
    if (!safeSet(KEYS.passport, JSON.stringify(passport)) || !safeSet(KEYS.vtrips, JSON.stringify(vt))) {
      return { ok: false, reason: 'There is not enough space on this device to add this file. Nothing was changed.' };
    }
    if (window.KYT.pastTrips && Array.isArray(b.pastTrips) && b.pastTrips.length) {
      try {
        const cur = await KYT.pastTrips.all(); const ids = new Set(cur.map(r => r.id));
        const extra = b.pastTrips.filter(r => r && !ids.has(r.id));
        if (extra.length) { await KYT.pastTrips.replaceAll(cur.concat(extra)); added.pastTrips = extra.length; }
      } catch (e) { /* the rest was added */ }
    }
    if (b.activeTrip && window.KYT.store) {
      await KYT.store.loadData();
      if ((KYT.store.get().stepsData || []).length) added.skippedActive = true;
      else {
        const t = b.activeTrip;
        KYT.store.setTripName(t.name || 'My Trip'); KYT.store.setTripNotes(t.notes || ''); KYT.store.setCoverImage(t.cover || null);
        KYT.store.setStepsData(t.steps.map(x => ({ ...x, targetTime: new Date(x.targetTime) }))); KYT.store.setCurrentIndex(0);
        await KYT.store.saveData(); added.activeTrip = true;
      }
    }
    markChanged();                                           // the device now differs from any earlier file
    return { ok: true, summary: s, mode: 'merge', added };
  }

  // ── dialogs ───────────────────────────────────────────────────────────────
  const BTN = 'display:block;width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;font:800 15px system-ui,sans-serif;cursor:pointer;margin-top:10px;';
  const PRIMARY = BTN + 'background:#2563EB;color:#fff;border:0;';
  const SECOND = BTN + 'background:#fff;color:#1E3A8A;border:2px solid #BFDBFE;';
  const QUIET = BTN + 'background:transparent;color:#475569;border:0;';

  function sheet(id, html) {
    const old = document.getElementById(id); if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = id; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:250;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.55);';
    wrap.innerHTML = `<div style="width:100%;max-width:480px;box-sizing:border-box;max-height:92vh;overflow:auto;background:#fff;color:#0F172A;border-radius:24px 24px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom));font-family:system-ui,sans-serif">${html}</div>`;
    document.body.appendChild(wrap);
    return wrap;
  }

  const dateTxt = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

  /** Open, when this device already has trips: resolves 'merge', 'replace' or null. */
  function chooseOpenMode(s, here) {
    return new Promise(resolve => {
      const row = (label, n) => n ? `<li>${label}: <strong>${n}</strong></li>` : '';
      const wrap = sheet('kyt-open-sheet', `
        <h2 style="margin:0 0 6px;font-size:20px;font-weight:900">Open this saved file?</h2>
        <p style="margin:0 0 4px;font-size:13.5px;font-weight:800;color:#334155">In the file</p>
        <ul style="margin:0 0 8px;padding-left:18px;font-size:13.5px;line-height:1.6;color:#334155">${row('Passport cities', s.cities)}${row('Virtual trips', s.virtualTrips)}${row('Past trips', s.pastTrips)}${s.activeTrip ? `<li>Current trip: <strong>${esc(s.activeTrip)}</strong></li>` : ''}</ul>
        <p style="margin:0 0 4px;font-size:13.5px;font-weight:800;color:#334155">On this device now</p>
        <ul style="margin:0 0 6px;padding-left:18px;font-size:13.5px;line-height:1.6;color:#334155">${row('Passport cities', here.cities)}${row('Virtual trips', here.virtualTrips)}${row('Past trips', here.pastTrips)}${here.activeTrip ? `<li>Current trip: <strong>${esc(here.activeTrip)}</strong></li>` : ''}</ul>
        <button type="button" id="kyt-open-merge" style="${PRIMARY}">Add the file to what is here</button>
        <p style="margin:4px 2px 0;font-size:12px;color:#64748B;line-height:1.45">Keeps everything on this device and adds what the file has that you do not. Your current trip stays as it is.</p>
        <button type="button" id="kyt-open-replace" style="${SECOND}">Replace what is here with the file</button>
        <button type="button" id="kyt-open-save" style="${SECOND}">Save what is here to a file first</button>
        <div id="kyt-open-msg" aria-live="polite" style="margin-top:6px;font-size:13px;font-weight:700;color:#047857"></div>
        <button type="button" id="kyt-open-cancel" style="${QUIET}">Cancel</button>`);
      const done = v => { wrap.remove(); resolve(v); };
      wrap.addEventListener('click', e => { if (e.target === wrap) done(null); });
      wrap.querySelector('#kyt-open-cancel').onclick = () => done(null);
      wrap.querySelector('#kyt-open-merge').onclick = () => done('merge');
      wrap.querySelector('#kyt-open-replace').onclick = () => done('replace');
      wrap.querySelector('#kyt-open-save').onclick = async () => {
        const msg = wrap.querySelector('#kyt-open-msg');
        try { const r = await saveToFile(); msg.style.color = r ? '#047857' : '#B91C1C'; msg.textContent = r ? 'Saved. Now choose how to open the file.' : 'Not saved: the share sheet was closed.'; }
        catch (e) { msg.style.color = '#B91C1C'; msg.textContent = 'Could not save: ' + e.message; }
      };
    });
  }

  async function openSheet() {
    const st = await storageStatus();
    const t = await selfTest();
    const sv = status();
    const meter = await storageBreakdown();
    const state = sv.unsaved
      ? `<span style="color:#B45309">● ${sv.changes} ${sv.changes === 1 ? 'change' : 'changes'} ${sv.lastSaved ? 'since you last saved (' + esc(dateTxt(sv.lastSaved)) + ')' : ', none saved to a file yet'}</span>`
      : (sv.lastSaved ? `<span style="color:#047857">✓ Everything is saved (${esc(dateTxt(sv.lastSaved))})</span>` : '<span style="color:#64748B">Nothing saved to a file yet</span>');
    const prot = st.persisted === null ? '' : (st.persisted ? 'Protected from automatic cleanup.' : 'Not yet protected from automatic cleanup by the browser, so a saved file matters.');
    const viaShare = defaultMethod() === 'share';
    const other = isPhone() && navigator.share;   // a phone that could do either
    const wrap = sheet('kyt-backup-sheet', `
      <h2 style="margin:0 0 6px;font-size:20px;font-weight:900">Save &amp; Open</h2>
      <p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#475569">Your trips live on this device only: no account, no cloud. <strong>Save</strong> puts all of them, with your passport, photos and tickets, in one file you keep (Files, Drive, or send it to yourself). <strong>Open</strong> that file on any phone to carry on.</p>
      <p style="margin:0;font-size:13.5px;font-weight:800">${state}</p>
      <div id="kyt-backup-msg" aria-live="polite" style="margin-top:8px;font-size:14px;font-weight:700;color:#047857"></div>
      <button type="button" id="kyt-backup-download" style="${PRIMARY}">Save to a file</button>
      ${viaShare ? `<p id="kyt-backup-how" style="margin:8px 2px 0;font-size:12.5px;line-height:1.5;color:#475569">Your phone's share sheet opens next, because that is how a file leaves an installed app. Tap <strong>${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'Save to Files' : 'Drive, Files or WhatsApp'}</strong> and pick where to keep it. Closing it saves nothing, and nothing is lost.</p>` : (isPhone() ? `<p id="kyt-backup-how" style="margin:8px 2px 0;font-size:12.5px;line-height:1.5;color:#475569">The file goes straight to your Downloads folder, in Files.</p>` : '')}
      ${other ? `<button type="button" id="kyt-backup-alt" style="background:none;border:0;padding:10px 2px;font:700 12.5px system-ui;color:#2563EB;text-decoration:underline;cursor:pointer">${viaShare ? 'Download to my phone instead' : 'Choose where to send it instead (share sheet)'}</button>` : ''}
      <button type="button" id="kyt-backup-restore" style="${SECOND}">Open a saved file</button>
      <input type="file" id="kyt-backup-file" style="display:none">
      ${meterHtml(meter)}
      <details style="margin-top:12px"><summary style="cursor:pointer;font-size:12.5px;font-weight:800;color:#64748B">About this device</summary>
        <p style="margin:6px 0 0;font-size:12.5px;line-height:1.6;color:#334155">
        ${t.local ? '✓' : '✗'} Settings and passport storage ${t.local ? 'works' : 'is blocked or full'} · ${t.idb ? '✓' : '✗'} Trip storage ${t.idb ? 'works' : 'is blocked or full'}<br>
        Running as ${esc(t.mode)} · ${t.passportCities} ${t.passportCities === 1 ? 'city' : 'cities'} stamped here${prot ? '<br>' + esc(prot) : ''}<br>
        <span style="color:#64748B">The installed app and the browser keep separate data. Save in one, then Open the file in the other, to move your trips across.</span></p></details>
      <button type="button" id="kyt-backup-close" style="${QUIET}">Close</button>`);
    const msg = wrap.querySelector('#kyt-backup-msg');
    const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? '#B91C1C' : '#047857'; };
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    wrap.querySelector('#kyt-backup-close').onclick = () => wrap.remove();
    const run = async method => {
      try {
        const r = await saveToFile(method);
        if (!r) return say('Nothing was saved because the share sheet was closed. Tap Save to a file whenever you are ready.', false);
        say(`Saved: ${r.cities} ${r.cities === 1 ? 'city' : 'cities'}, ${r.virtualTrips} virtual ${r.virtualTrips === 1 ? 'trip' : 'trips'}${r.activeTrip ? ', current trip "' + r.activeTrip + '"' : ''}. ${r.method === 'download' && isPhone() ? 'It is in Downloads, in the Files app.' : 'Keep the file somewhere safe, such as your Drive.'}`);
      } catch (e) { say('Could not save: ' + e.message, true); }
    };
    wrap.querySelector('#kyt-backup-download').onclick = () => run();
    const alt = wrap.querySelector('#kyt-backup-alt');
    if (alt) alt.onclick = () => run(viaShare ? 'download' : 'share');
    const file = wrap.querySelector('#kyt-backup-file');
    wrap.querySelector('#kyt-backup-restore').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      const r = await restoreFromText(await f.text());
      file.value = '';
      if (r.ok && r.mode === 'merge') { const a = r.added; say(`Added ${a.cities} ${a.cities === 1 ? 'city' : 'cities'}, ${a.virtualTrips} virtual ${a.virtualTrips === 1 ? 'trip' : 'trips'}, ${a.pastTrips} past ${a.pastTrips === 1 ? 'trip' : 'trips'}${a.activeTrip ? ' and the current trip' : ''}${a.skippedActive ? '. Your current trip was kept; the file\'s current trip was not added' : ''}. Reloading…`); setTimeout(() => location.reload(), 1800); }
      else if (r.ok) { say('Opened. Reloading…'); setTimeout(() => location.reload(), 900); }
      else if (r.reason !== 'cancelled') say(r.reason, true);
    };
    return wrap;
  }

  /** Resolves 'backup' (downloaded, go ahead), 'skip' (end without backup) or null (cancel). */
  function confirmEndTrip(tripName) {
    return new Promise(resolve => {
      const wrap = sheet('kyt-end-sheet', `
        <h2 style="margin:0 0 6px;font-size:20px;font-weight:900">End this trip?</h2>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#475569">Ending <strong>${esc(tripName || 'this trip')}</strong> moves it to <strong>Past trips</strong> on this device, so you can look back at it or plan it again. Photos are shrunk to save space. Your passport gets its stamps.</p>
        <button type="button" id="kyt-end-skip" style="${PRIMARY}">End trip</button>
        <button type="button" id="kyt-end-backup" style="${SECOND}">Save a file first, then end it</button>
        <button type="button" id="kyt-end-cancel" style="${QUIET}">Keep my trip</button>`);
      const done = v => { wrap.remove(); resolve(v); };
      wrap.addEventListener('click', e => { if (e.target === wrap) done(null); });
      wrap.querySelector('#kyt-end-cancel').onclick = () => done(null);
      wrap.querySelector('#kyt-end-skip').onclick = () => done('skip');
      wrap.querySelector('#kyt-end-backup').onclick = async () => {
        const btn = wrap.querySelector('#kyt-end-backup');
        try { const r = await saveToFile(); if (r) done('backup'); else btn.textContent = 'Not saved yet. Tap to try again.'; }
        catch (e) { btn.textContent = 'Saving failed. Tap to try again.'; }
      };
    });
  }

  // First launch of the installed app with nothing in it: on iPhone it does not share data with Safari.
  function maybeShowFreshAppNotice() {
    try {
      const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
      if (!standalone || localStorage.getItem('kyt_fresh_notice')) return;
      localStorage.setItem('kyt_fresh_notice', '1');
      const empty = !Object.keys(readJson(KEYS.passport, {})).length && !readJson(KEYS.vtrips, []).length;
      if (!empty) return;
      const el = document.createElement('div');
      el.id = 'kyt-fresh-notice'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top));z-index:280;max-width:480px;margin:0 auto;padding:14px 16px;border-radius:16px;background:#1E3A8A;color:#fff;font:600 14px/1.45 system-ui,sans-serif;box-shadow:0 14px 30px rgba(0,0,0,.35)';
      el.innerHTML = 'Starting fresh? This app keeps its own data, separate from Safari. If you used KYT in Safari first, save it there, then open the file here. <div style="display:flex;gap:10px;margin-top:10px"><button type="button" data-kyt-backup style="flex:1;padding:10px;border-radius:12px;border:0;background:#fff;color:#1E3A8A;font:800 14px system-ui">Open a saved file</button><button type="button" id="kyt-fresh-dismiss" style="flex:1;padding:10px;border-radius:12px;border:2px solid #93C5FD;background:none;color:#fff;font:800 14px system-ui">Got it</button></div>';
      document.body.appendChild(el);
      bind(el);
      el.querySelector('#kyt-fresh-dismiss').onclick = () => el.remove();
    } catch (e) { /* storage blocked */ }
  }

  /** Toolbar Save: one tap saves the file (like KYF's Save Data), then a short note says where it went, with a way to Open or see options. */
  function saveNote(html) {
    const old = document.getElementById('kyt-save-note'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'kyt-save-note'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:300;max-width:480px;margin:0 auto;padding:12px 16px;border-radius:14px;background:#0F172A;color:#fff;font:600 13.5px/1.45 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35)';
    el.innerHTML = html + ' <button type="button" id="kyt-save-more" style="margin-left:6px;background:none;border:0;color:#93C5FD;font:800 13.5px system-ui;text-decoration:underline;padding:6px 2px">Open a file or more</button>';
    document.body.appendChild(el);
    el.querySelector('#kyt-save-more').onclick = () => { el.remove(); openSheet(); };
    setTimeout(() => el.remove(), 7000);
  }
  async function quickSave() {
    try {
      const r = await saveToFile();
      if (!r) return saveNote('Nothing was saved because the share sheet was closed.');
      saveNote(`\u2713 Saved as <strong>${esc(r.name)}</strong>${r.method === 'download' && isPhone() ? ', in Downloads' : ''}.`);
    } catch (e) { saveNote('Could not save: ' + esc(e.message || e)); }
  }

  // Any element marked data-kyt-backup opens the sheet; the toolbar's Save button saves straight away.
  function bind(root) {
    refreshIndicators();
    (root || document).querySelectorAll('[data-kyt-backup]').forEach(el => {
      if (el.dataset.kytBackupBound) return;
      el.dataset.kytBackupBound = '1';
      el.addEventListener('click', e => { e.preventDefault(); if (el.id === 'kyt-nav-save') quickSave(); else openSheet(); });
    });
  }
  if (typeof document !== 'undefined') {
    const start = () => { bind(); refreshIndicators(); maybeShowFreshAppNotice(); setTimeout(maybeNudge, 2500); setTimeout(maybeLowSpaceNotice, 3500); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }

  return { meterInfo, storageBreakdown, selfTest, safeSet, requestPersistence, storageStatus, buildBackup, downloadBackup, saveToFile, restoreFromText, deviceSummary, mergeFile, openSheet, quickSave, confirmEndTrip, bind, markChanged, markSaved, status, maybeNudge, maybeLowSpaceNotice, refreshIndicators };
})();
