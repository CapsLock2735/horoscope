import NodeGeocoder from 'node-geocoder';
import julian from 'astronomia/julian';
import sidereal from 'astronomia/sidereal';
import { Planet } from 'astronomia/planetposition';
import solar from 'astronomia/solar';
import moonposition from 'astronomia/moonposition';
import coord from 'astronomia/coord';
import vsop87Dearth from 'astronomia/data/vsop87Dearth';
import vsop87Bearth from 'astronomia/data/vsop87Bearth';
import vsop87Dmercury from 'astronomia/data/vsop87Dmercury';
import vsop87Dvenus from 'astronomia/data/vsop87Dvenus';
import vsop87Dmars from 'astronomia/data/vsop87Dmars';
import vsop87Djupiter from 'astronomia/data/vsop87Djupiter';
import vsop87Dsaturn from 'astronomia/data/vsop87Dsaturn';
import vsop87Buranus from 'astronomia/data/vsop87Buranus';
import vsop87Bneptune from 'astronomia/data/vsop87Bneptune';
// import { siderealTime, ecliptic, horizon } from 'astronomia/coordinate';

// 延迟创建 geocoder 以避免在无 API Key 的环境下初始化报错
let geocoder = null;
function getGeocoder() {
  if (!geocoder) {
    geocoder = NodeGeocoder({
      provider: 'opencage',
      apiKey: process.env.GEOCODER_API_KEY
    });
  }
  return geocoder;
}

const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const SIGNS_EN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

const radToDeg = r => r * 180 / Math.PI;
const degToRad = d => d * Math.PI / 180;
const norm360 = d => (d % 360 + 360) % 360;
const signFromDeg = d => SIGNS[Math.floor(norm360(d) / 30) % 12];
const signFromDegEn = d => SIGNS_EN[Math.floor(norm360(d) / 30) % 12];
const degText = d => { 
  const x = norm360(d) % 30; 
  const a = Math.floor(x); 
  const m = Math.floor((x - a) * 60); 
  return `${a}°${String(m).padStart(2,'0')}'` 
};

// 将球坐标转换为直角坐标（黄道坐标系，单位：天文单位）
function eclipticSphericalToRectangular(lon, lat, range) {
  const cosLat = Math.cos(lat);
  const x = range * cosLat * Math.cos(lon);
  const y = range * cosLat * Math.sin(lon);
  const z = range * Math.sin(lat);
  return { x, y, z };
}

// 直角坐标转回球坐标（返回：lon, lat, range）
function rectangularToEclipticSpherical(x, y, z) {
  const range = Math.hypot(x, y, z);
  const lon = Math.atan2(y, x);
  const lat = Math.atan2(z, Math.hypot(x, y));
  return { lon, lat, range };
}

