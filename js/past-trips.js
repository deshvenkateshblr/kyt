/**
 * past-trips.js: ended trips are kept on the device instead of deleted.
 *
 * Ending a trip archives it first: steps, notes and the cover, with photos and tickets shrunk to save space
 * (about 1000 px; the originals are 1600 px at 95%). The "Past trips" list on the Trips page can open one
 * read-only, plan it again as a new planned trip, remove its photos, or delete it. Past trips travel inside
 * the saved file (Save and Open). Right after ending, Undo puts the trip back as the live trip.
 *
 * The data rules (summarise, planFromRecord, sizes) are pure, so they are tested in Node. The browser part
 * stores one JSON array under 'kyt_past_trips' in the same IndexedDB as the live trip.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.KYT = root.KYT || {}; root.KYT.pastTrips = api; if (api.boot) api.boot(); }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const KEY = 'kyt_past_trips';
  const SHRINK_PX = 1000, SHRINK_Q = 0.7;
  const TRAVEL_ICONS = ['plane', 'train-front', 'train', 'bus', 'car', 'route', 'ship', 'bike', 'tram-front'];
  const STAY_ICONS = ['bed', 'bed-double', 'hotel'];

  // ── Pure rules ────────────────────────────────────────────────────────────────────────────────────────────

  const photoOf = m => (typeof m === 'string' ? m : (m && m.photo) || '');

  function countPhotos(steps) {
    let n = 0;
    (steps || []).forEach(s => { n += (s.memories || []).filter(photoOf).length + (s.attachments || []).filter(a => a && a.data).length; });
    return n;
  }

  const sizeOf = rec => { try { return JSON.stringify(rec).length; } catch (e) { return 0; } };

  /** Facts shown on a past-trip card. */
  function summarise(rec) {
    const steps = rec.steps || [];
    const times = steps.map(s => new Date(s.targetTime).getTime()).filter(t => !isNaN(t));
    const first = times.length ? new Date(Math.min.apply(null, times)) : null;
    const last = times.length ? new Date(Math.max.apply(null, times)) : null;
    const dayKeys = new Set(steps.map(s => { const d = new Date(s.targetTime); return isNaN(d) ? '' : d.toDateString(); }).filter(Boolean));
    return { steps: steps.length, days: dayKeys.size, photos: countPhotos(steps), bytes: sizeOf(rec), first, last };
  }

  /** A readable size: "850 KB", "4.2 MB". */
  function bytesLabel(n) {
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /** Cities a step mentions, by the place or title text. `cities` are records with id and name. */
  function cityOfStep(step, cities) {
    const hay = ((step.where || '') + ' ' + (step.title || '')).toLowerCase();
    let best = null;
    cities.forEach(c => { const n = c.name.toLowerCase(); if (hay.includes(n) && (!best || n.length > best.name.length)) best = c; });
    return best;
  }

  /**
   * An ended trip as a new planned trip, to run through "Start this trip" again with fresh dates.
   * Days follow the dates the trip actually had; times keep the time of day; photos, tickets, status and
   * the old dates are left behind. `cities` is the full city list (to recognise places by name).
   */
  function planFromRecord(rec, cities, now) {
    const steps = (rec.steps || []).slice().sort((a, b) => new Date(a.targetTime) - new Date(b.targetTime));
    const dayIndex = new Map();
    const out = [];
    const route = [];
    steps.forEach((s, i) => {
      const d = new Date(s.targetTime);
      if (isNaN(d)) return;
      const key = d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
      if (!dayIndex.has(key)) dayIndex.set(key, dayIndex.size + 1);
      const city = cityOfStep(s, cities || []);
      if (city && !route.includes(city.id)) route.push(city.id);
      const icon = s.icon || 'map-pin';
      const type = TRAVEL_ICONS.includes(icon) ? 'travel' : (STAY_ICONS.includes(icon) ? 'stay' : 'stop');
      out.push({
        id: 'pa_' + (now || Date.now()) + '_' + i, dayId: dayIndex.get(key), type, cityName: city ? city.name : '',
        title: s.title || 'Stop', where: s.where || '', mapsUrl: s.mapUrl || '', notes: s.notes || '', icon,
        hour: d.getHours(), minute: d.getMinutes(), durationMin: type === 'stay' ? 30 : 90
      });
    });
    const days = Array.from(dayIndex.values()).map(id => {
      const first = out.find(s => s.dayId === id && s.cityName);
      const c = first && (cities || []).find(x => x.name === first.cityName);
      return { id, cityId: c ? c.id : (route[0] || null) };
    });
    return {
      id: String((now || Date.now())), name: (rec.name || 'Past trip') + ' (again)', originCity: 'already_there',
      cities: route, days, duration: days.length || 1, taste: { intent: 'mixed', diet: 'any', pace: 'standard' }, steps: out
    };
  }

  /** Validate a record read from a saved file. */
  function validRecord(r) {
    return !!(r && typeof r === 'object' && typeof r.id === 'string' && Array.isArray(r.steps) &&
      r.steps.every(s => s && s.targetTime && !isNaN(new Date(s.targetTime))));
  }

  // ── Browser: storage ──────────────────────────────────────────────────────────────────────────────────────

  const hasBrowser = typeof document !== 'undefined' && typeof indexedDB !== 'undefined';
  const KS = () => (root.KYT && root.KYT.store) || null;

  async function all() {
    const ks = KS(); if (!ks || !ks.getRaw) return [];
    try { const raw = await ks.getRaw(KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a.filter(validRecord) : []; }
    catch (e) { return []; }
  }
  async function saveAll(list) {
    const ks = KS(); if (!ks || !ks.setRaw) throw new Error('storage unavailable');
    await ks.setRaw(KEY, JSON.stringify(list));
    if (root.KYT.backup && root.KYT.backup.markChanged) root.KYT.backup.markChanged();
  }

  function shrink(dataUrl, px, q) {
    return new Promise(resolve => {
      if (!hasBrowser || typeof dataUrl !== 'string' || !/^data:image\//.test(dataUrl)) return resolve(dataUrl);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, px / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const small = c.toDataURL('image/jpeg', q);
          resolve(small.length < dataUrl.length ? small : dataUrl);
        } catch (e) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  /**
   * Keeps the live trip as a past trip. `live` is KYT.store.get(). Resolves to the record, or throws
   * (for example when the device is full), in which case nothing was changed.
   */
  async function archive(live) {
    const steps = [];
    for (const s of live.stepsData || []) {
      const copy = { ...s, targetTime: new Date(s.targetTime).toISOString() };
      if (Array.isArray(s.memories)) {
        copy.memories = [];
        for (const m of s.memories) {
          if (typeof m === 'string') copy.memories.push(await shrink(m, SHRINK_PX, SHRINK_Q));
          else if (m && m.photo) copy.memories.push({ ...m, photo: await shrink(m.photo, SHRINK_PX, SHRINK_Q) });
          else if (m) copy.memories.push(m);
        }
      }
      if (Array.isArray(s.attachments)) {
        copy.attachments = [];
        for (const a of s.attachments) copy.attachments.push(a && /^image\//.test(a.type || '') ? { ...a, data: await shrink(a.data, SHRINK_PX, SHRINK_Q) } : a);
      }
      steps.push(copy);
    }
    const rec = {
      id: 'pt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: live.tripName || 'My trip', notes: live.tripNotes || '',
      cover: live.tripCoverImage ? await shrink(live.tripCoverImage, SHRINK_PX, SHRINK_Q) : null,
      endedAt: new Date().toISOString(), steps
    };
    const list = await all();
    list.unshift(rec);
    await saveAll(list);
    return rec;
  }

  async function remove(id) { await saveAll((await all()).filter(r => r.id !== id)); }

  async function removePhotos(id) {
    const list = await all();
    const r = list.find(x => x.id === id); if (!r) return;
    r.cover = null;
    r.steps.forEach(s => { s.memories = []; s.attachments = (s.attachments || []).filter(a => a && !/^image\//.test(a.type || '')); });
    await saveAll(list);
  }

  /** Replaces all past trips (used when a saved file is opened). */
  async function replaceAll(list) { await saveAll((list || []).filter(validRecord)); }

  /** A past trip as a new planned trip, saved with the other planned trips. Resolves to the new trip. */
  async function planAgain(id) {
    const rec = (await all()).find(r => r.id === id);
    if (!rec) throw new Error('That trip is no longer here.');
    const trip = planFromRecord(rec, root.KYT_CITIES || []);
    let vt = [];
    try { vt = JSON.parse(localStorage.getItem('kyt_virtual_trips') || '[]'); } catch (e) { vt = []; }
    vt.push(trip);
    const json = JSON.stringify(vt);
    const ok = root.KYT.backup ? root.KYT.backup.safeSet('kyt_virtual_trips', json) : (localStorage.setItem('kyt_virtual_trips', json), true);
    if (!ok) throw new Error('There is not enough space on this device.');
    return trip;
  }

  /** Puts a past trip back as the live trip (Undo right after ending). Refuses if a live trip exists. */
  async function makeLive(id) {
    const ks = KS(); const rec = (await all()).find(r => r.id === id);
    if (!ks || !rec) return false;
    await ks.loadData();
    if ((ks.get().stepsData || []).length) return false;
    ks.setTripName(rec.name); ks.setTripNotes(rec.notes || ''); ks.setCoverImage(rec.cover || null);
    ks.setStepsData(rec.steps.map(s => ({ ...s, targetTime: new Date(s.targetTime) })));
    ks.setCurrentIndex(0);
    await ks.saveData();
    await remove(id);
    return true;
  }

  // ── Browser: the Past trips list and the read-only view ───────────────────────────────────────────────────

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = d => d ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const BTN = 'padding:8px 12px;border-radius:10px;font:700 13px system-ui,sans-serif;cursor:pointer;';

  async function render() {
    const host = document.getElementById('vt-past');
    if (!host) return;
    const list = await all();
    if (!list.length) { host.innerHTML = ''; return; }
    const open = host.dataset.open === '1';
    host.innerHTML = `
      <button type="button" data-past-toggle class="w-full flex items-center justify-between text-left px-1 py-2">
        <span class="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Past trips (${list.length})</span>
        <span class="text-xs font-bold text-slate-400">${open ? 'Hide' : 'Show'}</span>
      </button>
      <div class="space-y-3 ${open ? '' : 'hidden'}" data-past-list>
        ${list.map(r => {
          const s = summarise(r);
          const dates = s.first ? (fmt(s.first) + (s.last && fmt(s.last) !== fmt(s.first) ? ' to ' + fmt(s.last) : '')) : '';
          return `<article data-past-id="${esc(r.id)}" class="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
            <h3 class="font-black text-slate-800 text-base">${esc(r.name)}</h3>
            <p class="text-xs text-slate-500 mt-0.5">${esc(dates)}${dates ? ' · ' : ''}${s.days} ${s.days === 1 ? 'day' : 'days'} · ${s.steps} steps · ${s.photos} ${s.photos === 1 ? 'photo' : 'photos'} · ${bytesLabel(s.bytes)}</p>
            <div class="flex flex-wrap gap-2 mt-3">
              <button type="button" data-past-act="view" style="${BTN}background:#2563EB;color:#fff;border:0">View</button>
              <button type="button" data-past-act="again" style="${BTN}background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE">Plan this again</button>
              ${s.photos ? `<button type="button" data-past-act="photos" style="${BTN}background:#fff;color:#475569;border:1px solid #E2E8F0">Remove photos</button>` : ''}
              <button type="button" data-past-act="delete" style="${BTN}background:#fff;color:#BE123C;border:1px solid #FECDD3">Delete</button>
            </div></article>`;
        }).join('')}
      </div>`;
  }

  function viewSheet(rec) {
    const old = document.getElementById('kyt-past-view'); if (old) old.remove();
    const s = summarise(rec);
    const byDay = new Map();
    rec.steps.slice().sort((a, b) => new Date(a.targetTime) - new Date(b.targetTime)).forEach(st => {
      const k = new Date(st.targetTime).toDateString();
      (byDay.get(k) || byDay.set(k, []).get(k)).push(st);
    });
    let n = 0;
    const body = Array.from(byDay.entries()).map(([k, steps]) => {
      n++;
      return `<h4 style="margin:16px 0 6px;font-size:12px;font-weight:900;color:#2563EB;letter-spacing:.08em">DAY ${n} · ${esc(new Date(k).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</h4>` + steps.map(st => {
        const t = new Date(st.targetTime);
        const photos = (st.memories || []).map(photoOf).filter(Boolean);
        return `<div style="padding:8px 0;border-top:1px solid #F1F5F9"><div style="font-size:12px;color:#94A3B8;font-weight:700">${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}</div>
          <div style="font-weight:800;font-size:14px">${esc(st.title)}</div>${st.where ? `<div style="font-size:12px;color:#64748B">${esc(st.where)}</div>` : ''}
          ${st.notes ? `<div style="font-size:13px;color:#334155;margin-top:2px">${esc(st.notes)}</div>` : ''}
          ${photos.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">${photos.map(p => `<img alt="" src="${esc(p)}" style="width:30%;min-width:90px;flex:1 1 30%;max-height:160px;object-fit:cover;border-radius:8px">`).join('')}</div>` : ''}</div>`;
      }).join('');
    }).join('');
    const wrap = document.createElement('div');
    wrap.id = 'kyt-past-view'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:250;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.55)';
    wrap.innerHTML = `<div style="width:100%;max-width:560px;max-height:92vh;overflow:auto;background:#fff;border-radius:24px 24px 0 0;padding:20px;font-family:system-ui,sans-serif;box-sizing:border-box">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h2 style="margin:0;font-size:20px;font-weight:900">${esc(rec.name)}</h2>
      <p style="margin:2px 0 0;font-size:12px;color:#64748B">${esc(fmt(s.first))}${s.last && fmt(s.last) !== fmt(s.first) ? ' to ' + esc(fmt(s.last)) : ''} · ${s.photos} photos (shrunk to save space)</p></div>
      <button type="button" data-past-close style="${BTN}background:#F1F5F9;color:#334155;border:0">Close</button></div>
      ${rec.notes ? `<p style="font-size:13px;color:#334155;margin:10px 0 0">${esc(rec.notes)}</p>` : ''}${body}</div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-past-close]')) wrap.remove(); });
  }

  function toast(msg, actionLabel, onAction) {
    const old = document.getElementById('kyt-past-toast'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'kyt-past-toast'; el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:300;max-width:480px;margin:0 auto;padding:14px 16px;border-radius:14px;background:#0F172A;color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.35);display:flex;gap:12px;align-items:center;justify-content:space-between';
    el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button" style="background:none;border:0;color:#93C5FD;font:800 14px system-ui;text-decoration:underline;cursor:pointer;white-space:nowrap">${esc(actionLabel)}</button>` : ''}`;
    document.body.appendChild(el);
    if (actionLabel) el.querySelector('button').onclick = async () => { el.remove(); await onAction(); };
    setTimeout(() => el.remove(), 15000);
  }

  async function onHostClick(e) {
    const host = document.getElementById('vt-past');
    if (e.target.closest('[data-past-toggle]')) { host.dataset.open = host.dataset.open === '1' ? '0' : '1'; return render(); }
    const btn = e.target.closest('[data-past-act]'); if (!btn) return;
    const card = btn.closest('[data-past-id]'); const id = card.dataset.pastId;
    const rec = (await all()).find(r => r.id === id); if (!rec) return render();
    const act = btn.dataset.pastAct;
    if (act === 'view') return viewSheet(rec);
    if (act === 'again') {
      try { const t = await planAgain(id); toast(`"${t.name}" is in your trips. Open it, then use Start this trip when you are ready.`); if (root.KYT.virtualTrips && root.KYT.virtualTrips.refresh) root.KYT.virtualTrips.refresh(); else location.reload(); }
      catch (err) { toast(err.message); }
      return;
    }
    if (act === 'photos') {
      if (!confirm(`Remove all photos and tickets from "${rec.name}"? The steps and notes stay. This frees space and cannot be undone.`)) return;
      await removePhotos(id); return render();
    }
    if (act === 'delete') {
      if (!confirm(`Delete "${rec.name}" from this device? Save a file first if you may want it back.`)) return;
      await remove(id); return render();
    }
  }

  /** After End Trip: offer Undo on the next page for a short while, only if no other live trip exists. */
  function maybeOfferUndo() {
    let id = null;
    try { id = sessionStorage.getItem('kyt_undo_end'); } catch (e) { /* blocked */ }
    if (!id) return;
    try { sessionStorage.removeItem('kyt_undo_end'); } catch (e) { /* */ }
    toast('Trip moved to Past trips.', 'Undo', async () => {
      const ok = await makeLive(id);
      toast(ok ? 'Your trip is live again.' : 'Could not undo: another trip is live now. Open Past trips instead.');
    });
  }

  function boot() {
    if (!hasBrowser) return;
    const start = () => {
      const host = document.getElementById('vt-past');
      try { if (host && sessionStorage.getItem('kyt_undo_end')) host.dataset.open = '1'; } catch (e) { /* blocked */ }
      if (host && !host.dataset.bound) { host.dataset.bound = '1'; host.addEventListener('click', onHostClick); render(); }
      maybeOfferUndo();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }

  return { summarise, planFromRecord, bytesLabel, countPhotos, validRecord, all, archive, remove, removePhotos, replaceAll, planAgain, makeLive, render, boot, KEY };
});
