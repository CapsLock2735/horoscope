// api/app.js
const {
  julian, solar, lunar, mercury, venus, mars,
  jupiter, saturn, uranus, neptune, pluto
} = require('astronomia');

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

        // 2. 从 Date 对象创建儒略千年数 (JDE) - 这是库需要的时间格式
        const jde = new julian.Calendar(date).toJDE();

        // 3. 定义行星及其对应的计算模块
        const planets = {
            Sun: solar, Moon: lunar, Mercury: mercury, Venus: venus,
            Mars: mars, Jupiter: jupiter, Saturn: saturn,
            Uranus: uranus, Neptune: neptune, Pluto: pluto
        };

        const planets_data = {};

        // 4. 循环计算每个行星的黄道经度
        for (const [name, body] of Object.entries(planets)) {
            let longitude;
            if (name === 'Sun') {
                // 太阳的函数名是 apparentLongitude
                longitude = body.apparentLongitude(jde).toFixed(2);
            } else {
                // 其他行星的函数名是 longitude
                longitude = body.longitude(jde).toFixed(2);
            }
            
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
