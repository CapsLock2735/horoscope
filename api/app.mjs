import path from 'path';
import { fileURLToPath } from 'url';
import julian from 'astronomia/julian';
import swisseph from 'swe-js';
import NodeGeocoder from 'node-geocoder';

// --- 配置 ---

// 1. 配置地理编码服务
// 建议使用 Vercel 的环境变量来存储你的 API Key，而不是直接写在代码里。
// 在 Vercel 项目设置 -> Environment Variables 中添加一个名为 GEOCODER_API_KEY 的变量。
const geocoder = NodeGeocoder({
  provider: 'opencage', // 你可以选择 'google', 'locationiq' 等，opencage 有免费额度
  apiKey: process.env.GEOCODER_API_KEY,
});

// 2. 配置 Swiss Ephemeris
// Vercel 会将 node_modules 放在项目根目录，我们需要正确指向它
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ephe_path = path.join(__dirname, '..', 'node_modules', 'swe-js', 'ephe');
swisseph.swe_set_ephe_path(ephe_path);

// --- 辅助常量与函数 ---
const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const PLANET_IDS = {
  Sun: swisseph.SE_SUN, Moon: swisseph.SE_MOON, Mercury: swisseph.SE_MERCURY,
  Venus: swisseph.SE_VENUS, Mars: swisseph.SE_MARS, Jupiter: swisseph.SE_JUPITER,
  Saturn: swisseph.SE_SATURN, Uranus: swisseph.SE_URANUS, Neptune: swisseph.SE_NEPTUNE,
  Pluto: swisseph.SE_PLUTO, NorthNode: swisseph.SE_TRUE_NODE
};
const norm360 = d => (d % 360 + 360) % 360;
const signFromDeg = d => SIGNS[Math.floor(norm360(d) / 30) % 12];
const degText = d => {
  const totalDegrees = norm360(d);
  const degreeInSign = totalDegrees % 30;
  const deg = Math.floor(degreeInSign);
  const min = Math.floor((degreeInSign - deg) * 60);
  return `${deg}°${String(min).padStart(2, '0')}'`;
};

// --- 核心计算函数 ---
function calculateChart(jde, lat, lon) {
  const flags = swisseph.SEFLG_SPEED;
  const chart = {};

  // 1. 计算宫位和四轴（上升、下降、天顶、天底）
  const houses = swisseph.swe_houses(jde, lat, lon, 'P'); // 'P' 代表 Placidus 宫位制
  if (houses.error) throw new Error(`House calculation error: ${houses.error}`);
  
  chart.Ascendant = { // 上升点
    longitude: Number(houses.ascendant.toFixed(4)),
    sign: signFromDeg(houses.ascendant),
    degree: degText(houses.ascendant)
  };
  chart.MC = { // 天顶
    longitude: Number(houses.mc.toFixed(4)),
    sign: signFromDeg(houses.mc),
    degree: degText(houses.mc)
  };

  // 2. 计算所有行星的位置
  for (const [name, id] of Object.entries(PLANET_IDS)) {
    const res = swisseph.swe_calc_ut(jde, id, flags);
    if (res.error) throw new Error(`Planet calculation error for ${name}: ${res.error}`);
    
    const lonDeg = res.longitude;
    chart[name] = {
      longitude: Number(lonDeg.toFixed(4)),
      sign: signFromDeg(lonDeg),
      degree: degText(lonDeg),
      isRetrograde: res.longitude_speed < 0 // 速度为负即为逆行
    };
  }

  // 3. 为每个行星分配宫位
  const houseCusps = [houses.house[0], houses.house[1], houses.house[2], houses.house[3], houses.house[4], houses.house[5], houses.house[6], houses.house[7], houses.house[8], houses.house[9], houses.house[10], houses.house[11]];
  for (const name of Object.keys(PLANET_IDS)) {
    const planetLon = chart[name].longitude;
    for (let i = 0; i < 12; i++) {
      const cuspStart = houseCusps[i];
      const cuspEnd = houseCusps[(i + 1) % 12];
      // 处理跨越0度白羊座的情况
      if (cuspStart < cuspEnd) {
        if (planetLon >= cuspStart && planetLon < cuspEnd) {
          chart[name].house = i + 1;
          break;
        }
      } else {
        if (planetLon >= cuspStart || planetLon < cuspEnd) {
          chart[name].house = i + 1;
          break;
        }
      }
    }
  }
  return chart;
}

// --- Vercel Serverless Function Handler ---
export default async (req, res) => {
  try {
    // 1. 获取并验证用户输入参数
    const { year, month, day, hour, minute, city, country, tz } = req.query;
    const requiredParams = { year, month, day, hour, minute, city, country, tz };
    for (const [param, value] of Object.entries(requiredParams)) {
      if (value == null) {
        return res.status(400).json({ error: `Missing required parameter: ${param}` });
      }
    }
    const tzOffset = parseFloat(tz);
    if (isNaN(tzOffset)) return res.status(400).json({ error: 'Invalid tz format' });

    // 2. 地理编码：将出生城市转换为经纬度
    const geoData = await geocoder.geocode(`${city}, ${country}`);
    if (!geoData || geoData.length === 0) {
      return res.status(400).json({ error: 'Could not find coordinates for the specified location.' });
    }
    const { latitude, longitude } = geoData[0];

    // 3. 计算出生时间的儒略日 (JDE)
    const utcHour = parseInt(hour, 10) - tzOffset;
    const birthDate = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), utcHour, parseInt(minute, 10)));
    const jdeBirth = julian.DateToJDE(birthDate);

    // 4. 计算当前时间的儒略日 (JDE)
    const nowDate = new Date();
    const jdeNow = julian.DateToJDE(nowDate);

    // 5. 核心计算：生成本命盘和行运盘
    const natalChart = calculateChart(jdeBirth, latitude, longitude);
    // 注意：行运盘的宫位通常也基于出生地来计算，以观察行运行星进入了你本命的哪个领域
    const transits = calculateChart(jdeNow, latitude, longitude);

    // 6. 成功返回两个星盘的数据
    res.status(200).json({
      natalChart,
      transits
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
};
