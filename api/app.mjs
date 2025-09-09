import express from 'express';
import NodeGeocoder from 'node-geocoder';
import { Origin, Horoscope } from 'circular-natal-horoscope-js';

const app = express();

// 静态页可保留（如无需可删除）
app.use(express.static('public'));

const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY
});

const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];

function degToSign(longitude) {
  // longitude: 0-360
  const norm = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(norm / 30);
  const degInSign = norm - signIndex * 30;
  const deg = Math.floor(degInSign);
  const min = Math.floor((degInSign - deg) * 60);
  return {
    longitude: Number(norm.toFixed(4)),
    sign: SIGNS[signIndex],
    degree: `${deg}°${String(min).padStart(2, '0')}'`
  };
}

function formatPlanet(p) {
  if (!p) return null;
  const base = degToSign(p.longitude);
  return {
    ...base,
    isRetrograde: Boolean(p.retrograde),
    house: p.house || null
  };
}

function buildHoroscope(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  // 将“当地时间 + 时区”换算为 UTC 时间
  const utc = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - Number(tzOffsetHours),
    Number(minute),
    0,
    0
  ));

  // circular-natal-horoscope-js 需要一个 Origin（起源）对象
  const origin = new Origin({
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    date: utc.getUTCDate(),
    hour: utc.getUTCHours(),
    minute: utc.getUTCMinutes(),
    latitude: Number(latitude),
    longitude: Number(longitude)
  });

  // 计算星盘（热带黄道，Placidus 宫制，可按需调整）
  const horoscope = new Horoscope({
    origin,
    houseSystem: 'placidus',
    zodiac: 'tropical',
    language: 'zh'
  });

  const data = horoscope?.get() || {};

  // planets: 包含太阳、月亮、水金火木土天海冥等
  const formatted = {};
  if (data?.planets) {
    Object.keys(data.planets).forEach(key => {
      // data.planets[key]: { name, longitude, retrograde, house, ... }
      formatted[key] = formatPlanet(data.planets[key]);
    });
  }

  // ASC/MC 通常在 data.angles 或 data.points 中，按库版本而定，兼容两种字段
  const ascLon =
    data?.angles?.Ascendant?.longitude ??
    data?.points?.Ascendant?.longitude ??
    null;

  const mcLon =
    data?.angles?.Midheaven?.longitude ??
    data?.points?.Midheaven?.longitude ??
    null;

  const Ascendant = ascLon != null ? degToSign(ascLon) : null;
  const MC = mcLon != null ? degToSign(mcLon) : null;

  return { formatted, Ascendant, MC };
}

// /api/chart?year=1990&month=5&day=12&hour=14&minute=30&city=Beijing&country=China&tz=8
app.get('/api/chart', async (req, res) => {
  try {
    const { year, month, day, hour, minute, city, country, tz } = req.query;

    // 参数校验
    const required = { year, month, day, hour, minute, city, country, tz };
    for (const [k, v] of Object.entries(required)) {
      if (v == null || `${v}`.trim() === '') {
        return res.status(400).json({ error: `Missing required parameter: ${k}` });
      }
    }
    const tzOffset = parseFloat(tz);
    if (Number.isNaN(tzOffset)) {
      return res.status(400).json({ error: 'Invalid tz format' });
    }

    // 地理编码
    const geo = await geocoder.geocode(`${city}, ${country}`);
    if (!geo || geo.length === 0) {
      return res.status(400).json({ error: 'Could not find coordinates for the specified location.' });
    }
    const { latitude, longitude } = geo[0];

    // 本命盘
    const natal = buildHoroscope(year, month, day, hour, minute, latitude, longitude, tzOffset);

    // 当前行运（使用当前 UTC 时间，tz=0）
    const now = new Date();
    const nowUtc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const transits = buildHoroscope(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth() + 1,
      nowUtc.getUTCDate(),
      nowUtc.getUTCHours(),
      nowUtc.getUTCMinutes(),
      latitude,
      longitude,
      0
    );

    // 输出结构与您原意保持一致
    res.status(200).json({
      natalChart: {
        ...natal.formatted,
        Ascendant: natal.Ascendant,
        MC: natal.MC
      },
      transits: {
        ...transits.formatted,
        Ascendant: transits.Ascendant,
        MC: transits.MC
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
});

app.listen(3000, () => {
  console.log('Astro API started on http://localhost:3000');
});
