import NodeGeocoder from 'node-geocoder';
import Astronomy from 'astronomy-engine';

const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY
});

const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];

function norm360(x) {
  let v = x % 360;
  if (v < 0) v += 360;
  return v;
}

function degToSign(longitude) {
  const norm = norm360(longitude);
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

function julianDateFromUTC(date) {
  return Astronomy.MakeTime(date).ut;
}

function calcEclipticLongitude(body, time) {
  // 返回黄经（度）
  const ecl = Astronomy.EclipticLongitude(body, time);
  return ecl;
}

function calcAscMc(time, latitude, longitude) {
  // 返回 ASC/MC 黄经（度）
  const hor = Astronomy.Horizon(time, latitude, -longitude, 0, 0); // 获取本地视点所需恒星时由库内部处理
  // Astronomy-engine 提供 SiderealTime，但更直接方式：使用 House 系列需自行实现。
  // 这里用内置便捷法：求中天(经度=本地恒星时*15° + 黄赤交角相关换算)，上升点需从地平坐标反推。
  // 为简化与稳妥，使用内置工具函数：
  const observer = new Astronomy.Observer(latitude, longitude, 0);
  const eq = Astronomy.Equator('earth', time, observer, true, true);
  const gast = Astronomy.SiderealTime(time);
  // 计算 MC：黄道中天经度
  const obliq = Astronomy.Obliquity(time);
  const mc = norm360(Math.atan2(Math.tan(Astronomy.DegreesToRadians(gast * 15)), Math.cos(Astronomy.DegreesToRadians(obliq))) * 180 / Math.PI);
  // ASC 计算（简化公式近似）：
  const latRad = Astronomy.DegreesToRadians(latitude);
  const stRad = Astronomy.DegreesToRadians(gast * 15);
  const epsRad = Astronomy.DegreesToRadians(obliq);
  const asc = norm360(Math.atan2(
    -Math.cos(stRad),
    Math.sin(epsRad) * Math.tan(latRad) + Math.cos(epsRad) * Math.sin(stRad)
  ) * 180 / Math.PI);

  return { asc, mc };
}

function wholeSignHouses(ascLongitude) {
  const houses = [];
  const ascSignIndex = Math.floor(norm360(ascLongitude) / 30);
  for (let i = 0; i < 12; i++) {
    const signIndex = (ascSignIndex + i) % 12;
    houses.push({
      index: i + 1,
      cusp: signIndex * 30
    });
  }
  return houses;
}

function assignHouse(longitude, houses) {
  const lon = norm360(longitude);
  const idx = Math.floor(lon / 30); // 整宫制：每30°一宫
  return (idx - Math.floor(houses[0].cusp / 30) + 12) % 12 + 1;
}

function buildChart(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  const utc = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - Number(tzOffsetHours),
    Number(minute),
    0, 0
  ));

  const time = Astronomy.MakeTime(utc);

  const planets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
  const planetMap = {
    Sun: 'Sun', Moon: 'Moon', Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars',
    Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune', Pluto: 'Pluto'
  };

  const positions = {};
  for (const p of planets) {
    const lon = calcEclipticLongitude(planetMap[p], time);
    positions[p] = { longitude: lon };
  }

  const { asc, mc } = calcAscMc(time, Number(latitude), Number(longitude));
  const houses = wholeSignHouses(asc);

  const formatted = {};
  for (const key of Object.keys(positions)) {
    const base = degToSign(positions[key].longitude);
    const house = assignHouse(base.longitude, houses);
    formatted[key] = { ...base, isRetrograde: null, house };
  }

  const Ascendant = degToSign(asc);
  const MC = degToSign(mc);

  return { planets: formatted, Ascendant, MC, houses };
}

export default async function handler(req, res) {
  try {
    const { year, month, day, hour, minute, city, country, tz } = req.query ?? req.body ?? {};
    const required = { year, month, day, hour, minute, city, country, tz };
    for (const [k, v] of Object.entries(required)) {
      if (v == null || `${v}`.trim() === '') {
        return res.status(400).json({ error: `Missing required parameter: ${k}` });
      }
    }
    const tzOffset = parseFloat(tz);
    if (Number.isNaN(tzOffset)) return res.status(400).json({ error: 'Invalid tz format' });

    const geo = await geocoder.geocode(`${city}, ${country}`);
    if (!geo || geo.length === 0) {
      return res.status(400).json({ error: 'Could not find coordinates for the specified location.' });
    }
    const { latitude, longitude } = geo[0];

    const natal = buildChart(year, month, day, hour, minute, latitude, longitude, tzOffset);

    const now = new Date();
    const nowUtc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const transits = buildChart(
      nowUtc.getUTCFullYear(),
      nowUtc.getUTCMonth() + 1,
      nowUtc.getUTCDate(),
      nowUtc.getUTCHours(),
      nowUtc.getUTCMinutes(),
      latitude,
      longitude,
      0
    );

    return res.status(200).json({
      natalChart: { ...natal.planets, Ascendant: natal.Ascendant, MC: natal.MC, houses: natal.houses },
      transits: { ...transits.planets, Ascendant: transits.Ascendant, MC: transits.MC, houses: transits.houses }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
}


