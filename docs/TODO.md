# KYT: Prioritized TODO

The single list of open work. Done work is in [CHANGELOG.md](CHANGELOG.md). Design intent and architecture are in [kyt_product_specification_roadmap.md](kyt_product_specification_roadmap.md).
Last reviewed: 27 Oct 2026, against service worker cache `kyt-v80`.

**How to use this file:** keep every open item here and nowhere else. When something ships, move it to the changelog. Other docs link here instead of keeping their own TODO lists.

**How priorities are set:** by what the traveller gains, meaning how many travellers need it and how much its absence hurts, not by effort or technical tidiness. The ranking is judgement from the app's data, code and a run of the real plan builder, not user research. Check it against three to five real first-time users before committing to a big item.

**Working rules:** keep the existing city sheet design, avoid added complexity, avoid cheesy labels, and keep curated facts in `data/cities.js` rather than in code. KYT is not a routing app: it links to Google Maps for live travel times and does not try to compute them. A new city needs `setting`, `vibes` and `effort` (a test fails without them). Adding a file under `js/` means adding it to the `sw.js` precache list and bumping the cache version.

---

## The traveller's journey: what exists and what is missing

| Stage | What the traveller asks | KYT today | Gap |
|---|---|---|---|
| Find a plan | "What can I do in 3 days from my city?" | 145 cities. 3 curated trips (two Tirupati, one Mathura and Vrindavan), from Bengaluru and Delhi. | Few ready-made plans |
| Pick the time | "Is this a good month? Will it be crowded?" | Curated trips hold best months and festival and crowd days, but nothing shows them, and the best months are unsourced AI text. The 145 cities hold no seasonal information. | Hidden, unverified, or missing |
| Check it fits | "Can I really do this in 4 days?" | A Google Maps link per leg. The builder assumes fixed transfer times (4 h, 5 h or 2 h) whatever the distance, so some plans are impossible: see P1.0. Every generated plan now says it is a suggested sequence and to check Google Maps (CHANGELOG 38). | Plans can be wrong |
| Suit the group | "My parents can't climb. We have kids." | Each attraction shows an access badge (easy, walk, trek). Plans do not use it. | Not used |
| Prepare | "What do I book, carry and wear?" | Curated trips show a Before You Go list and tips. Virtual trips show nothing. | Missing for virtual trips |
| Travel | "What is next? Where are my tickets?" | Now view, attachments, offline use. | Works |
| Remember and share | "Show the trip, keep the photos, tell my friends." | Album, PDF memory card, passport share card, WhatsApp short links. | Works. Everything lives only on the device |

---

## P0: Generated plans must not look careless

Clear. The contradictions in generated days and the explainer on every generated plan shipped in CHANGELOG 38. The remaining cause of impossible plans, fixed transfer times for hill and pilgrimage places, is P1.0.

## P1: A confident first trip, and not losing what you built

| ID | Item | Why it matters | Evidence |
|---|---|---|---|
| P1.0 | **Access and season gates** for the places where a normal plan fails. For each such place, record in `data/cities.js` a short `access` note with an official source: no road access or a trek (the trip needs N days, not a day trip), arrival-day rest at high altitude, and seasonal closure as month windows, never exact dates (Kedarnath opened on 22 Apr 2026 and 2 May 2025, announced each year by the temple committee). Warn in the city sheet and the plan, and stop generating the day-trip version for gated places. Start with the 16 `effort: trek` cities and the Himalayan pilgrimage and high-altitude places (Kedarnath, Badrinath, Leh, Spiti Valley); expect about 25. Verify each against its official source and leave other places blank. | A plan that sends a family to Kedarnath for a day, or sightseeing on the arrival day in Leh, can cost a trip or their health. | The run planned Haridwar to Kedarnath as a day excursion (leave 07:30, darshan 13:30, trek 15:00, drive back 18:00) and Manali to Leh as a 4-hour drive followed by sightseeing. The "day excursion" rule is a straight-line distance of 130 km or less: 209 city pairs, 119 of them touching a hills or trek city. |
| P1.1 | **More curated trips**, chosen by the origins and circuits your first users have. The old notes name the 12 Jyotirlinga circuit, Golden Triangle and Ayodhya, Varanasi, Prayagraj and Lucknow. Use the admin tool. | Ready-made plans are the first-timer's front door, and the home page promises "spiritual circuits, coastal getaways and heritage trails". | 3 trips today, from Bengaluru and Delhi only. |
| P1.2 | **Plan-ahead notes and official links where they matter.** Add a short note (booking window, registration or permit, ID, dress code) and the official website to the cities that need one, starting with the Himalayan trek and major pilgrimage cities. Verify each against the official source and leave the rest blank. Show it in the city sheet and in virtual plans. It can share the sourcing work of P1.0. | Protects against missed bookings and fake booking sites, which is why the owner asked for `officialWebsite`. | Curated trips already show this; virtual trips do not. Only 43 of 615 attraction notes mention timings, fees or booking at all. |
| P1.6 | **Weather by month for every city:** average high, low and rainfall, shown as a small strip in the city sheet. Generate once with a script from ERA5 reanalysis and store 36 numbers per city in `data/cities.js`; no runtime calls. Because the native app will be paid, do not use Open-Meteo's free API (non-commercial only): use the Copernicus Climate Data Store (ERA5 moved to CC BY in July 2025; confirm commercial use on the dataset page) or a paid Open-Meteo plan. Spot-check the hill cities against IMD normals, since 11 to 25 km grid cells smooth out mountains. | "Which month?" is the first question about any trip. | The 145 cities hold no seasonal data. |
| P1.7 | **Best months and special days, honestly sourced.** Show best months and festival or crowd days on curated trip cards and the detail page, and flag a start date outside the best months. First re-derive the curated `bestMonths` from P1.6 plus P1.0, or label them unverified: today they are pasted AI text with empty `sources`. Add month-level special days (never exact dates, which move with the lunar calendar) with a source link, for about 25 places where crowds or closures change a plan. | Festival crowds can change a plan completely. | `bestMonths` is on 3 of 3 curated trips and `specialDays` on 2 of 3; neither is shown anywhere. |