function calculatePlanets(jde) {
  const out = {};
  
  // 太阳 - 使用更精确的计算
  const earth = new Planet(vsop87Dearth);
  const sun = solar.apparentVSOP87(earth, jde);
  const sunLonDeg = norm360(radToDeg(sun.lon));
  out.Sun = { 
    sign: signFromDeg(sunLonDeg), 
    signEn: signFromDegEn(sunLonDeg),
    degree: degText(sunLonDeg), 
    longitude: Number(sunLonDeg.toFixed(2)) 
  };

  // 月亮 - 使用更精确的计算
  const moonPos = moonposition.position(jde);
  const moonLonDeg = norm360(radToDeg(moonPos.lon));
  out.Moon = { 
    sign: signFromDeg(moonLonDeg), 
    signEn: signFromDegEn(moonLonDeg),
    degree: degText(moonLonDeg), 
    longitude: Number(moonLonDeg.toFixed(2)) 
  };

  // 其他行星 - 使用 VSOP87 数据（改为地心黄经）
  const datasets = {
    Mercury: vsop87Dmercury, 
    Venus: vsop87Dvenus, 
    Mars: vsop87Dmars,
    Jupiter: vsop87Djupiter, 
    Saturn: vsop87Dsaturn, 
    // 注意：Uranus/Neptune 使用 VSOP87B（J2000 章动前黄道）以避免 D 数据集中 L 分量为 0 的问题
    Uranus: vsop87Buranus,
    Neptune: vsop87Bneptune
  };
  
  // 地球的日心位置（黄道球坐标 -> 直角坐标）
  const earthHelio = earth.position(jde); // {lon, lat, range} (radians, AU)
  const eRect = eclipticSphericalToRectangular(earthHelio.lon, earthHelio.lat, earthHelio.range);

  for (const [name, ds] of Object.entries(datasets)) {
    try {
      const planet = new Planet(ds);
      // VSOP87 返回行星的日心黄道球坐标
      // 对于 B 数据（J2000 章动前黄道），position() 会岁差到日期黄道；对 D 数据直接返回日期黄道
      const pHelio = planet.position(jde);
      // 转换为直角坐标
      const pRect = eclipticSphericalToRectangular(pHelio.lon, pHelio.lat, pHelio.range);
      // 由日心转地心：行星 - 地球
      const geoRect = { x: pRect.x - eRect.x, y: pRect.y - eRect.y, z: pRect.z - eRect.z };
      const geo = rectangularToEclipticSpherical(geoRect.x, geoRect.y, geoRect.z);
      
      // 确保位置数据有效
      if (geo && typeof geo.lon === 'number' && !isNaN(geo.lon)) {
        const lonDeg = norm360(radToDeg(geo.lon));
        out[name] = { 
          sign: signFromDeg(lonDeg), 
          signEn: signFromDegEn(lonDeg),
          degree: degText(lonDeg), 
          longitude: Number(lonDeg.toFixed(2)) 
        };
      } else {
        console.error(`Invalid position data for ${name}:`, geo);
        out[name] = { 
          sign: "白羊座", 
          signEn: "Aries",
          degree: "0°00'", 
          longitude: 0 
        };
      }
    } catch (error) {
      console.error(`Error calculating ${name}:`, error);
      // 如果计算失败，使用默认值
      out[name] = { 
        sign: "白羊座", 
        signEn: "Aries",
        degree: "0°00'", 
        longitude: 0 
      };
    }
  }

  return out;
}

// 从 UTC Date 计算儒略日（UT）
function dateToJulianDayUTC(date) {
  return 2440587.5 + date.getTime() / 86400000;
}

// 平黄赤交角（角秒 -> 度）
function meanObliquityDeg(T) {
  const seconds = 21.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T;
  return 23 + 26 / 60 + seconds / 3600;
}

