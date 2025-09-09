// api/app.js
const swisseph = require('swisseph');

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
        const { year, month, day, hour, minute, lon, lat, tz } = request.query;

        if (!year || !month || !day || !hour || !minute || !lon || !lat || !tz) {
            return response.status(400).json({ error: "Missing required parameters." });
        }

        const date = {
            year: parseInt(year),
            month: parseInt(month),
            day: parseInt(day),
            hour: parseInt(hour) + parseInt(minute) / 60 - parseFloat(tz) // 转换为UTC
        };

        // swisseph 需要设置星历文件路径
        swisseph.swe_set_ephe_path(__dirname + '/../../node_modules/swisseph/ephe');

        // 计算儒略日
        swisseph.swe_julday(date.year, date.month, date.day, date.hour, swisseph.SE_GREG_CAL, (julianDay) => {
            
            const planets = {
                Sun: swisseph.SE_SUN, Moon: swisseph.SE_MOON, Mercury: swisseph.SE_MERCURY,
                Venus: swisseph.SE_VENUS, Mars: swisseph.SE_MARS, Jupiter: swisseph.SE_JUPITER,
                Saturn: swisseph.SE_SATURN, Uranus: swisseph.SE_URANUS, Neptune: swisseph.SE_NEPTUNE,
                Pluto: swisseph.SE_PLUTO
            };

            const planets_data = {};
            
            // 计算行星位置
            for (const [name, code] of Object.entries(planets)) {
                swisseph.swe_calc_ut(julianDay, code, swisseph.SEFLG_SPEED, (result) => {
                    const longitude = result.longitude;
                    planets_data[name] = {
                        sign: getSign(longitude),
                        degree: formatDegree(longitude),
                        longitude: longitude
                    };
                });
            }

            // 计算宫位和四轴
            swisseph.swe_houses(julianDay, parseFloat(lat), parseFloat(lon), 'P', (houses) => {
                
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

                // 所有计算完成后，发送响应
                response.status(200).json(chart_data);
            });
        });

    } catch (error) {
        response.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
    }
}
