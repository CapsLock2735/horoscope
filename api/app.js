// api/app.js
const sweph = require('sweph-js');

// 星座列表
const SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

// 获取星座名称
function getSign(longitude) {
    return SIGNS[Math.floor(longitude / 30)];
}

// 格式化度数
function formatDegree(longitude) {
    const signPos = longitude % 30;
    const deg = Math.floor(signPos);
    const minute = Math.floor((signPos - deg) * 60);
    return `${deg}°${String(minute).padStart(2, '0')}'`;
}

// API 主函数
export default function handler(request, response) {
    try {
        // 从 URL 获取参数
        const { year, month, day, hour, minute, lon, lat, tz } = request.query;

        // 检查必要参数
        if (!year || !month || !day || !hour || !minute || !lon || !lat || !tz) {
            return response.status(400).json({ error: "Missing required parameters." });
        }

        // 计算儒略日 (Julian Day)
        const date = {
            year: parseInt(year),
            month: parseInt(month),
            day: parseInt(day),
            hour: parseInt(hour) + parseInt(minute) / 60 - parseFloat(tz) // 转换为UTC
        };
        const julianDay = sweph.swe_julday(date.year, date.month, date.day, date.hour, sweph.SE_GREG_CAL);

        // 设置星历表路径
        sweph.swe_set_ephe_path(__dirname + '/../../node_modules/sweph/ephe');

        const planets = {
            Sun: sweph.SE_SUN, Moon: sweph.SE_MOON, Mercury: sweph.SE_MERCURY,
            Venus: sweph.SE_VENUS, Mars: sweph.SE_MARS, Jupiter: sweph.SE_JUPITER,
            Saturn: sweph.SE_SATURN, Uranus: sweph.SE_URANUS, Neptune: sweph.SE_NEPTUNE,
            Pluto: sweph.SE_PLUTO
        };

        const planets_data = {};
        for (const [name, code] of Object.entries(planets)) {
            const result = sweph.swe_calc_ut(julianDay, code, sweph.SEFLG_SPEED);
            const longitude = result.longitude;
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: longitude
            };
        }
        
        // 计算上升点和天顶
        const houses = sweph.swe_houses(julianDay, parseFloat(lat), parseFloat(lon), 'P'); // Placidus分宫

        const chart_data = {
            planets: planets_data,
            angles: {
                ASC: {
                    sign: getSign(houses.ascendant),
                    degree: formatDegree(houses.ascendant),
                    longitude: houses.ascendant
                },
                MC: {
                    sign: getSign(houses.mc),
                    degree: formatDegree(houses.mc),
                    longitude: houses.mc
                }
            }
        };

        response.status(200).json(chart_data);

    } catch (error) {
        response.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
    }
}
