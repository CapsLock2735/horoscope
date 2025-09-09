// api/app.js
const ephemeris = require('ephemeris-moshier');

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

// Vercel handler
module.exports = (request, response) => {
    try {
        const { year, month, day, hour, minute, tz } = request.query;

        if (!year || !month || !day || !hour || !minute || !tz) {
            return response.status(400).json({ error: "Missing required parameters: year, month, day, hour, minute, tz" });
        }

        // 1. 将本地时间转换为UTC儒略日
        const localDate = new Date(
            `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
        );
        
        // 应用时区偏移，得到UTC时间
        // 注意：JavaScript的getTimezoneOffset返回的是分钟，且符号相反
        // 我们直接使用用户传入的tz
        const utcHour = parseInt(hour) - parseFloat(tz);
        const julianDayUTC = ephemeris.jd.from_gregorian(parseInt(year), parseInt(month), parseInt(day) + (utcHour / 24) + (parseInt(minute) / 1440));

        // 2. 定义要计算的行星
        const planetsToCalc = {
            Sun: 'sun', Moon: 'moon', Mercury: 'mercury', Venus: 'venus',
            Mars: 'mars', Jupiter: 'jupiter', Saturn: 'saturn',
            Uranus: 'uranus', Neptune: 'neptune', Pluto: 'pluto'
        };

        const planets_data = {};

        // 3. 循环计算每个行星的位置
        for (const [name, key] of Object.entries(planetsToCalc)) {
            const result = ephemeris.getPlanet(key, julianDayUTC);
            if (result.error) {
                throw new Error(`Failed to calculate for ${name}: ${result.error}`);
            }
            
            // 结果是黄道坐标 (ecliptic coordinates)
            const longitude = result.ecliptic.l;
            
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
        response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
};
