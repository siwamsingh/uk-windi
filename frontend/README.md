# WindScope — UK Wind Generation Dashboard

A responsive React + Vite + Tailwind CSS single-page dashboard for national UK wind generation. It displays Elexon BMRS forecasts (blue) alongside actual generation (green), supports daily/hourly/30-minute views, and explains the accuracy metrics in plain English.

## Features

- Single-page responsive layout for desktop, tablet and mobile.
- Delivery-date selector: past dates show actuals, predictions and errors; the upcoming date shows the prediction without inventing actuals or error scores.
- Three chart resolutions: daily trend, hourly view, and 30-minute view.
- Forecasts use the newest eligible `WINDFOR` publication at or before the decision cutoff through the existing FastAPI accuracy endpoint.
- Historical metrics: MAE, RMSE, bias and matched hours.
- CSV export of the selected chart data.
- Plain-English explanations for the metrics, MW, forecast error and the limitation of the 30-minute view.
- Reusable UI components live in `src/components/`; API and date/analytics helpers live in `src/lib/`.

## Requirements

- Node.js 18 or newer (Node 20+ recommended)
- npm
- The FastAPI backend from the companion wind accuracy project, running on `http://127.0.0.1:8000`

## Run locally

1. Start the backend in another terminal. From its `backend` folder:

   ```powershell
   python -m uvicorn main:app --reload
   ```

2. Open this project folder (`wind-dashboard`) in VS Code and install packages:

   ```powershell
   npm install
   ```

3. Start Vite:

   ```powershell
   npm run dev
   ```

4. Open the URL printed by Vite, usually `http://localhost:5173`.

The Vite dev server proxies requests beginning with `/api` to `http://127.0.0.1:8000`, so you do not need to configure CORS for local development.

To use a different local FastAPI URL, set `VITE_DEV_API_TARGET` before starting Vite. Example in PowerShell:

```powershell
$env:VITE_DEV_API_TARGET = "http://127.0.0.1:8010"
npm run dev
```

## Backend API contract

This frontend expects the following endpoints from the companion FastAPI project:

- `GET /api/actuals/wind?from=...&to=...`
- `GET /api/analysis/accuracy?from=...&to=...&decision_time=...`
- `GET /api/analysis/accuracy/day-ahead?from=...&to=...`

Date ranges use ISO-8601 UTC timestamps. `to` is exclusive. The API must return hourly `WINDFOR` forecasts and compare them with the mean of the two half-hourly `FUELHH` actual records for each hour, as in the companion backend.

## Production deployment

Build the static site:

```bash
npm run build
```

The files for deployment will be created in `dist/`.

When deploying the frontend separately (for example, Vercel), configure `VITE_API_BASE_URL` to your deployed FastAPI base URL, without a trailing slash. See `.env.example`. Vite embeds this value at build time.

Because production requests will be cross-origin, configure `CORSMiddleware` in the FastAPI application to allow your deployed frontend origin. For example:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend-domain.example"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)
```

Replace the example origin with the actual deployed URL. Do not leave wildcard origins in place for a production setup unless that is an intentional decision.

## Data and metric notes

- The Elexon endpoint documentation identifies `WINDFOR` as the national wind-generation forecast family. Its latest forecast endpoint is documented at <https://bmrs.elexon.co.uk/api-documentation/endpoint/forecast/generation/wind/latest>.
- Actuals come from `FUELHH` wind generation records in the backend.
- MAE is the average absolute forecast error. RMSE gives larger errors extra weight. Bias is the signed average `forecast - actual`; positive means over-forecasting.
- The 30-minute view draws the hourly forecast across both half-hours for visual comparison, but KPI metrics remain based on hourly forecast versus hourly-average actuals so that the scored values are at the same resolution.
- For an upcoming delivery date, no actuals or errors are fabricated. If no valid forecast was published by the selected cutoff, the chart remains empty and the dashboard explains the missing data.
- This is a forecast-accuracy dashboard, not a trading recommendation. Purchase decisions require demand and other supply/market inputs.

## Project structure

```text
wind-dashboard/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example
└── src/
    ├── App.jsx
    ├── main.jsx
    ├── styles.css
    ├── components/
    │   ├── BrandHeader.jsx
    │   ├── ChartPanel.jsx
    │   ├── MetricCard.jsx
    │   ├── MetricExplainer.jsx
    │   └── Notice.jsx
    └── lib/
        ├── analytics.js
        ├── api.js
        └── dates.js
```
