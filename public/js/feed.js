import { MONITORED_STOP_CODES } from "./arrivals.js";

// Where arrival data comes from. There are three sources — the live 511.org API,
// the last live response kept in localStorage, and the static cache GitHub
// Actions publishes — and callers should never have to care which one answered.
//
// The feed also owns everything about staying current: the API key, the poll
// timer, the per-minute heartbeat that keeps countdowns honest, and suspending
// itself while the tab is hidden. Callers get snapshots and status; that's all.

const API_KEY_STORAGE = "muni-metro-api-key";
const API_DATA_STORAGE = "muni-metro-data";
const API_DATA_TIMESTAMP = "muni-metro-data-timestamp";

const POLL_INTERVAL_MS = 30_000;
// Countdowns are minute-resolution, so re-emitting this often is enough to keep
// them accurate — and it is what flips the board from AM to PM at noon.
const HEARTBEAT_INTERVAL_MS = 60_000;

const SOURCE_LIVE = "API direct";

function stopMonitoringUrl(stopCode, apiKey) {
  return `https://api.511.org/transit/StopMonitoring?api_key=${apiKey}&agency=SF&stopCode=${stopCode}&format=json`;
}

// Fetch every monitored stop at once and key the responses by stop code.
async function fetchAllStops(urlFor) {
  const responses = await Promise.all(
    MONITORED_STOP_CODES.map((code) => fetch(urlFor(code))),
  );

  if (responses.some((response) => !response.ok)) {
    throw new Error("One or more stop feeds failed");
  }

  const payloads = await Promise.all(
    responses.map((response) => response.json()),
  );

  return Object.fromEntries(
    MONITORED_STOP_CODES.map((code, i) => [code, payloads[i]]),
  );
}

// onSnapshot receives {stops, lastUpdated, source} or null when nothing loaded.
// onStatus receives {state, message, canRefresh} for the key indicator.
export function createFeed({ onSnapshot, onStatus }) {
  let pollTimer = null;
  let heartbeatTimer = null;
  let latest = null;

  const getApiKey = () => localStorage.getItem(API_KEY_STORAGE);

  function reportStatus(message) {
    const apiKey = getApiKey();
    onStatus({
      state: apiKey ? "live" : "cached",
      canRefresh: Boolean(apiKey),
      message:
        message ||
        (apiKey
          ? "API key saved — fetching live"
          : "No API key saved. Add one to fetch live arrivals."),
    });
  }

  function publish(snapshot) {
    latest = snapshot;
    onSnapshot(snapshot);
  }

  // --- The three sources -----------------------------------------------------

  async function fetchLive() {
    const apiKey = getApiKey();
    if (!apiKey) return null;

    try {
      const stops = await fetchAllStops((code) =>
        stopMonitoringUrl(code, apiKey),
      );
      reportStatus();
      return {
        stops,
        lastUpdated: new Date().toISOString(),
        source: SOURCE_LIVE,
      };
    } catch (error) {
      console.error("Error fetching directly from API:", error);
      onStatus({
        state: "error",
        canRefresh: true,
        message: "API fetch failed. Check console for details.",
      });
      return null;
    }
  }

  function readStored() {
    try {
      const data = localStorage.getItem(API_DATA_STORAGE);
      const timestamp = localStorage.getItem(API_DATA_TIMESTAMP);
      if (!data || !timestamp) return null;
      return { ...JSON.parse(data), source: "localStorage" };
    } catch (error) {
      console.error("Error loading data from localStorage:", error);
      return null;
    }
  }

  function writeStored(snapshot) {
    try {
      localStorage.setItem(API_DATA_STORAGE, JSON.stringify(snapshot));
      localStorage.setItem(API_DATA_TIMESTAMP, new Date().toISOString());
    } catch (error) {
      console.error("Error saving data to localStorage:", error);
    }
  }

  async function fetchPublishedCache() {
    try {
      const stops = await fetchAllStops((code) => `./data/stop-${code}.json`);
      const metadataResponse = await fetch("./data/metadata.json");
      if (!metadataResponse.ok) {
        throw new Error("Failed to fetch cache metadata");
      }
      const metadata = await metadataResponse.json();
      return { stops, lastUpdated: metadata.lastUpdated, source: "cache" };
    } catch (error) {
      console.error("Error fetching cached arrivals:", error);
      return null;
    }
  }

  // --- Loading ---------------------------------------------------------------

  // Best available data, in order of freshness. Live responses are remembered so
  // a later failure still has something recent to fall back to.
  async function load() {
    const live = await fetchLive();
    if (live) {
      writeStored(live);
      return live;
    }
    return readStored() || (await fetchPublishedCache());
  }

  async function refresh() {
    publish(await load());
  }

  // --- Timers ----------------------------------------------------------------

  function startTimers() {
    stopTimers();
    if (getApiKey()) {
      pollTimer = setInterval(refresh, POLL_INTERVAL_MS);
    }
    // Re-emitting the snapshot re-renders it against the current clock, which is
    // what ages the countdowns and switches legs at noon even with no API key.
    heartbeatTimer = setInterval(() => {
      if (latest) onSnapshot(latest);
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopTimers() {
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    pollTimer = null;
    heartbeatTimer = null;
  }

  // Nothing useful happens in a hidden tab, and polling one burns API quota.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopTimers();
      return;
    }
    startTimers();
    if (getApiKey()) refresh();
  });

  return {
    getApiKey,

    async start() {
      reportStatus();
      await refresh();
      startTimers();
    },

    refresh,

    // Saving a key immediately upgrades the feed to live data; removing one
    // drops back to the published cache and forgets what the key fetched.
    async setApiKey(apiKey) {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
      reportStatus("API key saved");
      startTimers();
      await refresh();
    },

    async clearApiKey() {
      localStorage.removeItem(API_KEY_STORAGE);
      localStorage.removeItem(API_DATA_STORAGE);
      localStorage.removeItem(API_DATA_TIMESTAMP);
      reportStatus("API key removed");
      startTimers();
      publish(await fetchPublishedCache());
    },
  };
}
