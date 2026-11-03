"""
enrich_kyt_places.py
Resolves accurate Google Maps Place IDs, Feature IDs (ftid), and canonical Place URLs
for window.KYT_CITIES without requiring a Google Maps API key.

Key capabilities:
- Mathematical 1-to-1 conversion from Google Feature ID (0x...:0x...) to canonical ChIJ Place ID
- Haversine distance sanity checks against parent city coordinates
- Caching in places_cache.json to avoid redundant lookups
- CLI options for batching: --city <id>, --limit <n>, --skip-beats, --in-place, --delay <sec>

Run:
  py -3.9 admin/enrich_kyt_places.py --city ujjain
  py -3.9 admin/enrich_kyt_places.py --limit 5
"""

import argparse
import base64
import json
import math
import os
import re
import struct
import sys
import time
from pathlib import Path
from urllib.parse import unquote, urlparse, parse_qs, quote_plus

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent
INPUT_JS_PATH = BASE_DIR / "data" / "cities.js"
OUTPUT_JS_PATH = BASE_DIR / "data" / "cities.enriched.js"
CACHE_PATH = BASE_DIR / "admin" / "places_cache.json"

# Queries in mapsUrl that are generic dishes/activities rather than places;
# for these, combining with the 'where' field gives a much better place match.
GENERIC_QUERIES = {
    "Hyderabad Biryani",
    "Alleppey Houseboat",
    "Amritsari Kulcha, Amritsar",
    "Lonavala Chikki",
    "Aurangabad Naan Qalia",
    "Bhubaneswar Odia Thali",
    "Guwahati Assamese Thali",
    "Thanjavur Painting",
    "Havelock Bioluminescence",
    "Badami Rock Climbing",
}

# Cities where assigning administrative Place ID overrides the recognized name
# (e.g., Omkareshwar's placeId forces Google Maps directions to show 'Mandhata')
EXCLUDED_CITY_PLACE_IDS = {"omkareshwar"}


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two lat/lng points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def ftid_to_place_id(ftid_str):
    """
    Deterministically convert Google Maps Feature ID '0x...:0x...' to canonical 'ChIJ...' Place ID.
    Google Place IDs are base64-encoded protobufs of the two 64-bit integer components of the feature ID.
    """
    if not ftid_str:
        return None
    match = re.search(r'0x([0-9a-fA-F]+):0x([0-9a-fA-F]+)', ftid_str)
    if not match:
        return None
    try:
        f1 = int(match.group(1), 16)
        f2 = int(match.group(2), 16)
        buf = b'\x0a\x12\t' + struct.pack('<Q', f1) + b'\x11' + struct.pack('<Q', f2)
        return base64.urlsafe_b64encode(buf).decode('ascii').rstrip('=')
    except Exception:
        return None


def get_clean_search_query(item, parent_city_name=None):
    """Extract the clean query from existing mapsUrl, with fallback to where/name."""
    maps_url = item.get("mapsUrl", "")
    parsed = urlparse(maps_url)
    qs = parse_qs(parsed.query)
    q = unquote(qs.get("query", [""])[0]).strip()

    if not q:
        if parent_city_name:
            q = f"{item.get('title', '')}, {item.get('where', parent_city_name)}"
        else:
            q = f"{item.get('name', '')}, {item.get('state', 'India')}"

    # If the query is a generic food/activity name, anchor it to the 'where' locality
    if parent_city_name and q in GENERIC_QUERIES:
        where = item.get("where", parent_city_name)
        q = f"{where}, {parent_city_name}"

    return q


