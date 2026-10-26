// index.js
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('options-container');
  const loading = document.getElementById('loading');

  // Check if returning user (has an existing trip in IndexedDB)
  const isReturningUser = await checkExistingTrip();

  loading.style.display = 'none';
  container.classList.remove('hidden');

  let html = '';

  if (isReturningUser) {
    html = `
      <div style="padding: 2px 4px 6px;">
        <p style="font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #2563EB; margin: 0 0 2px;">Welcome Back</p>
        <p style="font-size: 0.88rem; font-weight: 700; color: #1E293B; margin: 0;">Continue your journey or explore something new:</p>
      </div>

      <!-- Option 1: Live Trip (Hero Highlight) -->
      <div class="k-option-item"><a href="view_trip.html" class="k-option-card k-option-primary">
        <div class="k-option-icon" style="background: #2563EB; color: #FFFFFF;">
          <i data-lucide="plane"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">View Current Trip</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Your live itinerary, checklist, tickets and photos.</p></div>

      <!-- Option 2: Edit Itinerary -->
      <div class="k-option-item"><a href="configure_trip.html" class="k-option-card">
        <div class="k-option-icon" style="background: #EEF2FF; color: #4F46E5;">
          <i data-lucide="settings-2"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">Edit Live Itinerary</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Add steps, change times, attach tickets.</p></div>

      <!-- Option 3: Virtual Trips -->
      <div class="k-option-item"><a href="virtual_trip.html" class="k-option-card">
        <div class="k-option-icon" style="background: #EFF6FF; color: #2563EB;">
          <i data-lucide="compass"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">My Virtual Trips</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Your saved multi-city plans.</p></div>

      <!-- Option 4: AI Curated Trips -->
      <div class="k-option-item"><a href="curated_trips.html" class="k-option-card">
        <div class="k-option-icon" style="background: #FEF3C7; color: #D97706;">
          <i data-lucide="sparkles"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">AI Curated Journeys</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Ready-made trips with day-by-day plans.</p></div>

      <!-- Option 5: Digital Passport -->
      <div class="k-option-item"><a href="visited.html" class="k-option-card">
        <div class="k-option-icon" style="background: #ECFDF5; color: #059669;">
          <i data-lucide="stamp"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">India Explorer Passport</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Stamp the places you have been.</p></div>
    `;
  } else {
    html = `
      <div style="padding: 2px 4px 6px;">
        <p style="font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #2563EB; margin: 0 0 2px;">Where to begin?</p>
        <p style="font-size: 0.88rem; font-weight: 700; color: #1E293B; margin: 0;">Choose how you want to travel today:</p>
      </div>

      <!-- Option 1: Upcoming Trip (Clear recommendation for confirmed trips) -->
      <div class="k-option-item"><a href="configure_trip.html" class="k-option-card">
        <div class="k-option-icon" style="background: #EEF2FF; color: #4F46E5;">
          <i data-lucide="calendar-check-2"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">Upcoming Trip</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Tickets and hotels already booked? Start here.</p></div>

      <!-- Option 2: Smart Virtual Trip Planner -->
      <div class="k-option-item"><a href="virtual_trip.html" class="k-option-card">
        <div class="k-option-icon" style="background: #EFF6FF; color: #2563EB;">
          <i data-lucide="compass"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">Start a Virtual Trip</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Know where you are going? Start here.</p></div>

      <!-- Option 3: AI Curated Trips -->
      <div class="k-option-item"><a href="curated_trips.html" class="k-option-card">
        <div class="k-option-icon" style="background: #FEF3C7; color: #D97706;">
          <i data-lucide="sparkles"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">AI Curated Journeys</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Not sure where to go? Start here for ideas.</p></div>

      <!-- Option 4: Digital Passport -->
      <div class="k-option-item"><a href="visited.html" class="k-option-card">
        <div class="k-option-icon" style="background: #ECFDF5; color: #059669;">
          <i data-lucide="stamp"></i>
        </div>
        <div class="k-option-body">
          <div class="k-option-head">
            <span class="k-option-title">India Explorer Passport</span>
          </div>
        </div>
        <i data-lucide="chevron-right" class="k-option-arrow"></i>
      </a>
      <p class="k-option-desc">Been there, done that? Create a share card of all the places you have visited.</p></div>
    `;
  }

  container.innerHTML = html;
  lucide.createIcons();
  if (!isReturningUser) nudgeOptionsOnce(container);
});

