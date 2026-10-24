# WindScope — Full-stack UK Wind Generation Dashboard

A single-page React + Vite + Tailwind CSS dashboard with a FastAPI backend that reads national UK wind generation actuals and forecasts from Elexon BMRS. 


## What is included

- `frontend/` — React/Vite/Tailwind dashboard, reusable components, responsive Recharts graph, date selector, daily/hourly/30-minute views, CSV export, KPI cards, plain-language metric explanations.
- `backend/` — FastAPI endpoints and services for actual generation, wind forecast vintages, single-cutoff accuracy and rolling day-ahead accuracy.

The dashboard defaults to the next delivery date. It displays predictions only for a future delivery date. Selecting a past date shows the forecasts available before the decision cutoff alongside actual production and forecast errors.

## Requirements

- Python 3.10+
- Node.js 18+ (Node 20+ recommended)
- npm
- Internet access for the backend to call Elexon and for npm to install frontend dependencies

## 1. Start the FastAPI backend

Open a terminal at the project root, then:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

On macOS/Linux, activate with `source .venv/bin/activate` instead.

The API docs will be at `http://127.0.0.1:8000/docs`.

## 2. Start the React frontend

Open a second terminal at the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

During local development, Vite proxies `/api` requests to `http://127.0.0.1:8000`. The frontend requires the companion backend to be running.

To use another local backend port in PowerShell before `npm run dev`:

```powershell
$env:VITE_DEV_API_TARGET = "http://127.0.0.1:8010"
npm run dev
```

## Data and calculation notes

- Actuals come from Elexon's `FUELHH` national wind records at 30-minute resolution.
- Forecast vintages come from the `WINDFOR` dataset. The backend filters by publication timestamp and prevents the accuracy calculation from using a forecast published after the decision cutoff.
- For hourly accuracy, the backend averages the two half-hourly actual readings in each hour. MAE, RMSE and bias are calculated at hourly resolution.
- The 30-minute chart repeats the corresponding hourly forecast across both half-hourly timestamps for visual comparison. The KPI metrics remain hourly so that forecast and actual values are scored at the same resolution.
- The daily chart displays average MW for a rolling 14-day trend. For an upcoming delivery day it displays previous completed days and the future forecast, without fabricated actuals.
- `to` is an exclusive timestamp. All dates and forecast decision cutoffs are UTC.
- MAE is the average size of errors; RMSE gives extra weight to large errors; bias is the signed average `forecast - actual`. Positive bias means over-forecasting.
- A missing prediction is left missing. The dashboard does not use made-up data to fill gaps.
- This is a forecast-accuracy and generation-forecasting dashboard, not a final electricity-buying recommendation. A purchase recommendation also needs expected demand, other available supply, contracts, storage and market constraints.

Elexon API documentation: <https://bmrs.elexon.co.uk/api-documentation/endpoint>

## Production deployment

Build the frontend from the `frontend/` directory:

```bash
npm run build
```

Deploy the `frontend/dist/` folder to a static host such as Vercel. Deploy the FastAPI backend to a reachable Python host. Set `VITE_API_BASE_URL` at frontend build time to the deployed backend base URL, without a trailing slash; see `frontend/.env.example`.

For a separately hosted frontend/backend, allow the frontend origin in FastAPI CORS middleware. Add this to `backend/main.py` after creating `app` and replace the example origin:

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

Do not use the example origin in production. The frontend's local proxy avoids CORS during development only.

## Project structure

```text
wind-power-dashboard/
├── README.md
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── services/
│       ├── __init__.py
│       ├── elexon.py
│       └── accuracy.py
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── styles.css
        ├── components/
        └── lib/
```
