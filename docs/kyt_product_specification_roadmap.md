# KYT (Know Your Travel): Product Specification & Roadmap

KYT is a travel companion that lets people build flexible itineraries by breaking a trip into sequential steps (flights, dining, sightseeing) with indicative timing, direct Google Maps routing and essential attachments. The interface uses bold, interactive controls to track active and completed steps, giving a calm, focused travel experience.

Open work is tracked only in [TODO.md](TODO.md). What has shipped is in [CHANGELOG.md](CHANGELOG.md).

---

## 1. Vision & Core Philosophy

### 1.1 The core USP: fluid sequencing over rigid schedules
Travel in India is vibrant and naturally fluid. Forcing artificial clock timestamps (`07:00, 08:00, 10:00`) on an auto-generated itinerary creates friction and breaks when flights shift, lines stretch, or a roadside chai stop happens.

KYT's governing principles:
1. **Fluid narrative sequence.** Daily activities follow natural day phases (Morning, Midday, Afternoon, Evening) or sequential beats, not minute-by-minute times.
2. **User as sovereign editor.** Every activity, meal and travel step is a suggestion the user can browse, reorder, modify or delete with one tap.
3. **Hard timestamps only for hard bookings.** Fixed times are for train departures, flight times, darshan slots and safari gates that the user entered or an expert curator set.
4. **Macro-structure before micro-planning.** Origin city, stay bases versus day visits, and travel windows are set before day activities are planned.

---

## 2. Technical Architecture & Constraints

To protect privacy, speed and ease of use, KYT operates under these parameters:

* **Zero-server app.** Built on progressive web technologies (HTML, CSS, vanilla JS, Tailwind, Lucide), hosted on GitHub Pages. No accounts, no backend for user data, no cloud sync. One optional exception: a small Cloudflare Worker stores anonymous shared itineraries for 60 days to make short share links. The app works without it and falls back to a longer compressed link.
* **On-device data.** User data lives in browser storage on the device: IndexedDB for the active trip, `localStorage` for virtual trips and the passport. See section 3.
* **Offline-first.** As a PWA it must work without a connection once loaded. A service worker (`sw.js`) precaches the app shell; a test requires every large page script (`js/page-*.js`) to be in that list.
* **Client-side processing.** Shareable images (the passport share card is drawn on a canvas), PDF memory cards (pdfmake) and attachment reading all happen in the browser.
* **Curated facts live in data files**, such as `data/cities.js`, not in code.

---

## 3. Storage Architecture

### 3.1 Where data lives today

| Tier | What it holds | Limits and behaviour |
|---|---|---|
| **IndexedDB** `kyt_db` / `kyt_store` | The single active trip: name, notes, cover image (data URL) and all steps as one JSON string. Attachments (up to 4 per step, 2 MB each) and memory photos (JPEG data URLs, 1600 px) are embedded inside the steps. | Large quota. Four separate writes per save. The whole trip is rewritten on every save. |
| **`localStorage`** | `kyt_virtual_trips` (all virtual trips, including AI-refined ones), `kyt_passport` (visited cities and dates), `kyt_share_name`. | About 5 MiB per origin, synchronous. Exceeding it throws. |
| **Cache Storage** `kyt-v53` | App shell. Network-first with a 2 s timeout, falling back to cache. Old caches are deleted on activate. | Managed by the service worker version. |
| **Cloudflare Worker KV** | Anonymous shared itineraries only. | 60-day expiry. Only server-side component. |
| **Files the user holds** | Trip export (`.json`, without attachments); PDF memory card; passport share image. | The only backups that exist today. |

### 3.2 What IndexedDB gives, and what it does not

**It gives:** room for far more than `localStorage` (Chrome allows up to 60% of disk per origin, Safari about 60%, Firefox up to the smaller of 10% of disk or 10 GiB); asynchronous access that does not block the page; native storage of Blobs (photos need no base64 inflation); transactions and indexes, so a list of many trips can be read cheaply; full offline use with no account. (Browser limits: MDN, *Storage quotas and eviction criteria*.)

**It does not give:**
* **Durability.** Without a persistence request, data is best-effort: the browser may evict it when the device is short on space, and the user can clear it at any time. The app does not yet call `navigator.storage.persist()`. Safari may also delete script-written data for a site that has had no interaction for seven days of browser use when cross-site tracking prevention is on; how this treats a Home Screen install needs testing on a device (TODO V2).
* **Portability.** Data belongs to one browser on one device. A new phone, a different browser, or (possibly) Safari versus the installed Home Screen app each start empty.
* **A backup.** Nothing exports the passport or virtual trips, and the trip export omits attachments and photos.
* **Quota awareness.** The app never checks free space. A failed trip save shows a generic alert; the virtual-trip and passport saves fail without telling the user.
* **Concurrency safety.** Two open tabs editing the same trip overwrite each other (last write wins), and there is no schema migration framework beyond the hand-written self-repair in `getDb()`.
* **Privacy at rest.** Data is unencrypted on the device. This matches the "no account" promise, but a shared device exposes it.

