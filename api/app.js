// api/app.js
const { Ephemeris, Body, Time } = require('@ouranos/ephemeris');

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

module.exports = async (request, response) => {
    try {
        const { year, month, day, hour, minute, tz } = request.query;

        if (!year || !month || !day || !hour || !minute || !tz) {
            return response.status(400).json({ error: "Missing required parameters: year, month, day, hour, minute, tz" });
        }

        // 创建时间对象，注意月份是从 1 开始的
        const time = new Time({
            year: parseInt(year),
            month: parseInt(month),
            day: parseInt(day),
            hours: parseInt(hour),
            minutes: parseInt(minute),
            seconds: 0,
            timezone: parseFloat(tz)
        });

        // 初始化星历表
        const ephemeris = new Ephemeris({ time });
        
        // 定义要计算的行星
        const bodies = [
            Body.SUN, Body.MOON, Body.MERCURY, Body.VENUS, Body.MARS,
            Body.JUPITER, Body.SATURN, Body.URANUS, Body.NEPTUNE, Body.PLUTO
        ];

        const planets_data = {};

        // 异步计算所有行星的位置
        const results = await ephemeris.getBodies(bodies);

        for (const key in results) {
            // key 的格式是 'sun', 'moon' 等
            const name = key.charAt(0).toUpperCase() + key.slice(1);
            const longitude = results[key].longitude;
            
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: longitude
            };
        }

        const chart_data = {
            planets: planets_data
        };

        response.status(200).json(chart_data);

    } catch (error) {
        console.error(error); // 在 Vercel 日志中打印详细错误
        response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
};
