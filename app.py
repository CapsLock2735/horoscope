# 导入所需的库
from flask import Flask, request, jsonify
from kerykeion import Kerykeion, KerykeionError

# 初始化 Flask 应用
app = Flask(__name__)

# 定义一个API路由，例如 /natal_chart
# methods=['GET'] 表示这个API接收GET请求
@app.route('/natal_chart', methods=['GET'])
def get_natal_chart():
    """
    这个函数会从URL的查询参数中获取出生信息，
    然后使用 Kerykeion 计算星盘，并以JSON格式返回。
    """
    try:
        # 从URL参数中安全地获取信息，例如 ?name=Frida&year=1907...
        name = request.args.get('name', 'New Chart') # 如果没有提供name，默认为'New Chart'
        year = int(request.args.get('year'))
        month = int(request.args.get('month'))
        day = int(request.args.get('day'))
        hour = int(request.args.get('hour'))
        minute = int(request.args.get('minute'))
        city = request.args.get('city')
        
        # Kerykeion 的一个强大之处在于，它能自动处理城市名到经纬度和时区的转换
        # 创建星盘实例
        person = Kerykeion(name, year, month, day, hour, minute, city=city)

        # person.data 包含了所有星盘信息的字典，jsonify会把它转换成标准的JSON响应
        return jsonify(person.data)

    except KerykeionError as e:
        # 如果Kerykeion在计算中出错（例如，找不到城市），返回一个清晰的错误信息
        return jsonify({"error": f"Astrology calculation error: {e}"}), 400
    except (ValueError, TypeError):
        # 如果传入的参数类型不正确（例如year不是数字），返回错误
        return jsonify({"error": "Invalid input parameters. Please check year, month, day, etc."}), 400
    except Exception as e:
        # 捕获所有其他未知错误
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

# Vercel 需要一个根路由来确认服务是否健康
@app.route('/', methods=['GET'])
def home():
    return "Astro API is running!"

# 这段代码是为了本地测试，Vercel部署时不会执行
if __name__ == '__main__':

    app.run(debug=True)
