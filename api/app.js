// api/app.js
module.exports = async (request, response) => {
  try {
    // 从原始请求中获取查询字符串
    const queryString = request.url.split('?')[1] || '';

    // 我们已经验证过可用的外部 API 地址
    const externalApiUrl = `https://ephemeris.onrender.com/planets?${queryString}`;

    // 调用外部 API，并明确指定使用 POST 方法
    const apiResponse = await fetch(externalApiUrl, {
      method: 'POST' // <--- 这是唯一的、关键的修改
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
