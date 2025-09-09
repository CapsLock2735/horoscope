import astrology from 'astrology-js';
import NodeGeocoder from 'node-geocoder';

// 修正点 1: 从导入的对象中，正确地取出 Natal 类
const Natal = astrology.default;

// --- 配置 ---
const geocoder = NodeGeocoder({
  provider: 'opencage',
  apiKey: process.env.GEOCODER_API_KEY,
});

// --- 辅助函数 ---
const SIGNS = ["白羊座","金牛座","双子座","巨蟹座","狮子座","处女座","天秤座","天蝎座","射手座","摩羯座","水瓶座","双鱼座"];
const formatSign = (signData) => {
    if (!signData) return null;
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

    // 修正点 2: 使用我们正确取出的 Natal 类
    const chart = new Natal(config); 
    const data = chart.get();

    const formattedChart = {};
    
    for (const planetName in data.planets) {
        const key = planetName.charAt(0).toUpperCase() + planetName.slice(1);
        formattedChart[key] = formatSign(data.planets[planetName]);
    }

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

    const natalChart = calculateChart(year, month, day, hour, minute, latitude, longitude, tzOffset);

    const now = new Date();
    const nowUtc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    const currentChart = calculateChart(
        nowUtc.getFullYear(),
        nowUtc.getMonth() + 1,
        nowUtc.getDate(),
        nowUtc.getHours(),
        nowUtc.getMinutes(),
        latitude,
        longitude,
        0
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
