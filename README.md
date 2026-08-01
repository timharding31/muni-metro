# Muni Metro Arrival Monitor

A simple web application that displays real-time arrival information for SF Muni Metro trains at specified stops.

## Features

- Displays bus arrivals for the 12 and 1 lines, switching between inbound (mornings) and outbound (evenings) stops based on time of day
- Updates data every 5 minutes during weekday commute times
- Simple, mobile-friendly web interface
- Static site hosted on GitHub Pages
- Data updated via GitHub Actions

## How It Works

This application takes a serverless approach:

1. **GitHub Actions** fetches data from the SF Muni API on a schedule
2. The data is stored as static JSON files in the gh-pages branch
3. The **GitHub Pages** site loads these JSON files to display arrivals
4. The site automatically refreshes to show the latest data

This approach has several advantages:

- Completely free to host (no server costs)
- Simple architecture with no backend server to maintain
- Reliable, with GitHub's infrastructure handling the scheduled updates
- API key is secured in GitHub Secrets, not exposed to clients

## Setup and Deployment

### Prerequisites

- A GitHub account
- A 511.org API key (get one at https://511.org/developers/list/apis/)

### Deployment Steps

1. **Fork this repository**
2. **Set up your API key in GitHub Secrets**
   - Go to your repository on GitHub
   - Navigate to Settings > Secrets and variables > Actions
   - Click "New repository secret"
   - Name: `API_KEY`
   - Value: Your 511.org API key
   - Click "Add secret"

3. **Enable GitHub Pages**
   - Go to Settings > Pages
   - Source: Deploy from a branch
   - Branch: gh-pages
   - Click "Save"

4. **Manually trigger the workflows to start**
   - Go to Actions tab
   - Select "Deploy to GitHub Pages" workflow
   - Click "Run workflow"
   - After that completes, run the "Update Muni Data Cache" workflow

5. **Access your site**
   - Your site will be available at `https://[your-username].github.io/muni-metro/`

### Local Development

1. Clone your repository

   ```
   git clone https://github.com/[your-username]/muni-metro.git
   cd muni-metro
   ```

2. Serve the files locally

   ```
   npx http-server public
   ```

3. Open your browser and visit `http://localhost:8080`

## Customization

### Modifying the Update Schedule

The default schedule updates data every 5 minutes during weekday commute windows: 8am-11am (inbound) and 4pm-8pm (outbound), Pacific Time. Cron is expressed in UTC and assumes PDT (UTC-7), so runs shift an hour earlier during PST.

To change this schedule:

1. Edit `.github/workflows/update-cache.yml`
2. Modify the `cron` value in the `schedule` section
3. Commit and push your changes

### Adding More Stops

Stop knowledge lives in one place, `public/js/arrivals.js`:

1. Update the list of stop codes in `.github/workflows/update-cache.yml`
2. Add the stop to the `STOPS` config in `public/js/arrivals.js` (code, name, lines,
   direction, and line colors)
3. Add it to the `INBOUND_STOPS` or `OUTBOUND_STOPS` array so it renders in the right mode

Nothing else needs to change — the feed derives which stops to fetch from `STOPS`,
and the view renders whatever groups it is given.

## Project Structure

```
muni-metro/
├── .github/workflows/          # GitHub Actions workflow definitions
│   ├── deploy.yml              # Workflow to deploy the site
│   └── update-cache.yml        # Workflow to update the transit data
├── public/                     # Static website files
│   ├── css/styles.css          # All styling
│   ├── js/
│   │   ├── app.js              # Entry point — wires the three modules together
│   │   ├── arrivals.js         # Stop config + SIRI parsing -> the board to show
│   │   ├── feed.js             # Live API / localStorage / published cache, polling
│   │   └── board.js            # All DOM rendering and controls
│   └── index.html              # Main HTML file
└── README.md                   # This documentation
```

### Module Boundaries

The three modules are deliberately deep — small interfaces over the parts most
likely to change:

- **`arrivals.js`** — the only module that knows stop codes, direction refs, line
  filters, the SIRI response shape, and the AM/PM commute split. Its whole
  interface is `buildBoard(snapshot)`, which returns exactly what the screen
  shows. It touches no DOM and performs no I/O, so it is directly testable.
- **`feed.js`** — the only module that fetches. It hides the three data sources
  (live 511.org, the last live response in `localStorage`, the static cache
  published by Actions) behind one fallback chain, and owns the API key, the poll
  timer, the per-minute heartbeat that keeps countdowns current, and suspending
  itself while the tab is hidden.
- **`board.js`** — the only module that touches the DOM. It owns every element
  id, all markup, the icons, the busy/status affordances, and the key dialog. It
  cannot fetch or read the clock.

`app.js` is wiring and nothing else.

## License

MIT
