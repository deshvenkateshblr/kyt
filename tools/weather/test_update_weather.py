"""Offline tests for update_weather.py. They use a fake NASA answer, so they need no network.

    python -m unittest discover -s tools/weather -v
"""
import copy
import io
import json
import shutil
import subprocess
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

import update_weather as uw

CITIES = [
    {"id": "agra", "name": "Agra", "lat": 27.18, "lng": 78.02, "setting": "plains"},
    {"id": "leh", "name": "Leh", "lat": 34.16, "lng": 77.58, "setting": "hills"},
    {"id": "goa", "name": "Goa", "lat": 15.5, "lng": 73.83, "setting": "coast"},
    {"id": "manali", "name": "Manali", "lat": 32.24, "lng": 77.19, "setting": "hills"},
]


def api_answer(hi=30.0, lo=18.0, per_day=2.0, **bad):
    """The shape NASA POWER returns: properties.parameter.<NAME>.<JAN..DEC, ANN>."""
    def block(v):
        d = {m: v for m in uw.MONTHS}
        d["ANN"] = v
        return d
    params = {"T2M_MAX": block(hi), "T2M_MIN": block(lo), "PRECTOTCORR": block(per_day)}
    for name, month_value in bad.items():                    # e.g. T2M_MAX=("JAN", -999.0)
        params[name][month_value[0]] = month_value[1]
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [78.0, 27.2, 200.0]},
            "properties": {"parameter": params}, "header": {"fill_value": -999.0}}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        (self.tmp / "cities.js").write_text(
            "window.KYT_CITIES = " + json.dumps(CITIES, indent=2) + ";\n\nif (typeof window !== 'undefined') {}\n", encoding="utf-8")
        self.log = []
        self.calls = []

    def args(self, *extra):
        return uw.build_parser().parse_args([
            "--cities-file", str(self.tmp / "cities.js"), "--weather-file", str(self.tmp / "weather.js"),
            "--overrides-file", str(self.tmp / "overrides.json"), "--cache-dir", str(self.tmp / "cache"), "--delay", "0", *extra])

    def go(self, *extra, answers=None, today="2026-11-02"):
        def fake(url):
            self.calls.append(url)
            for cid, ans in (answers or {}).items():
                c = next(c for c in CITIES if c["id"] == cid)
                if f"latitude={c['lat']:.4f}" in url:
                    if isinstance(ans, Exception):
                        raise ans
                    return ans
            return api_answer()
        return uw.run(self.args(*extra), fetch=fake, sleep=lambda s: None, today=today, out=self.log.append)

    def weather(self):
        return uw.load_weather(self.tmp / "weather.js")


class Parsing(Base):
    def test_rain_is_converted_from_mm_per_day_to_mm_per_month(self):
        out = uw.parse_response(api_answer(per_day=1.0))
        self.assertEqual(out["rain"][0], 31)                  # January
        self.assertEqual(out["rain"][3], 30)                  # April
        self.assertEqual(out["rain"][1], 28)                  # February at 28.25 days, rounded
        self.assertEqual(out["hi"], [30.0] * 12)

    def test_fill_value_and_missing_months_are_refused(self):
        with self.assertRaisesRegex(ValueError, "T2M_MAX JAN"):
            uw.parse_response(api_answer(T2M_MAX=("JAN", -999.0)))
        data = api_answer()
        del data["properties"]["parameter"]["PRECTOTCORR"]["JUL"]
        with self.assertRaisesRegex(ValueError, "PRECTOTCORR JUL"):
            uw.parse_response(data)

    def test_a_changed_response_shape_says_so(self):
        with self.assertRaisesRegex(ValueError, "unexpected response shape"):
            uw.parse_response({"normals": []})

    def test_validation(self):
        good = {"hi": [30.0] * 12, "lo": [18.0] * 12, "rain": [10] * 12}
        uw.validate(good)
        for bad, why in [({**good, "lo": [35.0] * 12}, "above high"), ({**good, "hi": [60.0] * 12}, "outside"),
                         ({**good, "rain": [5000] + [0] * 11}, "rainfall"), ({**good, "hi": [30.0] * 11}, "12 numbers")]:
            with self.assertRaisesRegex(ValueError, why):
                uw.validate(bad)

    def test_the_request_url(self):
        url = uw.request_url(27.18, 78.02)
        self.assertIn("/api/temporal/climatology/point?", url)
        self.assertIn("parameters=T2M_MAX,T2M_MIN,PRECTOTCORR", url)
        self.assertIn("latitude=27.1800", url)
        self.assertIn("longitude=78.0200", url)
        self.assertIn("format=JSON", url)

    def test_the_real_city_file_loads_with_coordinates_for_every_city(self):
        cities = uw.load_cities(uw.ROOT / "data" / "cities.js")
        self.assertGreater(len(cities), 100)
        self.assertEqual(len({c["id"] for c in cities}), len(cities))


