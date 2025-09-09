// api/app.js
module.exports = async (request, response) => {
  try {
    // Take all query parameters from the original request (?year=, ?month=, etc.)
    const queryParams = new URLSearchParams(request.query).toString();

    // The external API that we have manually verified is working.
    const externalApiUrl = `https://ephemeris.onrender.com/v2/planets?${queryParams}`;

    // Call the external API.
    const apiResponse = await fetch(externalApiUrl);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return response.status(apiResponse.status).json({ 
        error: "External API failed.",
        details: errorText 
      });
    }

    // Get the JSON data.
    const data = await apiResponse.json();

    // Send the data back to the user.
    // Add a CORS header to allow browser access from any domain.
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(200).json(data);

  } catch (error) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};
