let interval;
let modeInterval;
let renderedMode = null;

// Get DOM elements
const apiRefreshBtn = document.getElementById("api-refresh-btn");
const lastUpdatedEl = document.getElementById("last-updated");
const apiKeyInput = document.getElementById("api-key-input");
const saveApiKeyBtn = document.getElementById("save-api-key");
const removeApiKeyBtn = document.getElementById("remove-api-key");
const apiKeyStatus = document.getElementById("api-key-status");
const arrivalsListEl = document.getElementById("arrivals-list");

// Icons
const ARROW_SIZE = 16;
const ICON_SIZE = 20;
const BUS_SIZE = 32;
const arrow = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${ARROW_SIZE}" height="${ARROW_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 8L22 12L18 16"/>
    <path d="M2 12H22"/>
  </svg>
`.trim();
const house = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-house-icon lucide-house">
    <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
    <path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
  </svg>
`.trim();
const factory = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 16h.01"/><path d="M16 16h.01"/>
    <path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M8 16h.01"/>
  </svg>
`.trim();
const bus = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${BUS_SIZE}" height="${BUS_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 6v6"/>
    <path d="M15 6v6"/>
    <path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>
    <circle cx="7" cy="18" r="2"/>
    <path d="M9 18h5"/>
    <circle cx="16" cy="18" r="2"/>
  </svg>
`.trim();

// Local storage keys
const API_KEY_STORAGE = "muni-metro-api-key";
const API_DATA_STORAGE = "muni-metro-data";
const API_DATA_TIMESTAMP = "muni-metro-data-timestamp";

// Stop configuration
// Inbound (AM): 12 from Pacific Ave & Polk St, 1 from Clay St & Polk St
// Outbound (PM): 12 and 1 from Sacramento St & Battery St (1X excluded via line filter)
const STOPS = {
  INBOUND_12: {
    code: "15851",
    name: "Pacific & Polk",
    lines: ["12"],
    direction: "OB",
    lineColor: { 12: "#5e81ac" },
  },
  INBOUND_1: {
    code: "14026",
    name: "Clay & Polk",
    lines: ["1"],
    direction: "IB",
    lineColor: { 1: "#d08770" },
  },
  OUTBOUND_12: {
    code: "16290",
    name: "Sacramento & Battery",
    lines: ["12"],
    direction: "IB",
    lineColor: { 12: "#5e81ac" },
  },
  OUTBOUND_1: {
    code: "16290",
    name: "Sacramento & Battery",
    lines: ["1"],
    direction: "OB",
    lineColor: { 1: "#d08770" },
  },
};

const INBOUND_STOPS = [STOPS.INBOUND_12, STOPS.INBOUND_1];
const OUTBOUND_STOPS = [STOPS.OUTBOUND_12, STOPS.OUTBOUND_1];
const MAX_ARRIVALS = 5;
const POLL_INTERVAL_MS = 30_000;

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE);
}

// Load the API key from local storage if available
function loadApiKey() {
  const apiKey = getApiKey();
  if (apiKey) {
    apiKeyInput.value = apiKey;
    apiKeyStatus.textContent = "API key loaded from storage";
    apiKeyStatus.style.color = "#A3BE8C";
    apiRefreshBtn.disabled = false;

    // Hide input and save button, show remove button
    apiKeyInput.hidden = true;
    saveApiKeyBtn.hidden = true;
    removeApiKeyBtn.hidden = false;
  } else {
    apiKeyStatus.textContent =
      "No API key saved. Enter your key to enable direct fetching.";
    apiKeyStatus.style.color = "#EBCB8B";
    apiRefreshBtn.disabled = true;

    // Show input and save button, hide remove button
    apiKeyInput.hidden = false;
    saveApiKeyBtn.hidden = false;
    removeApiKeyBtn.hidden = true;
  }
}

// Determine which commute leg to show based on local time of day.
// Before noon -> inbound (AM), noon onward -> outbound (PM).
function currentMode() {
  return new Date().getHours() < 12 ? "AM" : "PM";
}

