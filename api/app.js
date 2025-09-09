// api/app.js

// Vercel 的主处理函数
module.exports = async (request, response) => {
  try {
    // 从 URL 获取星座名称, 例如: /api/app?sign=libra
    const { sign } = request.query;

    // 验证参数
    if (!sign) {
      return response.status(400).json({ error: "Missing required parameter: sign" });
    }

    // Aztro API 的地址，它需要 POST 请求
    const externalApiUrl = `https://aztro.sameerkumar.website/?sign=${sign}&day=today`;

    // 使用内置的 fetch 函数调用外部 API
    const apiResponse = await fetch(externalApiUrl, {
      method: 'POST'
    });

    // 检查外部 API 是否成功返回
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return response.status(apiResponse.status).json({ 
        error: "Failed to fetch data from the Aztro API.",
        details: errorText 
      });
    }

    // 获取返回的 JSON 数据
    const data = await apiResponse.json();

    // 将数据返回给调用者
    // 添加 CORS 头，允许任何域名的浏览器访问
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(200).json(data);

  } catch (error) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
  }
};
