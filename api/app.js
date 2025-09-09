// api/app.js
const { julian, planetposition, data } = require('astronomia');

// 从 data 模块中加载 VSOP87 数据集
const { vsop87A } = data;

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

        // 3. 初始化行星位置计算器，传入 VSOP87 数据
        const pos = new planetposition.Planet(vsop87A);

        // 4. 定义行星 (注意：这个库不计算月亮和冥王星)
        const planets = {
            Sun: planetposition.sun, // 太阳有特殊的方法
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
            // 调用 eclipticLongitude 方法计算位置
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
