# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev     # serves ./public on :8080 with caching disabled
npm test        # stub — there is no test framework in this repo
```

There is no build step, bundler, linter, or transpiler. `public/` is deployed
verbatim. Browsers load `public/js/*.js` as native ES modules, so imports must
keep their explicit `.js` extensions and stay relative.

### Local development gotcha

The app fetches `./data/*.json`, which only exists on the `gh-pages` branch. A
plain `npm run dev` therefore renders "No arrival data available". To see a
populated board locally, generate fixtures into `public/data/` (gitignored):

```js
// stop codes: 15851, 14026, 16290; plus metadata.json with {"lastUpdated": ISO}
{"ServiceDelivery":{"StopMonitoringDelivery":{"MonitoredStopVisit":[
  {"MonitoredVehicleJourney":{"LineRef":"12","DirectionRef":"OB",
    "MonitoredCall":{"DestinationDisplay":"Ferry Plaza",
                     "ExpectedArrivalTime":"<ISO, a few minutes out>"}}}]}}}
```

Arrivals in the past are filtered out, so fixture times must be regenerated
relative to now. The board also switches legs at noon (see AM/PM below), which
determines which stop codes are even read.

## Two-branch deployment model

This is the most surprising thing about the repo:

- `main` holds source only.
- `gh-pages` holds both the deployed site **and** the live `data/` cache.

`update-cache.yml` checks out `gh-pages` directly, curls 511.org into `data/`,
and commits back to that branch on a commute-hours cron (expressed in UTC
assuming PDT, so runs shift an hour during PST). `deploy.yml` copies `public/`
into `dist/`, then re-copies `data/` back out of `gh-pages` and deploys with
`clean-exclude: data/*` so the cache survives a site deploy.

Consequence: `public/data/` must never be committed on `main` — it is gitignored.

## Architecture

`public/js/` is four files: `app.js` is wiring only; the other three are
deliberately deep modules with small interfaces. Keep it that way — a change
should land in exactly one of them.

- **`arrivals.js`** — the only place that knows stop codes, `DirectionRef`
  values, line filters, the SIRI response shape, and the AM/PM commute split.
  Interface is `buildBoard(snapshot, now)` returning exactly what the screen
  shows. No DOM, no I/O, no hidden clock (`now` is injectable), so it is the one
  module that can be exercised directly under Node.
- **`feed.js`** — the only place that fetches. Hides three sources behind one
  fallback chain: live 511.org → last live response in `localStorage` → the
  static cache published by Actions. Also owns the API key, the 30s poll, the
  60s heartbeat, and suspending itself when the tab is hidden.
- **`board.js`** — the only place that touches the DOM. Owns every element id,
  all markup, the icons, busy/status affordances, and the key dialog.

Data flows one way: `feed` emits a snapshot → `arrivals` turns it into a board →
`board` paints it. `feed` derives which stops to fetch from `arrivals`'
`MONITORED_STOP_CODES`, so adding a stop means editing `STOPS` (plus the curl
list in `update-cache.yml`) and nothing else.

### AM/PM commute mode

Before noon the board shows the inbound leg (two separate stops, one group
each); from noon it shows outbound (both lines share stop 16290, so it collapses
to one group). The 60s heartbeat in `feed.js` re-emits the current snapshot,
which is what ages the countdowns and flips the leg at noon even with no API key.

### Two data paths for the same API

The Actions cache uses the `API_KEY` repo secret. Live mode uses a key the user
pastes into the dialog, stored in `localStorage` and sent from the browser. With
no key the app is read-only against the published cache and the Update button is
disabled.

## Frontend conventions

- CSS selects on classes and `data-` attributes only; no id selectors. The
  element ids in `index.html` are the JS contract, the classes are the CSS one.
- The app is installed as a PWA on Android, where Chrome lays it out edge to
  edge. `index.html` sets `viewport-fit=cover` and `.app` uses `100svh` plus
  `env(safe-area-inset-*)` padding. Do not switch back to `100dvh` — the dynamic
  viewport measures taller than the area above the gesture bar and pushes the
  controls off screen. `body` is `overflow: hidden`; only `.board` scrolls.
- Nord palette, dark only. Amber is reserved for imminent arrivals
  (`LEAVE_NOW_MINUTES`).

## Testing note

`<dialog>` `close` events do not fire under Claude-in-Chrome browser automation
(reproducible with a minimal standalone page), so the API-key dialog cannot be
verified with real clicks there. Dispatch the event directly instead:

```js
dlg.returnValue = "save";
dlg.dispatchEvent(new Event("close"));
```
