import NodeGeocoder from 'node-geocoder';
// --- 核心修正：采用正确的模块导入方式 ---
import astronomia from 'astronomia'; // 导入主对象
import { Planet } from 'astronomia/planetposition'; // 保持对 Planet 的正确导入
// --- 数据文件的导入方式保持不变 ---
import vsop87Dearth from 'astronomia/data/vsop87Dearth';
import vsop87Dmercury from 'astronomia/data/vsop87Dmercury';
import vsop87Dvenus from 'astronomia/data/vsop87Dvenus';
import vsop87Dmars from 'astronomia/data/vsop87Dmars';
import vsop87Djupiter from 'astronomia/data/vsop87Djupiter';
import vsop87Dsaturn from 'astronomia/data/vsop87Dsaturn';
import vsop87Duranus from 'astronomia/data/vsop87Duranus';
import vsop87Dneptune from 'astronomia/data/vsop87Dneptune';

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
  const x = norm360(d);
  const deg = Math.floor(x);
  const minutes = Math.floor((x - deg) * 60);
  const seconds = Math.round(((x - deg) * 60 - minutes) * 60);
  return `${deg % 30}°${String(minutes).padStart(2,'0')}'${String(seconds).padStart(2,'0')}"`;
};

function calculatePlanets(jde) {
  const out = {};
  const earth = new Planet(vsop87Dearth);

  // --- 核心修正：通过主对象调用模块 ---
  const sunPos = astronomia.solar.apparentVSOP87(earth, jde);
  const sunLonDeg = norm360(radToDeg(sunPos.lon));
  out.Sun = { 
    sign: signFromDeg(sunLonDeg), 
    signEn: signFromDegEn(sunLonDeg),
    degree: degText(sunLonDeg), 
    longitude: Number(sunLonDeg.toFixed(4)),
    isRetrograde: false
  };

  // --- 核心修正：通过主对象调用模块 ---
  const moonPos = astronomia.moonposition.position(jde);
  const moonLonDeg = norm360(radToDeg(moonPos.lon));
  out.Moon = { 
    sign: signFromDeg(moonLonDeg), 
    signEn: signFromDegEn(moonLonDeg),
    degree: degText(moonLonDeg), 
    longitude: Number(moonLonDeg.toFixed(4)),
    isRetrograde: false
  };

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
    const planet = new Planet(ds);
    // --- 核心修正：通过主对象调用模块 ---
    const pos = astronomia.solar.geocentricVSOP87(planet, earth, jde);
    const lonDeg = norm360(radToDeg(pos.lon));
    // --- 核心修正：通过主对象调用模块 ---
    const posPrev = astronomia.solar.geocentricVSOP87(planet, earth, jde - 0.001);
    const lonDegPrev = norm360(radToDeg(posPrev.lon));
    const isRetrograde = norm360(lonDeg - lonDegPrev) > 180;

    out[name] = { 
      sign: signFromDeg(lonDeg), 
      signEn: signFromDegEn(lonDeg),
      degree: degText(lonDeg), 
      longitude: Number(lonDeg.toFixed(4)),
      isRetrograde: isRetrograde
    };
  }

  return out;
}

function assignHouse(longitude, houseCusps) {
    const lon = norm360(longitude);
    const cusps = houseCusps.map(c => norm360(c));

    for (let i = 0; i < 12; i++) {
        const cusp1 = cusps[i];
        const cusp2 = cusps[(i + 1) % 12];
        if (cusp1 > cusp2) {
            if (lon >= cusp1 || lon < cusp2) {
                return i + 1;
            }
        } else {
            if (lon >= cusp1 && lon < cusp2) {
                return i + 1;
            }
        }
    }
    return -1;
}

function buildChart(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  const localDate = new Date(
    parseInt(year, 10), 
    parseInt(month, 10) - 1, 
    parseInt(day, 10), 
    parseInt(hour, 10), 
    parseInt(minute, 10)
  );
  
  const utcDate = new Date(localDate.getTime() - (tzOffsetHours * 60 * 60 * 1000));
  // --- 核心修正：通过主对象调用模块 ---
  const jde = astronomia.julian.DateToJDE(utcDate);
  const planets = calculatePlanets(jde);
  
  // --- 核心修正：通过主对象调用模块 ---
  const placidusCusps = astronomia.house.placidus(jde, degToRad(latitude), degToRad(longitude));
  const ascLon = norm360(radToDeg(placidusCusps.asc));
  const mcLon = norm360(radToDeg(placidusCusps.mc));
  const houseCuspDegrees = placidusCusps.cusps.map(c => norm360(radToDeg(c)));

  const angles = {
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

  const houses = houseCuspDegrees.map((cusp, i) => ({
      house: i + 1,
      sign: signFromDeg(cusp),
      signEn: signFromDegEn(cusp),
      cusp: Number(cusp.toFixed(4)),
      degree: degText(cusp)
  }));
  
  const planetsWithHouses = {};
  for (const [name, planet] of Object.entries(planets)) {
    planetsWithHouses[name] = {
      ...planet,
      house: assignHouse(planet.longitude, houseCuspDegrees)
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

// Handler 部分保持不变
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
        houseSystem: "Placidus",
        zodiac: "Tropical"
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
}
