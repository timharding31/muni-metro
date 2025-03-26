document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const refreshBtn = document.getElementById('refresh-btn');
    const apiRefreshBtn = document.getElementById('api-refresh-btn');
    const lastUpdatedEl = document.getElementById('last-updated');
    const arrivals13985El = document.getElementById('arrivals-13985');
    const arrivals14448El = document.getElementById('arrivals-14448');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const apiKeyStatus = document.getElementById('api-key-status');

    // Local storage key for API key
    const API_KEY_STORAGE = 'muni-metro-api-key';

    // Stop codes
    const STOP_CODES = {
        N_JUDAH: '13985',
        J_CHURCH: '14448'
    };

    // Load the API key from local storage if available
    function loadApiKey() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE);
        if (apiKey) {
            apiKeyInput.value = apiKey;
            apiKeyStatus.textContent = 'API key loaded from storage';
            apiKeyStatus.style.color = 'green';
            apiRefreshBtn.disabled = false;
        } else {
            apiKeyStatus.textContent = 'No API key saved. Enter your key to enable direct fetching.';
            apiKeyStatus.style.color = 'orange';
            apiRefreshBtn.disabled = true;
        }
    }

    // Save API key to local storage
    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem(API_KEY_STORAGE, apiKey);
            apiKeyStatus.textContent = 'API key saved';
            apiKeyStatus.style.color = 'green';
            apiRefreshBtn.disabled = false;
        } else {
            apiKeyStatus.textContent = 'Please enter a valid API key';
            apiKeyStatus.style.color = 'red';
            apiRefreshBtn.disabled = true;
        }
    });

    // Function to fetch data from static cache
    async function fetchCachedArrivals() {
        try {
            // Fetch all data files in parallel
            const [stop1Response, stop2Response, metadataResponse] = await Promise.all([
                fetch('./data/stop-13985.json'),
                fetch('./data/stop-14448.json'),
                fetch('./data/metadata.json')
            ]);
            
            // Check if all responses are OK
            if (!stop1Response.ok || !stop2Response.ok || !metadataResponse.ok) {
                throw new Error('Failed to fetch cached arrival data');
            }
            
            // Parse JSON responses
            const [stop1Data, stop2Data, metadata] = await Promise.all([
                stop1Response.json(),
                stop2Response.json(),
                metadataResponse.json()
            ]);
            
            return {
                stops: {
                    [STOP_CODES.N_JUDAH]: stop1Data,
                    [STOP_CODES.J_CHURCH]: stop2Data,
                },
                lastUpdated: metadata.lastUpdated,
                source: 'cache'
            };
        } catch (error) {
            console.error('Error fetching cached arrivals:', error);
            return null;
        }
    }

    // Function to fetch data directly from 511.org API
    async function fetchDirectFromApi() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE);
        if (!apiKey) {
            apiKeyStatus.textContent = 'Please enter and save your API key first';
            apiKeyStatus.style.color = 'red';
            return null;
        }

        try {
            // Create a proxy URL to avoid CORS issues
            const createFetchUrl = (stopCode) => {
                return `https://api.511.org/transit/StopMonitoring?api_key=${apiKey}&agency=SF&stopCode=${stopCode}&format=json`;
            };

            // Fetch data for both stops concurrently
            const [stop1Response, stop2Response] = await Promise.all([
                fetch(createFetchUrl(STOP_CODES.N_JUDAH)),
                fetch(createFetchUrl(STOP_CODES.J_CHURCH))
            ]);
            
            if (!stop1Response.ok || !stop2Response.ok) {
                throw new Error('Failed to fetch from API');
            }
            
            // Parse JSON responses
            const [stop1Data, stop2Data] = await Promise.all([
                stop1Response.json(),
                stop2Response.json()
            ]);
            
            return {
                stops: {
                    [STOP_CODES.N_JUDAH]: stop1Data,
                    [STOP_CODES.J_CHURCH]: stop2Data,
                },
                lastUpdated: new Date().toISOString(),
                source: 'API direct'
            };
        } catch (error) {
            console.error('Error fetching directly from API:', error);
            apiKeyStatus.textContent = 'API fetch failed. Check console for details.';
            apiKeyStatus.style.color = 'red';
            return null;
        }
    }

    // Function to format time (minutes from now)
    function formatArrivalTime(expectedArrival) {
        const arrivalTime = new Date(expectedArrival);
        const now = new Date();
        const diffMinutes = Math.round((arrivalTime - now) / 60000);
        
        if (diffMinutes <= 0) {
            return 'Arriving now';
        } else if (diffMinutes === 1) {
            return '1 minute';
        } else {
            return `${diffMinutes} minutes`;
        }
    }

    // Function to render arrivals for a stop
    function renderArrivals(stopData, element) {
        if (!stopData) {
            element.innerHTML = '<p>No data available</p>';
            return;
        }

        try {
            // Check if we have monitoring deliveries
            const monitoredStopVisit = stopData.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit;
            
            if (!monitoredStopVisit || monitoredStopVisit.length === 0) {
                element.innerHTML = '<p>No arrivals scheduled</p>';
                return;
            }

            // Create HTML for arrivals
            const arrivalsHTML = monitoredStopVisit.map(visit => {
                const vehicle = visit.MonitoredVehicleJourney;
                const line = vehicle.LineRef;
                const destination = vehicle.DestinationName;
                const expectedArrival = vehicle.MonitoredCall?.ExpectedArrivalTime;
                
                let arrivalTime = 'Schedule unavailable';
                if (expectedArrival) {
                    arrivalTime = formatArrivalTime(expectedArrival);
                }

                return `
                    <div class="arrival">
                        <div class="line">${line}</div>
                        <div class="destination">${destination}</div>
                        <div class="time">${arrivalTime}</div>
                    </div>
                `;
            }).join('');

            element.innerHTML = arrivalsHTML;
        } catch (error) {
            console.error('Error rendering arrival data:', error);
            element.innerHTML = '<p>Error processing arrival data</p>';
        }
    }

    // Function to update the UI
    function updateUI(data) {
        if (!data) {
            arrivals13985El.innerHTML = '<p>Failed to load data</p>';
            arrivals14448El.innerHTML = '<p>Failed to load data</p>';
            return;
        }

        // Update last updated time
        if (data.lastUpdated) {
            const lastUpdated = new Date(data.lastUpdated);
            lastUpdatedEl.textContent = `Last Updated: ${lastUpdated.toLocaleTimeString()} (${data.source})`;
        }

        // Render arrivals for each stop
        renderArrivals(data.stops[STOP_CODES.N_JUDAH], arrivals13985El);
        renderArrivals(data.stops[STOP_CODES.J_CHURCH], arrivals14448El);
    }

    // Initialize
    loadApiKey();

    // Initial data fetch from cache
    fetchCachedArrivals().then(updateUI);

    // Set up auto-refresh every 60 seconds
    setInterval(() => {
        fetchCachedArrivals().then(updateUI);
    }, 60000);

    // Cache refresh button
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        
        const data = await fetchCachedArrivals();
        updateUI(data);
        
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh Cache';
    });

    // Direct API fetch button
    apiRefreshBtn.addEventListener('click', async () => {
        apiRefreshBtn.disabled = true;
        apiRefreshBtn.textContent = 'Fetching...';
        
        const data = await fetchDirectFromApi();
        if (data) {
            updateUI(data);
        }
        
        apiRefreshBtn.disabled = false;
        apiRefreshBtn.textContent = 'Direct API Fetch';
    });
});