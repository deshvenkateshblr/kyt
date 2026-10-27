# KYT functional tests

End-to-end tests that drive the real pages in a headless, phone-sized Chromium (390x844, touch).
Functionality only: no screenshots or styling checks. External requests (Google Fonts, pdfmake CDN)
are blocked so runs are hermetic and work offline.

    npm install            # installs Playwright; then once:  npx playwright install chromium
    npm run test:e2e       # 54 tests, about 2 minutes
    npm test               # admin unit tests + e2e

Set KYT_CHROMIUM=/path/to/chrome to use an existing browser binary.

| File | Journeys covered |
|---|---|
| 01-trip-engine | launcher states, first-time save, add/edit/reorder/delete steps, Now view (prev/next/first/last, done auto-advance, in-progress), end trip and passport stamp |
| 02-share-and-memories | export/import round trip, bad file, attachments (link, 2 MB cap, 4 max), photo memory, completion prompt |
| 03-virtual-trips | hub, city search (aliases, ranking), day plan, taste filters, "Use as my trip" with start date, overwrite prompt, share-link import, city deep link |
| 04-passport-curated-pwa | passport mark/filter/sort/date/undo, curated list, preview, open in Virtual Trips, share link, offline shell and offline editing, manifest, catalog integrity |
| 07-generated-plans | the problem scenarios and 400 random trips generate plans with no contradictions (no same-time steps, time-of-day beats keep their time, one lunch a day, no overnight stay before the return), and the generated-plan notice shows on the builder and plan page but not on curated trips |
| 08-trip-setup | a new empty trip raises no alerts (Stays & Days, Day Plan and Share wait for a first destination), the Start & Style card (own card, honest summary, Done, opens only while the starting point is missing), header follows the cities |

Note: tests that reload the page wait for the IndexedDB write to settle first (`waitForSaved` in helpers.js); without that pause a reload within a few ms of a save was seen to return the old value about 1 run in 40.
