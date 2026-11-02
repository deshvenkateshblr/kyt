# KYT Admin: curated trips generator

A static tool (no server, no build). It turns AI output into `data/curated_trips.js`, the file KYT reads.

## Run it
Put the `admin/` folder in the KYT repo root, next to `data/` and `lib/`, then serve the repo and open `/admin/index.html`:

    python3 -m http.server 8000      # from the KYT repo root

It loads `../data/cities.js` for city ids. Without it the tool still works but cannot match cities.

## Workflow
1. **Curate Trip**:
   - **Origin & Destination Circuit**: Choose your starting point (e.g. Bengaluru, Delhi, Mumbai) and select ordered destination cities from the 159-city KYT catalog (e.g. Pune → Bhimashankar → Aurangabad → Nashik) with quick reorder and remove buttons, or choose from popular preset circuits.
   - **Trip Parameters**: Set duration (days), travel style/intent (Spiritual, Cultural, Nature/Adventure, Culinary, Mixed), food preference (Any, Vegetarian, Jain, Satvik/no onion-garlic), pace (Relaxed, Standard, Deep), and faith.
   - **Curator Guidance**: Click verified quick twist chips (morning darshan timings, pure satvik food, senior-friendly, temple afternoon closures) or enter custom instructions.
   - **Generate**: Click **"📋 Copy Prompt & Open Gemini ↗"** to 1-click copy the prompt (which embeds candidate beats and verified Google Maps links from KYT's catalog) and launch Gemini web, or click **"⚡ Generate with Gemini API"** to run directly in-page.
   - **Ingest & Instant Preview**: Paste Gemini's response (or paste from clipboard) to view a live timeline preview showing day-by-day steps, verification issues, and Google Maps links, then click **"✓ Add to Curated Library"**.
   - *(Optional Ideas Brainstorming)*: An expandable brainstorm section is available if you prefer Gemini to propose 12 destination ideas from scratch.
2. **Review & Edit**:
   - Inspect and edit every trip in your library: title, tagline, tags, transportation notes, Before You Go prerequisites, Special Days, and day-by-day activities.
   - Click "Open Maps link" to spot-check locations.
   - Make variations with Gemini (e.g. relaxed pace, Jain-friendly, monsoon edition).
   - Click **"✓ Approve for Export"** when satisfied.
3. **Curated Library & Export**:
   - View library summary with approved/draft counters.
   - Click **"📥 Download curated_trips.js"** to generate the production file for KYT, or copy the JS directly.
   - Import existing `curated_trips.js` or backup JSON files to update the library.


The admin applies no editorial limits (days, travel time, how packed a day is). It only blocks a missing title or no days, and it still strips HTML and allows only https Google Maps links, since AI text is untrusted. Editing an approved trip returns it to draft.

### Tags KYT can filter on
Each trip carries `taste.intent`, `faiths[]`, `taste.pace`, `taste.diet`, `audience[]`, `budget`, `transport.mode`, `transport.approxTravelHours`, `bestMonths[]`, `track` (theme label) and `kind` (weekend or long-weekend, from its length). `ideaId` and `variantOf` link trips from the same idea.

### Before you go and special days (mainly for spiritual trips)
- `beforeYouGo: [{ type: booking|id|dress|rules|timing|other, text }]`: hard prerequisites such as darshan booking windows, original ID, dress code, phone and camera rules, permits.
- `specialDays: [{ name, when, effect: festival|special-darshan|closed|crowded|other, note }]`: festivals, special darshan or seva days, weekly specials, closures, crowd peaks. Many follow the lunar calendar, so `when` is the occasion and usual months, not exact dates; show it with a "confirm with the temple" line.
Both are empty lists when not relevant. A spiritual trip with neither gets an info note in Review (never a block).

## Output file
    window.KYT_CURATED_TRIPS_SCHEMA = 1;
    window.KYT_CURATED_TRIPS_GENERATED_AT = "<ISO>";
    window.KYT_CURATED_TRIPS = [ { id, rev, status, title, tagline, track, ideaId, variantOf, originCity, originName, kind, durationDays,
      bestMonths:[1..12], taste:{intent,diet,pace}, faiths[], audience[], budget, transport:{mode,note,approxTravelHours},
      cities[], highlights[], tips[], beforeYouGo[], specialDays[], sources[{name,url}], generated{via,model,at},
      days:[{ day, title, cityId, cityName, steps:[{ title, where, hour, minute, icon, mapsUrl, mapsAuto?, notes, durationMin?, verify[] }] }] } ];

`taste`, `cities` and icons use KYT's own vocabulary and ids. `mapsAuto: true` means the link is a Maps search made by the tool, not one the AI supplied.

## Reading it in KYT
    <script src="data/curated_trips.js"></script>   <!-- before your page script -->

    var trips = window.KYT_CURATED_TRIPS || [];
    // Real trip: steps in the shape KYT's main store uses
    steps = toKytSteps(trip, startDate);       // see admin/core.js
    // Virtual trip record for the Virtual Trips screen
    vt = toVirtualTrip(trip);                  // see admin/core.js

Copy those two functions from `core.js` (they have no dependencies) rather than loading all of it. Add `data/curated_trips.js` to the service worker cache list.

**Important for KYT:** treat every string as text. Render with `textContent` or escape it. The admin strips HTML and restricts links to https Google Maps, but the file is data, not trusted markup.

## Tools in this folder
- **`index.html`**: Curated trips generator and library reviewer.
- **`places.html`**: Place ID Manager. View progress, search and lookup Google Place IDs using the free Place ID Finder, bulk-import IDs, and download/update `data/cities.js`.

## Tests
    node admin/tests/core.test.js     # 57 unit tests; try TZ=Asia/Kolkata and TZ=America/Los_Angeles

## Known limits
- Gemini call uses the Interactions endpoint and a model name you can edit. It was tested only against a mock, not the live API.
- Map links and opening hours from AI can be wrong. Always spot-check approved trips.
- Check Google's terms on Maps-grounded output (attribution, storage) before shipping content generated that way.
- Six icon names used in KYT's own city data (adventure, water, tree, museum, monument, island) are not valid lucide icons; the admin only offers icons verified to exist.