def resolve_place_on_gmaps(page, query, expected_lat=None, expected_lng=None):
    """Navigate Google Maps search and extract canonical place data from the URL/payload."""
    search_url = f"https://www.google.com/maps/search/{quote_plus(query)}?hl=en"
    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
    except Exception as e:
        print(f"      [!] Page load timeout for '{query}': {e}")
        return {
            "query": query,
            "resolvedName": query,
            "placeId": None,
            "ftid": None,
            "lat": None,
            "lng": None,
            "distanceKm": None,
            "canonicalMapsUrl": f"https://www.google.com/maps/search/?api=1&query={quote_plus(query)}",
        }

    # 1. Wait up to 4s to see if Google Maps auto-redirects to a single /maps/place/ URL
    try:
        page.wait_for_url(re.compile(r"/maps/place/"), timeout=4000)
    except Exception:
        # 2. If it stayed on /maps/search/, click the top place result in the left panel
        try:
            first_link = page.locator('a[href*="/maps/place/"]').first
            if first_link.count() > 0:
                first_link.click()
                page.wait_for_url(re.compile(r"/maps/place/"), timeout=5000)
        except Exception:
            pass

    # Brief pause for URL state (!1s0x...:0x... and @lat,lng) to settle
    time.sleep(1.2)
    current_url = page.url

    # Extract ftid (e.g. 0x39747121d702ff6d:0xdd2ae4803f767dde)
    ftid_match = re.search(r'!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)', current_url)
    ftid = ftid_match.group(1) if ftid_match else None

    # Extract resolved coordinates (!3dLAT!4dLNG is the exact pin; @LAT,LNG is viewport)
    pin_coord_match = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', current_url)
    view_coord_match = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', current_url)

    resolved_lat, resolved_lng = None, None
    if pin_coord_match:
        resolved_lat = float(pin_coord_match.group(1))
        resolved_lng = float(pin_coord_match.group(2))
    elif view_coord_match:
        resolved_lat = float(view_coord_match.group(1))
        resolved_lng = float(view_coord_match.group(2))

    # Extract Place Name from /maps/place/<Name>/
    name_match = re.search(r'/maps/place/([^/@]+)', current_url)
    resolved_name = unquote(name_match.group(1).replace("+", " ")) if name_match else query

    # Mathematically compute ChIJ Place ID from ftid
    place_id = ftid_to_place_id(ftid)

    # Distance sanity check against parent city coordinates
    distance_km = None
    if expected_lat and expected_lng and resolved_lat and resolved_lng:
        distance_km = round(haversine_km(expected_lat, expected_lng, resolved_lat, resolved_lng), 1)

    # Construct clean, universal canonical Google Maps Place URL
    if place_id:
        canonical_url = f"https://www.google.com/maps/search/?api=1&query={quote_plus(query)}&query_place_id={place_id}"
    elif ftid:
        canonical_url = f"https://www.google.com/maps/place/{quote_plus(resolved_name)}/data=!4m2!3m1!1s{ftid}"
    else:
        canonical_url = f"https://www.google.com/maps/search/?api=1&query={quote_plus(query)}"

    return {
        "query": query,
        "resolvedName": resolved_name,
        "placeId": place_id,
        "ftid": ftid,
        "lat": resolved_lat,
        "lng": resolved_lng,
        "distanceKm": distance_km,
        "canonicalMapsUrl": canonical_url,
    }


def load_cities_js(filepath):
    """Load window.KYT_CITIES and preserve prefix/suffix code."""
    with open(filepath, "r", encoding="utf-8") as f:
        raw = f.read()
    # Match the array block between window.KYT_CITIES = and the closing semicolon
    match = re.search(r'^(window\.KYT_CITIES\s*=\s*)(\[\s*\{[\s\S]*?\}\s*\])(\s*;[\s\S]*)$', raw)
    if match:
        prefix = match.group(1)
        cities_json = match.group(2)
        suffix = match.group(3)
        return json.loads(cities_json), prefix, suffix
    
    # Fallback search
    match2 = re.search(r'window\.KYT_CITIES\s*=\s*(\[\s*\{[\s\S]*?\}\s*\])\s*;', raw)
    if not match2:
        raise ValueError(f"Could not parse window.KYT_CITIES array from {filepath}")
    return json.loads(match2.group(1)), "window.KYT_CITIES = ", ";\n"


def save_cities_js(cities_data, filepath, prefix="window.KYT_CITIES = ", suffix=";\n"):
    """Write back cities array preserving catalog helper functions."""
    js_content = prefix + json.dumps(cities_data, indent=2, ensure_ascii=False) + suffix
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(js_content)


