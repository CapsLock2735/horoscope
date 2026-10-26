# horoscope

`GET` or `POST /api/chart` returns a tropical natal chart, a transit chart and their aspects.
For dates from 1920 to 2030, every position agrees with the full Swiss Ephemeris to within 2″ (see [Accuracy](#accuracy)).

## Parameters

| Parameter | Required | Notes |
|---|---|---|
| `year` `month` `day` | yes | Birth date, local to the birthplace |
| `hour` `minute` | no | Birth time, local. Leave `hour` out (or pass `timeUnknown=true`) when the time is unknown |
| `lat` `lon` | one of these two | Birthplace coordinates |
| `city` `state` `country` | | Geocoded with OpenCage (`GEOCODER_API_KEY`) when `lat`/`lon` are missing |
| `timezone` | no | IANA name such as `America/New_York`. Normally leave it out: the zone and that day's daylight saving are looked up from the coordinates |
| `tz` | no | Legacy fixed UTC offset in hours. Still accepted, but it cannot know about daylight saving, so the response carries a warning |
| `houseSystem` | no | `whole` (default) or `placidus`. Inside the polar circles Placidus has no solution and the chart falls back to Whole Sign with a warning |
| `transitYear` `transitMonth` `transitDay` | no | Transit date. Read at local noon unless `transitHour`/`transitMinute` are given. Without a date, transits are for the current moment |
| `transitLat` `transitLon` `transitTimezone` | no | Where the user is now, for the transit chart. Defaults to the birthplace |

## Response

- `natalChart.planets`: Sun to Pluto, plus `NorthNode` and `SouthNode` (true node). Each has `sign`, `signEn`, `degree`, `longitude`, and `house` when the birth time is known.
- `natalChart.angles`: `Ascendant` and `MC`, or `null` when the birth time is unknown.
- `natalChart.houses`: 12 cusps with `cusp` longitudes, or `null` when the birth time is unknown.
- When the birth time is unknown, `planets.Moon.possibleSigns` lists every sign the Moon was in that day.
- `natalChart.chartInfo`:
  - `date`: the birth moment in UTC.
  - `localTime`.
  - `timeKnown`.
  - `timezone`: UTC offset in hours that applied that day.
  - `timezoneName`.
  - `timezoneSource`: `location`, `parameter` or `fixed offset`.
  - `warnings`: for example a local time that a daylight-saving change skipped or repeated.
- `transits`: same shape as the natal chart, for the transit moment and place.
- `analysis.aspects.natal`: aspects between natal points. `analysis.aspects.transitToNatal`: aspects from transiting bodies to natal points.
  - Each aspect is `{ p1, p2, type, angle, orb }`.
  - Orbs: conjunction and opposition 8°, trine and square 7°, sextile 5°. Transit orbs are 40% of these.
- Errors: `400` with `{ error }` for bad or missing input. A body that fails to compute returns `500`; the API never falls back to a placeholder position.

CORS is open (`CORS_ORIGIN` overrides `*`).

## Accuracy

Positions are apparent geocentric longitudes referred to the true equinox of date. This is what Swiss Ephemeris returns by default, and what astrology software shows. Planets are corrected for light-time, annual aberration and nutation. The Moon uses ELP/MPP02.

Measured against the full Swiss Ephemeris (pyswisseph 2.10 with the data files `sepl_18.se1` and `semo_18.se1`) on 3,000 random charts from 1920 to 2030, latitudes −55° to 62°:

| Point | Largest difference | Mean |
|---|---|---|
| Sun, Moon, Mercury to Saturn, Pluto, true node | 0.0006° (2″) | ≤ 0.0002° |
| Uranus, Neptune | 0.0005° (2″) | 0.0001° |
| Ascendant, MC, Placidus cusps | 0.0003° (1″) | < 0.0001° |

None of the 3,000 charts put a body in a different sign, or in a different Placidus house. Retrograde stations and new and full moons fall within a minute of Swiss Ephemeris.

To reproduce, download the two data files from [github.com/aloistr/swisseph](https://github.com/aloistr/swisseph/tree/master/ephe) and run:

```bash
SE_EPHE_PATH=/path/to/ephe python3 test/compare_swisseph.py 3000 1920 2030
```

Without `SE_EPHE_PATH`, Swiss Ephemeris quietly falls back to its built-in Moshier mode, and the script reports this. In Moshier mode its true node is up to about 1′ away from the full ephemeris, so a comparison against it looks worse than it is.

Two limits:

- **After 2030 the Moon drifts by up to 9″.** Nothing else changes. The cause is ΔT, the gap between clock time and the time the planets follow. Nobody knows its future value, so each library predicts it. Up to 2030, astronomia and Swiss Ephemeris agree to within 1 second. By 2040 astronomia predicts 85 s and Swiss Ephemeris 72 s. The Moon moves 0.5″ to 0.7″ a second, so 13 seconds is 7″ to 9″.
- Pluto uses Meeus chapter 37, which is valid from 1885 to 2099.

Longitudes and cusps are returned with 4 decimals (0.0001° ≈ 0.4″). `degree` is truncated to whole arcminutes.

## Tests

```bash
npm test
```

Runs the suite three times, with the server clock set to UTC, Shanghai and Los Angeles. A chart must not depend on where the server runs.

Positions must match the fixtures to within 0.001°.

`test/fixtures.json` is generated with `SE_EPHE_PATH=/path/to/ephe python3 test/make_fixtures.py > test/fixtures.json`. It needs `pip install pyswisseph` and the same two data files. Without them the script stops instead of writing weaker Moshier-mode fixtures. It converts birth times to UTC with Python's `zoneinfo`, independently of the API's own timezone code.
