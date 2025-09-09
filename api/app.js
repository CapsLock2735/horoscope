// api/app.js

// 严格按照您提供的官方文档，从子目录分别导入所需模块
const julian = require('astronomia/julian');
const planetposition = require('astronomia/planetposition');
const solar = require('astronomia/solar');
const moonposition = require('astronomia/moonposition');
const data = require('astronomia/data');

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

        // 2. 从 Date 对象创建儒略天文时 (JDE)
        const jde = julian.DateToJDE(date);
        
        const planets_data = {};

        // 3. 使用 VSOP87 高精度计算太阳位置
        // 根据您的示例 4，我们需要先创建一个地球的 Planet 实例
        const earth = new planetposition.Planet(data.vsop87Dearth);
        // 然后调用 solar 模块的 VSOP87 方法
        const sunPos = solar.apparentVSOP87(earth, jde);
        const sunLon = sunPos.lon;
        planets_data['Sun'] = {
            sign: getSign(sunLon),
            degree: formatDegree(sunLon),
            longitude: parseFloat(sunLon.toFixed(2))
        };

        // 4. 使用正确的模块计算月亮位置
        const moonLon = moonposition.position(jde).lon;
        planets_data['Moon'] = {
            sign: getSign(moonLon),
            degree: formatDegree(moonLon),
            longitude: parseFloat(moonLon.toFixed(2))
        };

        // 5. 定义其他行星及其对应的 VSOP87 数据集
        const otherPlanets = {
            Mercury: data.vsop87Dmercury,
            Venus: data.vsop87Dvenus,
            Mars: data.vsop87Dmars,
            Jupiter: data.vsop87Djupiter,
            Saturn: data.vsop87Dsaturn,
            Uranus: data.vsop87Duranus,
            Neptune: data.vsop87Dneptune
        };

        // 6. 循环计算其他行星的位置
        for (const [name, planetData] of Object.entries(otherPlanets)) {
            const planet = new planetposition.Planet(planetData);
            const position = planet.position(jde); // 调用 position 方法获取 LBR
            const longitude = position.l; // L 是黄道经度
            
            planets_data[name] = {
                sign: getSign(longitude),
                degree: formatDegree(longitude),
                longitude: parseFloat(longitude.toFixed(2))
            };
        }

        response.status(200).json({ planets: planets_data });

    } catch (error) {
        console.error(error);
        response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
    }
};
