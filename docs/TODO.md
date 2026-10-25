# KYT: Prioritized TODO

The single list of open work. Done work is in [CHANGELOG.md](CHANGELOG.md). Design intent and architecture are in [kyt_product_specification_roadmap.md](kyt_product_specification_roadmap.md).
Last reviewed: 24 Oct 2026, against service worker cache `kyt-v53`.

**How to use this file:** keep every open item here and nowhere else. When something ships, move it to the changelog. Other docs link here instead of keeping their own TODO lists.

**How priorities are set:** by what the traveller gains, meaning how many travellers need it and how much its absence hurts, not by effort or technical tidiness. The ranking is judgement from the app's data and code, not user research. Check it against three to five real first-time users before committing to a big item.

**Working rules:** keep the existing city sheet design, avoid added complexity, avoid cheesy labels, and keep curated facts in `data/cities.js` rather than in code. A new city needs `setting`, `vibes` and `effort` (a test fails without them). Adding a file under `js/` means adding it to the `sw.js` precache list and bumping the cache version.

---

## Let us add a feedback email link to footer of all pages.

## The traveller's journey: what exists and what is missing

| Stage | What the traveller asks | KYT today | Gap |
|---|---|---|---|
| Find a plan | "What can I do in 3 days from my city?" | 145 cities. 3 curated trips (two Tirupati, one Mathura and Vrindavan), from Bengaluru and Delhi. | Few ready-made plans |
| Pick the time | "Is this a good month? Will it be crowded?" | Every curated trip stores best months, and two of three store festival and crowd days. **Nothing shows them.** The 145 cities hold no seasonal information. | Hidden, or missing |
| Check it fits | "How long is the drive? Can I do this in 4 days?" | A Google Maps link per leg. No travel time, and no check of the plan against the days. | Missing |
| Suit the group | "My parents can't climb. We have kids." | Each attraction shows an access badge (easy, walk, trek). Plans do not use it. | Not used |
| Prepare | "What do I book, carry and wear?" | Curated trips show a Before You Go list and tips. Virtual trips show nothing. | Missing for virtual trips |
| Travel | "What is next? Where are my tickets?" | Now view, attachments, offline use. | Works |
| Remember and share | "Show the trip, keep the photos, tell my friends." | Album, PDF memory card, passport share card, WhatsApp short links. | Works. Everything lives only on the device |

---

## P0: Needed by almost every traveller on every trip

| ID | Item | Why it matters | Evidence |
|---|---|---|---|
| P0.1 | **Show best months and special days.** Display them on curated trip cards and the detail page, and flag a start date outside the best months. | "Which month?" is the first question about any Indian trip, and a festival can change a plan completely. This costs little because the data is already written. | `bestMonths` on 3 of 3 curated trips and `specialDays` on 2 of 3; neither is rendered anywhere in the code. |
| P0.2 | **Plan for elders, kids and fitness.** Add party chips (family with elders, family with kids, friends, solo). Use each attraction's `mobility` (331 easy, 250 walk, 32 trek) and the city `effort` flag (16 trek cities) to leave out or warn on strenuous stops. | Pilgrimages with parents are a core use, and today a plan can send an elder up a trek without a word. | `mobility` is shown as a badge but never used to build a plan. The `party` tag cannot drive this: it is "any" on 609 of 615 attractions. |
| P0.3 | **Travel time per leg, and a fit check** that warns when the trip has fewer days than cities. **Decision needed:** the distance table is straight-line, so either show rough times labelled as estimates (keeping the Maps link), or curate road hours for common routes. A confident wrong number hurts trust more than none. | "How long is the drive?" decides whether a plan is realistic. | Curated steps carry `durationMin`; virtual-trip legs show only a Maps link. |

## P1: A confident first trip, and not losing what you built

| ID | Item | Why it matters | Evidence |
|---|---|---|---|
| P1.1 | **More curated trips**, chosen by the origins and circuits your first users have. The old notes name the 12 Jyotirlinga circuit, Golden Triangle and Ayodhya, Varanasi, Prayagraj and Lucknow. Use the admin tool. | Ready-made plans are the first-timer's front door, and the home page promises "spiritual circuits, coastal getaways and heritage trails". | 3 trips today, from Bengaluru and Delhi only. |
| P1.2 | **Plan-ahead notes and official links where they matter.** Add a short note (booking window, registration or permit, ID, dress code, seasonal closure) and the official website to the cities that need one, starting with the Himalayan trek and major pilgrimage cities, where a missed booking can cancel the trip. Verify each against the official source and leave the rest blank. Show it in the city sheet and in virtual plans. | Protects against missed bookings and fake booking sites, which is why the owner asked for `officialWebsite`. | Curated trips already show this; virtual trips do not. Only 43 of 615 attraction notes mention timings, fees or booking at all. |
| P1.3 | **Backup before "End Trip".** Ending a trip permanently deletes its steps, notes, attachments and photos. Offer a full backup download first. The unlimited archive waits for the native app (P5.1). | One tap erases the memory book. | `config.js` end-trip flow; the current export leaves out attachments and photos. |
| P1.4 | **One backup and restore for everything:** passport, virtual trips and the current trip in a single file. | A traveller who has marked 40 cities loses them all by clearing browser data or changing phones. | Only the current trip exports today. |
| P1.5 | **Storage safety.** Request persistent storage after the first save and show a clear message when a save fails. Add a plain "saved on this device only" note. | A failed save is silent for virtual trips and the passport, and unprotected data can be evicted. | `saveVTrips()` has no error handling; `navigator.storage.persist()` is never called. |

