# WindWave Endpoint Control

Practicum site on endpoint data management with JavaScript, themed on wind energy for smart cities. It includes the cloud architecture diagram (Devices, Cloud CDN, Cloud Load Balancing, Cloud Run, Cloud Firestore, Cloud Storage, Secret Manager) and a working turbine fleet console that uses async requests.

## Files
- `endpointwind-page.html` – the page
- `endpointwind-style.css` – dark control-room styles and animations
- `endpointwind-script.js` – simulated endpoints, async requests, diagram animation, console
- `vercel.json` – opens the page at the site root (keep this exact name)

## Upload to GitHub
1. Create a NEW repository for this site.
2. Add file -> Upload files, drag in the unzipped files (not the zip), and commit.

## Deploy on Vercel
1. Vercel -> Add New -> Project, import the repository.
2. Framework Preset: Other. Leave build settings empty. Deploy.

Note: the "back end" is simulated in the browser, so no real cloud account is needed.