def main():
    parser = argparse.ArgumentParser(description="Enrich KYT cities and beats with Google Maps Place IDs")
    parser.add_argument("--city", help="Target specific city ID (e.g. 'omkareshwar' or 'ujjain')")
    parser.add_argument("--limit", type=int, help="Limit number of cities to process")
    parser.add_argument("--skip-beats", action="store_true", help="Only resolve city-level Place IDs")
    parser.add_argument("--in-place", action="store_true", help="Update data/cities.js in place instead of cities.enriched.js")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay in seconds between requests (default 1.0)")
    args = parser.parse_args()

    # Lazy-load Playwright so helpful error is shown if not installed
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("\n[!] Playwright is not installed for Python.")
        print("    Run via Node: node admin/enrich_kyt_places.js")
        print("    Or install:   py -3.9 -m pip install playwright && py -3.9 -m playwright install chromium\n")
        sys.exit(1)

    print(f"Loading catalog from: {INPUT_JS_PATH}")
    cities, prefix, suffix = load_cities_js(INPUT_JS_PATH)
    print(f"Loaded {len(cities)} cities.")

    target_cities = cities
    if args.city:
        target_cities = [c for c in cities if c.get("id") == args.city]
        if not target_cities:
            print(f"Error: City ID '{args.city}' not found in catalog.")
            sys.exit(1)
    elif args.limit:
        target_cities = cities[:args.limit]

    cache = {}
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            try:
                cache = json.load(f)
            except Exception:
                cache = {}

    with sync_playwright() as p:
        # Prefer system Microsoft Edge if available, otherwise chromium
        try:
            browser = p.chromium.launch(channel="msedge", headless=True)
        except Exception:
            browser = p.chromium.launch(headless=True)

        context = browser.new_context(
            locale="en-IN",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        for c_idx, city in enumerate(target_cities, 1):
            city_id = city["id"]
            city_query = f"{city['name']}, {city.get('state', '')}, India"
            cache_key = f"city::{city_id}"

            if cache_key not in cache:
                print(f"[{c_idx}/{len(target_cities)}] Resolving City: {city_query}...")
                res = resolve_place_on_gmaps(page, city_query, city.get("lat"), city.get("lng"))
                cache[cache_key] = res
                with open(CACHE_PATH, "w", encoding="utf-8") as f:
                    json.dump(cache, f, indent=2, ensure_ascii=False)
                time.sleep(args.delay)
            else:
                res = cache[cache_key]

            # Apply to city object (respecting excluded cities like Omkareshwar)
            if res.get("placeId") and city_id not in EXCLUDED_CITY_PLACE_IDS:
                city["placeId"] = res["placeId"]
            if res.get("ftid"):
                city["ftid"] = res["ftid"]
            if res.get("canonicalMapsUrl") and city_id not in EXCLUDED_CITY_PLACE_IDS:
                city["mapsUrl"] = res["canonicalMapsUrl"]

            if args.skip_beats:
                continue

            # Process each beat inside the city
            for b_idx, beat in enumerate(city.get("beats", []), 1):
                beat_query = get_clean_search_query(beat, city["name"])

                # If this attraction is an activity (food, breakfast, lunch, trail), do NOT map via Place ID
                if beat.get("kind") == "activity":
                    beat.pop("placeId", None)
                    beat.pop("ftid", None)
                    beat["mapsUrl"] = f"https://www.google.com/maps/search/?api=1&query={quote_plus(beat_query)}"
                    print(f"   -> Beat {b_idx}/{len(city.get('beats', []))} [ACTIVITY]: {beat['title']} (skipped Place ID)")
                    continue

                b_cache_key = f"beat::{city_id}::{beat['title']}"

                if b_cache_key not in cache:
                    print(f"   -> Beat {b_idx}/{len(city.get('beats', []))}: {beat_query}")
                    b_res = resolve_place_on_gmaps(page, beat_query, city.get("lat"), city.get("lng"))
                    if b_res.get("distanceKm") and b_res["distanceKm"] > 150:
                        print(f"      [!] WARNING: {beat['title']} resolved {b_res['distanceKm']} km from {city['name']} ({b_res['resolvedName']})")
                    cache[b_cache_key] = b_res
                    with open(CACHE_PATH, "w", encoding="utf-8") as f:
                        json.dump(cache, f, indent=2, ensure_ascii=False)
                    time.sleep(args.delay)
                else:
                    b_res = cache[b_cache_key]

                if b_res.get("placeId"):
                    beat["placeId"] = b_res["placeId"]
                if b_res.get("ftid"):
                    beat["ftid"] = b_res["ftid"]
                if b_res.get("lat") and b_res.get("lng"):
                    beat["lat"] = b_res["lat"]
                    beat["lng"] = b_res["lng"]
                if b_res.get("canonicalMapsUrl"):
                    beat["mapsUrl"] = b_res["canonicalMapsUrl"]

        browser.close()

    out_path = INPUT_JS_PATH if args.in_place else OUTPUT_JS_PATH
    save_cities_js(cities, out_path, prefix, suffix)
    print(f"\n✓ Done! Output written to {out_path}")


if __name__ == "__main__":
    main()
    main()