// api/app.js

// This is the main function Vercel will run
module.exports = async (request, response) => {
  try {
    // Get the date parameters from the request URL
    // Example: /api/app?year=2024&month=5&day=21&hour=12&minute=0
    const { year, month, day, hour, minute } = request.query;

    // Basic validation
    if (!year || !month || !day || !hour || !minute) {
      return response.status(400).json({ error: "Missing required date parameters." });
    }

    // Format the date into the ISO 8601 format required by the external API
    // Example: 2024-05-21T12:00:00Z
    const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;

    // The external API endpoint
    const externalApiUrl = `https://astrology-api.vercel.app/api/planets?time=${isoDate}`;

    // Call the external API using the built-in 'fetch' function
    const apiResponse = await fetch(externalApiUrl);

    // Check if the external API call was successful
    if (!apiResponse.ok) {
      // If the external API failed, pass its error through
      const errorData = await apiResponse.text();
      return response.status(apiResponse.status).json({ 
        error: "Failed to fetch data from the external astrology API.",
        details: errorData 
      });
    }

    // Get the JSON data from the successful response
    const data = await apiResponse.json();

    // Send the data back to the user who called our API
    response.status(200).json(data);

  } catch (error) {
    // Catch any other unexpected errors
    response.status(500).json({ error: `An internal server error occurred: ${error.message}` });
  }
};
