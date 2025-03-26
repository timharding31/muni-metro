document.addEventListener('DOMContentLoaded', function () {
    // Get DOM elements
    const refreshBtn = document.getElementById('refresh-btn')
    const apiRefreshBtn = document.getElementById('api-refresh-btn')
    const lastUpdatedEl = document.getElementById('last-updated')
    // Removed individual stop elements as they're no longer in the HTML
    const apiKeyInput = document.getElementById('api-key-input')
    const saveApiKeyBtn = document.getElementById('save-api-key')
    const apiKeyStatus = document.getElementById('api-key-status')
    const arrivalsListEl = document.getElementById('arrivals-list')

    // Local storage key for API key
    const API_KEY_STORAGE = 'muni-metro-api-key'

    // Stop codes
    const STOP_CODES = {
        N_JUDAH: '14448',
        J_CHURCH: '17073'
    }

    // Load the API key from local storage if available
    function loadApiKey() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE)
        if (apiKey) {
            apiKeyInput.value = apiKey
            apiKeyStatus.textContent = 'API key loaded from storage'
            apiKeyStatus.style.color = '#A3BE8C'
            apiRefreshBtn.disabled = false
        } else {
            apiKeyStatus.textContent = 'No API key saved. Enter your key to enable direct fetching.'
            apiKeyStatus.style.color = '#EBCB8B'
            apiRefreshBtn.disabled = true
        }
    }

    // Save API key to local storage
    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim()
        if (apiKey) {
            localStorage.setItem(API_KEY_STORAGE, apiKey)
            apiKeyStatus.textContent = 'API key saved'
            apiKeyStatus.style.color = '#A3BE8C'
            apiRefreshBtn.disabled = false
        } else {
            apiKeyStatus.textContent = 'Please enter a valid API key'
            apiKeyStatus.style.color = '#BF616A'
            apiRefreshBtn.disabled = true
        }
    })

    // Function to fetch data from static cache
    async function fetchCachedArrivals() {
        try {
            // Fetch all data files in parallel
            const [stop1Response, stop2Response, metadataResponse] = await Promise.all([
                fetch('./data/stop-14448.json'),
                fetch('./data/stop-17073.json'),
                fetch('./data/metadata.json')
            ])

            // Check if all responses are OK
            if (!stop1Response.ok || !stop2Response.ok || !metadataResponse.ok) {
                throw new Error('Failed to fetch cached arrival data')
            }

            // Parse JSON responses
            const [stop1Data, stop2Data, metadata] = await Promise.all([
                stop1Response.json(),
                stop2Response.json(),
                metadataResponse.json()
            ])

            return {
                stops: {
                    [STOP_CODES.N_JUDAH]: stop1Data,
                    [STOP_CODES.J_CHURCH]: stop2Data,
                },
                lastUpdated: metadata.lastUpdated,
                source: 'cache'
            }
        } catch (error) {
            console.error('Error fetching cached arrivals:', error)
            if (window.localStorage.getItem(API_KEY_STORAGE)) {
                console.log('Fetching via saved API key:')
                return fetchDirectFromApi()
            }
            return null
        }
    }

    // Function to fetch data directly from 511.org API
    async function fetchDirectFromApi() {
        const apiKey = localStorage.getItem(API_KEY_STORAGE)
        if (!apiKey) {
            apiKeyStatus.textContent = 'Please enter and save your API key first'
            apiKeyStatus.style.color = '#BF616A'
            return null
        }

        try {
            // Create a proxy URL to avoid CORS issues
            const createFetchUrl = (stopCode) => {
                return `https://api.511.org/transit/StopMonitoring?api_key=${apiKey}&agency=SF&stopCode=${stopCode}&format=json`
            }

            // Fetch data for both stops concurrently
            const [stop1Response, stop2Response] = await Promise.all([
                fetch(createFetchUrl(STOP_CODES.N_JUDAH)),
                fetch(createFetchUrl(STOP_CODES.J_CHURCH))
            ])

            if (!stop1Response.ok || !stop2Response.ok) {
                throw new Error('Failed to fetch from API')
            }

            // Parse JSON responses
            const [stop1Data, stop2Data] = await Promise.all([
                stop1Response.json(),
                stop2Response.json()
            ])

            return {
                stops: {
                    [STOP_CODES.N_JUDAH]: stop1Data,
                    [STOP_CODES.J_CHURCH]: stop2Data,
                },
                lastUpdated: new Date().toISOString(),
                source: 'API direct'
            }
        } catch (error) {
            console.error('Error fetching directly from API:', error)
            apiKeyStatus.textContent = 'API fetch failed. Check console for details.'
            apiKeyStatus.style.color = '#BF616A'
            return null
        }
    }

    // Function to format time (minutes from now)
    function formatArrivalTime(expectedArrival) {
        const arrivalTime = new Date(expectedArrival)
        const now = new Date()
        const diffMinutes = Math.round((arrivalTime - now) / 60000)

        if (diffMinutes <= 0) {
            return 'Arriving now'
        } else if (diffMinutes === 1) {
            return '1 minute'
        } else {
            return `${diffMinutes} minutes`
        }
    }

    // Function to get numerical minutes for sorting
    function getMinutesUntilArrival(expectedArrival) {
        if (!expectedArrival) return 999 // No arrival time means put it at the end

        const arrivalTime = new Date(expectedArrival)
        const now = new Date()
        return Math.round((arrivalTime - now) / 60000)
    }

    // Function to format destination display
    function getFormattedDestination(vehicle) {
        // Default to destination display or name
        return vehicle.MonitoredCall?.DestinationDisplay ||
            vehicle.DestinationName ||
            "Inbound"
    }

    // Function to combine and sort arrivals from both stops
    function renderCombinedArrivals(data) {
        if (!data || !data.stops) {
            arrivalsListEl.innerHTML = '<p>No arrival data available</p>'
            return
        }

        try {
            const allArrivals = []

            // Process N-Judah arrivals
            const nArrivals = data.stops[STOP_CODES.N_JUDAH]?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit || []
            nArrivals.forEach(visit => {
                const vehicle = visit.MonitoredVehicleJourney
                if (vehicle.LineRef === 'N' && vehicle.DirectionRef === 'IB') {
                    allArrivals.push({
                        line: 'N',
                        lineColor: '#5e81ac',
                        destination: getFormattedDestination(vehicle),
                        destinationDisplay: getFormattedDestination(vehicle),
                        expectedArrival: vehicle.MonitoredCall?.ExpectedArrivalTime,
                        rawTime: getMinutesUntilArrival(vehicle.MonitoredCall?.ExpectedArrivalTime)
                    })
                }
            })

            // Process J-Church arrivals
            const jArrivals = data.stops[STOP_CODES.J_CHURCH]?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit || []
            jArrivals.forEach(visit => {
                const vehicle = visit.MonitoredVehicleJourney
                if (vehicle.LineRef === 'J' && vehicle.DirectionRef === 'IB') {
                    allArrivals.push({
                        line: 'J',
                        lineColor: '#d08770',
                        destination: getFormattedDestination(vehicle),
                        destinationDisplay: getFormattedDestination(vehicle),
                        expectedArrival: vehicle.MonitoredCall?.ExpectedArrivalTime,
                        rawTime: getMinutesUntilArrival(vehicle.MonitoredCall?.ExpectedArrivalTime)
                    })
                }
            })

            // Sort all arrivals by time
            allArrivals.sort((a, b) => a.rawTime - b.rawTime)

            // No arrivals
            if (allArrivals.length === 0) {
                arrivalsListEl.innerHTML = '<p>No arrivals scheduled</p>'
                return
            }

            // Build HTML for combined arrivals
            const arrivalsHTML = allArrivals.slice(0, 5).map((arrival) => {
                let formattedTime = 'Schedule unavailable'
                if (arrival.expectedArrival) {
                    formattedTime = formatArrivalTime(arrival.expectedArrival)
                }

                return `
                    <li class="train">
                        <span class="line" style="background-color: ${arrival.lineColor}">${arrival.line}</span>
                        <span class="dest">${arrival.destinationDisplay}</span>
                        <span class="time">${formattedTime}</span>
                    </li>
                `
            }).join('')

            arrivalsListEl.innerHTML = arrivalsHTML
        } catch (error) {
            console.error('Error rendering combined arrival data:', error)
            arrivalsListEl.innerHTML = '<p>Error processing arrival data</p>'
        }
    }

    // Function to update the UI
    function updateUI(data) {
        if (!data) {
            arrivalsListEl.innerHTML = '<p>Failed to load data</p>'
            return
        }

        // Update last updated time
        if (data.lastUpdated) {
            const lastUpdated = new Date(data.lastUpdated)
            lastUpdatedEl.textContent = `Last Updated: ${lastUpdated.toLocaleTimeString()} (${data.source})`
        }

        // Render the combined arrivals view
        renderCombinedArrivals(data)
    }

    // Initialize
    loadApiKey()

    // Initial data fetch from cache
    fetchCachedArrivals().then(updateUI)

    // Set up auto-refresh every 60 seconds
    setInterval(() => {
        fetchCachedArrivals().then(updateUI)
    }, 60_000)

    // Cache refresh button
    refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true
        refreshBtn.textContent = 'Refreshing...'

        const data = await fetchCachedArrivals()
        updateUI(data)

        refreshBtn.disabled = false
        refreshBtn.textContent = 'Refresh Cache'
    })

    // Direct API fetch button
    apiRefreshBtn.addEventListener('click', async () => {
        apiRefreshBtn.disabled = true
        apiRefreshBtn.textContent = 'Fetching...'

        const data = await fetchDirectFromApi()
        if (data) {
            updateUI(data)
        }

        apiRefreshBtn.disabled = false
        apiRefreshBtn.textContent = 'Direct API Fetch'
    })
})