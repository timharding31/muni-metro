// Everything the app knows about SF Muni: which stops matter, how to read the
// 511.org SIRI payload, and which arrivals are worth putting on the board.
//
// The interface is one function — buildBoard(snapshot) — that turns raw stop
// feeds into exactly what the screen shows. Stop codes, direction refs, line
// filters, minute math, sorting, capping and grouping all stay in here.

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
// At or under this many minutes you need to start walking now
const LEAVE_NOW_MINUTES = 3;

// The distinct stops the feed has to fetch. Both PM entries share one stop, so
// this is shorter than the config above.
export const MONITORED_STOP_CODES = [
  ...new Set(Object.values(STOPS).map((stop) => stop.code)),
];

// Which commute leg to show, from local time of day.
// Before noon -> inbound (AM), noon onward -> outbound (PM).
export function currentMode(now = new Date()) {
  return now.getHours() < 12 ? "AM" : "PM";
}

// Minutes until arrival, or null when the feed gives no estimate.
function minutesUntil(expectedArrival, now) {
  if (!expectedArrival) return null;
  return Math.round((new Date(expectedArrival) - now) / 60000);
}

function destinationOf(vehicle) {
  return (
    vehicle.MonitoredCall?.DestinationDisplay ||
    vehicle.DestinationName ||
    "Inbound"
  );
}

// Pull arrivals out of one stop's SIRI payload, filtered by direction and by the
// lines that stop is allowed to show (this is what keeps 1X off the PM board).
function extractArrivals(stopData, stopConfig, now) {
  const visits =
    stopData?.ServiceDelivery?.StopMonitoringDelivery?.MonitoredStopVisit || [];

  return visits.reduce((arrivals, visit) => {
    const vehicle = visit.MonitoredVehicleJourney;
    if (!vehicle) return arrivals;
    if (vehicle.DirectionRef !== stopConfig.direction) return arrivals;
    if (!stopConfig.lines.includes(vehicle.LineRef)) return arrivals;

    const minutes = minutesUntil(vehicle.MonitoredCall?.ExpectedArrivalTime, now);

    arrivals.push({
      line: vehicle.LineRef,
      lineColor: stopConfig.lineColor[vehicle.LineRef],
      destination: destinationOf(vehicle),
      stopName: stopConfig.name,
      stopCode: stopConfig.code,
      minutes,
      hasEstimate: minutes !== null,
      soon: minutes !== null && minutes <= LEAVE_NOW_MINUTES,
    });

    return arrivals;
  }, []);
}

// Arrivals without an estimate sort last; everything else sorts by minutes.
function byMinutes(a, b) {
  return (a.minutes ?? Infinity) - (b.minutes ?? Infinity);
}

// Group the arrivals by stop, ordering groups by their earliest departure. AM
// yields one group per stop; PM collapses to a single group because both lines
// share the outbound stop, but it still gets a header so the
// "<stop> -> <destination>" label is always on screen.
function groupByStop(arrivals) {
  const groups = new Map();

  arrivals.forEach((arrival) => {
    if (!groups.has(arrival.stopCode)) {
      groups.set(arrival.stopCode, {
        stopCode: arrival.stopCode,
        stopName: arrival.stopName,
        arrivals: [],
      });
    }
    groups.get(arrival.stopCode).arrivals.push(arrival);
  });

  return [...groups.values()].sort(
    (a, b) => byMinutes(a.arrivals[0], b.arrivals[0]),
  );
}

// Turn a feed snapshot into the board: the leg being shown, where it takes you,
// and the next few departures grouped by stop. An empty board always carries an
// emptyMessage explaining why, so the caller never has to guess.
export function buildBoard(snapshot, now = new Date()) {
  const mode = currentMode(now);
  const board = {
    mode,
    destination: mode === "AM" ? "work" : "home",
    lastUpdated: snapshot?.lastUpdated || null,
    source: snapshot?.source || null,
    groups: [],
    emptyMessage: null,
  };

  if (!snapshot?.stops) {
    return { ...board, emptyMessage: "No arrival data available" };
  }

  const stopConfigs = mode === "AM" ? INBOUND_STOPS : OUTBOUND_STOPS;
  const arrivals = stopConfigs
    .flatMap((stopConfig) => {
      const stopData = snapshot.stops[stopConfig.code];
      return stopData ? extractArrivals(stopData, stopConfig, now) : [];
    })
    // Drop anything that has already left, then keep only what fits on screen.
    .filter((arrival) => !arrival.hasEstimate || arrival.minutes >= 0)
    .sort(byMinutes)
    .slice(0, MAX_ARRIVALS);

  if (arrivals.length === 0) {
    return { ...board, emptyMessage: "No arrivals scheduled" };
  }

  return { ...board, groups: groupByStop(arrivals) };
}
