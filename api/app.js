// api/app.js
const astronomia = require('astronomia'); // 导入整个库

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

        // 2. 从 Date 对象创建儒略日 (修正：从 astronomia 对象中获取 JulianDay)
        const jd = astronomia.JulianDay.fromDate(date);

        // 3. 定义要计算的行星 (修正：从 astronomia 对象中获取 Body)
        const planets = {
            Sun: astronomia.Body.Sun, Moon: astronomia.Body.Moon, Mercury: astronomia.Body.Mercury, 
            Venus: astronomia.Body.Venus, Mars: astronomia.Body.Mars, Jupiter: astronomia.Body.Jupiter, 
            Saturn: astronomia.Body.Saturn, Uranus: astronomia.Body.Uranus, 
            Neptune: astronomia.Body.Neptune, Pluto: astronomia.Body.Pluto
        };

        const planets_data = {};

        // 4. 循环计算每个行星的黄道经度
        for (const [name, body] of Object.entries(planets)) {
            const longitude = body.eclipticLongitude(jd).toFixed(2);
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