// 简化章动（Meeus 简式，单位：弧秒）
function nutationInLongitudeArcsec(T) {
  const L = degToRad(280.4665 + 36000.7698 * T);
  const Lp = degToRad(218.3165 + 481267.8813 * T);
  const Om = degToRad(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
  return -17.20 * Math.sin(Om) - 1.32 * Math.sin(2 * L) - 0.23 * Math.sin(2 * Lp) + 0.21 * Math.sin(2 * Om);
}

function nutationInObliquityArcsec(T) {
  const L = degToRad(280.4665 + 36000.7698 * T);
  const Lp = degToRad(218.3165 + 481267.8813 * T);
  const Om = degToRad(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000);
  return 9.20 * Math.cos(Om) + 0.57 * Math.cos(2 * L) + 0.10 * Math.cos(2 * Lp) - 0.09 * Math.cos(2 * Om);
}

// 计算格林威治视恒星时（度）
function apparentSiderealTimeDeg(jdUT) {
  // 使用 astronomia 的视恒星时（单位：秒）并转换为度
  const s = sidereal.apparent(jdUT); // seconds of time in [0, 86400)
  const deg = (s / 240); // 86400s -> 360°
  return norm360(deg);
}

function calculateAscMc(utcDate, latitude, longitude) {
  // 计算本地视恒星时（度）
  const jdUT = dateToJulianDayUTC(utcDate);
  const gast = apparentSiderealTimeDeg(jdUT);
  const lstDeg = norm360(gast + longitude);

  // 计算黄赤交角（真黄赤交角）
  const T = (jdUT - 2451545.0) / 36525.0;
  const obliquity = meanObliquityDeg(T) + nutationInObliquityArcsec(T) / 3600.0;

  // 采用数值方法：在黄道上搜索地平高度为 0 的交点，并选取东方（方位角 < 180°）者为 ASC
  const lst = degToRad(lstDeg);
  const eps = degToRad(obliquity);
  const phi = degToRad(latitude);

  function altitudeForLambda(lamRad) {
    const eq = new coord.Ecliptic(lamRad, 0).toEquatorial(eps);
    const H = lst - eq.ra;
    const alt = Math.asin(Math.sin(phi) * Math.sin(eq.dec) + Math.cos(phi) * Math.cos(eq.dec) * Math.cos(H));
    return alt;
  }

  function azimuthForLambda(lamRad) {
    const eq = new coord.Ecliptic(lamRad, 0).toEquatorial(eps);
    const H = lst - eq.ra;
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(eq.dec) * Math.cos(phi));
    return norm360(radToDeg(az));
  }

  // 扫描 0..360° 找到两个过零区间
  const crossings = [];
  let prevLam = 0;
  let prevAlt = altitudeForLambda(0);
  const steps = 720; // 0.5° 步长
  for (let i = 1; i <= steps; i++) {
    const lam = (i * 2 * Math.PI) / steps;
    const alt = altitudeForLambda(lam);
    if (alt === 0 || (alt > 0) !== (prevAlt > 0)) {
      crossings.push([prevLam, lam]);
      if (crossings.length === 2) break;
    }
    prevLam = lam;
    prevAlt = alt;
  }
  // 二分逼近
  function refineInterval(a, b) {
    let fa = altitudeForLambda(a);
    for (let j = 0; j < 40; j++) {
      const m = 0.5 * (a + b);
      const fm = altitudeForLambda(m);
      if ((fa > 0) !== (fm > 0)) { b = m; } else { a = m; fa = fm; }
    }
    return 0.5 * (a + b);
  }
  let ascLon;
  if (crossings.length > 0) {
    const roots = crossings.map(([a, b]) => refineInterval(a, b));
    // 选择东方交点（在 Meeus 约定下：方位角 > 180°）
    const az0 = azimuthForLambda(roots[0]);
    const cand = az0 > 180 ? roots[0] : (roots[1] ?? roots[0]);
    ascLon = norm360(radToDeg(cand));
  } else {
    // 回退到解析公式（极端情况下）
    ascLon = norm360(radToDeg(Math.atan2(
      -Math.cos(lst),
      Math.sin(eps) * Math.tan(phi) + Math.cos(eps) * Math.sin(lst)
    )));
  }

  // MC（中天）维持原公式
  const mcLon = norm360(radToDeg(Math.atan2(Math.sin(lst), Math.cos(lst) * Math.cos(eps))));

  return {
    Ascendant: {
      sign: signFromDeg(ascLon),
      signEn: signFromDegEn(ascLon),
      degree: degText(ascLon),
      longitude: Number(ascLon.toFixed(2))
    },
    MC: {
      sign: signFromDeg(mcLon),
      signEn: signFromDegEn(mcLon),
      degree: degText(mcLon),
      longitude: Number(mcLon.toFixed(2))
    }
  };
}

function wholeSignHouses(ascLongitude) {
  const houses = [];
  const ascSignIndex = Math.floor(norm360(ascLongitude) / 30);
  
  for (let i = 0; i < 12; i++) {
    const signIndex = (ascSignIndex + i) % 12;
    houses.push({
      house: i + 1,
      sign: SIGNS[signIndex],
      signEn: SIGNS_EN[signIndex],
      cusp: signIndex * 30
    });
  }
  return houses;
}

