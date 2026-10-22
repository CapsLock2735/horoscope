import NodeGeocoder from 'node-geocoder';
import tzlookup from 'tz-lookup';
import {
  buildChart, findAspects, longitudesOf, localToUtc, utcToLocal, bodyLongitudes, point
} from '../lib/astro.mjs';
import julian from 'astronomia/julian';

// 延迟创建 geocoder 以避免在无 API Key 的环境下初始化报错
let geocoder = null;
function getGeocoder() {
  if (!geocoder) {
    geocoder = NodeGeocoder({ provider: 'opencage', apiKey: process.env.GEOCODER_API_KEY });
  }
  return geocoder;
}

class BadRequest extends Error {}

const present = v => v != null && `${v}`.trim() !== '';
function int(params, key, min, max) {
  const n = Number(params[key]);
  if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`Invalid ${key}: expected an integer from ${min} to ${max}`);
  return n;
}
function num(params, key, min, max) {
  const n = Number(params[key]);
  if (!Number.isFinite(n) || n < min || n > max) throw new BadRequest(`Invalid ${key}: expected a number from ${min} to ${max}`);
  return n;
}
function checkDate(y, m, d, label) {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new BadRequest(`Invalid ${label}: ${y}-${m}-${d} does not exist`);
}
function validZone(name) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: name }); return true; } catch { return false; }
}

/**
 * 时区优先级：timezone（IANA 名，如 America/New_York）→ tz（固定偏移小时，旧参数，不含夏令时判断）→ 按经纬度自动查。
 * 自动查用的是出生地的历史时区规则，会自动判断当年当天是不是夏令时。
 */
function resolveZone(params, prefix, latitude, longitude) {
  const nameKey = prefix ? `${prefix}Timezone` : 'timezone';
  const tzKey = prefix ? `${prefix}Tz` : 'tz';
  if (present(params[nameKey])) {
    const name = `${params[nameKey]}`.trim();
    if (!validZone(name)) throw new BadRequest(`Invalid ${nameKey}: ${name}`);
    return { name, source: 'parameter' };
  }
  if (present(params[tzKey])) {
    const h = num(params, tzKey, -14, 14);
    return { offsetMinutes: Math.round(h * 60), source: 'fixed offset' };
  }
  return { name: tzlookup(latitude, longitude), source: 'location' };
}

async function resolveLocation(params) {
  if (present(params.lat) && present(params.lon)) {
    return { latitude: num(params, 'lat', -90, 90), longitude: num(params, 'lon', -180, 180) };
  }
  if (!present(params.city) || !present(params.country)) {
    throw new BadRequest('Missing location: pass lat and lon, or city and country');
  }
  const address = present(params.state) ? `${params.city}, ${params.state}, ${params.country}` : `${params.city}, ${params.country}`;
  const geo = await getGeocoder().geocode(address);
  if (!geo || geo.length === 0) throw new BadRequest(`Could not find coordinates for the specified location: ${address}`);
  return { latitude: geo[0].latitude, longitude: geo[0].longitude };
}

const pad = n => String(n).padStart(2, '0');
function chartInfo(utcMs, zone, conv, location, timeKnown, local) {
  const warnings = [];
  if (conv.nonexistent) warnings.push('This local time was skipped by a daylight-saving change; it was read with the offset in force just after.');
  if (conv.ambiguous) warnings.push('This local time happened twice because of a daylight-saving change; the first occurrence was used.');
  if (zone.source === 'fixed offset') warnings.push('A fixed tz offset was given, so daylight saving was not checked. Omit tz to look it up from the location.');
  return {
    date: new Date(utcMs).toISOString(),
    localTime: `${local.year}-${pad(local.month)}-${pad(local.day)}` + (timeKnown ? ` ${pad(local.hour)}:${pad(local.minute)}` : ''),
    timeKnown,
    timezone: conv.offsetMinutes / 60,
    timezoneName: zone.name ?? null,
    timezoneSource: zone.source,
    location,
    warnings
  };
}

function corsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  corsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const params = { ...(req.query || {}), ...body };

    for (const k of ['year', 'month', 'day']) {
      if (!present(params[k])) throw new BadRequest(`Missing required parameter: ${k}`);
    }
    const year = int(params, 'year', 1800, 2200), month = int(params, 'month', 1, 12), day = int(params, 'day', 1, 31);
    checkDate(year, month, day, 'birth date');

    // 出生时间未知：不传 hour，或 timeUnknown=true
    const timeKnown = present(params.hour) && !['1', 'true', 'yes'].includes(`${params.timeUnknown ?? ''}`.toLowerCase());
    const hour = timeKnown ? int(params, 'hour', 0, 23) : 12;
    const minute = timeKnown && present(params.minute) ? int(params, 'minute', 0, 59) : 0;
    const houseSystem = `${params.houseSystem || 'whole'}`.toLowerCase();
    if (!['whole', 'placidus'].includes(houseSystem)) throw new BadRequest('Invalid houseSystem: use whole or placidus');

    const location = await resolveLocation(params);
    const zone = resolveZone(params, '', location.latitude, location.longitude);

    // ---- 本命盘 ----
    const conv = localToUtc({ year, month, day, hour, minute }, zone);
    const natalRaw = buildChart(conv.utcMs, { ...location, houseSystem, timeKnown });
    const natal = {
      planets: natalRaw.planets,
      angles: natalRaw.angles,
      houses: natalRaw.houses,
      chartInfo: chartInfo(conv.utcMs, zone, conv, location, timeKnown, { year, month, day, hour, minute })
    };
    if (natalRaw.houseNote) natal.chartInfo.warnings.push(natalRaw.houseNote);
    if (!timeKnown) {
      // 月亮一天走约 13°，不知道时间时给出这一天里可能落入的星座
      const start = localToUtc({ year, month, day, hour: 0, minute: 0 }, zone).utcMs;
      const end = localToUtc({ year, month, day, hour: 23, minute: 59 }, zone).utcMs;
      const a = point(bodyLongitudes(julian.DateToJDE(new Date(start))).Moon);
      const b = point(bodyLongitudes(julian.DateToJDE(new Date(end))).Moon);
      natal.planets.Moon.possibleSigns = a.signEn === b.signEn ? [a.signEn] : [a.signEn, b.signEn];
      natal.chartInfo.warnings.push('Birth time unknown: planets are cast for local noon, and the Ascendant, MC and houses are left out.');
    }

    // ---- 行运盘 ----
    let tUtc, tLoc = location, tZone = zone, tConv = null, tLocal;
    if (present(params.transitLat) && present(params.transitLon)) {
      tLoc = { latitude: num(params, 'transitLat', -90, 90), longitude: num(params, 'transitLon', -180, 180) };
      tZone = resolveZone(params, 'transit', tLoc.latitude, tLoc.longitude);
    } else if (present(params.transitTimezone) || present(params.transitTz)) {
      tZone = resolveZone(params, 'transit', tLoc.latitude, tLoc.longitude);
    }
    if (present(params.transitYear) && present(params.transitMonth) && present(params.transitDay)) {
      const ty = int(params, 'transitYear', 1800, 2200), tm = int(params, 'transitMonth', 1, 12), td = int(params, 'transitDay', 1, 31);
      checkDate(ty, tm, td, 'transit date');
      // 行运某一天：默认取当地中午，而不是 UTC 0 点（那是美洲的前一天晚上）
      const th = present(params.transitHour) ? int(params, 'transitHour', 0, 23) : 12;
      const tmin = present(params.transitMinute) ? int(params, 'transitMinute', 0, 59) : 0;
      tConv = localToUtc({ year: ty, month: tm, day: td, hour: th, minute: tmin }, tZone);
      tUtc = tConv.utcMs;
      tLocal = { year: ty, month: tm, day: td, hour: th, minute: tmin };
    } else {
      tUtc = Date.now();
      tLocal = utcToLocal(tUtc, tZone);
      tConv = { offsetMinutes: tLocal.offsetMinutes, nonexistent: false, ambiguous: false };
    }
    const transitRaw = buildChart(tUtc, { ...tLoc, houseSystem, timeKnown: true });
    const transits = {
      planets: transitRaw.planets,
      angles: transitRaw.angles,
      houses: transitRaw.houses,
      chartInfo: chartInfo(tUtc, tZone, tConv, tLoc, true, tLocal)
    };

    // ---- 相位 ----
    const natalLons = longitudesOf(natalRaw);
    const transitLons = longitudesOf({ planets: transitRaw.planets, angles: null });
    return res.status(200).json({
      natalChart: natal,
      transits,
      analysis: {
        aspects: {
          natal: findAspects(natalLons, natalLons, true),
          transitToNatal: findAspects(transitLons, natalLons, false, 0.4)
        },
        houseSystem: natalRaw.houseSystem,
        zodiac: 'Tropical',
        nodes: 'True node'
      }
    });
  } catch (e) {
    if (e instanceof BadRequest) return res.status(400).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
}
