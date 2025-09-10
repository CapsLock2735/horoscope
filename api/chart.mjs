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
// import { siderealTime, ecliptic, horizon } from 'astronomia/coordinate';

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
const degText = d => { 
  const x = norm360(d) % 30; 
  const a = Math.floor(x); 
  const m = Math.floor((x - a) * 60); 
  return `${a}°${String(m).padStart(2,'0')}'` 
};

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

  // 其他行星 - 使用 VSOP87 数据
  const datasets = {
    Mercury: vsop87Dmercury, 
    Venus: vsop87Dvenus, 
    Mars: vsop87Dmars,
    Jupiter: vsop87Djupiter, 
    Saturn: vsop87Dsaturn, 
    Uranus: vsop87Duranus, 
    Neptune: vsop87Dneptune
  };
  
  for (const [name, ds] of Object.entries(datasets)) {
    try {
      const planet = new Planet(ds);
      const pos = planet.position(jde);
      
      // 确保位置数据有效
      if (pos && typeof pos.lon === 'number' && !isNaN(pos.lon)) {
        const lonDeg = norm360(radToDeg(pos.lon));
        out[name] = { 
          sign: signFromDeg(lonDeg), 
          signEn: signFromDegEn(lonDeg),
          degree: degText(lonDeg), 
          longitude: Number(lonDeg.toFixed(2)) 
        };
      } else {
        console.error(`Invalid position data for ${name}:`, pos);
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

function calculateAscMc(jde, latitude, longitude) {
  // 使用更精确的 ASC/MC 计算方法
  
  // 计算从 J2000.0 开始的天数
  const daysSinceJ2000 = (jde - 2451545.0);
  
  // 计算格林威治恒星时 (使用更精确的公式)
  const T = daysSinceJ2000 / 36525.0; // 儒略世纪
  const gmst = (280.46061837 + 360.98564736629 * daysSinceJ2000 + 0.000387933 * T * T) % 360;
  
  // 计算本地恒星时
  const lst = (gmst + longitude) % 360;
  
  // 计算黄赤交角 (考虑岁差)
  const obliquity = 23.4392911 - 0.0130042 * T;
  
  // 计算 MC (中天) - 本地恒星时就是 MC 的黄经
  const mcLon = norm360(lst);
  
  // 计算 ASC (上升点) - 使用正确的公式
  const latRad = degToRad(latitude);
  const lstRad = degToRad(lst);
  const oblRad = degToRad(obliquity);
  
  // 上升点计算公式
  const ascLon = norm360(radToDeg(Math.atan2(
    -Math.cos(lstRad),
    Math.sin(oblRad) * Math.tan(latRad) + Math.cos(oblRad) * Math.sin(lstRad)
  )));

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
  const angles = calculateAscMc(jde, latitude, longitude);
  
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
    const { year, month, day, hour, minute, city, country, tz } = req.query ?? req.body ?? {};
    
    // 参数校验
    const required = { year, month, day, hour, minute, city, country, tz };
    for (const [k, v] of Object.entries(required)) {
      if (v == null || `${v}`.trim() === '') {
        return res.status(400).json({ error: `Missing required parameter: ${k}` });
      }
    }
    
    const tzOffset = parseFloat(tz);
    if (Number.isNaN(tzOffset)) return res.status(400).json({ error: 'Invalid tz format' });

    // 地理编码
    const geo = await geocoder.geocode(`${city}, ${country}`);
    if (!geo || geo.length === 0) {
      return res.status(400).json({ error: 'Could not find coordinates for the specified location.' });
    }
    const { latitude, longitude } = geo[0];

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