function assignHouse(longitude, houses) {
  const lon = norm360(longitude);
  const signIndex = Math.floor(lon / 30);
  const ascSignIndex = Math.floor(houses[0].cusp / 30);
  return ((signIndex - ascSignIndex + 12) % 12) + 1;
}

function buildChart(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  // 修正时间计算：输入时间是本地时间，需要转换为 UTC
  const localDate = new Date(
    parseInt(year, 10), 
    parseInt(month, 10) - 1, 
    parseInt(day, 10), 
    parseInt(hour, 10), 
    parseInt(minute, 10)
  );
  
  // 转换为 UTC 时间
  const utcDate = new Date(localDate.getTime() - (tzOffsetHours * 60 * 60 * 1000));
  
  const jde = julian.DateToJDE(utcDate);
  
  // 计算行星位置
  const planets = calculatePlanets(jde);
  
  // 计算 ASC/MC
  const angles = calculateAscMc(utcDate, latitude, longitude);
  
  // 计算宫位
  const houses = wholeSignHouses(angles.Ascendant.longitude);
  
  // 为每个行星分配宫位
  const planetsWithHouses = {};
  for (const [name, planet] of Object.entries(planets)) {
    planetsWithHouses[name] = {
      ...planet,
      house: assignHouse(planet.longitude, houses)
    };
  }
  
  return {
    planets: planetsWithHouses,
    angles,
    houses,
    chartInfo: {
      date: utcDate.toISOString(),
      location: { latitude, longitude },
      timezone: tzOffsetHours
    }
  };
}

export default async function handler(req, res) {
  try {
    const { year, month, day, hour, minute, city, state, country, tz } = req.query ?? req.body ?? {};
    
    // 参数校验
    const required = { year, month, day, hour, minute, tz };
    for (const [k, v] of Object.entries(required)) {
      if (v == null || `${v}`.trim() === '') {
        return res.status(400).json({ error: `Missing required parameter: ${k}` });
      }
    }
    
    const tzOffset = parseFloat(tz);
    if (Number.isNaN(tzOffset)) return res.status(400).json({ error: 'Invalid tz format' });

    // 支持直接传入坐标以便无 API Key 调试：lat/lon 优先生效
    let { lat, lon } = req.query ?? req.body ?? {};
    let latitude;
    let longitude;
    if (lat != null && lon != null && `${lat}`.trim() !== '' && `${lon}`.trim() !== '') {
      latitude = parseFloat(lat);
      longitude = parseFloat(lon);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return res.status(400).json({ error: 'Invalid lat/lon format' });
      }
    } else {
      // 地理编码
      if (!city || !country) {
        return res.status(400).json({ error: 'Missing required parameter: city or country' });
      }
      const address = state && `${state}`.trim() !== ''
        ? `${city}, ${state}, ${country}`
        : `${city}, ${country}`;
      const geo = await getGeocoder().geocode(address);
      if (!geo || geo.length === 0) {
        return res.status(400).json({ error: `Could not find coordinates for the specified location: ${address}` });
      }
      ({ latitude, longitude } = geo[0]);
    }

    // 本命盘
    const natal = buildChart(year, month, day, hour, minute, latitude, longitude, tzOffset);

    // 当前行运
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
      natalChart: {
        planets: natal.planets,
        angles: natal.angles,
        houses: natal.houses,
        chartInfo: natal.chartInfo
      },
      transits: {
        planets: transits.planets,
        angles: transits.angles,
        houses: transits.houses,
        chartInfo: transits.chartInfo
      },
      analysis: {
        aspects: "Aspects calculation can be added here",
        houseSystem: "Whole Sign Houses",
        zodiac: "Tropical"
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
}