/**
 * First visit only: briefly light up each option in turn, as a hover would on a desktop,
 * so a new user sees that the cards are tappable. Skipped for reduced-motion users and
 * stopped at the first touch, click or scroll.
 */
function nudgeOptionsOnce(container) {
  try {
    if (localStorage.getItem('kyt_home_nudged')) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cards = Array.from(container.querySelectorAll('.k-option-card'));
    if (!cards.length) return;
    const timers = [];
    let started = false;
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    const stop = () => {
      timers.forEach(clearTimeout);
      cards.forEach(c => c.classList.remove('k-nudge'));
      events.forEach(ev => window.removeEventListener(ev, stop));
    };
    const run = () => {
      if (started) return;
      started = true;
      localStorage.setItem('kyt_home_nudged', '1');
      events.forEach(ev => window.addEventListener(ev, stop, { passive: true }));
      cards.forEach((card, i) => {
        timers.push(setTimeout(() => card.classList.add('k-nudge'), 400 + i * 650));
        timers.push(setTimeout(() => card.classList.remove('k-nudge'), 400 + i * 650 + 600));
      });
      timers.push(setTimeout(stop, 400 + cards.length * 650 + 100));
    };
    // Only play once the menu is actually on screen, otherwise nobody sees it.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) { io.disconnect(); run(); }
      }, { threshold: 0.6 });
      io.observe(container);
    } else run();
  } catch (e) { /* storage blocked: no nudge */ }
}

function checkExistingTrip() {
  return new Promise((resolve) => {
    let isUpgrade = false;
    // Try to open IndexedDB
    const request = indexedDB.open('kyt_db', 1);

    request.onerror = () => {
      console.error("Could not open IndexedDB");
      resolve(false); // Default to new user on error
    };

    request.onupgradeneeded = (e) => {
      isUpgrade = true;
      const db = e.target.result;
      // Create the kyt_store table so subsequent trip saves succeed
      if (!db.objectStoreNames.contains('kyt_store')) {
        db.createObjectStore('kyt_store');
      }
    };

    request.onsuccess = (e) => {
      const db = e.target.result;
      
      // If store doesn't exist (e.g. database previously created without store),
      // self-heal by bumping version to create kyt_store
      if (!db.objectStoreNames.contains('kyt_store')) {
        const nextVer = (db.version || 1) + 1;
        db.close();
        const fixReq = indexedDB.open('kyt_db', nextVer);
        fixReq.onupgradeneeded = (ev) => {
          const fixDb = ev.target.result;
          if (!fixDb.objectStoreNames.contains('kyt_store')) {
            fixDb.createObjectStore('kyt_store');
          }
        };
        fixReq.onsuccess = () => resolve(false);
        fixReq.onerror = () => resolve(false);
        return;
      }

      if (isUpgrade) {
        // Brand new database with empty store -> new user
        resolve(false);
        return;
      }

      const tx = db.transaction('kyt_store', 'readonly');
      const store = tx.objectStore('kyt_store');
      
      // store.js saves the trip under 'kyt_stepsData' (a JSON string), so look there first.
      const stepsReq = store.get('kyt_stepsData');
      stepsReq.onsuccess = (ev) => {
        let steps = ev.target.result;
        try { if (typeof steps === 'string') steps = JSON.parse(steps); } catch (e) { steps = null; }
        if (Array.isArray(steps) && steps.length > 0) { resolve(true); return; }
        legacyCheck();
      };
      stepsReq.onerror = () => legacyCheck();

      function legacyCheck() {
        const getReq = store.get('kyt_state');
        getReq.onsuccess = (event) => {
          const state = event.target.result;
          // If state exists and has steps, consider them a returning user
          if (state && state.stepsData && state.stepsData.length > 0) {
            resolve(true);
          } else {
            // Alternatively check localStorage as fallback (since migration logic exists)
            try {
              const localSteps = localStorage.getItem('kyt_stepsData');
              if (localSteps && JSON.parse(localSteps).length > 0) {
                resolve(true);
                return;
              }
            } catch (err) {}
            resolve(false);
          }
        };
        
        getReq.onerror = () => {
          resolve(false);
        };
      }
    };
  });
}





