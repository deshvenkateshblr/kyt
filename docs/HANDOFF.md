# KYT handoff (31 Oct 2026, service worker cache `kyt-v94`, master at `a974f18`)

Start a fresh review from here. The full backlog is [TODO.md](TODO.md); what shipped is in [CHANGELOG.md](CHANGELOG.md) (entries 45 to 56 are this thread).

## Where things stand
- **Repo:** `github.com/deshvenkateshblr/KYT`, zero-server PWA (vanilla JS, Tailwind CDN, Lucide, `sw.js`), hosted at vividnova.com/KYT. Clean tree, all pushed.
- **Tests:** `NODE_PATH=/opt/npm-tools/node_modules node --test --test-concurrency=1 "tests/e2e/*.test.js"` (137 pass; `KYT_PW_TIMEOUT` shortens waits). Bumping a version means `sw.js` `CACHE_NAME` and `js/footer.js` `APP_VERSION` together (a test enforces it).
- **Git flow:** commit on master, `git fetch origin master`, rebase if behind, `git push origin HEAD:master`.

## The virtual trip model (built by hand, suggestions carry the intelligence)
- Flow: name the trip, pick cities (nearest first), choose where you start, "Plan the days". Setup is only Destinations and From.
- Day Plan: one tab per day (sticky), a city per day, suggestions from each city's `beats` sorted by style, three step types (stop, stay, travel), "Suggest a plan" fills only empty days.
- Travel steps: From and To type-ahead, mode, duration, overnight tick box, live Google Maps directions link (new tab). Hints: arrive, travel to next city, overnight travel, stay, return home.
- Bottom bar: "Plan Day N" while a day is empty; View trip and Start this trip only when every day has a step.
- Trip data: `trip = {id, name, originCity, cities[], days:[{id, cityId}], taste, steps[], ...}`; code is in `js/virtual-trips.js`, markup in `virtual_trip.html`, shared cards and the city sheet in `js/ui-components.js`.
- Access notes (`access` in `data/cities.js`): Kedarnath, Chopta, Leh, Kohima, Tawang, Ziro, Badrinath, Spiti Valley. Shown in the city sheet and the Day Plan; trek or altitude places are never a day trip.

## Pending, in suggested order
1. **P1.0 rest:**
   - Verify at an official source and add Sonamarg, Kargil, and the Manali to Leh and Srinagar to Leh road windows. Only old or press sources were found (Zojila closure article is from 2017, Manali to Leh from 2024).
   - Use the month windows (`closed`) to warn when a trip has a start date.
   - Add an arrival-day rest step for altitude places (Leh, 48 h).
   - The Kedarnath and Chopta "usually closed Nov to Apr" windows are approximate; Badrinath and Spiti rest on press reports.
2. **P1.8 leftovers:** fold the trip page's city cards and Video Gallery into the day tab; Stay needs check-out and nights; generated Return and arrival travel steps should carry from and to; reordering cities after steps exist (arrows hide once a plan has steps; changing a day's city is locked once the day has steps); P1.0 badges on suggestions and travel steps.
3. **P1.9:** more than one city in a day.
4. **Known gaps from this thread:**
   - Suggest a plan assumes the default city order when mapping days to cities.
   - Other cities are probably as thin in `beats` as Mumbai was (it was topped up with temples).
   - P2.8: extra days in a city repeat the same attractions.
   - The step editor's "About N km apart by road" hint only knows cities in the data.
   - Day Plan has had no visual check at desktop width beyond one screenshot, and nothing was tried on a real iPhone (the footer is one line only by measurement at 390 px).
5. **Content and later:** P1.1 more curated trips, P1.2 plan-ahead notes, P1.6 weather by month, P1.7 best months, V3 review of `city-attributes-review.csv` (`effort: trek` is unreliable, wrong for Pushkar and Gokarna among others); P2 and P3 items are in TODO.md.

## Things worth knowing
- `generateSteps` is still exported and used by tests and "Suggest a plan"; the old stay modal, regenerate and "rebuild keeping edits" paths are gone.
- The sticky day tabs use `-top-4` because the scroll container has 16 px padding.
- City cards show an "N videos" link (a real `?city=<id>` anchor); the city sheet opens in place on a plain click.
- Sources for each access note are in the data (`access.source`), so they can be re-checked.
