# Rich City Detail Pages - Enhancement Plan

> **Status note (24 Oct 2026):** this is a design reference. Open items from it (sections 1, 4 and 6) are tracked only in [TODO.md](TODO.md) (P3.3, P3.2, P1.2). Sections 2, 3 and 5 are done.

This document outlines the roadmap and features to be implemented for the "Rich City Detail" slide-over view. The goal is to make each city page highly immersive, shareable, and actionable for users building their virtual trips.

## 1. YouTube Video Header Carousel
**Goal:** Replace the static image header placeholder with an embedded, interactive YouTube video player to give users a virtual preview of the city.
**Details:**
*   Create a new data file `data/city_videos_data.js` via a curation script (using `yt-dlp` to fetch metadata).
*   **Language Filter:** The script currently enforces English explicitly by parsing `data.language` to reject non-English vlogs, as the query search alone is insufficient.
*   **TODO:** Build an interactive UI settings toggle for users to set their preferred language (e.g., English, Hindi). The fetch script and `city_videos_data.js` structure will need to be updated to map multiple languages per city so that the UI can pick the relevant localized video array.
*   Implement a carousel UI in the header (with previous/next buttons) allowing users to swipe through or click through multiple videos of the city right inside the slide-over.

## 2. Expanded Attraction Details
**Goal:** Provide deeper context for the top attractions directly within the slide-over.
**Details:**
*   Currently, the "Top Attractions" section shows the title and a brief note/location.
*   Verify and validate the extended data available for each attraction (beats).
*   Implement an expansion mechanism (or richer card layout) to display these expanded details so users don't have to leave the page to understand why an attraction is significant.

## 3. Direct City Sharing
**Goal:** Allow users to share a specific destination directly with friends.
**Details:**
*   Add a prominent "Share" button to the City Detail slide-over (perhaps next to the title or in the header).
*   Clicking this will generate a link that points directly to this specific city's detail page (e.g., using a URL hash parameter like `#city=agra`).
*   When a recipient opens the link, the app will automatically launch and slide open this specific city's view.

## 4. Prominent POIs via Google Maps (Hotels & Restaurants)
**Goal:** Help users visualize the local infrastructure by surfacing highly-rated establishments.
**Details:**
*   Figure out a strategy to query or link to prominent places, hotels, and restaurants.
*   **Constraint/Filter:** Only show establishments with a minimum of 5,000 reviews to ensure high quality and relevance.
*   *Implementation Strategy:* Since KYT is zero-server, this may involve constructing highly specific Google Maps Search URLs (e.g., `https://www.google.com/maps/search/Hotels+in+Agra/`), or pre-curating a lightweight dataset of top-tier hotels/restaurants per city.


## 5. Spiritual & Religious Coverage Validation
**Goal:** Ensure comprehensive coverage of highly significant religious sites and circuits across India.
**Details:**
*   **TODO:** Audit the `cities.js` database to guarantee all 12 Jyotirlinga temple locations are documented and appropriately tagged.
*   **TODO:** Ensure major Vishnu shrines and prominent Yatra circuit destinations (e.g., Char Dham) are fully represented as cities or major attractions within their respective regions.

## 6. Official Websites for Attractions
**Goal:** Protect users from fake booking sites and misinformation by providing authoritative sources.
**Details:**
*   **TODO:** Expand the attraction (`beats`) data schema to include a new `officialWebsite` field.
*   **TODO:** For major monuments and temples, source and populate the verified official domain (e.g., official temple trust sites, ASI ticket portals).
*   Surface this link prominently in the "Expanded Attraction Details" UI within the slide-over.