class Running(Base):
    def test_a_first_run_fetches_every_city_and_writes_the_file(self):
        self.assertEqual(self.go(), 0)
        self.assertEqual(len(self.calls), 4)
        w = self.weather()
        self.assertEqual(list(w["cities"]), ["agra", "leh", "goa", "manali"], "same order as cities.js")
        self.assertEqual(w["cities"]["agra"]["src"], "nasa-power")
        self.assertEqual(w["meta"]["generated"], "2026-11-02")
        self.assertEqual(w["meta"]["period"], uw.DEFAULT_PERIOD)
        self.assertTrue(any("hill cities" in line and "leh" in line and "manali" in line for line in self.log))

    def test_a_second_run_asks_nobody_and_leaves_the_file_byte_for_byte_alone(self):
        self.go()
        before = (self.tmp / "weather.js").read_bytes()
        self.calls.clear()
        self.assertEqual(self.go(today="2027-01-01"), 0)
        self.assertEqual(self.calls, [])
        self.assertEqual((self.tmp / "weather.js").read_bytes(), before, "no churn, not even the date")
        self.assertTrue(any("No changes" in line for line in self.log))

    def test_one_failure_does_not_lose_the_others_and_the_exit_code_says_so(self):
        code = self.go(answers={"goa": api_answer(T2M_MIN=("MAR", -999.0))})
        self.assertEqual(code, 1)
        self.assertEqual(list(self.weather()["cities"]), ["agra", "leh", "manali"])
        self.assertTrue(any("goa" in line and "FAILED" in line for line in self.log))
        self.calls.clear()
        self.assertEqual(self.go(), 0, "the next run fills just the gap")
        self.assertEqual(len(self.calls), 1)
        self.assertIn("goa", self.weather()["cities"])

    def test_a_network_error_keeps_what_we_already_had(self):
        self.go()
        old_agra = copy.deepcopy(self.weather()["cities"]["agra"])
        code = self.go("--refresh", "--cities", "agra", answers={"agra": RuntimeError("could not reach NASA POWER")})
        self.assertEqual(code, 1)
        self.assertEqual(self.weather()["cities"]["agra"], old_agra)

    def test_refresh_asks_again_and_reports_what_moved(self):
        self.go()
        self.calls.clear()
        self.go("--refresh", "--cities", "agra", answers={"agra": api_answer(hi=33.0)})
        self.assertEqual(len(self.calls), 1, "only the chosen city")
        self.assertEqual(self.weather()["cities"]["agra"]["hi"][0], 33.0)
        self.assertEqual(self.weather()["cities"]["leh"]["hi"][0], 30.0, "the others are untouched")
        self.assertTrue(any("moved by 0.5 C" in line and "agra" in line for line in self.log))

    def test_a_complete_override_wins_is_never_fetched_and_survives_later_runs(self):
        ov = {"hi": [-1.0, 3, 9, 15, 19, 24, 27, 26, 22, 15, 8, 2], "lo": [-14.0, -11, -6, -1, 3, 7, 11, 10, 5, -2, -8, -12],
              "rain": [10] * 12, "source": "IMD normals"}
        (self.tmp / "overrides.json").write_text(json.dumps({"leh": ov}), encoding="utf-8")
        self.go()
        self.assertEqual(len(self.calls), 3, "Leh is not fetched")
        leh = self.weather()["cities"]["leh"]
        self.assertEqual((leh["src"], leh["hi"][0]), ("override", -1.0))
        self.go("--refresh")
        self.assertEqual(self.weather()["cities"]["leh"]["src"], "override")
        self.assertFalse(any("Spot-check" in line and "leh" in line.split("Spot-check")[-1] for line in self.log[-6:]),
                         "a corrected hill city is not listed for spot-checking")

    def test_removing_an_override_brings_the_nasa_value_back_on_the_next_run(self):
        ov = {"hi": [1.0] * 12, "lo": [0.0] * 12, "rain": [5] * 12}
        (self.tmp / "overrides.json").write_text(json.dumps({"leh": ov}), encoding="utf-8")
        self.go()
        (self.tmp / "overrides.json").write_text("{}", encoding="utf-8")
        self.calls.clear()
        self.go()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.weather()["cities"]["leh"]["src"], "nasa-power")

    def test_a_partial_override_is_ignored_with_a_warning(self):
        (self.tmp / "overrides.json").write_text(json.dumps({"leh": {"hi": [1.0] * 12}}), encoding="utf-8")
        self.go()
        self.assertEqual(self.weather()["cities"]["leh"]["src"], "nasa-power")
        self.assertTrue(any("override for leh ignored" in line for line in self.log))

    def test_an_override_for_an_unknown_city_is_reported(self):
        (self.tmp / "overrides.json").write_text(json.dumps({"atlantis": {}}), encoding="utf-8")
        self.go()
        self.assertTrue(any("atlantis" in line and "not a city" in line for line in self.log))

    def test_dry_run_writes_nothing_but_a_later_run_reuses_the_cache(self):
        self.go("--dry-run")
        self.assertFalse((self.tmp / "weather.js").exists())
        self.calls.clear()
        self.assertEqual(self.go(), 0)
        self.assertEqual(self.calls, [], "answers came from the cache")
        self.assertEqual(len(self.weather()["cities"]), 4)

    def test_unknown_city_id_stops_with_a_message(self):
        with self.assertRaises(SystemExit) as cm:
            self.go("--cities", "agra,atlantis")
        self.assertIn("atlantis", str(cm.exception))

    def test_a_city_that_left_cities_js_leaves_the_weather_file_too(self):
        self.go()
        data = [c for c in CITIES if c["id"] != "goa"]
        (self.tmp / "cities.js").write_text("window.KYT_CITIES = " + json.dumps(data) + ";\n", encoding="utf-8")
        self.go()
        self.assertNotIn("goa", self.weather()["cities"])

    def test_the_output_is_valid_javascript_the_app_can_read(self):
        self.go()
        node = shutil.which("node")
        if not node:
            self.skipTest("node is not installed")
        js = ("global.window={};require(process.argv[1]);const w=window.KYT_WEATHER;"
              "console.log(JSON.stringify([Object.keys(w.cities).length,w.cities.agra.hi.length,w.cities.agra.rain.length,w.meta.source]))")
        res = subprocess.run([node, "-e", js, str(self.tmp / "weather.js")], capture_output=True, text=True)
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(json.loads(res.stdout), [4, 12, 12, "NASA POWER climatology"])


