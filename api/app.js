// api/app.js
const { julian, planetposition } = require('astronomia');
// 修正：根据官方文档，直接从子目录导入 VSOP87 数据
const vsop87A = require('astronomia/data/vsop87A');

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

        // 3. 初始化行星位置计算器，传入正确加载的 VSOP87 数据
        const pos = new planetposition.Planet(vsop87A);

        // 4. 定义行星
        const planets = {
            Sun: planetposition.sun,
            Mercury: planetposition.mercury,
            Venus: planetposition.venus,
            Mars: planetposition.mars,
            Jupiter: planetposition.jupiter,
            Saturn: planetposition.saturn,
            Uranus: planetposition.uranus,
            Neptune: planetposition.neptune
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
