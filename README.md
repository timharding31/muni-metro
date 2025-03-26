# Muni Metro Arrival Monitor

A simple web application that displays real-time arrival information for SF Muni Metro trains at specified stops.

## Features

- Displays inbound train arrivals for two nearby stops (N-Judah and J-Church)
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

The default schedule updates data every 5 minutes during weekday commute hours (5am-4pm Pacific Time). 

To change this schedule:
1. Edit `.github/workflows/update-cache.yml`
2. Modify the `cron` value in the `schedule` section
3. Commit and push your changes

### Adding More Stops

1. Update the list of stop codes in the GitHub workflow file
2. Modify the frontend code to display the additional stops

## Project Structure

```
muni-metro/
├── .github/workflows/          # GitHub Actions workflow definitions
│   ├── deploy.yml              # Workflow to deploy the site
│   └── update-cache.yml        # Workflow to update the transit data
├── public/                     # Static website files
│   ├── css/                    # CSS stylesheets
│   ├── js/                     # JavaScript files
│   └── index.html              # Main HTML file
└── README.md                   # This documentation
```

## License

MIT