## P2: Smoother planning

| ID | Item | Why it matters | Source |
|---|---|---|---|
| P2.1 | **Filters in the trip builder's city library** (state, setting, vibe, effort), reusing the passport filter sheet. | Picking from 145 cities is hard without them. The data exists; only the passport uses it. | `build_virtual_trip.md` §6 |
| P2.2 | **Food and culinary metadata, plus a food filter** (local cuisines, Jain and satvik availability). | Jain and satvik support is the differentiator, and cities carry no cuisine data. | Old backlog |
| P2.3 | **Return type** (round trip or one way) and **transit mode** (own car, cab, train, flight). | Open-jaw trips and train or flight plans are common. A final-day return is always generated today. | Roadmap §6 |
| P2.4 | **Store photos and attachments as separate records (Blobs)** instead of base64 inside the trip JSON. | Every "mark done" rewrites every photo, so photo-heavy trips will slow down. | Storage review |
| P2.5 | **Free-flow search on curated trips.** Worth doing once P1.1 grows the list. | Finding the right trip among many. | Old backlog |
| P2.6 | **Plan for elders, kids and fitness.** Party chips (family with elders, family with kids, friends, solo). Use each attraction's `mobility` (331 easy, 250 walk, 32 trek) and the city `effort` flag to leave out or warn on strenuous stops. The `party` tag cannot drive this: it is "any" on 609 of 615 attractions. | Pilgrimages with parents are a core use. Useful, but fewer travellers are blocked by its absence than by P0 and P1. | Data review |
| P2.7 | **Duration nudge:** warn when the trip has fewer days than cities. Needs no distance data. | Stops people building overpacked plans. | Roadmap Phase 2 |
| P2.8 | **Extra days in one city repeat the same attractions.** When a trip has more days than cities, each extra day lists the last city's attractions again (Leh on days 3 and 4 is identical). Spread the attractions across the days, or leave the spare days open for the traveller. | A repeated day looks careless and tells the traveller to do the same things twice. | Seen while checking P0.2: Manali to Leh in 4 days, Haridwar to Kedarnath in 4 days. |

## P3: Convenience and delight

| ID | Item | Notes | Source |
|---|---|---|---|
| P3.1 | **City landmark illustrations** (Taj for Agra, Red Fort for Delhi, and so on), replacing the type icons. Keep the existing city sheet design and keep the artwork data in `data/cities.js`. | Personality and recognition. | Owner |
| P3.2 | **Hotels, stations and airports per city** as Google Maps search links. A plain link cannot enforce the "5,000+ reviews" rule, so decide whether that matters. | Saves a search, little else. | `build_city_details.md` §4 |
| P3.3 | **Video language toggle** (English or Hindi). Depends on the audience question below. | The data has a language field; there is no user setting. | `build_city_details.md` §1 |
| P3.4 | **Drag chips between days** in the day plan. | Steps already reorder and delete; cross-day drag is a convenience. | Old backlog |
| P3.5 | **Explorer Quests in Passport (`visited.html`).** Curated cultural & geographical hit-lists (<15 cities each: 12 Jyotirlingas, Maha Vishnu, Sapta Moksha Puri, Sapta Nadi, Top 10 UNESCO, Maratha Forts, Toy Trains, etc.) with live stamp progress, quest banners, and passport badges. Steps 1-4 complete. See [explorer_quests_spec.md](explorer_quests_spec.md). | Transforms 145 destinations into inspiring, bite-sized travel quests instead of burying them inside generic filters; achieves >94% city coverage. | Spec doc |