## P2: Smoother planning

| ID | Item | Why it matters | Source |
|---|---|---|---|
| P2.1 | **Filters in the trip builder's city library** (state, setting, vibe, effort), reusing the passport filter sheet. | Picking from 145 cities is hard without them. The data exists; only the passport uses it. | `build_virtual_trip.md` §6 |
| P2.2 | **Food and culinary metadata, plus a food filter** (local cuisines, Jain and satvik availability). | Jain and satvik support is the differentiator, and cities carry no cuisine data. | Old backlog |
| P2.3 | **Return type** (round trip or one way) and **transit mode** (own car, cab, train, flight). | Open-jaw trips and train or flight plans are common. A final-day return is always generated today. | Roadmap §6 |
| P2.4 | **Store photos and attachments as separate records (Blobs)** instead of base64 inside the trip JSON. | Every "mark done" rewrites every photo, so photo-heavy trips will slow down. | Storage review |
| P2.5 | **Meal collision suppression** when a food-walk beat already covers a meal, plus gentle timing badges on curated steps. Verify what is already done. | Cleaner generated days. | Roadmap Phase 3 |
| P2.6 | **Free-flow search on curated trips.** Worth doing once P1.1 grows the list. | Finding the right trip among many. | Old backlog |

## P3: Convenience and delight

| ID | Item | Notes | Source |
|---|---|---|---|
| P3.1 | **City landmark illustrations** (Taj for Agra, Red Fort for Delhi, and so on), replacing the type icons. Keep the existing city sheet design and keep the artwork data in `data/cities.js`. | Personality and recognition. | Owner |
| P3.2 | **Hotels, stations and airports per city** as Google Maps search links. A plain link cannot enforce the "5,000+ reviews" rule, so decide whether that matters. | Saves a search, little else. | `build_city_details.md` §4 |
| P3.3 | **Video language toggle** (English or Hindi). Depends on the audience question below. | The data has a language field; there is no user setting. | `build_city_details.md` §1 |
| P3.4 | **Drag chips between days** in the day plan. | Steps already reorder and delete; cross-day drag is a convenience. | Old backlog |
| P3.5 | **Explorer Quests in Passport (`visited.html`).** Curated cultural & geographical hit-lists (<15 cities each: 12 Jyotirlingas, Maha Vishnu, Sapta Moksha Puri, Sapta Nadi, Top 10 UNESCO, Maratha Forts, Toy Trains, etc.) with live stamp progress, quest banners, and passport badges. Steps 1-3 complete; Step 4 (hero badges & canvas share card stamps) up next. See [explorer_quests_spec.md](explorer_quests_spec.md). | Transforms 145 destinations into inspiring, bite-sized travel quests instead of burying them inside generic filters; achieves >94% city coverage. | Spec doc |

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
| V3 | **Review `city-attributes-review.csv`** (the owner's judgments for all 145 cities; the file is not in the repo). | The passport filters and strength meters use `setting`, `vibes` and `effort`, and P0.2 will warn on `effort`. Today 16 cities are "trek", including Pushkar and Gokarna. |

## Open question for the owner

Who are the first hundred users, and in which language do they plan? If they are mostly Hindi or regional-language families planning pilgrimages with parents, the UI language and WhatsApp-first sharing could outrank much of this list. Nothing in the code or docs answers this, so it is not given a priority.

## Considered and deliberately not added

| Idea | Why not now |
|---|---|
| Budget and expense tracking | A separate product. KYT sequences and remembers; it does not manage money. |
| Hotel, train or flight booking, or booking-email import | Needs accounts and servers, which the app avoids. |
| Live weather forecast | Needs a network call and a provider. Best months (P0.1) answer the planning question. |
| Offline maps | Not possible for Google Maps links; a large build otherwise. |
| AI chat planner | "Refine with AI" already covers it without a server. |
| Live co-editing between travellers | Needs sync and accounts. WhatsApp links cover sharing a plan. |
| Packing list generator | The trip notes field already invites packing reminders. Revisit if testers ask. |

## Parked by decision

| Item | Decision |
|---|---|
| **P5.1 Native mobile app with an unlimited local archive** | Planned. The archive of any number of past trips ships with the native app (roadmap Phase 5). The web app keeps the active trip or two, plus backup and restore (P1.3 to P1.5). |
| Accounts or cloud sync | Out of scope for the web app. May return with the native app if there is demand. |
| Bucket List and Explore modules | Removed and replaced by Virtual Trips (`requirements_notes.md`). |
| Starter packs for virtual trips | Covered by curated trips with "Edit as my plan". |

## Already done (listed as open in older docs)

Visited status and bragging-rights share card (passport), sharing customised trips without a server (short links plus compressed fallback), default journey anchors on virtual trips, 12 Jyotirlinga and Vishnu shrine audit, direct city sharing, rich city detail sheet with videos and nearby cities, search box reset on adding a city, distance estimates (distance matrix and travel legs), AI prompt generation and "Refine with AI", XSS escaping of step text.