### 3.3 Design decision: active trips on the web, unlimited archive in the native app

Most travellers have one or two active trips. The web app is built for that. An archive of any number of past trips is a feature of the native mobile app (Phase 5), which doubles as the user's local trip library.

Until then, the web app protects the user instead of archiving for them: a full backup before "End Trip", a single backup and restore for everything, and a persistence request (TODO P1.3 to P1.5).

### 3.4 Target storage model

This is the shape to build towards, so the native app is an additional adapter and not a rewrite.

1. **One repository interface**, `KYT.storage`: `listTrips`, `getTrip`, `saveTrip`, `archiveTrip`, `deleteTrip`, `exportBackup`, `importBackup`. Pages stop calling IndexedDB or `localStorage` directly. The web adapter uses IndexedDB; the native adapter later writes to app files or an on-device database.
2. **Trips as records.** A `trips` store with one small record per trip (id, name, dates, status of active or archived, cover thumbnail, step and photo counts). List screens read only these. Steps live in the trip record without binary data.
3. **Media as Blobs.** A `media` store keyed by id holds photos and attachments; steps reference them. Saving a step status no longer rewrites every photo (TODO P2.4).
4. **Virtual trips and the passport** move from `localStorage` to the same repository, so they get the same quota handling and backup.
5. **One backup format**: versioned JSON (`kytBackup: 1`) with passport, virtual trips, trips and media. The web "backup" and the native "import" use the same file, which is how web users move to the app.
6. **Durability on native.** A wrapper that hosts the web code in a WebView keeps web storage inside that WebView, which the OS may clear when the device is short on space (verify for the chosen framework). The native adapter should therefore store the archive in app files or an on-device database, not WebView storage.

---

## 4. Design & UX Principles

* **Mobile-first and tactile.** Large touch targets (42 px or more), thumb-friendly controls.
* **Highly desirable aesthetic.** Clean, intentional design in the spirit of modern iOS apps: crisp type, whitespace, vibrant accents, smooth animation.
* **Native app illusion.** Designed for the iOS and Android Home Screen, hiding browser UI.
* **Progressive disclosure.** Show only what is needed now. Prioritise the current or next step; avoid calendar overload.

### 4.1 Unified design system (as built)

| Element | Specification across Virtual Trip, Trip Detail, Curated, Passport and the trip editor |
| :--- | :--- |
| **Top navigation** | One unified floating toolbar from `KYT.header.renderMainToolbar` (Home, Trips, Curated, Album, Passport, plus contextual Edit or Live Trip). Builder and Canvas add a compact subnav (`← My Trips` or `← Edit Cities`, and Share). |
| **Container width** | Responsive max-width (`max-w-4xl` or `max-w-5xl`, centred on desktop, edge-padded on mobile). |
| **Back navigation** | One clear back action per screen; never duplicate back buttons. |
| **Cards** | Rounded cards (`rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-blue-300`), built through `KYT.ui` components. |
| **Actions** | Primary in KYT royal blue (`bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl`); secondary in soft blue tint (`bg-blue-50 text-blue-700 hover:bg-blue-100`). |
| **City detail** | One shared city detail sheet, reused by trips, curated trips and the passport. Keep this design. |

---

## 5. Feature Modules

#### Module 1: Core itinerary engine (live)
* Create a trip with a title, optional cover image and notes.
* **Rich steps:** the *what* (title and category icon), *when* (target date and time), *where* (location and Google Maps link), plus notes.
* **Contextual "Now" view:** a swipeable card that prioritises the current or next step.
* **Flexible sequence:** create, edit and reorder steps on a soft timeline.
* **Hybrid attachments:** PDFs and images up to 2 MB, or Drive and web links, in an in-app viewer.
* **Compact sharing:** export and import as minified `.json`, without attachments.

#### Module 2: Memories and celebration (live)
* **Travel memory card:** on completing a trip, a PDF memory card of highlights and photos.
* **Album:** photos and notes per step, viewable from any main screen.
* *Future investigation:* an animated GIF of the trip summary.

