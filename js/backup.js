/**
 * backup.js — storage safety for a zero-server app.
 *
 *  - safeSet():            localStorage write that tells the user when it fails (quota, blocked storage).
 *  - requestPersistence(): asks the browser not to evict KYT's data when the device runs low on space.
 *  - buildBackup() / downloadBackup() / restoreFromText(): ONE file with the passport, virtual trips and the
 *    current trip, including photos and tickets (they live inside the trip's steps).
 *  - openSheet() / confirmEndTrip(): the two dialogs people see ("Back up & restore", "End this trip?").
 *
 * No dependencies. Uses KYT.store for the current trip when it is on the page. Styles are inline so the
 * dialogs look the same on every page, with or without Tailwind.
 */
window.KYT = window.KYT || {};

window.KYT.backup = (() => {
  const KEYS = { passport: 'kyt_passport', vtrips: 'kyt_virtual_trips', shareName: 'kyt_share_name', lastBackup: 'kyt_last_backup' };
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
    el.innerHTML = esc(message) + ' <button type="button" style="margin-left:8px;background:none;border:0;color:#FECACA;font-weight:800;text-decoration:underline;font-size:14px" data-kyt-backup>Back up now</button>';
    document.body.appendChild(el);
    bind(el);
    setTimeout(() => el.remove(), ms || 12000);
  }

  // ── safe localStorage write ───────────────────────────────────────────────
  let lastWarn = 0;
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); requestPersistence(); return true; }
    catch (e) {
      console.error('localStorage write failed for', key, e);
      if (Date.now() - lastWarn > 5000 && typeof document !== 'undefined' && document.body) {
        lastWarn = Date.now();
        toast('Your last change could not be saved: this device has no room left for KYT. Download a backup, then free some space.');
      }
      return false;
    }
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

  // ── build / download ──────────────────────────────────────────────────────
  async function buildBackup() {
    const backup = {
      kytBackup: FORMAT, app: 'KYT', createdAt: new Date().toISOString(),
      passport: readJson(KEYS.passport, {}),
      virtualTrips: readJson(KEYS.vtrips, []),
      shareName: readLocal(KEYS.shareName) || '',
      activeTrip: null
    };
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
      activeTrip: b.activeTrip ? b.activeTrip.name : null,
      steps: b.activeTrip ? b.activeTrip.steps.length : 0
    };
  }

  async function downloadBackup() {
    const backup = await buildBackup();
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `kyt-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    try { localStorage.setItem(KEYS.lastBackup, backup.createdAt); } catch (e) { /* not critical */ }
    return summary(backup);
  }

  // ── restore ───────────────────────────────────────────────────────────────
  /** Returns {ok:true, summary} or {ok:false, reason}. `confirmFn` lets tests skip the browser confirm(). */
  async function restoreFromText(text, confirmFn) {
    let b;
    try { b = JSON.parse(text); } catch (e) { return { ok: false, reason: 'This file is not a KYT backup (it could not be read).' }; }
    if (b && b.kytVersion && !b.kytBackup) return { ok: false, reason: 'This is a single-trip file. Import it from Edit Trip, using Import Trip.' };
    if (!b || b.kytBackup !== FORMAT) return { ok: false, reason: 'This file is not a KYT backup.' };
    const passportOk = b.passport && typeof b.passport === 'object' && !Array.isArray(b.passport);
    const vtripsOk = Array.isArray(b.virtualTrips);
    const tripOk = !b.activeTrip || (Array.isArray(b.activeTrip.steps) && b.activeTrip.steps.every(s => s && s.targetTime && !isNaN(new Date(s.targetTime))));
    if (!passportOk || !vtripsOk || !tripOk) return { ok: false, reason: 'This backup file is damaged, so nothing was changed.' };

    const s = summary(b);
    const lines = [`Restore this backup? It replaces what is on this device now:`, `• Passport: ${s.cities} ${s.cities === 1 ? 'city' : 'cities'}`, `• Virtual trips: ${s.virtualTrips}`,
      s.activeTrip ? `• Current trip: "${s.activeTrip}" (${s.steps} steps)` : `• Current trip: none in the file, so yours stays as it is`];
    if (!(confirmFn ? confirmFn(lines.join('\n')) : window.confirm(lines.join('\n')))) return { ok: false, reason: 'cancelled' };

    if (!safeSet(KEYS.passport, JSON.stringify(b.passport)) || !safeSet(KEYS.vtrips, JSON.stringify(b.virtualTrips))) {
      return { ok: false, reason: 'There is not enough space on this device to restore. Nothing else was changed.' };
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
    return { ok: true, summary: s };
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

  async function openSheet() {
    const st = await storageStatus();
    const last = readLocal(KEYS.lastBackup);
    const lastTxt = last ? `Last backup: ${new Date(last).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No backup yet';
    const prot = st.persisted === null ? '' : (st.persisted ? 'Protected from automatic cleanup.' : 'Not yet protected from automatic cleanup by the browser, so a backup matters.');
    const wrap = sheet('kyt-backup-sheet', `
      <h2 style="margin:0 0 6px;font-size:20px;font-weight:900">Back up &amp; restore</h2>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.5;color:#475569">KYT keeps everything on this device only: no account, no cloud. Clearing browser data, switching phones or running out of space can erase it.</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#475569">One file holds your passport, virtual trips and current trip, with photos and tickets.</p>
      <p style="margin:0;font-size:12.5px;font-weight:700;color:#64748B">${esc(lastTxt)}${prot ? ' · ' + esc(prot) : ''}</p>
      <div id="kyt-backup-msg" aria-live="polite" style="margin-top:10px;font-size:14px;font-weight:700;color:#047857"></div>
      <button type="button" id="kyt-backup-download" style="${PRIMARY}">Download backup</button>
      <button type="button" id="kyt-backup-restore" style="${SECOND}">Restore from a backup file</button>
      <input type="file" id="kyt-backup-file" accept=".json,application/json" style="display:none">
      <button type="button" id="kyt-backup-close" style="${QUIET}">Close</button>`);
    const msg = wrap.querySelector('#kyt-backup-msg');
    const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? '#B91C1C' : '#047857'; };
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });
    wrap.querySelector('#kyt-backup-close').onclick = () => wrap.remove();
    wrap.querySelector('#kyt-backup-download').onclick = async () => {
      try { const s = await downloadBackup(); say(`Saved: ${s.cities} cities, ${s.virtualTrips} virtual trips${s.activeTrip ? ', current trip "' + s.activeTrip + '"' : ''}. Keep the file somewhere safe, such as your Drive.`); }
      catch (e) { say('Could not create the backup: ' + e.message, true); }
    };
    const file = wrap.querySelector('#kyt-backup-file');
    wrap.querySelector('#kyt-backup-restore').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      const r = await restoreFromText(await f.text());
      file.value = '';
      if (r.ok) { say('Restored. Reloading…'); setTimeout(() => location.reload(), 900); }
      else if (r.reason !== 'cancelled') say(r.reason, true);
    };
    return wrap;
  }

  /** Resolves 'backup' (downloaded, go ahead), 'skip' (end without backup) or null (cancel). */
  function confirmEndTrip(tripName) {
    return new Promise(resolve => {
      const wrap = sheet('kyt-end-sheet', `
        <h2 style="margin:0 0 6px;font-size:20px;font-weight:900">End this trip?</h2>
        <p style="margin:0;font-size:14px;line-height:1.5;color:#475569">Ending <strong>${esc(tripName || 'this trip')}</strong> permanently deletes its steps, notes, tickets and photos from this device. Your passport stamps stay.</p>
        <button type="button" id="kyt-end-backup" style="${PRIMARY}">Download backup, then end trip</button>
        <button type="button" id="kyt-end-skip" style="${SECOND}">End without a backup</button>
        <button type="button" id="kyt-end-cancel" style="${QUIET}">Keep my trip</button>`);
      const done = v => { wrap.remove(); resolve(v); };
      wrap.addEventListener('click', e => { if (e.target === wrap) done(null); });
      wrap.querySelector('#kyt-end-cancel').onclick = () => done(null);
      wrap.querySelector('#kyt-end-skip').onclick = () => done('skip');
      wrap.querySelector('#kyt-end-backup').onclick = async () => {
        try { await downloadBackup(); done('backup'); }
        catch (e) { wrap.querySelector('#kyt-end-backup').textContent = 'Backup failed. Tap to try again.'; }
      };
    });
  }

  // Any element marked data-kyt-backup opens the sheet.
  function bind(root) {
    (root || document).querySelectorAll('[data-kyt-backup]').forEach(el => {
      if (el.dataset.kytBackupBound) return;
      el.dataset.kytBackupBound = '1';
      el.addEventListener('click', e => { e.preventDefault(); openSheet(); });
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bind());
    else bind();
  }

  return { safeSet, requestPersistence, storageStatus, buildBackup, downloadBackup, restoreFromText, openSheet, confirmEndTrip, bind };
})();
