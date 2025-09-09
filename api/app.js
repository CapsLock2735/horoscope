// api/app.js

// 严格按照库的真实设计，从子目录分别导入所需模块
const base = require('astronomia/base');
const julian = require('astronomia/julian');
const planetposition = require('astronomia/planetposition');
const solar = require('astronomia/solar');
const moonposition = require('astronomia/moonposition');
const data = require('astronomia/data');

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

        // 2. 使用正确的模块计算太阳位置
        const sunLon = solar.apparentLongitude(jd);
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

        // 4. 正确初始化行星计算器，并将数据传入
        const pos = new planetposition.Planet(data);

        // 5. 定义其他行星 (常量从 'base' 模块获取)
        const otherPlanets = {
            Mercury: base.mercury,
            Venus: base.venus,
            Mars: base.mars,
            Jupiter: base.jupiter,
            Saturn: base.saturn,
            Uranus: base.uranus,
            Neptune: base.neptune
        };

        // 6. 循环计算其他行星的位置
        for (const [name, body] of Object.entries(otherPlanets)) {
            // 调用正确的 'position' 方法，并从返回的对象中获取 'lon'
            const result = pos.position(body, jd);
            const longitude = result.lon;
            
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
