import NodeGeocoder from 'node-geocoder';
import julian from 'astronomia/julian';
import { Planet } from 'astronomia/planetposition';
import solar from 'astronomia/solar';
import moonposition from 'astronomia/moonposition';
import vsop87Dearth from 'astronomia/data/vsop87Dearth';
import vsop87Dmercury from 'astronomia/data/vsop87Dmercury';
import vsop87Dvenus from 'astronomia/data/vsop87Dvenus';
import vsop87Dmars from 'astronomia/data/vsop87Dmars';
import vsop87Djupiter from 'astronomia/data/vsop87Djupiter';
import vsop87Dsaturn from 'astronomia/data/vsop87Dsaturn';
import vsop87Duranus from 'astronomia/data/vsop87Duranus';
import vsop87Dneptune from 'astronomia/data/vsop87Dneptune';
// --- 逻辑修正 1：根据指南，导入正确的坐标和恒星时模块 ---
import coord from 'astronomia/coord';
import sidereal from 'astronomia/sidereal';


const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY
});

const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const SIGNS_EN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

const radToDeg = r => r * 180 / Math.PI;
const degToRad = d => d * Math.PI / 180;
const norm360 = d => (d % 360 + 360) % 360;
const signFromDeg = d => SIGNS[Math.floor(norm360(d) / 30) % 12];
const signFromDegEn = d => SIGNS_EN[Math.floor(norm360(d) / 30) % 12];

// 逻辑修正：优化度数显示，增加秒，使其更精确
const degText = d => { 
  const x = norm360(d);
  const deg = Math.floor(x);
  const minutes = Math.floor((x - deg) * 60);
  const seconds = Math.round(((x - deg) * 60 - minutes) * 60);
  const signDegree = deg % 30;
  return `${signDegree}°${String(minutes).padStart(2,'0')}'${String(seconds).padStart(2,'0')}"`;
};

// --- 逻辑修正 2：修正行星位置计算（日心 -> 地心）并增加逆行判断 ---
function calculatePlanets(jde) {
  const out = {};
  const earth = new Planet(vsop87Dearth);

  // 太阳
  const sun = solar.apparentVSOP87(earth, jde);
  const sunLonDeg = norm360(radToDeg(sun.lon));
  out.Sun = { 
    sign: signFromDeg(sunLonDeg), 
    signEn: signFromDegEn(sunLonDeg),
    degree: degText(sunLonDeg), 
    longitude: Number(sunLonDeg.toFixed(4)),
    isRetrograde: false
  };

  // 月亮
  const moonPos = moonposition.position(jde);
  const moonLonDeg = norm360(radToDeg(moonPos.lon));
  out.Moon = { 
    sign: signFromDeg(moonLonDeg), 
    signEn: signFromDegEn(moonLonDeg),
    degree: degText(moonLonDeg), 
    longitude: Number(moonLonDeg.toFixed(4)),
    isRetrograde: false
  };

  const datasets = {
    Mercury: vsop87Dmercury, Venus: vsop87Dvenus, Mars: vsop87Dmars,
    Jupiter: vsop87Djupiter, Saturn: vsop87Dsaturn, Uranus: vsop87Duranus, 
    Neptune: vsop87Dneptune
  };
  
  for (const [name, ds] of Object.entries(datasets)) {
    try {
      const planet = new Planet(ds);
      // 核心逻辑修正：使用 geocentricVSOP87 替换 planet.position
      const pos = solar.geocentricVSOP87(planet, earth, jde);
      
      if (pos && typeof pos.lon === 'number' && !isNaN(pos.lon)) {
        const lonDeg = norm360(radToDeg(pos.lon));
        
        // 增加逆行判断逻辑
        const posPrev = solar.geocentricVSOP87(planet, earth, jde - 0.001);
        const lonDegPrev = norm360(radToDeg(posPrev.lon));
        const isRetrograde = norm360(lonDeg - lonDegPrev) > 180;

        out[name] = { 
          sign: signFromDeg(lonDeg), 
          signEn: signFromDegEn(lonDeg),
          degree: degText(lonDeg) + (isRetrograde ? "r" : ""),
          longitude: Number(lonDeg.toFixed(4)),
          isRetrograde: isRetrograde
        };
      } else {
        // 保留您原来的错误处理
        out[name] = { sign: "白羊座", signEn: "Aries", degree: "0°00'", longitude: 0, isRetrograde: false };
      }
    } catch (error) {
      // 保留您原来的错误处理
      out[name] = { sign: "白羊座", signEn: "Aries", degree: "0°00'", longitude: 0, isRetrograde: false };
    }
  }
  return out;
}

