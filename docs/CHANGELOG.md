# KYT (Know Your Travel) — Changelog

What has been built, newest last. Open work lives in [TODO.md](TODO.md); design intent and architecture live in [kyt_product_specification_roadmap.md](kyt_product_specification_roadmap.md).

1. **Short Share URL Acronyms**
   - Created short 3-letter acronyms for all cities and 3-letter compact codes for taste profiles (intent, diet, pace) to generate clean, short shareable URLs.

2. **Dedicated Shared Trip View (`trip_detail.html`)**
   - Built a dedicated, mobile-friendly landing page for viewing shared/curated trips.
   - Includes trip header with title, description, and social share actions.
   - Destination grid with attraction summaries.
   - Filterable video gallery showcasing YouTube highlights of trip cities.
   - Seamless "Customize" / "Edit Plan" handoff into `virtual_trip.html`.

3. **Clickable City Cards in Shared Trip View (`trip_detail.html`)**
   - Made city cards interactive with hover states, cursor cues, and "Explore" badges.
   - Added rich city detail slide-over sheet (matching `virtual_trip.html`):
     - Interactive YouTube video carousel with next/previous controls.
     - Collapsible attractions list with travel style tags, pace, accessibility labels, notes, and direct Google Maps links.
     - Nearby destinations sorted by distance with one-click navigation.
     - Deep-linking (`?city=<cityId>`), history back-stack, and city share button.

