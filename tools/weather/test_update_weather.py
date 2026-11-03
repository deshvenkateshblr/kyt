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


def api_answer(hi=30.0, lo=18.0, per_day=2.0, names=(uw.HI_PARAM, uw.LO_PARAM, uw.RAIN_PARAM), **bad):
    """The shape NASA POWER returns: properties.parameter.<NAME>.<JAN..DEC, ANN>. A value may be one number or 12."""
    def block(v):
        vals = v if isinstance(v, list) else [v] * 12
        d = dict(zip(uw.MONTHS, vals))
        d["ANN"] = vals[0]
        return d
    params = {names[0]: block(hi), names[1]: block(lo), names[2]: block(per_day)}
    for name, month_value in bad.items():                    # e.g. T2M_MAX_AVG=("JAN", -999.0)
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
                c = next(c for c in uw.load_cities(self.tmp / "cities.js") if c["id"] == cid)
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
        with self.assertRaisesRegex(ValueError, "T2M_MAX_AVG JAN"):
            uw.parse_response(api_answer(T2M_MAX_AVG=("JAN", -999.0)))
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
        self.assertIn("parameters=T2M_MAX_AVG,T2M_MIN_AVG,PRECTOTCORR", url)
        self.assertNotIn("T2M_MAX,", url, "the extreme-value parameter must not be requested")
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
        code = self.go(answers={"goa": api_answer(T2M_MIN_AVG=("MAR", -999.0))})
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


DELHI = {"hi": [20.1, 24.2, 29.9, 36.5, 39.9, 39.0, 35.6, 34.2, 34.1, 33.0, 28.4, 22.8],      # IMD 1991-2020, Safdarjung
         "lo": [7.5, 10.6, 15.6, 21.3, 25.8, 27.7, 27.5, 26.7, 25.0, 19.5, 13.0, 8.4]}
DELHI_RAIN_PER_DAY = [0.62, 0.76, 0.56, 0.54, 0.99, 2.47, 6.76, 7.52, 4.12, 0.49, 0.2, 0.26]


def delhi_answer(**kw):
    return api_answer(hi=kw.get("hi", DELHI["hi"]), lo=kw.get("lo", DELHI["lo"]), per_day=kw.get("per_day", DELHI_RAIN_PER_DAY))


