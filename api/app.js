// api/app.js
const { Body, JulianDay } = require('astronomia');

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
        const jd = JulianDay.fromDate(date);

        // 3. 定义要计算的行星
        const planets = {
            Sun: Body.Sun, Moon: Body.Moon, Mercury: Body.Mercury, Venus: Body.Venus,
            Mars: Body.Mars, Jupiter: Body.Jupiter, Saturn: Body.Saturn,
            Uranus: Body.Uranus, Neptune: Body.Neptune, Pluto: Body.Pluto
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
