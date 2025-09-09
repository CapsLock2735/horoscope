from flask import Flask, request, jsonify
import phem
import datetime

app = Flask(__name__)

# 定义行星和星座的列表，方便后面使用
PLANETS = {
    "Sun": phem.SUN, "Moon": phem.MOON, "Mercury": phem.MERCURY,
    "Venus": phem.VENUS, "Mars": phem.MARS, "Jupiter": phem.JUPITER,
    "Saturn": phem.SATURN, "Uranus": phem.URANUS, "Neptune": phem.NEPTUNE,
    "Pluto": phem.PLUTO
}

SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
]

def get_sign(longitude):
    """根据黄道经度计算星座"""
    return SIGNS[int(longitude / 30)]

def format_degree(longitude):
    """将黄道经度格式化为星座内的度数"""
    sign_pos = longitude % 30
    deg = int(sign_pos)
    minute = int((sign_pos - deg) * 60)
    return f"{deg}°{minute:02d}'"

@app.route('/natal_chart', methods=['GET'])
def get_natal_chart():
    try:
        # 获取URL参数
        year = int(request.args.get('year'))
        month = int(request.args.get('month'))
        day = int(request.args.get('day'))
        hour = int(request.args.get('hour'))
        minute = int(request.args.get('minute'))
        
        # phem 需要经纬度和时区来计算上升点
        # 注意：phem的经度是西经为正，东经为负
        lon = float(request.args.get('lon')) # 例如：北京 116.4074 -> -116.4074
        lat = float(request.args.get('lat')) # 例如：北京 39.9042
        tz = float(request.args.get('tz'))   # 例如：东八区 8

        # 创建观测者对象
        observer = phem.Observer(year, month, day, hour, minute, 0)
        observer.lon = lon
        observer.lat = lat
        
        # 将本地时间转换为UTC时间
        local_dt = datetime.datetime(year, month, day, hour, minute)
        utc_dt = local_dt - datetime.timedelta(hours=tz)
        observer.date = phem.Date(utc_dt)

        # 计算行星位置
        planets_data = {}
        for name, planet_code in PLANETS.items():
            planet = phem.planet(planet_code)
            planet.compute(observer)
            longitude = planet.ecliptic.lon
            planets_data[name] = {
                "sign": get_sign(longitude),
                "degree": format_degree(longitude),
                "longitude": longitude
            }

        # 计算上升点 (ASC) 和天顶 (MC)
        # phem的宫位计算比较底层，我们手动计算
        sidereal_time = observer.date.get_siderial_time()
        asc, mc = phem.houses(observer.lat, sidereal_time)

        # 准备最终的JSON输出
        chart_data = {
            "info": {
                "date": f"{year}-{month}-{day} {hour}:{minute}",
                "location": f"Lon: {lon}, Lat: {lat}, TZ: {tz}"
            },
            "planets": planets_data,
            "angles": {
                "ASC": {
                    "sign": get_sign(asc),
                    "degree": format_degree(asc),
                    "longitude": asc
                },
                "MC": {
                    "sign": get_sign(mc),
                    "degree": format_degree(mc),
                    "longitude": mc
                }
            }
        }
        
        return jsonify(chart_data)

    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route('/', methods=['GET'])
def home():
    return "Astro API (phem version) is running!"
