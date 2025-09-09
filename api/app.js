// api/app.js
const ephemeris = require('ephemeris');

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

// 将基于回调的函数转换为 Promise，以便使用 async/await
function getPlanetAsync(planet, jd) {
    return new Promise((resolve, reject) => {
        ephemeris.getPlanet(planet, jd, (err, result) => {
            if (err) {
                return reject(err);
            }
            resolve(result);
        });
    });
}

// Vercel 的主处理函数
module.exports = async (request, response) => {
    try {
        const { year, month, day, hour, minute, tz } = request.query;

        if (!year || !month || !day || !hour || !minute || !tz) {
            return response.status(400).json({ error: "Missing required parameters" });
        }

        // 1. 计算儒略日 (Julian Day)
        const utcHour = parseInt(hour) - parseFloat(tz);
        const julianDay = ephemeris.jd.from_gregorian(
            parseInt(year),
            parseInt(month),
            parseInt(day),
            utcHour,
            parseInt(minute),
            0
        );

        // 2. 定义行星
        const planets = {
            Sun: 'sun', Moon: 'moon', Mercury: 'mercury', Venus: 'venus',
            Mars: 'mars', Jupiter: 'jupiter', Saturn: 'saturn',
            Uranus: 'uranus', Neptune: 'neptune', Pluto: 'pluto'
        };

        const planets_data = {};
        
        // 3. 异步计算所有行星的位置
        for (const [name, key] of Object.entries(planets)) {
            const result = await getPlanetAsync(key, julianDay);
            const longitude = result.observed.ecliptic.l; // 获取黄道经度
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: longitude
            };
        }

        response.status(200).json({ planets: planets_data });

    } catch (error) {
        console.error(error); // 在 Vercel 日志中打印详细错误
        response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
};
