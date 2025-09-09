// api/app.js
const astrology = require('astrology-js');

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

// Vercel 的 handler 函数必须使用 module.exports 或 export default
// module.exports 是最兼容的写法
module.exports = (request, response) => {
    try {
        const { year, month, day, hour, minute, lon, lat, tz } = request.query;

        if (!year || !month || !day || !hour || !minute || !lon || !lat || !tz) {
            return response.status(400).json({ error: "Missing required parameters." });
        }

        // 注意：JavaScript 的 Date 对象中，月份是从 0 开始的 (0=一月, 1=二月...)
        const date = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
        ));

        // 这个库的经度是标准的：东经为正，西经为负。
        // 这与我们之前的 phem 库相反，更符合直觉。
        const location = new astrology.Location(parseFloat(lat), parseFloat(lon));

        const person = new astrology.Person();
        person.setDate(date);
        person.setLocation(location);
        // 时区信息在这个库中不是必需的，因为它直接使用UTC日期

        const planets = person.getPlanets();
        const planets_data = {};
        
        // 库返回的行星名是小写的，我们处理一下
        for (const key in planets) {
            const name = key.charAt(0).toUpperCase() + key.slice(1);
            const longitude = planets[key].longitude;
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: longitude
            };
        }

        const chart_data = {
            planets: planets_data,
            angles: {
                // 这个库同样不直接提供简单的四轴计算，留空
                ASC: null,
                MC: null
            }
        };

        response.status(200).json(chart_data);

    } catch (error) {
        response.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
    }
};