class Retrying(unittest.TestCase):
    def http_error(self, code, retry_after=None):
        headers = {"Retry-After": retry_after} if retry_after else {}
        return urllib.error.HTTPError("u", code, "x", headers, io.BytesIO(b""))

    def ok(self):
        resp = mock.MagicMock()
        resp.read.return_value = b'{"ok": true}'
        resp.__enter__.return_value = resp
        return resp

    def test_it_retries_busy_answers_then_succeeds(self):
        waits = []
        with mock.patch("urllib.request.urlopen", side_effect=[self.http_error(503), self.http_error(429, "7"), self.ok()]):
            self.assertEqual(uw.fetch_json("https://x", sleep=waits.append), {"ok": True})
        self.assertEqual(waits, [2.0, 7.0])

    def test_it_does_not_retry_a_bad_request(self):
        with mock.patch("urllib.request.urlopen", side_effect=[self.http_error(422)]) as m:
            with self.assertRaisesRegex(RuntimeError, "HTTP 422"):
                uw.fetch_json("https://x", sleep=lambda s: None)
        self.assertEqual(m.call_count, 1)

    def test_it_gives_up_after_the_retries_with_a_plain_message(self):
        with mock.patch("urllib.request.urlopen", side_effect=urllib.error.URLError("proxy said no")):
            with self.assertRaisesRegex(RuntimeError, "could not reach NASA POWER"):
                uw.fetch_json("https://x", retries=2, sleep=lambda s: None)


if __name__ == "__main__":
    unittest.main()