4. **First-Time User Database Initialization (Defect #1 Fix)**
   - Fixed `Failed to save to database` bug when first-time users build a trip from the homepage.
   - Ensured `kyt_store` object store is properly created in IndexedDB `onupgradeneeded` in both `js/index.js` and `js/store.js` with self-repair fallback.

5. **Step Edit Button Implementation (Defect #2 Fix)**
   - Implemented and exported `openEdit(stepIndex)` in `js/step-form.js` so pencil icons on trip steps open the edit modal as expected.

6. **Hubli Distance Matrix Corrections (Defect #3 Fix)**
   - Fixed city key mismatches in `data/distance_matrix.js` (`bangalore` -> `bengaluru`, `mangalore` -> `udupi`, etc.).
   - Added city aliases mapping in `js/virtual-trips.js` and `trip_detail.html` to gracefully resolve alias lookups.

7. **Direct Google Maps Links for Newer Attractions (Defect #4 Fix)**
   - Added direct `mapsUrl` links for ~40 attractions across 13 newer cities in `data/cities.js`, removing reliance on fallback map queries.

8. **HTML Escaping & XSS Sanitization**
   - Sanitized unescaped insertions of step titles, locations, icons, and attachment data across `js/config.js`, `js/carousel.js`, and `js/step-form.js`.

9. **Branding & PWA Polish**
   - Fixed KYT logo cropping issues on header and home screen banner.
   - Removed redundant "KYT / Know Your Travel" repetition on `index.html`.
   - Paired *"Know your travel"* with *"Plan it your way"* and rewrote hero headline and lead copy in a compelling Ad-Guru voice.
   - Cleaned up hero section by removing conflicting demo mockup image (`.k-demo`) and creating a dedicated, prominent "Trip Menu" card section at the top.
   - Improved styling of the "Add to Home Screen" prompt.
   - Merged homepage redesign into `index.html` and `index.js`.

10. **Travel Legs & Realistic Journey Milestones in Virtual Trips (Option A)**
    - Auto-generated inter-city travel legs (`Travel to <Next City>`) with direct Google Maps driving-directions links.
    - Added trip departure on Day 1 and return milestone on the final day.
    - Added hotel check-in placeholder for each destination.
    - Added breakfast, lunch, and dinner placeholders tailored to the trip's dietary preference (`Vegetarian`, `Jain`, `Satvik`, or `Local`).
    - Added reorder arrows (earlier / later) to city chips so users can control the sequence of cities.
    - Preserved one-click step deletion in the builder so users can easily remove any unwanted placeholders.
    - Bumped service worker cache version to `kyt-v23` in `sw.js`.

11. **Phase 1: Navigation & Header Unification & Centralized JS Component**
    - Created reusable JavaScript header module [`js/header.js`](../js/header.js) driving the top header across all views via `KYT.header.render()`.
    - Fixed back navigation from Trip Detail back to My Virtual Trips (`← My Trips` back link/button).
    - Removed redundant extra "Home" pill from top right of `trip_detail.html` (logo already serves as brand home link).
    - Unified sticky white header across `virtual_trip.html` (Hub, Canvas, Builder) and `trip_detail.html` with clean divider, breadcrumbs, and Share action.
    - Eliminated duplicate back buttons in Builder mode.
    - Expanded `#virtual-trips-view` layout containers from cramped `max-w-md` to responsive `max-w-4xl mx-auto w-full`.
    - Added `./js/header.js` to PWA app shell and bumped service worker cache to `kyt-v25` in `sw.js`.

12. **Current Trip: View $\leftrightarrow$ Configure Navigation Loop & Toolbar**
    - Updated `configure_trip.html` with a clean sticky header featuring `← View Trip` back navigation and brand logo.
    - Updated `closeConfigView()` in [`js/config.js`](../js/config.js) so saving ("Save & Close") returns directly to [`view_trip.html`](../view_trip.html) instead of redirecting to home.
    - Enhanced `#main-toolbar` in [`view_trip.html`](../view_trip.html) to include AI Curated Trips (`curated_trips.html`) alongside Home, Virtual Trips, Memory Album, and Edit Itinerary.
    - Preserved mobile-first touch optimization on both screens.

13. **Unified App Floating Toolbar & Self-Contained Album Modal Dialog**
    - Added `KYT.header.renderMainToolbar(container, options)` in [`js/header.js`](../js/header.js) driving the exact same mobile-optimized floating pill toolbar across [`view_trip.html`](../view_trip.html), [`curated_trips.html`](../curated_trips.html), and [`visited.html`](../visited.html).
    - Standardized navigation icons across the toolbar: Home (`index.html`), Virtual Trips (`virtual_trip.html`), AI Curated (`curated_trips.html`), Album (opens modal), Digital Passport (`visited.html`), plus contextual Edit / Live Trip actions.
    - Built self-contained Album modal dialog (`KYT.header.openAlbum()` / `KYT.header.closeAlbum()`) with an explicit **X close button** at top-right, backdrop click-to-dismiss, and `Escape` key handler. Works uniformly whether invoked from View Trip, Curated Trips, or Digital Passport.
    - Kept strict mobile touch optimization (`max-w-md mx-auto`, touch targets $\ge 42\text{px}$).

14. **Complete App Navigation Header Unification (`virtual_trip.html` & `trip_detail.html`)**
    - Replaced disconnected headers on [`virtual_trip.html`](../virtual_trip.html) and [`trip_detail.html`](../trip_detail.html) with the same unified `#main-toolbar` driven by `KYT.header.renderMainToolbar`.
    - On [`virtual_trip.html`](../virtual_trip.html):
      - Renders the floating toolbar with **Trips** active in Hub mode.
      - Seamlessly displays a compact contextual subnav bar (`← My Trips` / `← Edit Cities` & `Share`) when entering Canvas or Builder mode.
    - On [`trip_detail.html`](../trip_detail.html):
      - Renders the floating toolbar at the top with full access to Home, Trips, Curated, Album, Passport, and Live Trip.
      - Added a clean breadcrumb back link (`← Back to Curated Trips` or `← Back to My Trips`) based on origin.
    - Bumped service worker cache to `kyt-v29` in [`sw.js`](../sw.js).

15. **Articulated Onboarding Options on Home (`index.html` & `js/index.js`)**
    - Redesigned the primary Trip Menu cards on [`index.html`](../index.html) with clear descriptive guidance for each user intent:
      - **Have an Upcoming Trip?** (`configure_trip.html`): "Head here if you have confirmed travel plans! Add your flights, hotels, tickets, boarding passes, and custom notes step-by-step."
      - **Start a Virtual Trip** (`virtual_trip.html`): "Pick destinations across India, choose your pace and dietary style, and get an automated day plan with inter-city travel legs."
      - **AI Curated Journeys** (`curated_trips.html`): "Browse handcrafted spiritual circuits, coastal getaways, and heritage trails with YouTube video guides ready to customize."
      - **My Digital Passport** (`visited.html`): "Been there, done that! Mark Indian cities you've explored, collect official stamps, and grow your personal travel scratchpad."
    - Enhanced returning user view with rich card styling and live countdown hero link for active itineraries.
    - Updated noscript fallback with matching structured cards.
    - Bumped service worker cache to `kyt-v30` in [`sw.js`](../sw.js).

16. **Hero Tagline Update (`index.html`)**
    - Updated hero tagline from *"Live every story."* to *"Happy journey!"* in [`index.html`](../index.html) for a warm, authentic Indian travel touch:
      - *Know your travel.*
      - *Plan it your way.*
      - *Happy journey!*

17. **Full Test Suite Verification & Resiliency Polish**
    - Executed the complete test suite covering all unit, catalog integrity, core itinerary engine, offline PWA, and browser e2e tests.
    - Resolved DOM ID collision between `#main-toolbar` and [`curated_trips.html`](../curated_trips.html) drawer button by prefixing toolbar nav items with `kyt-nav-*` in [`js/header.js`](../js/header.js).
    - Hardened offline cache fallback in [`sw.js`](../sw.js) with `{ ignoreSearch: true }` so requests with cache query params reliably serve the cached app shell assets.
    - **110 passed, 0 failed** (56 admin core tests + 54 browser e2e tests across all four test suites).
    - Bumped service worker cache to `kyt-v32` in [`sw.js`](../sw.js).

18. **Origin City Selection, Day 0 Fluid Arrival, Day 1 Morning Start & Non-Overlapping Time Spacing**
    - Added Starting Point (Origin City) selector to the Virtual Trip Canvas in [`virtual_trip.html`](../virtual_trip.html) with popular starting hubs and an "Already in destination" option.
    - Implemented dedicated **Day 0: Travel & Arrival** generated with exactly one fluid block ("Activities for today are fluid depending on time of arrival") with Google Maps directions from the origin city.
    - Ensured **Day 1 begins in the morning** with morning refreshment & breakfast followed by matched sightseeing beats.
    - Removed rigid time slots (e.g. `15:00`) from the builder UI in favor of natural sequential order, day phase badges (`Arrival`, `Morning`, `Midday`, `Afternoon`, `Evening`), and suggestive timing hints.
    - Resolved time overlapping in `useAsMyTrip()` by calculating strictly increasing, non-overlapping `targetTime`s with minimum buffer spacing and proper day offsets.
    - Bumped service worker cache to `kyt-v33` in [`sw.js`](../sw.js).

19. **Transit Days (Day 2+) Chronological Narrative Sequence & Post-Arrival Afternoon Beat Mapping**
    - Fixed Day 2+ ordering defect where catalog beats with early morning hours (e.g., `Bhimashankar Jyotirlinga` at 06:00 AM) preceded the morning inter-city travel leg (`Travel to Bhimashankar`).
    - Standardized transit day architecture across `generateSteps()` and `appendCitySteps()`:
      1. Morning Transit (`Travel to <City>` at 07:30 AM)
      2. Midday Hotel Check-in / Drop Luggage (12:00 PM)
      3. Midday Regional Lunch (13:00 PM)
      4. Afternoon & Evening Exploration Beats (scheduled post-arrival $\ge$ 14:30 PM with 1.5h pacing)
      5. Evening Dinner & Leisure (20:00 PM)
      6. Return Journey (21:00 PM on final day)
    - Added self-healing routine (`sanitizeOrRegenerateSteps`) on builder launch so existing plans stored in localStorage automatically repair their order.
    - Added a convenient "Reset Order" action to the builder header.
    - Bumped service worker cache to `kyt-v34` in [`sw.js`](../sw.js).

20. **Travel Duration & Daily Night Stay Allocation (Automatic Day Excursions & Night Travel)**
    - Added **Trip Duration** stepper (`[-] X Days [+]`) on the Canvas with pacing hints.
    - Added **Night Stays & Base Allocation** section on the Canvas allowing travelers to configure their night stay for each day:
      - 🏨 **Base Stay** (e.g. Pune hotel)
      - 🏨 **Transfer Stay** (e.g. Bhimashankar hotel)
      - 🚂 **Overnight Travel** (Night train / sleeper coach)
    - Automated smart defaults using `window.KYT_DISTANCE_MATRIX`: destinations $\le 130$ km from base (e.g. Bhimashankar from Pune = 119 km) intelligently suggest **Day Excursion** by default.
    - Automatic narrative generation:
      - **Day Excursion**: Morning Drive from base $\rightarrow$ Lunch $\rightarrow$ Afternoon Sights $\rightarrow$ Return Drive to base hotel $\rightarrow$ Dinner & Sleep at base (zero false hotel check-ins).
      - **Base Transfer**: Morning Transit $\rightarrow$ Hotel Check-in $\rightarrow$ Lunch $\rightarrow$ Sights $\rightarrow$ Dinner & Sleep in destination.
      - **Overnight Travel**: Evening departure milestone boarding night train or sleeper coach.
    - Bumped service worker cache to `kyt-v35` in [`sw.js`](../sw.js).

21. **Decoupled City Selection & Progressive Stay Modal**
    - **Clean Canvas**: Removed inline duration and night stay wrappers from the Canvas top card so users can freely search, browse, and add multiple destinations without viewport obstruction.
    - **Progressive Disclosure Modal (`#vt-stay-modal`)**: Tapping "Generate Day Plan" opens a dedicated modal asking for Trip Duration (- / + stepper with pacing hint) and daily night stays.
    - **Clean "Overnight Travel" Terminology**: Removed all mentions of "Night Train" or "sleeper" coach; labeled simply and cleanly as `Overnight Travel` across select dropdowns, badges, and itinerary steps.
    - **Seamless Next-Morning Arrival**: When previous night is `Overnight Travel`, the next morning generates a clean `Morning Arrival in <City>` milestone rather than a redundant highway drive.
    - **Accessible in Builder**: Added `Stays & Days` quick-action button in the Builder header to easily adjust duration and night stays at any time.

22. **Evening Base Transfers & Unified 4-Phase Daily Itinerary Pipeline**
    - **Fixed Modal Badge Discrepancy**: Corrected `#vt-stay-modal` badge evaluation so choosing a different city for the night stay accurately displays `🏨 Evening Transfer (Explore <DayCity> → Sleep in <StayCity>)` instead of defaulting to `Base Stay in <DayCity>`.
    - **Unified 4-Phase Itinerary Pipeline**:
      - **Phase 1 (Morning)**: Accurately checks where the traveler woke up (`prevStayCityId`). Supports Morning Arrival from `overnight_travel`, Morning Excursion drive, Morning Base Move drive + check-in, or relaxed morning breakfast if already in the city.
      - **Phase 2 (Midday & Sightseeing)**: Paces morning and afternoon sightseeing with dietary lunch. Automatically schedules sightseeing to wrap up by 17:30 when an evening transfer or excursion return is planned.
      - **Phase 3 (Evening & Night Stay)**: Strictly driven by `tonightStay`. Supports **Evening Transfer** (`Travel to <StayCity>` at 18:00 $\rightarrow$ `Hotel Check-in, Dinner & Overnight Stay in <StayCity>` at 20:30), **Excursion Return**, **Overnight Travel**, or **Base Stay**.
      - **Phase 4 (Final Day Return)**: Accurately sets return origin based on the final evening's actual location.
    - **Seamless Next-Day Continuity**: When Day 1 ends with an evening transfer to Nashik, Day 2 correctly wakes up in Nashik with zero redundant morning transit.
23. **UI Unification Step 4 & Component Modernization (`KYT.ui`)**
    - **`visited.html`**: Configured passport card rendering loop via `KYT.ui.renderCityCard(city, { variant: 'passport' })`, preserving all action buttons (`unmarkVisited`, `markVisited`, `updateDate`) and circular stamp graphics.
    - **`js/config.js`**: Unified `renderConfigSteps()` to use `KYT.ui.renderStepCard(step, { variant: 'config', ... })` for each row, loading `js/ui-components.js` before `js/config.js` in both `configure_trip.html` and `view_trip.html`.
    - **`curated_trips.html`**: Converted preview timeline cards to `KYT.ui.renderStepCard(s, { variant: 'curated-preview' })` and updated "Open in Virtual Trips to Edit" action to use `KYT.ui.convertCuratedTripToVirtual(trip)`.
    - **Harness & Resiliency**: Updated `tests/e2e/helpers.js` to auto-detect installed Chromium browsers (Edge/Chrome) when `KYT_CHROMIUM` is unset; updated curated trips count regex in `04-passport-curated-pwa.test.js` to match full catalog size.
    - **110 passed, 0 failed** across all unit and functional E2E test suites.
    - Bumped service worker cache to `kyt-v40` in [`sw.js`](../sw.js).

24. **Trip-Level Metadata URL Preservation & Hero Banner Badges**
    - **`js/virtual-trips.js`**: Encoded `origin` (`'0'` if destination-starts / `already_there`, else resolved city code) and `days` (`trip.duration || trip.cities.length || 1`) in `shareCurrentTrip()`. In `init()`, read `origin` and `days` during shared trip imports, resolved origin via `KYT.ui.resolveCity`, assigned duration, and cleaned URL params.
    - **`trip_detail.html`**: Added `#trip-meta-pills` container in the hero banner. Loaded `originParam` and `daysParam`, preserved them in `window.history.replaceState` when loading by ID or curated trip, and dynamically rendered clean badges for Starting Point (`📍 Starts in destination` or `📍 From <City>`), Duration (`🗓️ X Days`), and Taste Profile (Intent, Diet, Pace).

25. **"Refine with AI" Feature in `trip_detail.html` & PWA Integration**
    - **Mobile Bottom-Sheet (`#ai-refine-modal`)**: Anchored to bottom on mobile (`items-end sm:items-center`) with slide-up sheet (`rounded-t-3xl sm:rounded-3xl max-h-[90vh]`) preventing virtual keyboard clipping.
    - **Two-Step Wizard**:
      - **Step 1 (`#ai-step-1`)**: Thumb-friendly twist chips (`Exact Google Maps links & timings`, `Strictly Vegetarian / Satvik dining`, `Relaxed pace, fewer stops`, `Family & senior-friendly`, `Hidden local gems`), optional custom input `#ai-custom-twist`, primary button `#btn-copy-open-gemini` (copies prompt & opens Gemini), native OS share `#btn-share-prompt-native`, and collapsible raw prompt `<details>`.
      - **Step 2 (`#ai-step-2`)**: Back button, giant 1-tap clipboard button `#btn-paste-clipboard` with auto-pulse on tab return (`visibilitychange`), instant auto-apply on paste (`paste` listener triggers after 100ms when `{` and `}` are detected), and explicit `#btn-apply-ai-plan`.
    - **Validation & Rendering**: Parses with `KYTAdmin.extractJson`, `KYTAdmin.toTripList`, and `KYTAdmin.validateTrip`, converting to virtual trip via `KYT.ui.convertCuratedTripToVirtual`. Automatically saves to `localStorage` (`kyt_virtual_trips`), triggers haptic vibration (`navigator.vibrate(40)`), renders `#refined-itinerary-section` with day-by-day preview timeline, and smoothly scrolls into view.
    - **PWA Caching**: Added `./admin/core.js` to `APP_SHELL` in [`sw.js`](../sw.js) and bumped cache to `kyt-v41`. All 110 tests pass.

26. **"Refine with AI" Visibility Fix & Action Disambiguation in `trip_detail.html`**
    - **Visibility & Contrast Fix**: Resolved root cause of the faint button by replacing Tailwind v4 `bg-linear-to-*` syntax with valid Tailwind v3 `bg-gradient-to-*` syntax. Applied vibrant, high-contrast gradient (`bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700`) with sparkles badge and elevation shadow to `#btn-open-ai-refine`, modal header, and primary modal CTAs.
    - **CTA Disambiguation**: Resolved confusion between multiple "Customize" buttons:
      - **Hero Banner**: Primary actions clearly differentiated as `[✨ Refine with AI]`, `[✏️ Edit in Builder]`, and `[📤 Share]`.
      - **Itinerary Card Header**: Removed duplicate blue "Customize in Builder" button. Replaced with an accurate context badge (`✨ AI-Refined Plan` vs `⭐ Curated Blueprint` vs `📅 Day-by-Day Plan`), an inline `[✨ Refine with AI / Refine Again]` trigger, and a clean text link `[Open Builder →]`.
    - **Full Test Verification**: Verified all 110 tests pass (56 unit tests + 54 browser E2E tests).

27. **Four Key Bug Fixes in `trip_detail.html` & `js/virtual-trips.js`**
    - **Bug 1 (`s.dayId` vs `s.day` mismatch in `trip_detail.html`)**: Corrected step day bucketing across `getTripForPrompt()` and `renderRefinedItinerary()` to use `s.dayId != null ? s.dayId : (s.day != null ? s.day : 1)`. Displayed `Day 0: Travel & Arrival` when `Number(d) === 0` and standardized the day subtitle to `dayBuckets[d][0]?.cityName || 'Itinerary Schedule'`.
    - **Bug 2 (`city.beats` & `att.title` in `getTripForPrompt()`)**: Updated the fallback synthesis loop in `getTripForPrompt()` (`trip_detail.html`) to correctly read `city.beats` and `att.title` matching `data/cities.js`.
    - **Bug 3 (`DOM.btnBuild` Regression in `js/virtual-trips.js`)**: Fixed `DOM.btnBuild` ("Generate Day Plan") click listener to open the progressive stays & duration modal (`openStayModal()`) instead of prematurely executing `generateSteps(trip)` and bypassing stay customization. Updated e2e test helper to confirm the stay modal during tests.
    - **Bug 4 (Trip ID Linking & Cross-Device Sharing for AI-Refined Trips)**: Changed `tripId` to mutable `let tripId` in `trip_detail.html`; when an AI-refined plan is applied in `applyAiResponseText`, `tripId = vTrip.id` is linked and URL state is updated (`window.history.replaceState`). Updated `#btn-edit-plan` to open the active AI trip (`virtual_trip.html?id=${activeId}`) instead of redirecting to raw params. Added URL-safe compression/decompression helpers (`KYT.ui.encodeAiTrip` & `KYT.ui.decodeAiTrip`) to share AI itineraries across devices via `?ai=`, and protected AI trips from unwanted regeneration in `sanitizeOrRegenerateSteps`.
    - Bumped service worker cache to `kyt-v42` in [`sw.js`](../sw.js). **All 110 tests pass (56 unit tests + 54 browser E2E tests).**

28. **Decoupled "Refine with AI" into Standalone `js/ai-refine.js` & 3-Step Review Wizard**
    - **Reverted `admin/core.js` & Service Worker**: Removed all trip-refinement logic from `admin/core.js` so it remains exclusively for the admin catalog editor. Replaced `'./admin/core.js'` with `'./js/ai-refine.js'` in `APP_SHELL` in [`sw.js`](../sw.js) and bumped cache to `kyt-v43`.
    - **Standalone Module [`js/ai-refine.js`](../js/ai-refine.js) (`window.KYT.aiRefine`)**:
      - **`buildEnrichPrompt(tripContext, twistText)`**: Generates structured, human-readable Google Gemini prompts with locked destinations, taste/pace filtering, logical fluid sequence phases (`Morning`, `Midday`, `Afternoon`, `Evening`), temple opening/afternoon closure windows (12:30 PM–4:00 PM), and exact Google Maps links (`mapsUrl`).
      - **`parseAndDiff(rawText, originalTripContext)`**: Tolerantly extracts JSON (supporting code fences, Unicode curly quotes, trailing commas, and comment stripping without breaking `https://` URLs). Auto-generates Google Maps search links for any steps lacking URLs and calculates a detailed diff summary (`totalSteps`, `mapsCount`, `verifyCount`, `addedOrEnriched`, and `removedSteps`).
      - **3-Step Modal UI Controller (`init(options)`)**:
        - **View 1 (`#ai-step-1`)**: Twist chips + custom requests + visible prompt preview + emerald feedback on copy (`✓ Copied to Clipboard!` for 2.5s) + `Next: Paste AI Response →` button and `Open Gemini ↗` link.
        - **View 2 (`#ai-step-2`)**: Clear guidance, paste textarea `#ai-response-textarea`, clipboard helper `#btn-paste-clipboard`, and primary CTA `#btn-preview-ai-changes` ("Preview What AI Did →").
        - **View 3 (`#ai-step-3`)**: Summary banner with badges (`📍 X Map Links`, `⚠️ Y Timing Alerts`, `🗓️ Z Steps`), day-by-day sequenced plan with timing alerts, collapsible list of filtered-out attractions, and sticky footer with `#btn-reject-ai` ("✗ Reject & Discard") and `#btn-accept-ai` ("✓ Accept & Update Trip").
    - **Verification**: **All 110 tests pass (56 unit tests + 54 browser E2E tests).**

29. **URL Shortening & WhatsApp "URL too long" Share Fix**
    - **Root Cause**: When an AI-refined itinerary was accepted in [`trip_detail.html`](../trip_detail.html), `onAccept` serialized the full trip object into a base64 query parameter `?ai=...`, injecting over 7,100 characters into the URL. Sharing this link via WhatsApp triggered an immediate error ("URL too long") due to messaging URL length limits.
    - **Clean Share URL Construction**:
      - Updated `#btn-share-trip` click listener in [`trip_detail.html`](../trip_detail.html) to always strip `&ai=` and construct a lightweight URL with standard compact parameters (`trip`, `cities`, `taste`, `origin`, `days`, `id`, `curated`). The shared link is reduced from >7,100 chars to <150 chars.
      - Updated `onAccept` callback in [`trip_detail.html`](../trip_detail.html) to link `vTrip.id` and purge `ai` from `window.history.replaceState`.
      - Added automatic address bar sanitization on page load when an incoming link contains legacy `?ai=`: imports the AI itinerary into `localStorage` (if not already present) and immediately removes `?ai=` from the address bar via `window.history.replaceState`.
      - Added length safeguard in `KYT.ui.encodeAiTrip` ([`js/ui-components.js`](../js/ui-components.js)) to reject JSON payloads >800 characters, preventing oversized query strings across the app.
      - Updated `shareCurrentTrip()` in [`js/virtual-trips.js`](../js/virtual-trips.js) to preserve `trip.id`.
    - **Test Coverage**: Added automated E2E test in [`tests/e2e/04-passport-curated-pwa.test.js`](../tests/e2e/04-passport-curated-pwa.test.js) validating that sharing produces a clean URL (<300 chars, no `&ai=`), and that incoming URLs with `&ai=` are sanitized in the browser address bar immediately.

30. **Client-Side Compressed Itinerary Sharing & Privacy Consent for GitHub Pages**
    - **GitHub Pages Native Architecture**: As `vividnova.com` is hosted statically on GitHub Pages with zero server-side code, trip sharing uses a 100% serverless, zero-account client-side architecture.
    - **Compact Plan Compression**: Built `compressPlan` and `decompressPlan` in [`js/ui-components.js`](../js/ui-components.js) using the browser's native `CompressionStream('deflate-raw')` / `DecompressionStream('deflate-raw')`. It packages all sequenced days, steps, hours, minutes, titles, locations, and icons into a compact ~890-char string (`&plan=...`). The entire URL is ~1,030 characters, well within WhatsApp's 2,048 limit.
    - **Privacy Consent Modal**: Implemented `#share-consent-modal` in [`trip_detail.html`](../trip_detail.html) with explicit checkbox required before sharing:
      `[ ] I understand that anyone with this URL can access your trip data.`
      The share button is disabled until checked.
    - **Automatic Plan Decompression on Recipient Device**: When a companion opens the link, [`trip_detail.html`](../trip_detail.html) decompresses the plan, restores all 18 customized steps and timings, auto-generates Google Maps links dynamically, saves the trip into `localStorage`, and cleans `plan` from the address bar via `history.replaceState`.
    - **Full Test Verification**: **All 56 tests pass (0 failures).**

31. **Cloudflare Worker URL Shortener Integration (Ultra-Short 55-char links)**
    - **Worker & KV Namespace Setup**:
      - Created [`cloudflare-worker/worker.js`](../cloudflare-worker/worker.js) handling `POST /api/trip` (stores itinerary JSON in `TRIP_KV` with 60-day auto-expiry, returns 6-character random alphanumeric code `id`) and `GET /api/trip/:id` (retrieves stored trip with full CORS support).
      - User deployed the worker to `https://kyt-share.deshvenkatesh.workers.dev` bound to KV namespace `TRIP_KV`.
    - **Front-End Integration & Robust Protocol Handling**:
      - Configured `window.KYT_SHORTENER_URL = 'https://kyt-share.deshvenkatesh.workers.dev'` in [`trip_detail.html`](../trip_detail.html).
      - Added `getShortenerEndpoint()` helper ensuring protocol normalization (`https://` automatically prepended if omitted) for both link generation (`POST /api/trip`) and retrieval (`GET /api/trip/:id`).
      - Verified live end-to-end worker connectivity: health check, trip creation, and trip retrieval tests all returned HTTP 200 with stored itinerary intact.
      - Preserved seamless fallback to browser-deflated compact link (`&plan=...`) if worker is unreachable.
    - **Test Suite**:
      - Added automated E2E test in [`tests/e2e/04-passport-curated-pwa.test.js`](../tests/e2e/04-passport-curated-pwa.test.js) validating `?c=` shortcode generation upon privacy consent and cross-device restoration into a fresh browser session.
      - Bumped service worker cache to `kyt-v46` in [`sw.js`](../sw.js).
      - **All 57 automated tests pass (57 pass, 0 fail).**

32. **India Explorer Passport, v47–v53 (summarised from the project handoff)**
    - `visited.html` and `js/passport-extras.js`: filters sheet, by-state grouping, Bronze / Silver / Gold levels (Silver at 8 cities, Gold at 25 cities or 10 states), strength meters (States, Regions, Experiences, Landscapes) shown as chips, and a canvas-drawn share card. City cards open the shared city detail sheet.
    - `data/cities.js`: every city carries `setting` (coast, hills, plains), `vibes` (1–3 of spiritual, heritage, nature, adventure, foodie) and `effort` (easy, trek). A test fails if any city lacks them.
    - Large page scripts moved out of the HTML files into `js/page-*.js`; a test requires each to be in the `sw.js` precache list. A test also checks that every inline script in the HTML parses (a format-on-save tool once broke string literals).
    - Service worker cache is `kyt-v53`. The e2e suite is 78 tests (`tests/e2e/01` to `05`).

33. **Usability pass: first-trip frictions fixed (service worker cache `kyt-v54`)**
    - **Start this trip.** The plan page (`trip_detail.html`) now has one clear primary "Start this trip" button; "Edit in Builder" and "Refine with AI" are secondary. The builder shows one "Trip Details & AI" link instead of three and one full-width Start button.
    - **Start date is always asked.** A dialog (`KYT.ui.startTripLive` in `js/ui-components.js`) asks for the date, with nothing pre-filled, past dates refused and a "Today" shortcut. Starting also clears the previous trip's notes and cover photo.
    - **No assumed origin.** New trips no longer default to Bengaluru. The builder asks where you start (or "Already in destination"), will not generate without it, and remembers the answer for the next trip.
    - **Small fixes.** Home copy no longer promises sync or says curated trips are "coming soon". Own plans show "N cities · D days" instead of curated-journey text. The builder counts planned days without Day 0. The Ctrl+V hint is hidden on phones. Create with a blank name now focuses the field. The night-stay "Base Move" label reads "Move hotel: sleep in X".
    - E2E suite is 85 tests, all passing.

34. **Storage safety: one backup, backup before End Trip, persistence, visible save failures (`js/backup.js`, service worker cache `kyt-v68`)**
    - **One backup file** (`kytBackup: 1`) holds the passport, all virtual trips and the current trip with its photos and tickets. "Back up or restore your data" on the home page, and "Back up or restore everything" in the trip editor, open one sheet to download or restore it. Restore validates the file, shows what it will replace, and changes nothing if the file is wrong or damaged. Single-trip files are pointed to Import Trip.
    - **End Trip** now asks first: download a backup and end, end without one, or keep the trip.
    - **Persistent storage** is requested after the first save (`navigator.storage.persist()`), and the sheet says whether the browser has granted it.
    - **Failed saves are visible.** Writes to `localStorage` (virtual trips, passport) go through `KYT.backup.safeSet`, which shows a "no room left" message with a Back up now shortcut instead of failing silently. The trip save message now says what to do.
    - Roadmap §3.4 still describes the target: one `KYT.storage` repository, media as Blobs, and the native app archive. The single-trip export (Export Trip) still leaves out photos and tickets; the new backup includes them.
    - E2E suite: 94 tests (`tests/e2e/06-storage.test.js` is new). The passport strength-panel test got a short wait, because it raced the async toggle event.

35. **Feedback link on every page (`js/footer.js`, service worker cache `kyt-v69`)**
    - One script adds a "Send feedback" mail link (to `info@vividnova.com`, with a subject and the page name) at the foot of every page. To change the address, edit `FEEDBACK_EMAIL` in that file. A new page gets the link by including the script.
    - Footer text is "Questions, comments and feedback, write to info@vividnova.com". The backup sheet now has a "This device check" (does browser storage work, installed app or browser tab, cities stamped here), added while chasing a report of passport stamps not surviving between sessions on a phone. E2E suite: 98 tests.

36. **Passport floating counter; iPhone Home Screen storage warning (service worker cache `kyt-v71`)**
    - `visited.html`: a floating "N visited ↑" pill appears bottom left once you scroll past the header. It updates as you mark cities and takes you back to the top when tapped.
    - An iPhone Home Screen app keeps its own storage, separate from Safari, so it starts empty. The home page install steps now say to back up first. The installed app shows a one-time "Starting fresh?" notice with a Restore shortcut when it opens with no data.

37. **App version in every footer, and "Refresh app" (service worker cache `kyt-v72`)**
    - `js/footer.js` prints "KYT version N" under the feedback line on every page, and warns when the phone's offline copy belongs to a different build. "Refresh app" removes the service worker and offline caches and reloads. To release: bump `APP_VERSION` in `js/footer.js` and `CACHE_NAME` in `sw.js` together; a test fails if they differ.

38. **Destination Catalog Expansion to 159 Cities & Lowercase URL Consistency (service worker cache `kyt-v74`)**
    - **Expanded Destinations**: Increased database from 145 to 159 cities in `data/cities.js` with complete geographic coordinates, setting (`coast`, `hills`, `plains`), travel vibes, effort levels, attraction beats, and direct Google Maps links.
    - **URL Consistency**: Standardized all internal and canonical external URLs to lowercase `vividnova.com/kyt`.

39. **Explorer Quests in India Explorer Passport (`visited.html`, `data/quests.js`, `js/passport-extras.js`)**
    - **Quests Catalog**: Added 28 curated cultural and geographical quests across 4 pillars (Spiritual, Heritage, Nature, Regional) covering 138 of 159 destinations (86.8%).
    - **Quests Selection Sheet**: Integrated `[Quests]` trigger button in `visited.html` opening a category-pill filtered modal dialog with real-time completion tracking and trophy badges (🏆).
    - **Active Quest Explainer Bar**: Filtered destination grid with a dedicated banner showing quest icon, title, full description, completion status, and a one-click `✕` exit button.
    - **Canvas Share Card Integration**: Dynamically ranks and renders "TOP QUESTS" with custom progress bars on the 1200x630 share card, with a persistent `Include Explorer Quests` user toggle.

40. **Interactive India Explorer Vector Map & Downloadable Poster (`visited.html`, `data/india-map.js`, `js/passport-extras.js`, service worker cache `kyt-v77`)**
    - **Survey of India Compliant Vector Map**: Fully client-side, offline projection of India's mainland, coastlines, and island territories in `data/india-map.js`.
    - **Interactive Explorer Map Modal**: Added "Your Explorer Map" launcher button to the Passport hero. Displays all 159 coordinates with custom glow effects, pulsing markers, and a toggle between "Visited Only" and "All Destinations".
    - **Pin Callouts**: Clicking any destination pin displays a rich slide-in details card showing the city name, state, brief overview, stamped date, and direct navigation to explore the destination.
    - **High-Res Poster Download**: One-click "Download Map Poster" generating an authentic dark-mode explorer poster with coordinate grids and explorer stats.
    - **Responsive Viewport Containment**: Modal height bounded (`h-[92vh] max-h-[880px]`) with aspect-ratio preservation (`900/1100`) preventing double scrollbars and overflow on desktop and mobile.

41. **Trip Detail & Builder Unification, 2-Hop Friction Removal & Compact Header (service worker cache `kyt-v79`)**
    - **Compact View Trip Header (`trip_detail.html`)**: Condensed bloated 5-tier header (~360px) into a sleek 2-row layout (~95px high, >60% vertical space savings). Row 1 hosts back navigation and primary "Start this trip" button; Row 2 hosts trip title, inline duration badge, metadata pills (`📍 From Bengaluru`, `🗓️ 5 Days`, `Spiritual`, `Satvik`), and secondary actions (`Refine with AI`, `Edit Trip`, `Share`). Itinerary days and destination cards are now immediately visible above the fold.
    - **Unified Header on Edit Trip (`virtual_trip.html`)**: Replaced fragmented subnav with the exact same hero header as View Trip (same blue styling, inline editable title, metadata pills). All key actions (`Trip Details & AI`, `Stays & Days`, `Share`) remain persistently accessible.
    - **Mode Switcher Tabs (`Edit Cities` vs `Day Plan`)**: Integrated clean tabs in the edit header (`[ 📍 Edit Cities ]` $\leftrightarrow$ `[ 🗓️ Day Plan (X) ]`). Toggling between destinations and the day-by-day plan keeps the header firmly anchored, eliminating the feeling of being thrown into a different screen.
    - **Elimination of Confusing Separate Edits & 2-Hop Loop**: Removed redundant "Edit Cities" button from `trip_detail.html`, unifying into one clear "Edit Trip" button with smart routing (builder for planned trips, canvas for unbuilt drafts). In the My Trips hub, clicking an unbuilt trip directly opens its canvas with zero extra hops.
    - **Helpful Empty State**: Trips with 0 destinations show an inviting card with an actionable `[+ Add Destinations]` button instead of dead text.

42. **Generated plans no longer contradict themselves; every generated plan carries an explainer (TODO P0.2, service worker cache `kyt-v80`)**
    - **Day scheduling rewritten** (`layoutDayBeats` in `js/virtual-trips.js`). A day's attractions are laid on a timeline instead of being clamped to a latest hour, which had stacked several steps at 17:00 or 18:30.
      - (a) The last day of a trip that returns home ends with a plain "Dinner in X" and then the return journey, never "Overnight Stay" followed by "Return Journey". The return is always the last step, at least an hour after the last one.
      - (b) No two steps of a day start at the same time (a final safety pass guarantees it).
      - (c) A beat whose title names a time of day keeps it: sunrise and dawn in the early morning, "morning" before 11:00, sunset around 16:30 to 19:00, dusk and aarti in the evening, light and sound shows after 18:30, dinner in the evening, lunch at midday. A beat that cannot fit its time on a day (a sunrise on a day spent driving to Leh) is left out of that day rather than shown at the wrong hour; on a free day it appears at its time.
      - (d) A day that already has a lunch among its attractions (Kerala sadya lunch at Munnar) no longer gets a second, generic lunch. Days without one still do.
      - On crowded days the spacing between attractions tightens from 90 to as little as 60 minutes before anything is dropped.
    - **Explainer on every generated plan** (`KYT.ui.renderGeneratedPlanNotice`, `js/ui-components.js`): the amber notice style from `curated_trips.html`, reworded as "A suggested sequence, not a schedule. Times are indicative and every step can be moved or removed. Before you set out, check road, weather and opening conditions in Google Maps." Shown once at the top of the builder and on the plan page (`trip_detail.html`), not on hand-curated trips, which keep their own wording.
    - **Also fixed:** tapping "Generate Day Plan" with no starting point chosen highlighted the origin selector inside the collapsed Preferences panel, so nothing visible happened. The panel now opens. (This made an existing test fail on the untouched code.)
    - **Tests:** `tests/e2e/07-generated-plans.test.js` (7 tests): the five problem scenarios plus one with no origin, the specific fixes, 400 random trips across all cities, origins, night stays and tastes, and the notice. Run against the old builder, 530 of 600 random trips broke at least one rule; against the new one, none. E2E suite: 107 tests, all passing.
    - **Not changed:** transfer times are still fixed (TODO P1.0), and extra days in one city still repeat its attractions (new TODO P2.8).

43. **Trip setup: no alerts on a new trip, an honest Start & Style card with a Done button (service worker cache `kyt-v81`)**
    - **No alerts on an empty trip.** Stays & Days and the Day Plan tab were live on a brand-new trip and answered with a browser alert ("Please add at least one city first"). They now wait, greyed with "Add a destination first", until the first destination is added. Share and Trip Details & AI are hidden until then, and come back as soon as there is a destination (and go again if the last one is removed).
    - **Start & Style is its own card**, no longer inside "Your Route" (formerly "Destinations Route"), where a setting about the whole trip read as part of the route. Its closed summary says what is missing or chosen: "Choose where you start" in red, then "From Delhi · Mixed · Standard" (the diet is added when it is not "Any food"). The old label read "Preferences (From Origin)" until a start was chosen.
    - **Done button, and it stays put.** The card opens by itself only while the starting point is missing, and collapses by itself once a start is chosen and a destination added. Done puts it away; once the traveller has opened or closed it, re-renders (every style chip tap used to reset it) no longer change it. A trip that starts with a remembered start opens with the card already put away.
    - **Header follows the cities.** The duration pill kept showing "1 Day" after cities were added; it and the start pill now update as the trip is set up.
    - **Tests:** `tests/e2e/08-trip-setup.test.js` (5 tests).

44. **A new virtual trip starts as one compact card (service worker cache `kyt-v82`)**
    - **One card instead of an empty "Your Route" and a separate Start & Style card.** "From" (the starting point, a required field, so it is always visible, outlined amber and explained with "Needed to plan your journey there" until chosen), "Destinations" (a one-line prompt, "Add your first destination from the list below", until there is one, then the route in order with the Generate Day Plan button) and "Style" (one line, "Mixed · Any food · Standard", with Change opening the chips and Done closing them). The start no longer hides inside a collapsed panel, which is why the "Choose where you start" prompt used to point at nothing visible.
    - **Controls that do not apply yet are not shown, instead of shown greyed with no reason.** Stays & Days, the Edit Cities / Day Plan switch, Share and Trip Details & AI appear with the first destination and go again if the last is removed. This replaces the disabled state added in 43.
    - **Header no longer repeats the card.** While cities are picked it carries only the trip length ("2 Days"), and nothing for an empty trip (it used to say "1 Day"); the full start and style summary shows on the Day Plan.
    - **Tests:** `tests/e2e/08-trip-setup.test.js` rewritten for the new card (5 tests).

45. **Trip setup in the order you think about it, and an editable Day Plan (TODO P1.8, service worker cache `kyt-v83`)**
    - **Cities first.** A new trip opens on just the city picker. "Continue" collapses the choice into a route card (From, Days, Style) with the cities as chips you can add to, edit or remove; one "Generate Day Plan" button follows.
    - **Slim header.** One title row with a ⋯ menu (share, trip details, reset plan) and a Setup / Day Plan switch; the Stays & Days row became the Days line of the card.
    - **Editable Day Plan.** Move a stop earlier or later, edit its title, time, place and notes, add a stop (typed, or one of the city's remaining attractions) or delete one. The sticky Start bar is a slim one-line bar.
    - **Edits survive a rebuild.** Changing days, start or cities regenerates the plan but keeps edited and added stops (`regeneratePlan`); "Reset plan" is the only thing that drops them.
    - **Known limits:** a deleted suggested stop can come back after a rebuild; an edit is kept only while a suggested stop with the same day and original title still exists; transfer times are still fixed (P1.0).
    - **Tests:** `tests/e2e/09-plan-editing.test.js` (5 tests); 03, 07 and 08 updated for the new flow; `KYT_PW_TIMEOUT` shortens Playwright waits.

46. **Setup trimmed to what a first-time user needs; Generate goes straight to the editable plan (service worker cache `kyt-v84`)**
    - **Nearby cities first.** After you add a city, the picker lists the 8 closest to the latest one under "Near X" (from the distance matrix), then "All destinations". Searching still searches everything.
    - **Continue is part of the Destinations card**, under the chips, not a bar floating over the list.
    - **No Setup / Day Plan switch, no ⋯ menu.** The header is back, the trip name and Share. "Edit cities & setup" and "Reset plan" live on the plan screen, next to a one-line summary ("From Delhi · 2 days · Mixed · Any food · Standard").
    - **Style is fully shown** with what each choice means (Interests, Food, Pace), instead of a closed "Mixed · Any food · Standard" line.
    - **No dialog on Generate.** The stays dialog is now optional (Days → Edit); Generate builds the plan, sleeping places default sensibly, and opens the plan where stops can be moved, edited, added and deleted. "Start this trip" and "View Trip" lead on to the plan page.
    - **No repeats on the plan page:** the trip name and the length of the trip each appear once.
    - **Tests:** 03, 07, 08 and 09 updated; 08 gains Continue placement and nearby-first tests (119 in all).


47. **Quieter plan page, a plain Continue, and no day of only meals (service worker cache `kyt-v85`)**
    - **Continue** is a compact button at the right of the Destinations card, not a full-width bar.
    - **One "Day-by-Day" heading** on the plan page (the extra "Day-by-Day Plan" badge shows only for AI-refined and curated plans), and the "suggested sequence, not a schedule" notice is a small grey line instead of an amber box.
    - **Thin cities are topped up.** If a city has fewer than three stops for the chosen interest (Mumbai for Spiritual and Vegetarian had one), the day adds its other sights, still within the food choice. Culinary trips stay food-led.
    - **Tests:** one new test in `07-generated-plans.test.js` (120 in all).

48. **Mumbai's temples, a compact Generate button, and a clear "start missing" signal (service worker cache `kyt-v86`)**
    - **Mumbai data:** six temples added to `data/cities.js` (Siddhivinayak at Prabhadevi, Mumbadevi at Bhuleshwar, Babulnath at Girgaon, Walkeshwar on Malabar Hill, ISKCON Juhu, Radha Gopinath at Chowpatty). Mahalakshmi was already part of the Haji Ali beat. Mumbai now has 11 stops, 7 of them spiritual. Other thinly covered cities are likely; the top-up in CHANGELOG 47 covers them until they are filled in.
    - **Generate Day Plan** is a compact right-aligned button, like Continue.
    - **Missing start:** pressing Generate without a starting point outlines From in red, shakes it once and shows "Choose where you start from to generate the plan" in red under it until one is chosen. No alert.
    - **Tests:** one each in 07 and 08 (122 in all).
