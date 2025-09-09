// api/app.js
export default async function handler(request, response) {
  // Vercel populates `request.method`. We only want to allow GET.
  if (request.method !== 'GET') {
    response.setHeader('Allow', ['GET']);
    return response.status(405).end(`Method ${request.method} Not Allowed`);
  }

  try {
    // The request.url property includes the path and query string.
    // We need to extract just the query string part.
    const queryString = request.url.split('?')[1] || '';

    // The external API with the correct path.
    const externalApiUrl = `https://ephemeris.onrender.com/planets?${queryString}`;

    // Call the external API.
    const apiResponse = await fetch(externalApiUrl);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return response.status(apiResponse.status).json({
        error: "External API failed.",
        details: errorText
      });
    }

    const data = await apiResponse.json();

    // Send the data back to the user.
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(200).json(data);

  } catch (error) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
}
