// api/app.js

// 严格按照 package.json 的 "exports" 定义，从子目录分别导入所需模块
const base = require('astronomia/base');
const julian = require('astronomia/julian');
const planetposition = require('astronomia/planetposition');
const data = require('astronomia/data'); // <--- 关键：导入 "data" 这个被导出的模块

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

        // 1. 创建一个标准的 JavaScript Date 对象 (UTC)
        const utcHour = parseInt(hour) - parseFloat(tz);
        const date = new global.Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1, // JS月份从0开始
            parseInt(day),
            utcHour,
            parseInt(minute)
        ));

        // 2. 从 Date 对象创建儒略日
        const jd = new julian.Calendar(date).toJDE();

        // 3. 初始化行星位置计算器，并将完整的 data 对象传入
        const pos = new planetposition.Planet(data); // <--- 关键：将 data 对象喂给计算器

        // 4. 定义行星 (常量从 'base' 模块获取)
        const planets = {
            Sun: base.sun,
            Mercury: base.mercury,
            Venus: base.venus,
            Mars: base.mars,
            Jupiter: base.jupiter,
            Saturn: base.saturn,
            Uranus: base.uranus,
            Neptune: base.neptune
        };

        const planets_data = {};

        // 5. 循环计算每个行星的黄道经度
        for (const [name, body] of Object.entries(planets)) {
            const longitude = pos.eclipticLongitude(body, jd).toFixed(2);
            
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: parseFloat(longitude)
            };
        }

        response.status(200).json({ planets: planets_data });

    } catch (error) {
        console.error(error);
        response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
};
