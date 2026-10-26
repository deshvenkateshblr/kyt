/**
 * store.js — KYT central state and IndexedDB persistence
 * All mutable state lives here; other modules read from window.KYT.store
 */

window.KYT = window.KYT || {};


// ── KYT.utils.escapeHTML — merge-safe bootstrap ───────────────────────────────
// js/ui-components.js provides the same bootstrap; whichever loads first wins.
// This ensures store.js pages (view_trip, configure_trip) also have escapeHTML.
(function () {
  const utils = window.KYT.utils || {};
  if (typeof utils.escapeHTML !== 'function') {
    utils.escapeHTML = (str) => {
      if (!str) return '';
      return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag));
    };
  }
  window.KYT.utils = utils;
})();

window.KYT.store = (() => {
  // ── State ─────────────────────────────────────────────────────────────────
  let tripName       = 'New Trip';
  let tripNotes      = '';
  let tripCoverImage = null;
  let stepsData      = [];
  let currentIndex   = 0;

  // ── IndexedDB Wrapper ─────────────────────────────────────────────────────
  const DB_NAME = 'kyt_db';
  const STORE_NAME = 'kyt_store';
  let dbPromise = null;

  function getDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // If database was opened at version 1 without the store, upgrade version to create it
          const nextVer = (db.version || 1) + 1;
          db.close();
          const fixReq = indexedDB.open(DB_NAME, nextVer);
          fixReq.onerror = () => reject(fixReq.error);
          fixReq.onupgradeneeded = (ev) => {
            const fixDb = ev.target.result;
            if (!fixDb.objectStoreNames.contains(STORE_NAME)) {
              fixDb.createObjectStore(STORE_NAME);
            }
          };
          fixReq.onsuccess = () => resolve(fixReq.result);
          return;
        }
        resolve(db);
      };
    });
    return dbPromise;
  }

  async function setItem(key, val) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getItem(key) {
    const db = await getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
  }

  // ── Getters (read-only snapshots) ─────────────────────────────────────────
  const get = () => ({ tripName, tripNotes, tripCoverImage, stepsData, currentIndex });

  // ── Setters ───────────────────────────────────────────────────────────────
  const setTripName       = v => { tripName       = v; };
  const setTripNotes      = v => { tripNotes      = v; };
  const setCoverImage     = v => { tripCoverImage = v; };
  const setStepsData      = v => { stepsData      = v; };
  const setCurrentIndex   = v => { currentIndex   = v; };

  // ── Convenience mutators on stepsData ─────────────────────────────────────
  const getStep     = i  => stepsData[i];
  const updateStep  = (i, patch) => { stepsData[i] = { ...stepsData[i], ...patch }; };

  // ── Persistence ───────────────────────────────────────────────────────────
  async function saveData() {
    try {
      await setItem('kyt_tripName', tripName);
      await setItem('kyt_tripNotes', tripNotes);
      await setItem('kyt_tripCoverImage', tripCoverImage || '');
      await setItem('kyt_stepsData', JSON.stringify(stepsData));
      if (window.KYT.backup) window.KYT.backup.requestPersistence();
    } catch (e) {
      console.error('IndexedDB save failed:', e);
      alert('Your last change could not be saved: this device may be out of space. Download a backup (Back up or restore everything), then free some space.');
    }
  }

  async function loadData() {
    try {
      let savedName  = await getItem('kyt_tripName');
      let savedNotes = await getItem('kyt_tripNotes');
      let savedImage = await getItem('kyt_tripCoverImage');
      let savedSteps = await getItem('kyt_stepsData');

      // Seamless migration from localStorage if IDB is empty
      if (savedName === undefined) {
        savedName = localStorage.getItem('kyt_tripName');
        savedNotes = localStorage.getItem('kyt_tripNotes');
        savedImage = localStorage.getItem('kyt_tripCoverImage');
        savedSteps = localStorage.getItem('kyt_stepsData');
        
        if (savedName) await setItem('kyt_tripName', savedName);
        if (savedNotes) await setItem('kyt_tripNotes', savedNotes);
        if (savedImage) await setItem('kyt_tripCoverImage', savedImage);
        if (savedSteps) await setItem('kyt_stepsData', savedSteps);
      }

      if (savedName)  tripName       = savedName;
      if (savedNotes) tripNotes      = savedNotes;
      if (savedImage) tripCoverImage = savedImage || null;

      if (savedSteps) {
        try {
          const parsed = JSON.parse(savedSteps);
          stepsData = parsed.map(step => ({ ...step, targetTime: new Date(step.targetTime) }));
        } catch (e) { console.error('Failed to parse saved steps:', e); }
      }

      // Auto-focus most relevant step
      if (stepsData.length > 0) {
        const idx = stepsData.findIndex(s => s.status === 'on' || s.status === 'todo');
        currentIndex = idx === -1 ? Math.max(0, stepsData.length - 1) : idx;
      }
    } catch (e) {
      console.error('Failed to load from IndexedDB:', e);
    }
  }

  return {
    get, setTripName, setTripNotes, setCoverImage, setStepsData, setCurrentIndex,
    getStep, updateStep, saveData, loadData
  };
})();

