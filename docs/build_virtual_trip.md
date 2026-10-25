# Next Iteration: Virtual Trip Enhancements

> **Status note (24 Oct 2026):** this is a design reference. Sections 1, 2, 3 (magic link) and 5 are built. Still open: the library filters from section 6 (TODO P2.1), attraction images from section 4 (TODO P4.1) and a `.json` export and import for virtual trips (covered by TODO P1.4). Open items are tracked only in [TODO.md](TODO.md).

This document outlines the next set of requirements and features to be implemented for the Virtual Trips functionality in KYT (Know Your Travel).

## 1. City Distance Estimation
**Goal:** Provide users with an estimate of distances between cities added to their virtual trip.
**Details:**
*   When multiple cities are added to the "Canvas", automatically display the travel distance between consecutive cities.
*   Display these estimates in the UI (e.g., in the Builder or Canvas view) so users can gauge the feasibility of their itinerary.
*   *Implementation idea:* To group cities by proximity logically (the way humans think), first introduce `state` and `district` fields into the `cities.js` dataset. Sorting cities by State and District will provide an automatic, highly accurate first approximation of proximity and regional circuits. We can then pre-generate a distance matrix strictly for these grouped circuits.
*   *Action Item:* Validate this state/district grouping matrix idea before full implementation.

## 2. AI Travel Plan Prompt Generation
**Goal:** Allow users to easily generate an optimal travel plan using an external AI tool, ensuring the output is perfectly formatted to be imported back into KYT.
**Details:**
*   Add a feature to generate an "AI Prompt" based on the user's selected cities, dates, and trip features (taste/vibe).
*   The prompt must include explicit instructions for the AI to format its output in a specific JSON structure (or similar) that KYT can natively parse.
*   Users can copy this prompt, paste it into an LLM (like ChatGPT or Gemini), and then copy-paste the resulting itinerary back into KYT to instantly populate their steps.

## 3. Share, Export, and Import Virtual Trips
**Goal:** Introduce seamless, serverless sharing for Virtual Trips so users can collaborate and start from curated inspiration.
**Details:**
*   **The Magic Link (URL Payload):** Allow users to share their drafted Virtual Trip via a compressed URL hash. Because Virtual Trips are lightweight (arrays of City IDs and a Taste Profile), the entire state can be encoded in a shortlink. Opening the link automatically hydrates the receiver's canvas.
*   **Bundled Starter Packs:** Ship the app with pre-created templates (e.g., *The Himalayan Retreat*, *The UP Heritage Trail*). Users can click a template to clone it into their private canvas and tweak it before generating the final itinerary.
*   **JSON Export/Import:** As a fallback for heavy trips with extensive notes, provide an option to download and upload `.json` files, mirroring the existing Configure Trip logic.

## 4. Rich City Detail Pages
**Goal:** Create an immersive view for each city that helps users expand their trip logically.
**Details:**
*   When a user clicks on a city card, trigger a **mobile-friendly, full-screen slide-over** overlay.
*   This view will act as a beautiful showcase, displaying nicely laid out images of the city's attractions alongside their descriptions.
*   Dynamically display a "Nearby Tourist Cities" section at the bottom, using the pre-generated distance matrix to show exactly how many kilometers away neighboring cities are (e.g., "Agra - 220km away").
*   Provide one-click "Add to Trip" buttons for both the core city and the nearby recommended cities.
*   **TODO / Action Item:** Collecting specific images for all attractions is tedious. When implementing this, we should rely on programmatic fetching. 
    *   *Image Source Strategy:* Use the **Wikimedia Commons API** (excellent for specific historical Indian landmarks) or the **Unsplash API** (using `${cityName} ${attractionName}` as search keywords) to dynamically fetch and cache images, rather than hardcoding hundreds of URLs.
## 5. Search Box UX Reset
**Goal:** Improve the user experience when adding cities from search results.
**Details:**
*   Currently, when a user searches for a city (e.g., "Agra") and clicks "Add", the search term remains in the input box. Because the city is removed from the available library, the library suddenly shows "No cities found".
*   **Action:** When a city is added to the canvas, automatically clear the search box (`input.value = ''`) and re-render the library so all remaining cities surface back immediately.

## 6. State Filter for City Library
**Goal:** Allow users to filter the available cities by State.
**Details:**
*   Implement a state filter UI (similar to the existing Travel Style / Taste Profile filter chips) in the Virtual Trip Hub or Canvas.
*   This will leverage the newly added `state` data in `cities.js` and allow users to quickly drill down into destinations within a specific region (e.g., clicking "Kerala" instantly filters the library to only show Munnar, Alleppey, Wayanad, etc.).