// Function to fetch data from static cache
async function fetchCachedArrivals() {
  try {
    const [s1Response, s2Response, s3Response, metadataResponse] =
      await Promise.all([
        fetch(`./data/stop-${STOPS.INBOUND_12.code}.json`),
        fetch(`./data/stop-${STOPS.INBOUND_1.code}.json`),
        fetch(`./data/stop-${STOPS.OUTBOUND_12.code}.json`),
        fetch("./data/metadata.json"),
      ]);

    if (
      !s1Response.ok ||
      !s2Response.ok ||
      !s3Response.ok ||
      !metadataResponse.ok
    ) {
      throw new Error("Failed to fetch cached arrival data");
    }

    const [s1Data, s2Data, s3Data, metadata] = await Promise.all([
      s1Response.json(),
      s2Response.json(),
      s3Response.json(),
      metadataResponse.json(),
    ]);

    return {
      stops: {
        [STOPS.INBOUND_12.code]: s1Data,
        [STOPS.INBOUND_1.code]: s2Data,
        [STOPS.OUTBOUND_12.code]: s3Data,
      },
      lastUpdated: metadata.lastUpdated,
      source: "cache",
    };
  } catch (error) {
    console.error("Error fetching cached arrivals:", error);
    return null;
  }
}

// Function to fetch data directly from 511.org API
async function fetchDirectFromApi() {
  const apiKey = getApiKey();
  if (!apiKey) {
    apiKeyStatus.textContent = "Please enter and save your API key first";
    apiKeyStatus.style.color = "#BF616A";

    // Ensure input and save button are visible if API key is missing
    apiKeyInput.hidden = false;
    saveApiKeyBtn.hidden = false;
    removeApiKeyBtn.hidden = true;
    return null;
  }

  try {
    const createFetchUrl = (stopCode) => {
      return `https://api.511.org/transit/StopMonitoring?api_key=${apiKey}&agency=SF&stopCode=${stopCode}&format=json`;
    };

    const [s1Response, s2Response, s3Response] = await Promise.all([
      fetch(createFetchUrl(STOPS.INBOUND_12.code)),
      fetch(createFetchUrl(STOPS.INBOUND_1.code)),
      fetch(createFetchUrl(STOPS.OUTBOUND_12.code)),
    ]);

    if (!s1Response.ok || !s2Response.ok || !s3Response.ok) {
      throw new Error("Failed to fetch from API");
    }

    const [s1Data, s2Data, s3Data] = await Promise.all([
      s1Response.json(),
      s2Response.json(),
      s3Response.json(),
    ]);

    return {
      stops: {
        [STOPS.INBOUND_12.code]: s1Data,
        [STOPS.INBOUND_1.code]: s2Data,
        [STOPS.OUTBOUND_12.code]: s3Data,
      },
      lastUpdated: new Date().toISOString(),
      source: "API direct",
    };
  } catch (error) {
    console.error("Error fetching directly from API:", error);
    apiKeyStatus.textContent = "API fetch failed. Check console for details.";
    apiKeyStatus.style.color = "#BF616A";
    return null;
  }
}

// Function to format time (minutes from now)
function formatArrivalTime(expectedArrival) {
  const arrivalTime = new Date(expectedArrival);
  const now = new Date();
  const diffMinutes = Math.round((arrivalTime - now) / 60000);

  if (diffMinutes <= 0) {
    return "Arriving now";
  } else if (diffMinutes === 1) {
    return "1 minute";
  } else {
    return `${diffMinutes} minutes`;
  }
}

// Function to get numerical minutes for sorting
function getMinutesUntilArrival(expectedArrival) {
  if (!expectedArrival) return 999; // No arrival time means put it at the end

  const arrivalTime = new Date(expectedArrival);
  const now = new Date();
  return Math.round((arrivalTime - now) / 60000);
}

// Function to format destination display
function getFormattedDestination(vehicle) {
  // Default to destination display or name
  return (
    vehicle.MonitoredCall?.DestinationDisplay ||
    vehicle.DestinationName ||
    "Inbound"
  );
}