## P4: Later, or not traveller-facing

| ID | Item | Notes |
|---|---|---|
| P4.1 | Dynamic attraction images (Wikimedia Commons or Unsplash). | Adds network dependence and attribution work, and conflicts with offline-first. |
| P4.2 | Food-specific videos per city. | Content effort. |
| P4.3 | Admin page to add cities, attractions, videos and nearby places. | Serves the owner, not travellers. |
| P4.4 | Update the Claude Doc review to the 7.5/10 re-rating (`6238e713-5651-406a-a568-4a4ad2ecab91`) and fix its stale facts: 1 curated trip (now 3), tests only for the admin tool (now 78 e2e). | Internal. |
| P4.5 | Repo hygiene: remove the one-off scripts in `scratch/` (48 files) and `scripts/` (32 files) and `fix.py`; turn off format-on-save for HTML in Visual Studio. | Internal. |
| P4.6 | Refresh `criticalusecases.md` (it still describes the old toolbar and button names) and add passport and sharing journeys. | Keeps regression checks honest. |
| P4.7 | Remove legacy storage paths once migration is no longer needed: the `kyt_state` check in `js/index.js`, the `localStorage` fallbacks for `kyt_stepsData`, and the cleanup line in `js/config.js`. | Less dead code. |
| P4.8 | Harden the share worker: use `crypto.getRandomValues` for the 6-character code and refuse to overwrite an existing key. | Collisions are rare. |

---

## Verify before the next release (checks on shipped work, not features)

| ID | Check | Why |
|---|---|---|
| V1 | **Passport share card on a real phone**, Android and iPhone. Only tested in a desktop browser so far. | It is the main way people show the passport to others. |
| V2 | **Storage on a real iPhone.** Plan a trip in Safari, then Add to Home Screen: is the data still there? Leave it unopened for a week: is it still there? | iOS storage rules differ between the Safari tab and the installed app, and the home page invites installing. |
| V3 | **Review `city-attributes-review.csv`** (the owner's judgments for all 145 cities; the file is not in the repo). | The passport filters and strength meters use `setting`, `vibes` and `effort`, and P1.0 and P2.6 will rely on `effort`. Today 16 cities are "trek", including Pushkar and Gokarna. |

## Open question for the owner

Who are the first hundred users, and in which language do they plan? If they are mostly Hindi or regional-language families planning pilgrimages with parents, the UI language and WhatsApp-first sharing could outrank much of this list. Nothing in the code or docs answers this, so it is not given a priority.

## Considered and deliberately not added

| Idea | Why not now |
|---|---|
| Own travel-time and route estimates | Google Maps does this live and better, its terms do not let us store its results, and tables built from OpenStreetMap raise licence questions for a paid app. Keep live Maps links (CHANGELOG 38). |
| Rail and flight times | No official, open, current source found; IRCTC publishes no public API we could confirm. Link out instead. |
| Budget and expense tracking | A separate product. KYT sequences and remembers; it does not manage money. |
| Hotel, train or flight booking, or booking-email import | Needs accounts and servers, which the app avoids. |
| Live weather forecast | Needs a network call and a provider. Monthly weather (P1.6) answers the planning question. |
| Offline maps | Not possible for Google Maps links; a large build otherwise. |
| AI chat planner | "Refine with AI" already covers it without a server. |
| Live co-editing between travellers | Needs sync and accounts. WhatsApp links cover sharing a plan. |
| Packing list generator | The trip notes field already invites packing reminders. Revisit if testers ask. |

## Parked by decision

| Item | Decision |
|---|---|
| **P5.1 Native mobile app with an unlimited local archive** | Planned, and the paid product. The archive of any number of past trips ships with the native app (roadmap Phase 5). The web app keeps the active trip or two, plus backup and restore (built, see CHANGELOG 34). |
| Accounts or cloud sync | Out of scope for the web app. May return with the native app if there is demand. |
| Bucket List and Explore modules | Removed and replaced by Virtual Trips (`requirements_notes.md`). |
| Starter packs for virtual trips | Covered by curated trips with "Edit as my plan". |

## Already done (listed as open in older docs)

Visited status and bragging-rights share card (passport), sharing customised trips without a server (short links plus compressed fallback), default journey anchors on virtual trips, 12 Jyotirlinga and Vishnu shrine audit, direct city sharing, rich city detail sheet with videos and nearby cities, search box reset on adding a city, distance estimates (distance matrix and travel legs), AI prompt generation and "Refine with AI", XSS escaping of step text.
