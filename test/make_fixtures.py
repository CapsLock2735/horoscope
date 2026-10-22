"""Generate reference charts with Swiss Ephemeris (pip install pyswisseph).

Local birth time -> UTC uses Python's zoneinfo, independently of the API's Intl code,
so a timezone bug in the API cannot hide behind the same bug in the reference.
Run: python3 test/make_fixtures.py > test/fixtures.json
"""
import json, datetime
from zoneinfo import ZoneInfo
import swisseph as swe

FL = swe.FLG_MOSEPH
BODIES = {'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY, 'Venus': swe.VENUS, 'Mars': swe.MARS,
          'Jupiter': swe.JUPITER, 'Saturn': swe.SATURN, 'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE,
          'Pluto': swe.PLUTO, 'NorthNode': swe.TRUE_NODE}
CASES = [
    ('NYC summer (EDT)', 1990, 7, 15, 14, 30, 'America/New_York', 40.7128, -74.0060),
    ('NYC winter (EST)', 1990, 1, 15, 14, 30, 'America/New_York', 40.7128, -74.0060),
    ('London', 1985, 1, 3, 6, 10, 'Europe/London', 51.5074, -0.1278),
    ('LA before DST', 2000, 3, 21, 23, 45, 'America/Los_Angeles', 34.0522, -118.2437),
    ('Sydney (AEDT)', 1995, 11, 8, 8, 0, 'Australia/Sydney', -33.8688, 151.2093),
    ('Chicago today', 2026, 10, 22, 21, 0, 'America/Chicago', 41.8781, -87.6298),
    ('Oslo', 1972, 12, 31, 18, 20, 'Europe/Oslo', 59.9139, 10.7522),
    ('Reykjavik', 2003, 6, 10, 3, 15, 'Atlantic/Reykjavik', 64.1466, -21.9426),
    ('Toronto 1968', 1968, 4, 4, 18, 1, 'America/Toronto', 43.6532, -79.3832),
    ('Shanghai 1988 (China DST)', 1988, 7, 1, 9, 0, 'Asia/Shanghai', 31.2304, 121.4737),
    ('Mumbai (+5:30)', 1975, 5, 20, 22, 10, 'Asia/Kolkata', 19.0760, 72.8777),
    ('Buenos Aires', 1983, 9, 12, 4, 40, 'America/Argentina/Buenos_Aires', -34.6037, -58.3816),
    ('Tromso (Placidus undefined)', 1999, 12, 21, 11, 0, 'Europe/Oslo', 69.6492, 18.9553),
]
out = []
for name, y, m, d, h, mi, tz, lat, lon in CASES:
    local = datetime.datetime(y, m, d, h, mi, tzinfo=ZoneInfo(tz))
    utc = local.astimezone(datetime.timezone.utc)
    jd = swe.julday(utc.year, utc.month, utc.day, utc.hour + utc.minute / 60)
    bodies = {k: swe.calc_ut(jd, v, FL)[0][0] for k, v in BODIES.items()}
    try:
        cusps, ascmc = swe.houses_ex(jd, lat, lon, b'P', FL)
        placidus = list(cusps)
    except swe.Error:  # Placidus has no solution inside the polar circle
        cusps, ascmc = swe.houses_ex(jd, lat, lon, b'W', FL)
        placidus = None
    out.append({'name': name, 'local': [y, m, d, h, mi], 'timezone': tz, 'lat': lat, 'lon': lon,
                'utc': utc.strftime('%Y-%m-%dT%H:%M:00.000Z'), 'utcOffsetHours': local.utcoffset().total_seconds() / 3600,
                'bodies': bodies, 'asc': ascmc[0], 'mc': ascmc[1],
                'placidus': placidus})
print(json.dumps(out, indent=1))