// Extract arrivals for a single stop, filtered by direction and allowed lines.
function extractArrivals(stopData, stopConfig) {
  const visits =
    stopData?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit || [];
  const arrivals = [];

  visits.forEach((visit) => {
    const vehicle = visit.MonitoredVehicleJourney;
    if (!vehicle) return;
    if (vehicle.DirectionRef !== stopConfig.direction) return;
    // Line filter excludes anything not in the allowed set (e.g. 1X at the outbound stop)
    if (!stopConfig.lines.includes(vehicle.LineRef)) return;

    arrivals.push({
      line: vehicle.LineRef,
      lineColor: stopConfig.lineColor[vehicle.LineRef],
      destination: getFormattedDestination(vehicle),
      stopName: stopConfig.name,
      stopCode: stopConfig.code,
      expectedArrival: vehicle.MonitoredCall?.ExpectedArrivalTime,
      rawTime: getMinutesUntilArrival(
        vehicle.MonitoredCall?.ExpectedArrivalTime,
      ),
    });
  });

  return arrivals;
}

// Build the HTML for a single arrival row
function arrivalRowHTML(arrival) {
  const formattedTime = arrival.expectedArrival
    ? formatArrivalTime(arrival.expectedArrival)
    : "Schedule unavailable";

  return `
            <li class="train">
                <div class="line" style="background-color: ${arrival.lineColor}">
                <span>${arrival.line}</span>
                </div>
                <div class="bus">
                    ${bus}
                </div>
                <span class="dest">${arrival.destination}</span>
                <span class="time">${formattedTime}</span>
            </li>
        `;
}

// Render arrivals for the current time-of-day mode.
// AM (inbound): arrivals grouped by stop, capped at MAX_ARRIVALS total.
// PM (outbound): single sorted list, capped at MAX_ARRIVALS.
function renderArrivals(data) {
  if (!data || !data.stops) {
    arrivalsListEl.innerHTML = "<p>No arrival data available</p>";
    return;
  }

  const mode = currentMode();
  renderedMode = mode;

  const stopConfigs = mode === "AM" ? INBOUND_STOPS : OUTBOUND_STOPS;

  // Collect arrivals across the relevant stops
  let allArrivals = [];
  stopConfigs.forEach((stopConfig) => {
    const stopData = data.stops[stopConfig.code];
    if (!stopData) return;
    allArrivals = allArrivals.concat(extractArrivals(stopData, stopConfig));
  });

  // Sort by time, drop anything that has already left
  allArrivals.sort((a, b) => a.rawTime - b.rawTime);
  while (allArrivals.length > 0 && allArrivals[0].rawTime < 0) {
    allArrivals.shift();
  }

  const capped = allArrivals.slice(0, MAX_ARRIVALS);

  if (capped.length === 0) {
    arrivalsListEl.innerHTML = "<p>No arrivals scheduled</p>";
    return;
  }

  if (mode === "PM") {
    // Single combined list for the one outbound stop
    arrivalsListEl.innerHTML = capped.map(arrivalRowHTML).join("");
    return;
  }

  // AM: group the capped set by stop, ordered by each group's earliest arrival
  const groups = {};
  capped.forEach((arrival) => {
    if (!groups[arrival.stopCode]) {
      groups[arrival.stopCode] = { name: arrival.stopName, items: [] };
    }
    groups[arrival.stopCode].items.push(arrival);
  });

  const orderedCodes = Object.keys(groups).sort((a, b) => {
    return groups[a].items[0].rawTime - groups[b].items[0].rawTime;
  });

  const html = orderedCodes
    .map((code) => {
      const group = groups[code];
      return `
            <li class="stop-group">
                <h3 class="stop-name">
                  ${group.name}
                  ${arrow}
                  ${mode === "AM" ? factory : house}
                </h3>
                <ul class="stop-arrivals">
                    ${group.items.map(arrivalRowHTML).join("")}
                </ul>
            </li>
        `;
    })
    .join("");

  arrivalsListEl.innerHTML = html;
}

// Function to save data to localStorage
function saveDataToLocalStorage(data) {
  if (!data) return;

  try {
    localStorage.setItem(API_DATA_STORAGE, JSON.stringify(data));
    localStorage.setItem(API_DATA_TIMESTAMP, new Date().toISOString());
  } catch (error) {
    console.error("Error saving data to localStorage:", error);
  }
}

// Function to load data from localStorage
function getDataFromLocalStorage() {
  try {
    const data = localStorage.getItem(API_DATA_STORAGE);
    const timestamp = localStorage.getItem(API_DATA_TIMESTAMP);

    if (!data || !timestamp) return null;

    return {
      ...JSON.parse(data),
      source: "localStorage",
    };
  } catch (error) {
    console.error("Error loading data from localStorage:", error);
    return null;
  }
}