#### Module 3: Virtual Trips (live)
Replaced the Bucket List. Pick cities across India, set a taste profile (intent, diet, pace), choose origin, duration and night stays, and get an automated day plan with travel legs. Share by short link; refine with an external AI and review the diff before accepting.

#### Module 4: Curated trips (live)
Hand-curated, day-by-day trips with video galleries, produced through the admin tool. Open one as your own plan, or share it. Each trip also carries best months, special days (festivals and crowds), audience, budget, transport, tips and a Before You Go list. Tips and Before You Go are shown; best months, special days, audience and budget are authored but not yet displayed (TODO P0.1). Virtual trips show none of this guidance yet (TODO P1.2).

#### Module 5: Passport, India Explorer (live)
A "Been There Done That" grid of 145 cities with trust-based check-in (the user marks a city and sets the date). Filters, by-state grouping, Bronze, Silver and Gold levels, strength meters (States, Regions, Experiences, Landscapes) and a shareable card.

#### Module 6: Native mobile app and archive (planned, Phase 5)
The app is a local library of any number of archived trips, with the same data model and backup format as the web app (section 3.4).

---

## 6. Trip-Level Attribute Specification

Virtual and curated trips share one macro-attribute model. Status shows what exists in the code.

### 6.1 Macro trip attributes
* **Origin city:** built. If it differs from the first city, a Day 0 (Travel and Arrival) is generated.
* **Stay allocation:** built, as night stays: base stay, evening transfer, day excursion with return, or overnight travel.
* **Return type** (round trip or one way): not built (TODO P2.3). A final-day return is always generated today.

### 6.2 Traveller profile
* **Intent:** spiritual, cultural, heritage, nature, leisure, adventure, mixed. Built.
* **Diet:** vegetarian, Jain, satvik, any. Built.
* **Pace:** relaxed, standard, deep dive. Built.
* **Party composition** (family with elders, family with kids, couples or friends, solo): not built (TODO P0.2). The attractions' `mobility` tag (easy, walk, trek) can drive it; the `party` tag is "any" on 609 of 615 attractions, so it cannot.
* **Transit mode** (self-drive, hired cab, train, flight plus cab): not built (TODO P2.3).

### 6.3 Inter-city transit
Transfer days follow a fixed shape: morning transit, midday check-in and lunch, afternoon and evening sights, dinner. Each leg links to live Google Maps driving directions. No duration is shown, because the distance table holds straight-line distances.

---

## 7. Curated Trips into Virtual Trips (high-fidelity blueprint)

When a user customises a curated trip in the builder:
1. **No loss of fidelity.** Curated steps, notes and local-expert verify checklists load as written, not replaced by generic catalog beats.
2. **Editorial timing as guidance.** Curated times appear as gentle suggestions (`Suggested ~09:30 AM` or `Morning`), not alarms.
3. **Fully editable.** Delete steps, reorder beats, or append cities and days.

---

## 8. Roadmap

### Phase 1: Navigation and header unification (done)
Unified toolbar, single back action per screen, responsive container.

### Phase 2: Macro trip parameters on the canvas (mostly done)
- [x] Origin city selector and dedicated Day 0.
- [x] Stay allocation (night stays), travel duration stepper.
- [x] Inter-city transfer cards with Google Maps driving links.
- [ ] Travel time per leg, and a fit check when days are fewer than cities (TODO P0.3).
- [ ] Party composition chips (TODO P0.2).

### Phase 3: Fluid sequence day generation (mostly done)
- [x] No artificial clock timestamps; day phase badges.
- [x] Non-overlapping sequential spacing.
- [ ] Curated steps shown with timing badges and checklist notes (verify).
- [ ] Meal collision suppression with food-walk beats (TODO P2.5).

### Phase 4: Data safety and offline hardening (next)
- [ ] Backup before End Trip, and one backup and restore for everything (TODO P1.3, P1.4).
- [ ] Persistent storage request and visible save failures (TODO P1.5).
- [ ] Real-device checks of storage and the share card (TODO V1, V2).
- [ ] Repository layer and Blob media store (section 3.4; TODO P2.4).
- [ ] Service worker cache bump with every changed asset (ongoing).

### Phase 5: Native mobile app and unlimited archive (planned)
- [ ] Choose the app framework and distribution route.
- [ ] Native storage adapter behind `KYT.storage` (section 3.4, point 6).
- [ ] My Trips archive screen: browse, reopen, delete and export any number of archived trips.
- [ ] Import the web app's backup file.
- [ ] Decide whether sync or encrypted cloud backup is wanted. The web app stays account-free.
