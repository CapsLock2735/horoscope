import NodeGeocoder from 'node-geocoder';
// 修正点 1: 只从库的“正门”导入所有需要的功能
import { julian, Planet, solar, moonposition, houses } from 'astronomia';
import vsop87Dearth from 'astronomia/data/vsop87Dearth';
import vsop87Dmercury from 'astronomia/data/vsop87Dmercury';
import vsop87Dvenus from 'astronomia/data/vsop87Dvenus';
import vsop87Dmars from 'astronomia/data/vsop87Dmars';
import vsop87Djupiter from 'astronomia/data/vsop87Djupiter';
import vsop87Dsaturn from 'astronomia/data/vsop87Dsaturn';
import vsop87Duranus from 'astronomia/data/vsop87Duranus';
import vsop87Dneptune from 'astronomia/data/vsop87Dneptune';

// --- 配置与常量 ---
const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY
});

const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const SIGNS_EN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

const radToDeg = r => r * 180 / Math.PI;
const norm360 = d => (d % 360 + 360) % 12;
const signFromDeg = d => SIGNS[Math.floor(norm360(d) / 30) % 12];
const signFromDegEn = d => SIGNS_EN[Math.floor(norm360(d) / 30) % 12];
const degText = d => { 
  const x = norm360(d) % 30; 
  const a = Math.floor(x); 
  const m = Math.floor((x - a) * 60); 
  return `${a}°${String(m).padStart(2,'0')}'` 
};

// --- 核心计算函数 ---
function buildChart(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  const utcHour = parseFloat(hour) - tzOffsetHours;
  const utcMinute = parseFloat(minute);
  const utcDate = new Date(Date.UTC(year, month - 1, day, utcHour, utcMinute));
  const jde = julian.DateToJDE(utcDate);

  // 修正点 2: 直接使用从 'astronomia' 正确导入的 houses 对象
  const housesResult = houses.placidus(jde, latitude, longitude);
  const ascendant = housesResult.asc;
  const mc = housesResult.mc;

  // 行星计算 (这部分逻辑是正确的，予以保留)
  const planets = {};
  const earth = new Planet(vsop87Dearth);
  const sunPos = solar.apparentVSOP87(earth, jde);
  planets.Sun = norm360(radToDeg(sunPos.lon));
  const moonPos = moonposition.position(jde);
  planets.Moon = norm360(radToDeg(moonPos.lon));
  const datasets = {
    Mercury: vsop87Dmercury, Venus: vsop87Dvenus, Mars: vsop87Dmars,
    Jupiter: vsop87Djupiter, Saturn: vsop87Dsaturn, Uranus: vsop87Duranus, 
    Neptune: vsop87Dneptune
  };
  for (const [name, ds] of Object.entries(datasets)) {
    const planet = new Planet(ds);
    const pos = planet.position(jde);
    planets[name] = norm360(radToDeg(pos.lon));
  }
  
  // 格式化输出
  const formattedPlanets = {};
  for (const [name, lon] of Object.entries(planets)) {
    formattedPlanets[name] = {
      sign: signFromDeg(lon),
      signEn: signFromDegEn(lon),
      degree: degText(lon),
      longitude: Number(lon.toFixed(2)),
      house: housesResult.house(lon)
    };
  }

  return {
    planets: formattedPlanets,
    angles: {
      Ascendant: {
        sign: signFromDeg(ascendant),
        signEn: signFromDegEn(ascendant),
        degree: degText(ascendant),
        longitude: Number(ascendant.toFixed(2))
      },
      MC: {
        sign: signFromDeg(mc),
        signEn: signFromDegEn(mc),
        degree: degText(mc),
        longitude: Number(mc.toFixed(2))
      }
    },
    houses: housesResult.cusps.map((cusp, i) => ({
      house: i + 1,
      sign: signFromDeg(cusp.longitude),
      signEn: signFromDegEn(cusp.longitude),
      cusp: Number(cusp.longitude.toFixed(2))
    })),
    chartInfo: {
      date: utcDate.toISOString(),
      location: { latitude, longitude },
      timezone: tzOffsetHours
    }
  };
}

// --- API 处理器 ---
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
    const transits = buildChart(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      latitude,
      longitude,
      -now.getTimezoneOffset() / 60
    );

    return res.status(200).json({
      natalChart: natal,
      transits: transits,
      analysis: {
        aspects: "Aspects calculation can be added here",
        houseSystem: "Placidus",
        zodiac: "Tropical"
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
}
