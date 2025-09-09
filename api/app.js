// api/app.js

// 严格按照库的真实设计，从子目录分别导入所需模块
const julian = require('astronomia/julian');
const planetposition = require('astronomia/planetposition');
const solar = require('astronomia/solar');
const moonposition = require('astronomia/moonposition');

// 关键：为每一个行星独立导入其 VSOP87 数据文件
const vsop87Dmercury = require('astronomia/data/vsop87Dmercury');
const vsop87Dvenus = require('astronomia/data/vsop87Dvenus');
const vsop87Dearth = require('astronomia/data/vsop87Dearth');
const vsop87Dmars = require('astronomia/data/vsop87Dmars');
const vsop87Djupiter = require('astronomia/data/vsop87Djupiter');
const vsop87Dsaturn = require('astronomia/data/vsop87Dsaturn');
const vsop87Duranus = require('astronomia/data/vsop87Duranus');
const vsop87Dneptune = require('astronomia/data/vsop87Dneptune');

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

function getSign(longitude) {
    return SIGNS[Math.floor(longitude / 30)];
}

function formatDegree(longitude) {
    const signPos = longitude % 30;
    const deg = Math.floor(signPos);
    const minute = Math.floor((signPos - deg) * 60);
    return `${deg}°${String(minute).padStart(2, '0')}'`;
}

module.exports = (request, response) => {
    try {
        const { year, month, day, hour, minute, tz } = request.query;

        if (!year || !month || !day || !hour || !minute || !tz) {
            return response.status(400).json({ error: "Missing required parameters" });
        }

        // 1. 创建 UTC 时间的儒略日
        const utcHour = parseInt(hour) - parseFloat(tz);
        const date = new global.Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            utcHour,
            parseInt(minute)
        ));
        const jd = new julian.Calendar(date).toJDE();
        
        const planets_data = {};

        // 2. 使用 VSOP87 高精度计算太阳位置
        const earth = new planetposition.Planet(vsop87Dearth);
        const sunPos = solar.apparentVSOP87(earth, jd);
        const sunLon = sunPos.lon;
        planets_data['Sun'] = {
            sign: getSign(sunLon),
            degree: formatDegree(sunLon),
            longitude: parseFloat(sunLon.toFixed(2))
        };

        // 3. 使用正确的模块计算月亮位置
        const moonLon = moonposition.position(jd).lon;
        planets_data['Moon'] = {
            sign: getSign(moonLon),
            degree: formatDegree(moonLon),
            longitude: parseFloat(moonLon.toFixed(2))
        };

        // 4. 定义其他行星及其对应的、已导入的数据集
        const otherPlanets = {
            Mercury: vsop87Dmercury,
            Venus: vsop87Dvenus,
            Mars: vsop87Dmars,
            Jupiter: vsop87Djupiter,
            Saturn: vsop87Dsaturn,
            Uranus: vsop87Duranus,
            Neptune: vsop87Dneptune
        };

        // 5. 循环计算其他行星的位置
        for (const [name, planetData] of Object.entries(otherPlanets)) {
            const planet = new planetposition.Planet(planetData);
            const position = planet.position(jd);
            const longitude = position.l;
            
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: parseFloat(longitude.toFixed(2))
            };
        }

        response.status(200).json({ planets: planets_data });

    } catch (error) {
        console.error(error);
        response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
};