// Function to update the UI
function updateUI(data) {
  if (!data) {
    arrivalsListEl.innerHTML = "<p>Failed to load data</p>";
    return;
  }

  // Save the data to localStorage if it's from API
  if (data.source === "API direct") {
    saveDataToLocalStorage(data);
  }

  // Update last updated time
  if (data.lastUpdated) {
    const lastUpdated = new Date(data.lastUpdated);
    lastUpdatedEl.textContent = `Last Updated: ${lastUpdated.toLocaleTimeString()} (${data.source})`;
  }

  // Render arrivals for the current mode
  renderArrivals(data);
}

function startPolling() {
  stopPolling();
  if (getApiKey()) {
    interval = setInterval(async () => {
      const data = await fetchDirectFromApi();
      if (data) updateUI(data);
    }, POLL_INTERVAL_MS);
  }
}

function stopPolling() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

// Re-render from the most recent data when the time-of-day mode changes
// (covers the no-API-key / cache-only case, which otherwise renders once on load).
function startModeWatcher() {
  stopModeWatcher();
  modeInterval = setInterval(() => {
    if (renderedMode === null || renderedMode === currentMode()) return;
    const storedData = getDataFromLocalStorage();
    if (storedData) {
      renderArrivals(storedData);
    }
  }, 60_000);
}

function stopModeWatcher() {
  if (modeInterval) {
    clearInterval(modeInterval);
    modeInterval = null;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  // Initialize
  loadApiKey();

  if (getApiKey()) {
    arrivalsListEl.innerHTML = "<p>Loading live arrivals...</p>";
    fetchDirectFromApi().then((data) => {
      if (data) {
        updateUI(data);
      } else {
        const storedData = getDataFromLocalStorage();
        if (storedData) {
          updateUI(storedData);
        } else {
          fetchCachedArrivals().then(updateUI);
        }
      }
    });
  } else {
    const storedData = getDataFromLocalStorage();
    if (storedData) {
      updateUI(storedData);
    } else {
      fetchCachedArrivals().then(updateUI);
    }
  }

  // Start polling if we have an API key
  startPolling();
  startModeWatcher();

  // Direct API fetch button
  apiRefreshBtn.addEventListener("click", async () => {
    apiRefreshBtn.disabled = true;
    apiRefreshBtn.textContent = "Updating...";

    const data = await fetchDirectFromApi();
    if (data) updateUI(data);

    apiRefreshBtn.disabled = false;
    apiRefreshBtn.textContent = "Update";
  });

  // Save API key button
  saveApiKeyBtn.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
      apiKeyStatus.textContent = "API key saved";
      apiKeyStatus.style.color = "#A3BE8C";
      apiRefreshBtn.disabled = false;

      // Hide input and save button, show remove button
      apiKeyInput.hidden = true;
      saveApiKeyBtn.hidden = true;
      removeApiKeyBtn.hidden = false;

      startPolling();
    } else {
      apiKeyStatus.textContent = "Please enter a valid API key";
      apiKeyStatus.style.color = "#BF616A";
      apiRefreshBtn.disabled = true;
    }
  });

  // Remove API key button
  removeApiKeyBtn.addEventListener("click", () => {
    localStorage.removeItem(API_KEY_STORAGE);
    localStorage.removeItem(API_DATA_STORAGE);
    localStorage.removeItem(API_DATA_TIMESTAMP);
    apiKeyInput.value = "";
    apiKeyStatus.textContent = "API key removed";
    apiKeyStatus.style.color = "#EBCB8B";
    apiRefreshBtn.disabled = true;

    // Show input and save button, hide remove button
    apiKeyInput.hidden = false;
    saveApiKeyBtn.hidden = false;
    removeApiKeyBtn.hidden = true;

    stopPolling();

    // Reload data from cache since we cleared localStorage
    fetchCachedArrivals().then(updateUI);
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopPolling();
    stopModeWatcher();
  } else {
    startPolling();
    startModeWatcher();
    if (getApiKey()) {
      fetchDirectFromApi().then((data) => {
        if (data) updateUI(data);
      });
    }
  }
});
