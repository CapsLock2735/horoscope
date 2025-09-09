// api/app.js

const julian = require('astronomia/julian');
const { Planet } = require('astronomia/planetposition');
const solar = require('astronomia/solar');
const moonposition = require('astronomia/moonposition');

// 独立引入每个 VSOP87 数据集，并做 default 回退（防止某些运行时包裹默认导出）
function requireData(path) {
  const mod = require(path);
  return mod && mod.default ? mod.default : mod;
}
const vsop87Dearth   = requireData('astronomia/data/vsop87Dearth');
const vsop87Dmercury = requireData('astronomia/data/vsop87Dmercury');
const vsop87Dvenus   = requireData('astronomia/data/vsop87Dvenus');
const vsop87Dmars    = requireData('astronomia/data/vsop87Dmars');
const vsop87Djupiter = requireData('astronomia/data/vsop87Djupiter');
const vsop87Dsaturn  = requireData('astronomia/data/vsop87Dsaturn');
const vsop87Duranus  = requireData('astronomia/data/vsop87Duranus');
const vsop87Dneptune = requireData('astronomia/data/vsop87Dneptune');

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

function radToDeg(rad) { return rad * 180 / Math.PI; }
function norm360(deg) { let x = deg % 360; if (x < 0) x += 360; return x; }
function signFromDeg(deg) { return SIGNS[Math.floor(norm360(deg) / 30) % 12]; }
function degText(deg) {
  const d = norm360(deg);
  const pos = d % 30;
  const whole = Math.floor(pos);
  const minute = Math.floor((pos - whole) * 60);
  return `${whole}°${String(minute).padStart(2, '0')}'`;
}

module.exports = (request, response) => {
  try {
    const { year, month, day, hour, minute, tz } = request.query;
    if (year == null || month == null || day == null || hour == null || minute == null || tz == null) {
      return response.status(400).json({ error: "Missing required parameters" });
    }

    const tzOffset = parseFloat(tz);
    if (Number.isNaN(tzOffset)) {
      return response.status(400).json({ error: "Invalid tz" });
    }

    const utcHour = parseInt(hour, 10) - tzOffset;
    const date = new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      utcHour,
      parseInt(minute, 10)
    ));

    // 用 JDE 保持与太阳 VSOP87一致
    const jde = julian.DateToJDE(date);

    const planets = {};

    // 太阳（VSOP87）
    const earth = new Planet(vsop87Dearth);
    const sun = solar.apparentVSOP87(earth, jde); // {lon, lat, range}
    const sunLonDeg = norm360(radToDeg(sun.lon));
    planets.Sun = {
      sign: signFromDeg(sunLonDeg),
      degree: degText(sunLonDeg),
      longitude: Number(sunLonDeg.toFixed(2))
    };

    // 月亮（弧度→度；属性名是 .lon）
    const moonLonDeg = norm360(radToDeg(moonposition.position(jde).lon));
    planets.Moon = {
      sign: signFromDeg(moonLonDeg),
      degree: degText(moonLonDeg),
      longitude: Number(moonLonDeg.toFixed(2))
    };

    // 其它行星（属性名 .lon，不是 .l）
    const datasets = {
      Mercury: vsop87Dmercury,
      Venus:   vsop87Dvenus,
      Mars:    vsop87Dmars,
      Jupiter: vsop87Djupiter,
      Saturn:  vsop87Dsaturn,
      Uranus:  vsop87Duranus,
      Neptune: vsop87Dneptune
    };

    for (const [name, ds] of Object.entries(datasets)) {
      if (!ds) throw new Error(`VSOP87 dataset missing for ${name}`);
      const p = new Planet(ds).position(jde); // {lon, lat, range}
      const lonDeg = norm360(radToDeg(p.lon));
      planets[name] = {
        sign: signFromDeg(lonDeg),
        degree: degText(lonDeg),
        longitude: Number(lonDeg.toFixed(2))
      };
    }

    return response.status(200).json({ planets });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
  }
};
