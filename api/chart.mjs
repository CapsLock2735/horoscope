import SwissEPH from 'sweph-wasm';
import NodeGeocoder from 'node-geocoder';
import wasmBase64 from './wasm-base64.mjs'; // 导入我们之前生成的 Base64 模块

// --- 1. 初始化 (Initialization) - 最终修正版 ---
// 这是解决所有问题的关键：我们从 Base64 字符串解码出 WASM 引擎
// 这种方法 100% 兼容 Vercel 环境，因为它不依赖网络或文件系统。

// a. 将 Base64 字符串解码为二进制 Buffer
const wasmBuffer = Buffer.from(wasmBase64, 'base64');

// b. 将这个在内存中创建的 Buffer 传递给 init 函数
const swe = await SwissEPH.init(wasmBuffer);

// c. 设置星历文件路径 (这一步仍然需要，它会从 CDN 下载数据文件，这是被允许的)
await swe.swe_set_ephe_path();

// --- 2. 配置与常量 ---
const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY,
});

const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const SIGNS_EN = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

const PLANET_IDS = {
  Sun: swe.PLANETS.SUN, Moon: swe.PLANETS.MOON, Mercury: swe.PLANETS.MERCURY,
  Venus: swe.PLANETS.VENUS, Mars: swe.PLANETS.MARS, Jupiter: swe.PLANETS.JUPITER,
  Saturn: swe.PLANETS.SATURN, Uranus: swe.PLANETS.URANUS, Neptune: swe.PLANETS.NEPTUNE,
  Pluto: swe.PLANETS.PLUTO, NorthNode: swe.PLANETS.TRUE_NODE
};

// --- 3. 辅助函数 ---
const norm360 = d => (d % 360 + 360) % 360;
const signFromDeg = d => SIGNS[Math.floor(norm360(d) / 30) % 12];
const signFromDegEn = d => SIGNS_EN[Math.floor(norm360(d) / 30) % 12];
const degText = d => { 
  const x = norm360(d) % 30; 
  const a = Math.floor(x); 
  const m = Math.floor((x - a) * 60); 
  return `${a}°${String(m).padStart(2,'0')}'`;
};

function assignHouseToPlanet(planetLon, houseCusps) {
  const lon = norm360(planetLon);
  for (let i = 0; i < 12; i++) {
    const cuspStart = houseCusps[i];
    const cuspEnd = houseCusps[(i + 1) % 12];
    if (cuspStart < cuspEnd) {
      if (lon >= cuspStart && lon < cuspEnd) return i + 1;
    } else {
      if (lon >= cuspStart || lon < cuspEnd) return i + 1;
    }
  }
  return -1; // Should not happen
}

// --- 4. 核心计算函数 ---
function buildChart(year, month, day, hour, minute, latitude, longitude, tzOffsetHours) {
  // 修正时间转换：使用 Date.UTC() 来创建无歧义的 UTC 时间对象
  const utcHour = parseFloat(hour) - tzOffsetHours;
  const utcMinute = parseFloat(minute);
  const utcDate = new Date(Date.UTC(year, month - 1, day, utcHour, utcMinute));

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

// --- 5. API 处理器 ---
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
