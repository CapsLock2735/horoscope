// api/app.js
import { Astro } from '@astro-npm/astro';

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

        // 创建日期对象 (注意：月份是从0开始的，所以要-1)
        const date = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute)
        ));

        // 创建 Astro 实例
        const astro = new Astro({ date });

        const planets_data = {};
        const planetKeys = [
            'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter',
            'saturn', 'uranus', 'neptune', 'pluto'
        ];

        // 获取行星位置
        planetKeys.forEach(key => {
            const longitude = astro[key].longitude;
            const name = key.charAt(0).toUpperCase() + key.slice(1); // 首字母大写
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: longitude
            };
        });
        
        // 这个库目前不直接计算四轴，但对于AI解读来说，行星位置是最核心的
        // 我们可以返回一个空的角度对象
        const chart_data = {
            planets: planets_data,
            angles: {
                // ASC 和 MC 的计算在这个库中比较复杂，暂时留空
                // AI 仍然可以根据行星信息做出非常好的解读
                ASC: null,
                MC: null
            }
        };

        response.status(200).json(chart_data);

    } catch (error) {
        response.status(500).json({ error: `An unexpected error occurred: ${error.message}` });
    }
}
