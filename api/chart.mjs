import SwissEPH from 'sweph-wasm';
import NodeGeocoder from 'node-geocoder';

// --- 1. 初始化 (Initialization) ---
// 这是最关键的一步，必须在所有计算之前完成。
// 我们在模块顶层进行初始化，以便 Vercel 可以复用已加载的实例。
const swe = await SwissEPH.init();
// 从 CDN 下载星历文件，这是在 Vercel 等无服务器环境中的最佳实践。
await swe.swe_set_ephe_path();

// --- 2. 配置与常量 (Configuration & Constants) ---
const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY,
});

const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const SIGNS_EN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

// 根据文档，定义行星常量
const PLANET_IDS = {
  Sun: swe.PLANETS.SUN, Moon: swe.PLANETS.MOON, Mercury: swe.PLANETS.MERCURY,
  Venus: swe.PLANETS.VENUS, Mars: swe.PLANETS.MARS, Jupiter: swe.PLANETS.JUPITER,
  Saturn: swe.PLANETS.SATURN, Uranus: swe.PLANETS.URANUS, Neptune: swe.PLANETS.NEPTUNE,
  Pluto: swe.PLANETS.PLUTO, NorthNode: swe.PLANETS.TRUE_NODE
};

// --- 3. 辅助函数 (Helper Functions) ---
const norm360 = d => (d % 360 + 360) % 360;
const signFromDeg = d => SIGNS[Math.floor(norm360(d) / 30) % 12];
const signFromDegEn = d => SIGNS_EN[Math.floor(norm360(d) / 30) % 12];
const degText = d => { 
  const x = norm360(d) % 30; 
  const a = Math.floor(x); 
  const m = Math.floor((x - a) * 60); 
  return `${a}°${String(m).padStart(2,'0')}'`;
};

// 为行星分配宫位 (使用 Placidus 宫位系统)
function assignHouseToPlanet(planetLon, houseCusps) {
  const lon = norm360(planetLon);
  for (let i = 0; i < 12; i++) {
    const cuspStart = houseCusps[i];
    const cuspEnd = houseCusps[(i + 1) % 12];
    // 处理跨越0度白羊座的情况
    if (cuspStart < cuspEnd) {
      if (lon >= cuspStart && lon < cuspEnd) {
        return i + 1;
      }
    } else {
      if (lon >= cuspStart || lon < cuspEnd) {
        return i + 1;
      }
    }
  }
  return -1; // Should not happen
}

// --- 4. 核心计算函数 (Core Calculation Function) ---
// 这个函数完全基于 sweph-wasm 文档重写
function buildChart(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  // 将本地时间转换为 UTC 时间
  const localDate = new Date(year, month - 1, day, hour, minute);
  const utcDate = new Date(localDate.getTime() - (tzOffsetHours * 60 * 60 * 1000));

  // 使用 sweph-wasm 的函数计算儒略日 (UT)
  const jd_ut = swe.swe_julday(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate(),
    utcDate.getUTCHours() + utcDate.getUTCMinutes() / 60,
    swe.SE_GREG_CAL
  );

  // 计算宫位和四轴 (上升点/天顶) - 使用权威的 Placidus 宫位制 ('P')
  const houses = swe.swe_houses(jd_ut, latitude, longitude, 'P');
  const ascendant = houses.ascmc[0];
  const mc = houses.ascmc[1];
  const houseCusps = houses.cusps;

  // 计算所有行星的位置
  const planets = {};
  const flags = swe.SEFLG_SPEED; // 请求计算速度，用于判断逆行

  for (const [name, id] of Object.entries(PLANET_IDS)) {
    const pos = swe.swe_calc_ut(jd_ut, id, flags);
    const lon = pos[0];
    const speed = pos[3];
    planets[name] = {
      sign: signFromDeg(lon),
      signEn: signFromDegEn(lon),
      degree: degText(lon),
      longitude: Number(lon.toFixed(2)),
      house: assignHouseToPlanet(lon, houseCusps),
      isRetrograde: speed < 0
    };
  }

  return {
    planets,
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
    houses: houseCusps.map((cusp, i) => ({
      house: i + 1,
      sign: signFromDeg(cusp),
      signEn: signFromDegEn(cusp),
      cusp: Number(cusp.toFixed(2))
    })),
    chartInfo: {
      date: utcDate.toISOString(),
      location: { latitude, longitude },
      timezone: tzOffsetHours
    }
  };
}

// --- 5. API 处理器 (API Handler) ---
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

    // 计算本命盘
    const natal = buildChart(year, month, day, hour, minute, latitude, longitude, tzOffset);

    // 计算当前行运盘
    const now = new Date();
    const transits = buildChart(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      latitude,
      longitude,
      -now.getTimezoneOffset() / 60 // 当前本地时区
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
