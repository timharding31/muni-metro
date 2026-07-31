let interval;
let modeInterval;
let renderedMode = null;

// Get DOM elements
const apiRefreshBtn = document.getElementById("api-refresh-btn");
const lastUpdatedEl = document.getElementById("last-updated");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeyStatus = document.getElementById("api-key-status");
const arrivalsListEl = document.getElementById("arrivals-list");
const keyBtn = document.getElementById("key-btn");
const keyDialog = document.getElementById("key-dialog");
const removeApiKeyBtn = document.getElementById("remove-api-key");

// Icons
const refreshIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
    <path d="M21 3v6h-6"/>
  </svg>
`.trim();
const keyIcon = `
  <svg xmlns="http://www.w3.org/2000/svg" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m15.5 7.5 3 3L22 7l-3-3"/>
    <path d="m21 2-9.6 9.6"/>
    <circle cx="7.5" cy="15.5" r="5.5"/>
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
// At or under this many minutes you need to start walking now
const LEAVE_NOW_MINUTES = 3;

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE);
}

// Reflect key state in the status dot and the Update button. Details that used
// to need their own paragraph now live in the dot's tooltip.
function updateKeyStatus(message) {
  const apiKey = getApiKey();
  apiKeyStatus.dataset.state = apiKey ? "live" : "cached";
  apiKeyStatus.title =
    message ||
    (apiKey
      ? "API key saved — fetching live"
      : "No API key saved. Add one to fetch live arrivals.");
  apiRefreshBtn.disabled = !apiKey;
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
    updateKeyStatus("Please save your API key first");
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

    updateKeyStatus();

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
    apiKeyStatus.dataset.state = "error";
    apiKeyStatus.title = "API fetch failed. Check console for details.";
    return null;
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

// The countdown is what you read from three feet away, so it carries the weight.
// "Now" and "—" are words rather than figures, and get sized down accordingly.
function etaHTML(arrival) {
  if (!arrival.expectedArrival) {
    return `<span class="eta__num eta__num--word">&mdash;</span>`;
  }
  if (arrival.rawTime <= 0) {
    return `<span class="eta__num eta__num--word">Now</span>`;
  }
  return `
    <span class="eta__num">${arrival.rawTime}</span>
    <span class="eta__unit">min</span>
  `;
}

// Build the HTML for a single arrival row
function arrivalRowHTML(arrival) {
  const hasEstimate = Boolean(arrival.expectedArrival);
  const soon = hasEstimate && arrival.rawTime <= LEAVE_NOW_MINUTES;

  return `
    <li class="row" data-soon="${soon}" data-stale="${!hasEstimate}">
      <span class="plate" style="background-color: ${arrival.lineColor}">${arrival.line}</span>
      <span class="dest">
        <span class="dest__name">${arrival.destination}</span>
      </span>
      <span class="eta">${etaHTML(arrival)}</span>
    </li>
  `;
}

// The header answers "board here, and it takes you there": the stop name, a
// track that stretches across whatever space is left, then the destination.
function groupHeaderHTML(stopName, destination) {
  return `
    <div class="group__head">
      <h2 class="stop-name">${stopName}</h2>
      <span class="track" aria-hidden="true">
        <span class="track__dot"></span>
        <span class="track__line"></span>
        <span class="track__head"></span>
      </span>
      <span class="sr-only">to</span>
      <span class="dest-name">${destination}</span>
    </div>
  `;
}

// Render arrivals for the current time-of-day mode.
// Arrivals are grouped by stop and capped at MAX_ARRIVALS total: AM (inbound)
// yields one group per stop, PM (outbound) a single group for the shared stop.
function renderArrivals(data) {
  if (!data || !data.stops) {
    arrivalsListEl.innerHTML = "<p>No arrival data available</p>";
    return;
  }

  const mode = currentMode();
  renderedMode = mode;

  const stopConfigs = mode === "AM" ? INBOUND_STOPS : OUTBOUND_STOPS;
  const destination = mode === "AM" ? "work" : "home";

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

  // Group the capped set by stop, ordered by each group's earliest arrival.
  // PM collapses to a single group (both lines share one outbound stop), but it
  // still gets a header so the "<stop> -> <destination>" label is always visible.
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

  arrivalsListEl.innerHTML = orderedCodes
    .map((code) => {
      const group = groups[code];
      return `
        <li class="group">
          ${groupHeaderHTML(group.name, destination)}
          <ul class="rows">
            ${group.items.map(arrivalRowHTML).join("")}
          </ul>
        </li>
      `;
    })
    .join("");
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

  // Update last updated time. The source is a debugging detail, so it rides in
  // the tooltip rather than competing with the arrivals.
  if (data.lastUpdated) {
    const lastUpdated = new Date(data.lastUpdated);
    lastUpdatedEl.textContent = `Updated ${lastUpdated.toLocaleTimeString()}`;
    lastUpdatedEl.title = `Source: ${data.source}`;
  }

  // Render arrivals for the current mode
  renderArrivals(data);
}

function setRefreshBusy(busy) {
  if (busy) {
    apiRefreshBtn.dataset.busy = "true";
    apiRefreshBtn.disabled = true;
  } else {
    delete apiRefreshBtn.dataset.busy;
    apiRefreshBtn.disabled = !getApiKey();
  }
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
  apiRefreshBtn.innerHTML = `${refreshIcon}<span>Update</span>`;
  keyBtn.innerHTML = keyIcon;
  updateKeyStatus();

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
    setRefreshBusy(true);

    const data = await fetchDirectFromApi();
    if (data) updateUI(data);

    setRefreshBusy(false);
  });

  // API key dialog
  keyBtn.addEventListener("click", () => {
    apiKeyInput.value = getApiKey() || "";
    removeApiKeyBtn.hidden = !getApiKey();
    keyDialog.showModal();
  });

  keyDialog.addEventListener("close", () => {
    const apiKey = apiKeyInput.value.trim();

    if (keyDialog.returnValue === "save") {
      if (apiKey) {
        localStorage.setItem(API_KEY_STORAGE, apiKey);
        updateKeyStatus("API key saved");
        startPolling();
        fetchDirectFromApi().then((data) => {
          if (data) updateUI(data);
        });
      } else {
        updateKeyStatus("Please enter a valid API key");
      }
      return;
    }

    if (keyDialog.returnValue === "remove") {
      localStorage.removeItem(API_KEY_STORAGE);
      localStorage.removeItem(API_DATA_STORAGE);
      localStorage.removeItem(API_DATA_TIMESTAMP);
      apiKeyInput.value = "";
      updateKeyStatus("API key removed");
      stopPolling();

      // Reload data from cache since we cleared localStorage
      fetchCachedArrivals().then(updateUI);
    }
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
