document.getElementById('travel-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentIATA = document.getElementById('currentLocation').value.toUpperCase();
    const destinationIATA = document.getElementById('destination').value.toUpperCase();

    if (!currentIATA || !destinationIATA) {
        alert('Please provide both current location IATA code and destination IATA code.');
        return;
    }

    // Construct a unique key for local storage based on the IATA codes
    const travelKey = `${currentIATA}-${destinationIATA}`;

    // Check if data for this combination already exists in localStorage
    const cachedData = localStorage.getItem(travelKey);
    if (cachedData) {
        const { weather, flights, activities, time, mapUrl } = JSON.parse(cachedData);
        displayResults(weather, flights, activities, time, mapUrl);
        return;
    }

    // Show loading messages
    showLoadingMessages();

    try {
        // Check for cached activities and map data in localStorage
        const cachedActivities = localStorage.getItem(`${destinationIATA}-activities`);
        const cachedMap = localStorage.getItem(`${destinationIATA}-map`);

        // Fetch all the required data using Promise.all
        const [weather, flights, activities, time, mapUrl] = await Promise.all([
            fetchWeather(destinationIATA),
            fetchFlights(currentIATA, destinationIATA),
            cachedActivities ? Promise.resolve(cachedActivities) : fetchActivities(destinationIATA),
            fetchTime(destinationIATA),
            cachedMap ? Promise.resolve(cachedMap) : fetchMap(destinationIATA)
        ]);

        // Store activities and map data in localStorage if not cached already
        if (!cachedActivities) {
            localStorage.setItem(`${destinationIATA}-activities`, activities);
        }
        if (!cachedMap) {
            localStorage.setItem(`${destinationIATA}-map`, mapUrl);
        }

        // Store all fetched data in localStorage with the travel key
        localStorage.setItem(travelKey, JSON.stringify({ weather, flights, activities, time, mapUrl }));

        // Display the results
        displayResults(weather, flights, activities, time, mapUrl);

    } catch (error) {
        console.error(error);
        alert(`Failed to fetch travel info: ${error.message}`);
        hideResults();
    }
});

function showLoadingMessages() {
    document.getElementById('weather').innerText = 'Loading weather...';
    document.getElementById('flights').innerText = 'Loading flights...';
    document.getElementById('activities').innerText = 'Loading activities...';
    document.getElementById('time').innerText = 'Loading time...';
    document.getElementById('map').style.display = 'none';
    document.getElementById('results').style.display = 'none';
}

function displayResults(weather, flights, activities, time, mapUrl) {
    document.getElementById('weather').innerText = `Weather: ${weather}`;
    document.getElementById('flights').innerText = `Flight Info: ${flights}`;
    document.getElementById('activities').innerText = `Activities: ${activities}`;
    document.getElementById('time').innerText = `Time: ${time}`;

    const mapElement = document.getElementById('map');
    mapElement.src = mapUrl;
    mapElement.style.display = 'block';

    // Make the results section visible
    document.getElementById('results').style.display = 'block';
}

function hideResults() {
    document.getElementById('results').style.display = 'none';
}

// Fetch weather based on destination IATA code
async function fetchWeather(destinationIATA) {
    const openCageApiKey = '_YOUR_API_KEY_';
    const weatherApiKey = '_YOUR_API_KEY_';

    try {
        const { lat, lon } = await fetchCoordinates(destinationIATA, openCageApiKey);
        const weatherResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${weatherApiKey}`);
        const weatherData = await weatherResponse.json();

        if (weatherResponse.ok) {
            return `${weatherData.weather[0].description}, ${Math.round(weatherData.main.temp - 273.15)}°C`;
        } else {
            throw new Error('Failed to retrieve weather data');
        }
    } catch (error) {
        throw new Error(`Error fetching weather: ${error.message}`);
    }
}

// Fetch flights between the current location and destination
async function fetchFlights(currentIATA, destinationIATA) {
    const aviationStackApiKey = '_YOUR_API_KEY_';

    try {
        const flightResponse = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${aviationStackApiKey}&dep_iata=${currentIATA}&arr_iata=${destinationIATA}`);
        const flightData = await flightResponse.json();

        if (flightResponse.ok && flightData.data.length > 0) {
            const flight = flightData.data[0];
            return `Flight from ${flight.departure.iata} to ${flight.arrival.iata}: ${flight.airline.name}, Flight number: ${flight.flight.iata}, Status: ${flight.flight_status}`;
        } else {
            throw new Error('No flight data available');
        }
    } catch (error) {
        throw new Error(`Error fetching flights: ${error.message}`);
    }
}