class Parameters(Base):
    def setUp(self):
        super().setUp()
        data = [c for c in CITIES if c["id"] == "agra"] + [{"id": "delhi", "name": "Delhi", "lat": 28.61, "lng": 77.21, "setting": "plains"}]
        (self.tmp / "cities.js").write_text("window.KYT_CITIES = " + json.dumps(data) + ";\n", encoding="utf-8")

    def test_an_answer_with_only_the_extreme_value_parameters_is_refused(self):
        old_style = api_answer(names=("T2M_MAX", "T2M_MIN", "PRECTOTCORR"))
        with self.assertRaisesRegex(ValueError, "unexpected response shape"):
            uw.parse_response(old_style)

    def test_implausible_averages_for_an_anchor_city_are_not_written(self):
        code = self.go(answers={"delhi": delhi_answer(hi=[45.0] * 12, lo=[35.0] * 12)})     # an average of 40 C all year
        self.assertEqual(code, 1)
        self.assertFalse((self.tmp / "weather.js").exists(), "nothing is written")
        text = "\n".join(self.log)
        self.assertIn("NOT WRITTEN", text)
        self.assertRegex(text, r"delhi: average temperature in JAN is 40\.0 C, expected 10 to 18 C")

    def test_rain_left_in_mm_per_day_is_caught(self):
        code = self.go(answers={"delhi": delhi_answer(per_day=[v / 30 for v in DELHI_RAIN_PER_DAY])})   # a unit slip, rain 30x too small
        self.assertEqual(code, 1)
        self.assertRegex("\n".join(self.log), r"delhi: rainfall in JUL is \d+\.\d mm, expected 150 to 270 mm")

    def test_nasas_known_bias_does_not_block_a_run(self):
        """Measured 2 Nov 2026: highs ~6 C too hot, lows ~4 C too cold, but the average and the rain are right."""
        nasa_delhi_hi = [26.8, 31.4, 38.3, 43.7, 46.6, 46.5, 42.5, 37.1, 36.3, 35.3, 31.6, 27.5]
        nasa_delhi_lo = [2.8, 5.2, 9.8, 16.6, 23.1, 26.2, 25.7, 24.0, 19.8, 14.6, 8.9, 3.9]
        self.assertEqual(self.go(answers={"delhi": delhi_answer(hi=nasa_delhi_hi, lo=nasa_delhi_lo)}), 0)

    def test_plausible_temperatures_pass_and_the_escape_hatch_exists(self):
        self.assertEqual(self.go(answers={"delhi": delhi_answer()}), 0)
        self.assertIn("delhi", self.weather()["cities"])
        # the same extremes are written when asked for explicitly
        self.setUp()
        bad = delhi_answer(hi=[45.0] * 12, lo=[35.0] * 12)
        self.assertEqual(self.go("--no-sanity-check", answers={"delhi": bad}), 0)
        self.assertIn("delhi", self.weather()["cities"])

    def test_the_file_records_which_parameters_were_used(self):
        self.go(answers={"delhi": delhi_answer()})
        self.assertEqual(self.weather()["meta"]["params"], {"hi": "T2M_MAX_AVG", "lo": "T2M_MIN_AVG", "rain": "PRECTOTCORR"})

    def test_data_from_other_parameters_is_never_kept_or_mixed(self):
        """An old file (no params, or the extreme-value ones) is fetched again in full, even when only one city is asked for."""
        old_style = api_answer(names=("T2M_MAX", "T2M_MIN", "PRECTOTCORR"))
        self.go("--hi-param", "T2M_MAX", "--lo-param", "T2M_MIN", "--no-sanity-check", answers={"agra": old_style, "delhi": old_style})
        self.assertEqual(self.weather()["meta"]["params"]["hi"], "T2M_MAX")
        self.calls.clear()
        self.go("--cities", "agra", answers={"delhi": delhi_answer()})
        self.assertEqual(len(self.calls), 2, "every city again, not just the one named")
        self.assertTrue(any("parameters changed" in line for line in self.log))
        self.assertEqual(self.weather()["meta"]["params"]["hi"], "T2M_MAX_AVG")
        self.assertEqual(self.weather()["cities"]["delhi"]["hi"][0], 20.1)

    def test_a_city_that_fails_after_a_parameter_change_is_left_out_not_kept_with_old_numbers(self):
        old_style = api_answer(names=("T2M_MAX", "T2M_MIN", "PRECTOTCORR"))
        self.go("--hi-param", "T2M_MAX", "--lo-param", "T2M_MIN", "--no-sanity-check", answers={"agra": old_style, "delhi": old_style})
        code = self.go(answers={"agra": RuntimeError("could not reach NASA POWER"), "delhi": delhi_answer()})
        self.assertEqual(code, 1)
        self.assertEqual(list(self.weather()["cities"]), ["delhi"], "agra waits for the next run")
        self.assertEqual(self.go(), 0)
        self.assertEqual(sorted(self.weather()["cities"]), ["agra", "delhi"])

    def test_a_file_from_before_params_were_recorded_is_treated_as_stale(self):
        legacy = ('window.KYT_WEATHER = {"meta": {"source": "NASA POWER climatology"}, "cities": '
                  '{"agra": {"hi": [31.0] , "lo": [0.0], "rain": [1], "src": "nasa-power"}}};\n')
        (self.tmp / "weather.js").write_text(legacy, encoding="utf-8")
        self.go(answers={"delhi": delhi_answer()})
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(len(self.weather()["cities"]["agra"]["hi"]), 12)

    def test_nasas_explanation_of_a_rejected_request_is_shown(self):
        err = urllib.error.HTTPError("u", 422, "x", {}, io.BytesIO(b'{"messages": ["T2M_MAX_AVG is not a valid parameter for climatology"]}'))
        with mock.patch("urllib.request.urlopen", side_effect=[err]):
            with self.assertRaisesRegex(RuntimeError, "HTTP 422 from NASA POWER: T2M_MAX_AVG is not a valid parameter"):
                uw.fetch_json("https://x", sleep=lambda s: None)


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
