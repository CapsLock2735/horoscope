// api/app.js

// 子目录导入（CJS 入口会走 astronomia 的 .cjs 导出）
const julian = require('astronomia/julian');
const planetposition = require('astronomia/planetposition');
const solar = require('astronomia/solar');
const moonposition = require('astronomia/moonposition');
const data = require('astronomia/data');

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}
function norm360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}
function getSignFromDeg(deg) {
  const idx = Math.floor(norm360(deg) / 30) % 12;
  return SIGNS[idx];
}
function formatDegreeFromDeg(deg) {
  const d = norm360(deg);
  const signPos = d % 30;
  const whole = Math.floor(signPos);
  const minute = Math.floor((signPos - whole) * 60);
  return `${whole}°${String(minute).padStart(2, '0')}'`;
}

module.exports = (request, response) => {
  try {
    const { year, month, day, hour, minute, tz } = request.query;

    if (
      year == null || month == null || day == null ||
      hour == null || minute == null || tz == null
    ) {
      return response.status(400).json({ error: "Missing required parameters" });
    }

    // 允许 tz 为浮点（如 8 或 8.0 或 5.5）
    const tzOffset = parseFloat(tz);
    if (Number.isNaN(tzOffset)) {
      return response.status(400).json({ error: "Invalid tz" });
    }

    // 1) 构造 UTC Date
    const utcHour = parseInt(hour, 10) - tzOffset;
    const date = new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      utcHour,
      parseInt(minute, 10)
    ));

    // 2) Date -> JDE
    const jde = julian.DateToJDE(date);

    const planets_data = {};

    // 3) 太阳（VSOP87）
    const earth = new planetposition.Planet(data.vsop87Dearth);
    const sunPos = solar.apparentVSOP87(earth, jde); // {lon, lat, range}
    const sunLonDeg = norm360(radToDeg(sunPos.lon));
    planets_data['Sun'] = {
      sign: getSignFromDeg(sunLonDeg),
      degree: formatDegreeFromDeg(sunLonDeg),
      longitude: Number(sunLonDeg.toFixed(2))
    };

    // 4) 月亮（弧度->度）
    const moonLonDeg = norm360(radToDeg(moonposition.position(jde).lon));
    planets_data['Moon'] = {
      sign: getSignFromDeg(moonLonDeg),
      degree: formatDegreeFromDeg(moonLonDeg),
      longitude: Number(moonLonDeg.toFixed(2))
    };

    // 5) 其它行星 VSOP87（注意属性名是 lon 不是 l）
    const otherPlanets = {
      Mercury: data.vsop87Dmercury,
      Venus: data.vsop87Dvenus,
      Mars: data.vsop87Dmars,
      Jupiter: data.vsop87Djupiter,
      Saturn: data.vsop87Dsaturn,
      Uranus: data.vsop87Duranus,
      Neptune: data.vsop87Dneptune
    };

    for (const [name, planetData] of Object.entries(otherPlanets)) {
      const planet = new planetposition.Planet(planetData);
      const p = planet.position(jde); // {lon, lat, range}
      const lonDeg = norm360(radToDeg(p.lon));
      planets_data[name] = {
        sign: getSignFromDeg(lonDeg),
        degree: formatDegreeFromDeg(lonDeg),
        longitude: Number(lonDeg.toFixed(2))
      };
    }

    return response.status(200).json({ planets: planets_data });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
  }
};
