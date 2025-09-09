import Astrology from 'astrology-js';
import NodeGeocoder from 'node-geocoder';

// --- 配置 ---
const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY,
});

// --- 辅助函数 ---
const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const formatSign = (signData) => {
    const deg = Math.floor(signData.normpos % 30);
    const min = Math.floor(((signData.normpos % 30) - deg) * 60);
    return {
        longitude: Number(signData.normpos.toFixed(4)),
        sign: SIGNS[signData.sign - 1],
        degree: `${deg}°${String(min).padStart(2, '0')}'`,
        isRetrograde: signData.retrograde,
        house: signData.house
    };
};

// --- 核心计算函数 ---
function calculateChart(year, month, day, hour, minute, lat, lon, tz) {
    const config = {
        year: parseInt(year),
        month: parseInt(month),
        day: parseInt(day),
        hour: parseInt(hour),
        minute: parseInt(minute),
        latitude: lat,
        longitude: lon,
        timezone: tz
    };

    const chart = new Astrology.Natal(config);
    const data = chart.get(); // 获取计算结果

    const formattedChart = {};
    
    // 格式化行星数据
    for (const planetName in data.planets) {
        const key = planetName.charAt(0).toUpperCase() + planetName.slice(1); // 首字母大写
        formattedChart[key] = formatSign(data.planets[planetName]);
    }

    // 格式化上升点和天顶
    formattedChart.Ascendant = formatSign(data.ascendant);
    formattedChart.MC = formatSign(data.mc);
    
    return formattedChart;
}

// --- Vercel Serverless Function Handler ---
export default async (req, res) => {
  try {
    const { year, month, day, hour, minute, city, country, tz } = req.query;
    const requiredParams = { year, month, day, hour, minute, city, country, tz };
    for (const [param, value] of Object.entries(requiredParams)) {
      if (value == null) {
        return res.status(400).json({ error: `Missing required parameter: ${param}` });
      }
    }
    const tzOffset = parseFloat(tz);
    if (isNaN(tzOffset)) return res.status(400).json({ error: 'Invalid tz format' });

    const geoData = await geocoder.geocode(`${city}, ${country}`);
    if (!geoData || geoData.length === 0) {
      return res.status(400).json({ error: 'Could not find coordinates for the specified location.' });
    }
    const { latitude, longitude } = geoData[0];

    // 计算本命盘
    const natalChart = calculateChart(year, month, day, hour, minute, latitude, longitude, tzOffset);

    // 计算当前行运盘
    const now = new Date();
    const nowUtc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000)); // 获取UTC时间
    const currentChart = calculateChart(
        nowUtc.getFullYear(),
        nowUtc.getMonth() + 1,
        nowUtc.getDate(),
        nowUtc.getHours(),
        nowUtc.getMinutes(),
        latitude, // 行运盘宫位基于出生地计算
        longitude,
        0 // 使用UTC时间
    );

    res.status(200).json({
      natalChart,
      transits: currentChart
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: `An internal server error occurred: ${e.message}` });
  }
};
