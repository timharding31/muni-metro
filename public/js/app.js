let interval

// Get DOM elements
const apiRefreshBtn = document.getElementById('api-refresh-btn')
const lastUpdatedEl = document.getElementById('last-updated')
const apiKeyInput = document.getElementById('api-key-input')
const saveApiKeyBtn = document.getElementById('save-api-key')
const removeApiKeyBtn = document.getElementById('remove-api-key')
const apiKeyStatus = document.getElementById('api-key-status')
const arrivalsListEl = document.getElementById('arrivals-list')

// Local storage keys
const API_KEY_STORAGE = 'muni-metro-api-key'
const API_DATA_STORAGE = 'muni-metro-data'
const API_DATA_TIMESTAMP = 'muni-metro-data-timestamp'

// Stop codes
const STOP_CODES = {
    N_JUDAH: '14448',
    J_CHURCH: '14006'
}

function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE)
}

// Load the API key from local storage if available
function loadApiKey() {
    const apiKey = getApiKey()
    if (apiKey) {
        apiKeyInput.value = apiKey
        apiKeyStatus.textContent = 'API key loaded from storage'
        apiKeyStatus.style.color = '#A3BE8C'
        apiRefreshBtn.disabled = false
        
        // Hide input and save button, show remove button
        apiKeyInput.hidden = true
        saveApiKeyBtn.hidden = true
        removeApiKeyBtn.hidden = false
    } else {
        apiKeyStatus.textContent = 'No API key saved. Enter your key to enable direct fetching.'
        apiKeyStatus.style.color = '#EBCB8B'
        apiRefreshBtn.disabled = true
        
        // Show input and save button, hide remove button
        apiKeyInput.hidden = false
        saveApiKeyBtn.hidden = false
        removeApiKeyBtn.hidden = true
    }
}

// Function to fetch data from static cache
async function fetchCachedArrivals() {
    try {
        // Fetch all data files in parallel
        const [stop1Response, stop2Response, metadataResponse] = await Promise.all([
            fetch('./data/stop-14448.json'),
            fetch('./data/stop-14006.json'),
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
        return null
    }
}

// Function to fetch data directly from 511.org API
async function fetchDirectFromApi() {
    const apiKey = getApiKey()
    if (!apiKey) {
        apiKeyStatus.textContent = 'Please enter and save your API key first'
        apiKeyStatus.style.color = '#BF616A'
        
        // Ensure input and save button are visible if API key is missing
        apiKeyInput.hidden = false
        saveApiKeyBtn.hidden = false
        removeApiKeyBtn.hidden = true
        return null
    }

    try {
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
                    expectedArrival: vehicle.MonitoredCall?.ExpectedArrivalTime,
                    rawTime: getMinutesUntilArrival(vehicle.MonitoredCall?.ExpectedArrivalTime)
                })
            }
        })

        // Sort all arrivals by time
        allArrivals.sort((a, b) => a.rawTime - b.rawTime)

        while (allArrivals.length > 0 && allArrivals[0].rawTime < 0) {
            // Remove any trains that have already left
            allArrivals.shift()
        }

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
                        <div class="line" style="background-color: ${arrival.lineColor}">
                            <span>${arrival.line}</span>
                        </div>
                        <span class="dest">${arrival.destination}</span>
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

// Function to save data to localStorage
function saveDataToLocalStorage(data) {
    if (!data) return
    
    try {
        localStorage.setItem(API_DATA_STORAGE, JSON.stringify(data))
        localStorage.setItem(API_DATA_TIMESTAMP, new Date().toISOString())
    } catch (error) {
        console.error('Error saving data to localStorage:', error)
    }
}

// Function to load data from localStorage
function getDataFromLocalStorage() {
    try {
        const data = localStorage.getItem(API_DATA_STORAGE)
        const timestamp = localStorage.getItem(API_DATA_TIMESTAMP)
        
        if (!data || !timestamp) return null
        
        return {
            ...JSON.parse(data),
            source: 'localStorage'
        }
    } catch (error) {
        console.error('Error loading data from localStorage:', error)
        return null
    }
}

// Function to update the UI
function updateUI(data) {
    if (!data) {
        arrivalsListEl.innerHTML = '<p>Failed to load data</p>'
        return
    }

    // Save the data to localStorage if it's from API
    if (data.source === 'API direct') {
        saveDataToLocalStorage(data)
    }

    // Update last updated time
    if (data.lastUpdated) {
        const lastUpdated = new Date(data.lastUpdated)
        lastUpdatedEl.textContent = `Last Updated: ${lastUpdated.toLocaleTimeString()} (${data.source})`
    }

    // Render the combined arrivals view
    renderCombinedArrivals(data)
}

function startPolling() {
    stopPolling()
    if (getApiKey()) {
        interval = setInterval(async () => {
            const data = await fetchDirectFromApi()
            if (data) updateUI(data)
        }, 60_000)
    }
}

function stopPolling() {
    if (interval) {
        clearInterval(interval)
        interval = null
    }
}

document.addEventListener('DOMContentLoaded', function () {
    // Initialize
    loadApiKey()

    // First try to get data from localStorage
    const storedData = getDataFromLocalStorage()
    
    if (storedData) {
        // If we have stored data, use it immediately
        updateUI(storedData)
    } else {
        // Fall back to cache if no localStorage data
        fetchCachedArrivals().then(updateUI)
    }

    // Start polling if we have an API key
    startPolling()

    // Direct API fetch button
    apiRefreshBtn.addEventListener('click', async () => {
        apiRefreshBtn.disabled = true
        apiRefreshBtn.textContent = 'Updating...'

        const data = await fetchDirectFromApi()
        if (data) updateUI(data)

        apiRefreshBtn.disabled = false
        apiRefreshBtn.textContent = 'Update'
    })

    // Save API key button
    saveApiKeyBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim()
        if (apiKey) {
            localStorage.setItem(API_KEY_STORAGE, apiKey)
            apiKeyStatus.textContent = 'API key saved'
            apiKeyStatus.style.color = '#A3BE8C'
            apiRefreshBtn.disabled = false
            
            // Hide input and save button, show remove button
            apiKeyInput.hidden = true
            saveApiKeyBtn.hidden = true
            removeApiKeyBtn.hidden = false
            
            startPolling()
        } else {
            apiKeyStatus.textContent = 'Please enter a valid API key'
            apiKeyStatus.style.color = '#BF616A'
            apiRefreshBtn.disabled = true
        }
    })
    
    // Remove API key button
    removeApiKeyBtn.addEventListener('click', () => {
        localStorage.removeItem(API_KEY_STORAGE)
        localStorage.removeItem(API_DATA_STORAGE)
        localStorage.removeItem(API_DATA_TIMESTAMP)
        apiKeyInput.value = ''
        apiKeyStatus.textContent = 'API key removed'
        apiKeyStatus.style.color = '#EBCB8B'
        apiRefreshBtn.disabled = true
        
        // Show input and save button, hide remove button
        apiKeyInput.hidden = false
        saveApiKeyBtn.hidden = false
        removeApiKeyBtn.hidden = true
        
        stopPolling()
        
        // Reload data from cache since we cleared localStorage
        fetchCachedArrivals().then(updateUI)
    })
})

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopPolling()
    } else {
        startPolling()
    }
})