// Fetch current time for the destination
async function fetchTime(destinationIATA) {
    const openCageApiKey = '_YOUR_API_KEY_';
    const timeZoneDbKey = '_YOUR_API_KEY_';

    try {
        const { lat, lon, city } = await fetchCoordinates(destinationIATA, openCageApiKey);
        const timeResponse = await fetch(`http://api.timezonedb.com/v2.1/get-time-zone?key=${timeZoneDbKey}&format=json&by=position&lat=${lat}&lng=${lon}`);
        const timeData = await timeResponse.json();

        if (timeResponse.ok && timeData.status === 'OK') {
            const timeOnly = timeData.formatted.split(' ')[1];
            return `The current time in destination is ${timeOnly}`;
        } else {
            throw new Error('Failed to retrieve time data');
        }
    } catch (error) {
        throw new Error(`Error fetching time: ${error.message}`);
    }
}

// Fetch activities around the destination
async function fetchActivities(destinationIATA) {
    const openCageApiKey = '_YOUR_API_KEY_';

    try {
        const { lat, lon } = await fetchCoordinates(destinationIATA, openCageApiKey);
        const osmUrl = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:1000,${lat},${lon});out;`;
        const osmResponse = await fetch(osmUrl);
        const osmData = await osmResponse.json();

        if (osmResponse.ok && osmData.elements.length > 0) {
            const activityCount = {};
            osmData.elements.forEach(element => {
                if (element.tags && element.tags.amenity) {
                    const amenity = element.tags.amenity;
                    activityCount[amenity] = (activityCount[amenity] || 0) + 1;
                }
            });

            const activitiesArray = Object.entries(activityCount)
                .sort(([, countA], [, countB]) => countB - countA)
                .map(([activity, count]) => `There are ${count} ${activity.replace(/_/g, ' ')} available.\n`);
            
            return activitiesArray.join(' ') || 'No specific activities found.';
        } else {
            throw new Error('No activities found');
        }
    } catch (error) {
        throw new Error(`Error fetching activities: ${error.message}`);
    }
}

// Fetch map for the destination
async function fetchMap(destinationIATA) {
    const openCageApiKey = '8c05bbb9c2e94f47ac6cab2cc94210b0';
    const geoapifyApiKey = '628dbfdafcb54db49cf4442d3d8e6d3f';

    try {
        const { lat, lon } = await fetchCoordinates(destinationIATA, openCageApiKey);
        const mapUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=600&height=400&center=lonlat:${lon},${lat}&zoom=14&apiKey=${geoapifyApiKey}`;
        return mapUrl;
    } catch (error) {
        throw new Error(`Error fetching map: ${error.message}`);
    }
}

// Helper function to fetch coordinates using OpenCage API
async function fetchCoordinates(iataCode, apiKey) {
    try {
        const response = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=${iataCode}&key=${apiKey}`);
        const data = await response.json();

        if (response.ok && data.results.length > 0) {
            const { lat, lng } = data.results[0].geometry;
            const city = data.results[0].components.city || data.results[0].components.town || data.results[0].components.village || data.results[0].components.hamlet || 'Unknown city';
            
            if (!lat || !lng) {
                throw new Error('Latitude or longitude is missing in the response');
            }

            return { lat, lon: lng, city };
        } else {
            throw new Error('Failed to retrieve coordinates from OpenCage');
        }
    } catch (error) {
        throw new Error(`Error fetching coordinates: ${error.message}`);
    }
}