// --- 逻辑修正 3：根据指南，使用 coord 和 sidereal 模块精确计算 ASC/MC ---
function calculateAscMc(jde, latitude, longitude) {
  // 根据指南，经度约定为“西正东负”，因此东经需要取负值
  const lonRad = degToRad(-longitude); 
  const latRad = degToRad(latitude);

  // 使用 sidereal 模块计算本地恒星时
  const mst = sidereal.mean(jde); // 格林尼治平均恒星时
  const lstRad = degToRad(mst) + lonRad; // 本地恒星时（弧度）

  // 使用 coord 模块获取黄赤交角
  // 注意：coord 模块导出的对象中包含了 ecliptic 和 horizon 子对象
  const oblRad = coord.ecliptic.trueObliquity(jde);

  // 使用 coord.horizon 内的函数计算上升点和中天
  const ascRad = coord.horizon.ascendant(lstRad, latRad, oblRad);
  const mcRad = coord.horizon.midheaven(lstRad, oblRad);

  const ascLon = norm360(radToDeg(ascRad));
  const mcLon = norm360(radToDeg(mcRad));

  return {
    Ascendant: {
      sign: signFromDeg(ascLon),
      signEn: signFromDegEn(ascLon),
      degree: degText(ascLon),
      longitude: Number(ascLon.toFixed(4))
    },
    MC: {
      sign: signFromDeg(mcLon),
      signEn: signFromDegEn(mcLon),
      degree: degText(mcLon),
      longitude: Number(mcLon.toFixed(4))
    }
  };
}

// 保留您原来的宫位计算和分配函数
function wholeSignHouses(ascLongitude) {
  const houses = [];
  const ascSignIndex = Math.floor(norm360(ascLongitude) / 30);
  for (let i = 0; i < 12; i++) {
    const signIndex = (ascSignIndex + i) % 12;
    houses.push({ house: i + 1, sign: SIGNS[signIndex], signEn: SIGNS_EN[signIndex], cusp: signIndex * 30 });
  }
  return houses;
}

function assignHouse(longitude, houses) {
  const lon = norm360(longitude);
  const signIndex = Math.floor(lon / 30);
  const ascSignIndex = Math.floor(houses[0].cusp / 30);
  return ((signIndex - ascSignIndex + 12) % 12) + 1;
}

// 以下所有代码均保持不变
function buildChart(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  const localDate = new Date(
    parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 
    parseInt(hour, 10), parseInt(minute, 10)
  );
  const utcDate = new Date(localDate.getTime() - (tzOffsetHours * 60 * 60 * 1000));
  const jde = julian.DateToJDE(utcDate);
  const planets = calculatePlanets(jde);
  const angles = calculateAscMc(jde, latitude, longitude);
  const houses = wholeSignHouses(angles.Ascendant.longitude);
  
  const planetsWithHouses = {};
  for (const [name, planet] of Object.entries(planets)) {
    planetsWithHouses[name] = { ...planet, house: assignHouse(planet.longitude, houses) };
  }
  
  return {
    planets: planetsWithHouses, angles, houses,
    chartInfo: { date: utcDate.toISOString(), location: { latitude, longitude }, timezone: tzOffsetHours }
  };
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
      nowUtc.getUTCFullYear(), nowUtc.getUTCMonth() + 1, nowUtc.getUTCDate(),
      nowUtc.getUTCHours(), nowUtc.getUTCMinutes(), latitude, longitude, 0
    );

    return res.status(200).json({
      natalChart: { planets: natal.planets, angles: natal.angles, houses: natal.houses, chartInfo: natal.chartInfo },
      transits: { planets: transits.planets, angles: transits.angles, houses: transits.houses, chartInfo: transits.chartInfo },
      analysis: { aspects: "Aspects calculation can be added here", houseSystem: "Whole Sign Houses", zodiac: "Tropical" }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
}
