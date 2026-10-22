# horoscope

`GET` or `POST /api/chart` returns a tropical natal chart, a transit chart and their aspects.
Positions agree with Swiss Ephemeris to within 0.02° (see `npm test`).

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

## Tests

```bash
npm test
```

Runs the suite three times, with the server clock set to UTC, Shanghai and Los Angeles. A chart must not depend on where the server runs.

`test/fixtures.json` is generated with `python3 test/make_fixtures.py` (needs `pip install pyswisseph`). The script converts birth times to UTC with Python's `zoneinfo`, independently of the API's own timezone code.
