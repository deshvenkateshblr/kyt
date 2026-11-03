"""
enrich_kyt_places.py
Resolves accurate Google Maps Place IDs, Feature IDs (ftid), and canonical Place URLs
for window.KYT_CITIES without requiring a Google Maps API key.

Key capabilities:
- Mathematical 1-to-1 conversion from Google Feature ID (0x...:0x...) to canonical ChIJ Place ID
- Haversine distance sanity checks against parent city coordinates
- Caching in places_cache.json to avoid redundant lookups
- CLI options for batching: --batch <n>, --batch-size <n>, --city <id>, --status, --skip-city, --in-place, --delay <sec>

Run:
  py -3.9 admin/enrich_kyt_places.py --status
  py -3.9 admin/enrich_kyt_places.py --batch 1 --in-place
  py -3.9 admin/enrich_kyt_places.py --city ujjain
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

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

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

    prefix_marker = "window.KYT_CITIES = "
    p_idx = raw.find(prefix_marker)
    s_idx = raw.rfind("\r\n];")
    close_len = 4
    if s_idx == -1:
        s_idx = raw.rfind("\n];")
        close_len = 3

    if p_idx != -1 and s_idx != -1:
        prefix = raw[:p_idx + len(prefix_marker)]
        cities_json = raw[p_idx + len(prefix_marker):s_idx + (close_len - 1)]
        suffix = raw[s_idx + (close_len - 1):]
        return json.loads(cities_json), prefix, suffix

    raise ValueError(f"Could not parse window.KYT_CITIES array from {filepath}")


def save_cities_js(cities_data, filepath, prefix="window.KYT_CITIES = ", suffix=";\n"):
    """Write back cities array preserving catalog helper functions."""
    js_content = prefix + json.dumps(cities_data, indent=2, ensure_ascii=False) + suffix
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(js_content)


def main():
    parser = argparse.ArgumentParser(description="Enrich KYT cities and beats with Google Maps Place IDs")
    parser.add_argument("--city", help="Target specific city ID (e.g. 'omkareshwar' or 'ujjain')")
    parser.add_argument("--batch", help="Batch number (e.g. 1) or range (e.g. 1-3)")
    parser.add_argument("--batch-size", type=int, default=10, help="Number of cities per batch (default 10)")
    parser.add_argument("--limit", type=int, help="Limit number of cities to process")
    parser.add_argument("--offset", type=int, default=0, help="Starting city offset")
    parser.add_argument("--status", action="store_true", help="Display catalog status and batch breakdown")
    parser.add_argument("--skip-beats", action="store_true", help="Only resolve city-level Place IDs")
    parser.add_argument("--skip-city", action="store_true", help="Only resolve beat-level Place IDs")
    parser.add_argument("--force", action="store_true", help="Force re-resolution even if placeId is already present")
    parser.add_argument("--in-place", action="store_true", help="Update data/cities.js in place instead of cities.enriched.js")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay in seconds between requests (default 1.0)")
    args = parser.parse_args()

    print(f"Loading catalog from: {INPUT_JS_PATH}")
    cities, prefix, suffix = load_cities_js(INPUT_JS_PATH)
    print(f"Loaded {len(cities)} cities.")

    if args.status:
        total_places = 0
        resolved_places = 0
        total_activities = 0
        resolved_cities = len([c for c in cities if c.get("placeId")])

        for c in cities:
            for b in c.get("beats", []):
                if b.get("kind") == "activity":
                    total_activities += 1
                else:
                    total_places += 1
                    if b.get("placeId"):
                        resolved_places += 1

        missing_places = total_places - resolved_places
        total_batches = math.ceil(len(cities) / args.batch_size)

        print("\n================ KYT PLACES CATALOG STATUS ================")
        print(f"Total Cities:           {len(cities)} ({resolved_cities} have city.placeId)")
        print(f"Total Attractions:      {total_places + total_activities}")
        print(f"  - Places:             {total_places} ({resolved_places} resolved, {missing_places} missing Place ID)")
        print(f"  - Activities:         {total_activities} (exempt from Place ID)")
        print(f"Total Batches:          {total_batches} (batch size: {args.batch_size} cities/batch)")
        print("-----------------------------------------------------------")

        for b in range(1, total_batches + 1):
            b_start = (b - 1) * args.batch_size
            b_cities = cities[b_start:b_start + args.batch_size]
            b_places = 0
            b_missing = 0
            for c in b_cities:
                for beat in c.get("beats", []):
                    if beat.get("kind") != "activity":
                        b_places += 1
                        if not beat.get("placeId"):
                            b_missing += 1
            tag = "✓ COMPLETE" if b_missing == 0 else f"{b_missing} missing"
            names = ", ".join([c["name"] for c in b_cities])[:50]
            print(f"  Batch {b:2d}: cities {b_start + 1:3d}-{b_start + len(b_cities):3d} | {b_places:2d} places | {tag} | {names}...")
        print("===========================================================\n")
        print("Run a batch with: node admin/enrich_kyt_places.js --batch 1 --in-place")
        return

    # Lazy-load Playwright so helpful error is shown if not installed
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("\n[!] Playwright is not installed for Python.")
        print("    Run via Node: node admin/enrich_kyt_places.js")
        print("    Or install:   py -3.9 -m pip install playwright && py -3.9 -m playwright install chromium\n")
        sys.exit(1)

    target_cities = cities
    if args.city:
        target_cities = [c for c in cities if c.get("id") == args.city]
        if not target_cities:
            print(f"Error: City ID '{args.city}' not found in catalog.")
            sys.exit(1)
    elif args.batch:
        batch_indices = []
        if args.batch.lower() == "all":
            total_batches = math.ceil(len(cities) / args.batch_size)
            batch_indices = list(range(1, total_batches + 1))
        elif "-" in args.batch:
            start_b, end_b = [int(x.strip()) for x in args.batch.split("-")]
            batch_indices = list(range(start_b, end_b + 1))
        elif "," in args.batch:
            batch_indices = [int(x.strip()) for x in args.batch.split(",")]
        else:
            batch_indices = [int(args.batch.strip())]

        target_cities = []
        for b in batch_indices:
            b_start = (b - 1) * args.batch_size
            target_cities.extend(cities[b_start:b_start + args.batch_size])
    elif args.limit:
        target_cities = cities[args.offset:args.offset + args.limit]

    cache = {}
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            try:
                cache = json.load(f)
            except Exception:
                cache = {}

    out_filepath = INPUT_JS_PATH if args.in_place else OUTPUT_JS_PATH

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

            beats = city.get("beats", [])
            place_beats = [b for b in beats if b.get("kind") != "activity"]
            missing_in_city = len([b for b in place_beats if not b.get("placeId")])

            print(f"\n[City {c_idx}/{len(target_cities)}] {city['name']} ({len(place_beats)} places, {missing_in_city} missing, {len(beats) - len(place_beats)} activities)")

            if not args.skip_city and city_id not in EXCLUDED_CITY_PLACE_IDS:
                if city.get("placeId") and not args.force:
                    pass
                else:
                    if cache_key not in cache or args.force:
                        print(f"  Resolving City: {city_query}...")
                        res = resolve_place_on_gmaps(page, city_query, city.get("lat"), city.get("lng"))
                        cache[cache_key] = res
                        with open(CACHE_PATH, "w", encoding="utf-8") as f:
                            json.dump(cache, f, indent=2, ensure_ascii=False)
                        time.sleep(args.delay)
                    else:
                        res = cache[cache_key]

                    if res.get("placeId") and city_id not in EXCLUDED_CITY_PLACE_IDS:
                        city["placeId"] = res["placeId"]
                    if res.get("ftid"):
                        city["ftid"] = res["ftid"]
                    if res.get("canonicalMapsUrl") and city_id not in EXCLUDED_CITY_PLACE_IDS:
                        city["mapsUrl"] = res["canonicalMapsUrl"]

            if not args.skip_beats:
                for b_idx, beat in enumerate(beats, 1):
                    beat_query = get_clean_search_query(beat, city["name"])

                    # If this attraction is an activity, skip Place ID
                    if beat.get("kind") == "activity":
                        beat.pop("placeId", None)
                        beat.pop("ftid", None)
                        clean_city_name = re.sub(r'\s*\(.*?\)', '', city["name"]).strip()
                        q = (beat.get("title") or "").strip()
                        if not re.search(rf'\b(at|in)\s+{re.escape(clean_city_name)}$', q, re.IGNORECASE):
                            q = f"{q} at {clean_city_name}"
                        beat["mapsUrl"] = f"https://www.google.com/maps/search/?api=1&query={quote_plus(q)}"
                        print(f"   -> Beat {b_idx}/{len(beats)} [ACTIVITY]: {beat['title']} -> {q}")
                        continue

                    # If already has placeId and not force, skip
                    if beat.get("placeId") and not args.force:
                        print(f"   -> Beat {b_idx}/{len(beats)} [PLACE]: {beat['title']} (already has {beat['placeId']})")
                        continue

                    b_cache_key = f"beat::{city_id}::{beat['title']}"

                    if b_cache_key not in cache or args.force:
                        print(f"   -> Beat {b_idx}/{len(beats)} [PLACE]: Resolving {beat_query}...")
                        b_res = resolve_place_on_gmaps(page, beat_query, city.get("lat"), city.get("lng"))
                        if b_res.get("distanceKm") and b_res["distanceKm"] > 150:
                            print(f"      [!] WARNING: {beat['title']} resolved {b_res['distanceKm']} km from {city['name']} ({b_res.get('resolvedName')})")
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
                    print(f"      ✓ {beat['title']} -> {beat.get('placeId') or '(no placeId)'}")

            # Save incrementally after each city completes
            save_cities_js(cities, out_filepath, prefix, suffix)

        browser.close()

    print(f"\n✓ Batch complete! Output written to: {out_filepath}")


if __name__ == "__main__":
    main()
