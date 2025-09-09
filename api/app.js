// api/app.js
module.exports = async (request, response) => {
  try {
    // 外部 API 的地址，这次是干净的，不带任何参数
    const externalApiUrl = `https://ephemeris.onrender.com/planets`;

    // 从用户的请求中获取查询参数对象, e.g., { dt: '2024-...' }
    const requestBody = request.query;

    // 调用外部 API
    const apiResponse = await fetch(externalApiUrl, {
      method: 'POST', // 明确使用 POST
      headers: {
        'Content-Type': 'application/json' // 告诉服务器我们发送的是 JSON 格式的数据
      },
      body: JSON.stringify(requestBody) // 将参数对象转换为 JSON 字符串并放入请求正文
    });

    // 检查外部 API 的响应
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return response.status(apiResponse.status).json({ 
        error: "External API failed.",
        details: errorText 
      });
    }

    const data = await apiResponse.json();

    // 将成功获取的数据返回给用户
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(200).json(data);

  } catch (error) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};
